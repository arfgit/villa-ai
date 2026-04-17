// Scene prefetch — the "writers room" runs during playback, not between
// scenes, so the user never watches a loading bar mid-episode.
//
// The store calls `triggerPrefetch(state)` at two moments:
//   1. right after a scene commits (so gen time overlaps with the next
//      scene's playback);
//   2. when a scene's line-by-line playback starts (belt-and-braces — if
//      commit-time trigger was rate-limited or the user advanced faster
//      than gen, this catches up).
//
// A module-level single-flight flag keeps these two triggers from firing
// overlapping batches. Episode-id fencing keeps a pre-episode-switch run
// from leaking its results into the new episode.
//
// Non-batchable scene types (minigame, recouple, bombshell, etc.) need
// per-scene setup the prefetcher doesn't have (interviewSubjectId, reward
// couple, etc.), AND they mutate game state: a recouple makes/breaks
// couples, a minigame awards a reward date, a bombshell seeds attractions.
// So when lookahead hits a non-batchable slot, we STOP — any ambient scene
// we generated beyond that point would be written against pre-mutation
// state and would read as a continuity break when committed after the
// live scene landed. The user gets a one-time "writers room" pause on the
// state-mutating scene, then prefetch resumes from the fresh state after
// it commits.

import type {
  Agent,
  CasaAmorState,
  Couple,
  EmotionState,
  LlmSceneResponse,
  Relationship,
  Scene,
  SceneType,
} from "@/types";
import type { BuildArgs, SceneOutline } from "@villa-ai/shared";
import { generateScene as generateSceneFromLlm } from "./llm";
import { nextChallengeCategory, planBatch } from "./seasonPlanner";
import { pickMinigame } from "./minigames";
import { cloneState, type WorkingState } from "./workingState";
import { createFallbackScene } from "./sceneFallback";
import { trimSceneForPrompt } from "./scenePayload";

// ── Policy ──────────────────────────────────────────────────────────────

// Scene types we prefetch unconditionally. Ambient social scenes have
// prompts that depend only on cast + relationship state; minigame's
// setup (challengeCategory + minigameDefinition) is derivable from
// current scenes via pure functions, so we can prefetch it too.
const BATCHABLE_TYPES: ReadonlySet<SceneType> = new Set([
  "firepit",
  "pool",
  "kitchen",
  "bedroom",
  "minigame",
]);

// Scene types that mutate game state enough that we can't reliably keep
// generating PAST them (a minigame picks a winner, a recouple creates or
// breaks couples). Prefetch stops after queuing one of these — the next
// cycle resumes from the fresh post-commit state.
const STOP_AFTER_TYPES: ReadonlySet<SceneType> = new Set([
  "minigame",
  "recouple",
]);

// Recouple is prefetchable ONLY when it's the first one of the season.
// That's the "first coupling" — no prior couples to mutate, no
// relationship history that a previous scene might have just shifted.
// Later recouples need the live recoupleScript built from fresh
// relationship numbers, and we skip them here.
function isFirstCoupling(scenes: Scene[]): boolean {
  return scenes.every((s) => s.type !== "recouple");
}

export function isBatchable(sceneType: SceneType, scenes: Scene[]): boolean {
  if (BATCHABLE_TYPES.has(sceneType)) return true;
  if (sceneType === "recouple" && isFirstCoupling(scenes)) return true;
  return false;
}

// Queue depth trades off buffer vs speculative burn. We used to target 5
// but that had two costs: (a) on single-model Ollama it pipelines 5
// generation jobs behind whatever's currently live, slowing everything;
// (b) deeper speculation = more scenes to throw away on mispredicts.
// 3 scenes ahead is still enough to absorb a single LLM hiccup without
// the user ever seeing "catching up…" during steady-state playback.
const TARGET_QUEUE_DEPTH = 3;

// Only top up when the queue drops below this. Prevents us from firing a
// batch on every single playback-start event. At threshold=2, there's
// always at least 1 scene in reserve while the next batch generates.
const TOPUP_THRESHOLD = 2;

export interface PrefetchPolicy {
  gapToFill: number;
}

export function planPrefetch(
  queueLength: number,
  sceneCount: number,
  activeCastSize: number,
  isPaused: boolean,
): PrefetchPolicy | null {
  if (isPaused) return null;
  if (activeCastSize < 2) return null;

  // Cold start — after the opener commits, slam the queue up to target
  // depth so every post-opener scene is already waiting.
  if (sceneCount === 1 && queueLength === 0) {
    return { gapToFill: TARGET_QUEUE_DEPTH };
  }
  if (queueLength < TOPUP_THRESHOLD) {
    return { gapToFill: TARGET_QUEUE_DEPTH - queueLength };
  }
  return null;
}

// ── Runner ──────────────────────────────────────────────────────────────

export interface PrefetchInput {
  activeCast: Agent[];
  scenes: Scene[];
  relationships: Relationship[];
  emotions: EmotionState[];
  couples: Couple[];
  seasonTheme: string;
  bombshellsIntroduced: string[];
  bombshellPool: Agent[];
  lastBombshellScene: number | null;
  bombshellDatingUntilScene: number | null;
  casaAmorState: CasaAmorState | null;
  avgDramaScore: number;
  gapToFill: number;
  // Called when each scene in the batch becomes ready. The store uses
  // this to append to sceneQueue INCREMENTALLY — otherwise the user sees
  // no progress during the 20-60s sequential realization window.
  onSceneReady?: (queued: QueuedScene) => void;
}

// A prefetched scene keeps the OUTLINE it was realized against. At
// consumption time, the store matches on `outline.type` to confirm the
// queued scene is still relevant for the current slot. Entries whose
// type no longer matches stay in the queue until the planner lines up
// with them — we don't discard on mismatch because the planner is
// nondeterministic (Math.random in tiebreakers).
//
// Keeping the outline (not just the type) means the consumer also has
// access to goal / tension / stakes / subtext — useful for metrics,
// debugging, and downstream features that want to know the intent
// behind a queued scene.
export interface QueuedScene {
  outline: SceneOutline;
  scene: LlmSceneResponse;
}

// Single-flight guard. The store calls triggerPrefetch from two sites
// (post-commit + playback-start); we want at most one run in flight at a
// time so we don't double-spend on LLM quota.
let inFlight = false;

export function isPrefetchInFlight(): boolean {
  return inFlight;
}

// Reset the single-flight guard. Called by the store on episode switch /
// new-episode / session-load so a stale in-flight run from the previous
// episode doesn't block cold-start prefetch on the new one. The in-flight
// run's result is still fenced out by the store's episode-id check — this
// only clears the flag so a NEW run can start.
export function resetPrefetchState(): void {
  inFlight = false;
}

/**
 * Plan + generate prefetch scenes in parallel.
 *
 * We walk up to MAX_LOOKAHEAD planner steps forward, collecting `gapToFill`
 * batchable scene types. Non-batchable slots are included in the simulated
 * state advancement (so subsequent index-based planner branches see the
 * right scene count) but skipped for generation — the main path will live-
 * gen them when they come up.
 *
 * Errors on individual scenes are logged and skipped (Promise.allSettled);
 * a single rate-limited call doesn't take down the whole batch.
 */
export async function prefetchScenes(
  input: PrefetchInput,
): Promise<QueuedScene[]> {
  if (inFlight) return [];
  if (input.gapToFill <= 0) return [];
  inFlight = true;
  try {
    return await runPrefetch(input);
  } finally {
    inFlight = false;
  }
}

// Build BuildArgs for a single outline. Takes a WorkingState snapshot so
// the prompt sees relationships / couples / emotions as they would be
// AFTER the previous scenes in the batch have committed — not the stale
// committed-episode view from the top of the batch.
function buildArgsFor(
  outline: SceneOutline,
  working: WorkingState,
  input: PrefetchInput,
): BuildArgs {
  // recentScenes on the wire must be REAL scenes (have an id). Working
  // state contains stub scenes (id-less) appended by applyRealizedScene
  // to advance the planner — those are client-only.
  const realScenes = working.scenes.filter(
    (s): s is Scene => typeof (s as Scene).id === "string",
  );

  // sceneNumber must count ALL scenes in the working timeline — real
  // committed ones + stubs from earlier outlines in this batch. Using
  // only realScenes.length would prompt every outline after the first
  // with the same sceneNumber, so scene 2/3/4 in a batch all read as
  // the same episode slot to the LLM. working.scenes has the stubs
  // applyRealizedScene appended, so .length here is correct.
  const buildArgs: BuildArgs = {
    cast: input.activeCast,
    relationships: working.relationships,
    emotions: working.emotions,
    couples: working.couples,
    recentScenes: realScenes.slice(-3).map(trimSceneForPrompt),
    sceneType: outline.type,
    seasonTheme: input.seasonTheme,
    sceneNumber: working.scenes.length + 1,
    isIntroduction: false,
    isFinale: false,
    outline,
  };

  // Minigame setup derived from working state so mid-batch challenge
  // rotation tracks the batch's prior games, not just the committed
  // history.
  if (outline.type === "minigame") {
    const category = nextChallengeCategory(working.scenes);
    const recentGameNames = working.scenes
      .slice(-6)
      .filter((s) => s.type === "minigame" || s.type === "challenge")
      .map((s) => s.title)
      .filter((t): t is string => typeof t === "string" && t.length > 0);
    buildArgs.challengeCategory = category;
    buildArgs.minigameDefinition = pickMinigame(category, recentGameNames);
  }

  // First-coupling: the prompt's first-coupling branch reads
  // isFirstCoupling directly, so this only needs to fire when no prior
  // recouple exists in working state (which already reflects earlier
  // batch scenes).
  if (outline.type === "recouple") {
    const hadPriorRecouple = working.scenes.some((s) => s.type === "recouple");
    buildArgs.isFirstCoupling = !hadPriorRecouple;
  }

  return buildArgs;
}

async function runPrefetch(input: PrefetchInput): Promise<QueuedScene[]> {
  const activeIds = input.activeCast.map((a) => a.id);

  // STAGE 1 — plan the batch as an arc. planBatch walks the season planner
  // forward input.gapToFill steps and returns an outline per step with
  // goal / tension / stakes / subtext already populated. Deterministic,
  // no LLM call.
  const outlines = planBatch({
    scenes: input.scenes,
    activeCastIds: activeIds,
    couples: input.couples,
    bombshellsIntroduced: input.bombshellsIntroduced.length,
    bombshellPoolSize: input.bombshellPool.length,
    lastBombshellScene: input.lastBombshellScene,
    bombshellDatingUntilScene: input.bombshellDatingUntilScene,
    avgDramaScore: input.avgDramaScore,
    casaAmorState: input.casaAmorState,
    batchSize: input.gapToFill,
  });

  // Filter outlines down to ones we can actually realize. isBatchable
  // encodes the "we have enough state to prompt this cleanly" rules.
  // Once we hit a non-batchable outline, stop — continuing would realize
  // scenes against pre-mutation state (e.g. a firepit after a yet-to-run
  // recouple).
  const realizable: SceneOutline[] = [];
  const combinedScenes = [...input.scenes];
  for (const outline of outlines) {
    const snapshot = [...combinedScenes];
    if (!isBatchable(outline.type, snapshot)) break;
    realizable.push(outline);
    combinedScenes.push({ type: outline.type } as unknown as Scene);
    // Scenes whose outcomes heavily reshape state (minigame winner picks
    // a reward date, recouple pair-forms couples) still mark batch end
    // even with the working-state simulator — their outcomes depend on
    // store-side side effects (rewards, eliminations) we're not
    // replicating in working state.
    if (STOP_AFTER_TYPES.has(outline.type)) break;
  }

  if (realizable.length === 0) return [];

  // STAGE 2 — realize in PARALLEL from the committed baseline.
  //
  // Each outline gets its own working-state clone built from the same
  // baseline (committed episode state + this batch's scene-type stubs
  // for correct sceneNumber advancement). Scenes DO NOT see each
  // other's LLM outcomes within a batch — that's the tradeoff for
  // going parallel. Over a 5-scene ambient batch that loses a few
  // intra-batch attraction deltas in subsequent prompts; the LLM's
  // imagination fills the gap just fine, and staleness is bounded
  // because state-mutating types already end the batch (STOP_AFTER).
  //
  // On local Ollama with num_parallel=1 this is no slower than
  // sequential — Ollama serializes internally. On Ollama with
  // num_parallel>=2 (or on Gemini with real concurrency), this runs
  // all N calls simultaneously, so cold-start fill time becomes
  // max(single-scene-latency) instead of sum(single-scene-latency).
  //
  // Each scene stages its own working state with prior outlines'
  // stubs so sceneNumber advances correctly — parallel doesn't mean
  // "all scenes at the same slot index".
  const baseline = cloneState({
    scenes: input.scenes.filter(
      (s): s is Scene => typeof (s as Scene).id === "string",
    ),
    relationships: input.relationships,
    emotions: input.emotions,
    couples: input.couples,
    eliminatedIds: [],
  });

  const runStartedAt = performance.now();
  const settled = await Promise.allSettled(
    realizable.map((outline) => {
      // Per-outline working state: baseline + stubs for any prior
      // outlines in this batch. Stubs give correct sceneNumber and
      // recentScenes window without needing the prior outlines'
      // LLM responses.
      const perSceneState = cloneState(baseline);
      for (let i = 0; i < outline.sequence && i < realizable.length; i++) {
        const prior = realizable[i];
        if (!prior) continue;
        perSceneState.scenes.push({
          type: prior.type,
        } as unknown as Scene);
      }
      return realizeWithRetryAndFallback(
        outline,
        perSceneState,
        input,
        activeIds,
      ).then((scene): QueuedScene | null => {
        if (!scene) return null;
        const queued: QueuedScene = { outline, scene };
        try {
          input.onSceneReady?.(queued);
        } catch (cbErr) {
          console.warn("[scene-prefetch] onSceneReady callback failed:", cbErr);
        }
        return queued;
      });
    }),
  );

  const scenes: QueuedScene[] = [];
  for (const r of settled) {
    if (r.status === "fulfilled" && r.value) {
      scenes.push(r.value);
    }
    // Procedural fallbacks (null) + rejected promises both fall here
    // silently — the store will live-gen when the scene plays.
  }
  const runMs = Math.round(performance.now() - runStartedAt);
  console.log(
    `[timing] prefetch-batch size=${realizable.length} ready=${scenes.length} ms=${runMs}`,
  );
  return scenes;
}

// Scene types safe to emit a templated fallback for. Ambient social
// scenes have no required state transitions — a canned 2-line
// interstitial is a tolerable interstitial. Procedural scene types
// (recouple forms couples, minigame awards a winner, bombshell adds
// cast) REQUIRE specific systemEvents the fallback can't produce
// correctly, so we return null on exhaustion and let them live-gen.
const FALLBACK_SAFE_TYPES: ReadonlySet<SceneType> = new Set([
  "firepit",
  "pool",
  "kitchen",
  "bedroom",
]);

// Try the LLM twice. On exhaustion:
//   - ambient scene types get a templated fallback so the batch keeps
//     flowing
//   - procedural scene types return null so the caller can stop the
//     batch (committing a procedural fallback would corrupt state)
async function realizeWithRetryAndFallback(
  outline: SceneOutline,
  workingState: WorkingState,
  input: PrefetchInput,
  activeIds: string[],
): Promise<LlmSceneResponse | null> {
  const maxAttempts = 2;
  let lastError: unknown = null;
  const startedAt = performance.now();
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const buildArgs = buildArgsFor(outline, workingState, input);
      const scene = await generateSceneFromLlm(buildArgs, activeIds);
      const ms = Math.round(performance.now() - startedAt);
      console.log(
        `[timing] prefetch seq=${outline.sequence} type=${outline.type} ok attempt=${attempt + 1} ms=${ms}`,
      );
      return scene;
    } catch (err) {
      lastError = err;
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(
        `[scene-prefetch] attempt ${attempt + 1} failed (outline seq ${outline.sequence}, type ${outline.type}):`,
        msg,
      );
    }
  }
  const ms = Math.round(performance.now() - startedAt);
  if (FALLBACK_SAFE_TYPES.has(outline.type)) {
    console.warn(
      `[timing] prefetch seq=${outline.sequence} type=${outline.type} fallback ms=${ms}`,
      lastError instanceof Error ? lastError.message : lastError,
    );
    return createFallbackScene(outline, input.activeCast);
  }
  console.warn(
    `[timing] prefetch seq=${outline.sequence} type=${outline.type} abort-procedural ms=${ms}`,
    lastError instanceof Error ? lastError.message : lastError,
  );
  return null;
}
