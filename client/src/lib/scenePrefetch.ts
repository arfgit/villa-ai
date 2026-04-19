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
// Batchable vs non-batchable: see BATCHABLE_TYPES and STOP_AFTER_TYPES
// below. Ambient scenes (firepit / pool / kitchen / bedroom) plus self-
// contained ceremonies (date / interview / challenge / minigame) and
// the first coupling are prefetched. Non-batchable types (recouple after
// the first, bombshell, islander_vote, public_vote, casa_amor_*) still
// live-gen — either because they mutate game state in ways working-
// state can't yet mirror (recouple reorganization, reward-date side
// effects) or because their setup depends on LLM-adjacent decisions
// the prefetcher shouldn't make without fresh context. When lookahead
// hits a non-batchable slot the batch stops and the user sees a live-
// gen pause on that scene; prefetch resumes from fresh state after.

import type {
  Agent,
  CasaAmorState,
  Couple,
  EmotionState,
  LlmSceneResponse,
  Relationship,
  Scene,
  SceneType,
} from "@villa-ai/shared";
import type { BuildArgs, SceneOutline } from "@villa-ai/shared";
import { generateScene as generateSceneFromLlm } from "./llm";
import { nextChallengeCategory, planBatch } from "./seasonPlanner";
import { pickMinigame } from "./minigames";
import { cloneState, type WorkingState } from "./workingState";
import { createFallbackScene } from "./sceneFallback";
import { trimSceneForPrompt } from "./scenePayload";

// ── Policy ──────────────────────────────────────────────────────────────

// Scene types we prefetch unconditionally. Widened from just ambient
// (firepit/pool/kitchen/bedroom) + minigame to also include dates,
// interviews, challenges — all self-contained scene types whose prompt
// needs nothing beyond committed game state + outline. Previously these
// live-gen'd every time, which is exactly the "loading screen between
// every ceremony scene" pain point users noticed.
const BATCHABLE_TYPES: ReadonlySet<SceneType> = new Set([
  "firepit",
  "pool",
  "kitchen",
  "bedroom",
  "minigame",
  "date",
  "interview",
  "challenge",
]);

// Scene types that STILL stop the batch because their outcomes require
// real store-side side effects we don't mirror in working state. A
// minigame awards a reward-date couple at commit time; a recouple
// reorganizes pairings through applyRecoupleDefections. We can realize
// ONE of these then stop — the next prefetch cycle resumes from the
// fresh post-commit state.
//
// Ceremony types (islander_vote / public_vote / bombshell) are still
// NON-BATCHABLE too — they're not in BATCHABLE_TYPES above. When we
// extend batching to cover those, workingState.applyElimination is the
// seed helper for eliminating an agent in the simulated state so
// subsequent batch prompts see the correct post-elimination cast.
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

// Queue depth of 5 matches the widened BATCHABLE_TYPES. Deeper queue
// absorbs runs of self-contained scenes (e.g. date → interview →
// challenge → date → kitchen) where a shallower buffer would empty
// faster than a refill batch completes. Speculative-burn cost is
// bounded — Haiku scene gen is ~$0.002/scene, so 2 extra speculative
// scenes is fractions of a cent.
const TARGET_QUEUE_DEPTH = 5;

// Only top up when the queue drops below this. Higher threshold means
// we refill sooner after consumption — with a 5-deep target and
// threshold 3, we kick off a refill batch once the queue is ≤ 3,
// giving it time to complete before the queue would otherwise empty.
const TOPUP_THRESHOLD = 3;

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
  // Eliminated-agent ids from the committed episode state. The prefetch
  // helpers (pickFocalDateCouple / pickInterviewSubject) gate candidates
  // through working.eliminatedIds; if this stays empty, a date or
  // interview scene could be prefetched against an agent who has
  // already left the villa.
  eliminatedIds: string[];
  seasonTheme: string;
  bombshellsIntroduced: string[];
  bombshellPool: Agent[];
  lastBombshellScene: number | null;
  bombshellDatingUntilScene: number | null;
  casaAmorState: CasaAmorState | null;
  avgDramaScore: number;
  gapToFill: number;
  // Per-agent live-chat sentiment carried through to the prefetched prompt
  // so batch scenes see the same "VIEWER VIBES" block the live-gen path sees.
  // Without this, scenes 2-5 of a batch would read a flat viewerless prompt
  // and drift out of sync with the popularity loop.
  viewerSentiment?: Record<string, number>;
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
    viewerSentiment: input.viewerSentiment,
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

  // Challenge setup: category rotation same as minigame, but no minigame
  // definition needed — challenge uses its own prompt branch.
  // Challenge setup mirrors minigame: inject the category AND the
  // pickMinigame-chosen definition. Previously only the category was
  // set, so prefetched challenges ignored the rotation dedupe and the
  // LLM invented the game type — letting "Beach Olympics" / "Face to
  // Face" repeat back-to-back. Live-gen already does this; keep parity.
  if (outline.type === "challenge") {
    const category = nextChallengeCategory(working.scenes);
    const recentGameNames = working.scenes
      .slice(-6)
      .filter((s) => s.type === "minigame" || s.type === "challenge")
      .map((s) => s.title)
      .filter((t): t is string => typeof t === "string" && t.length > 0);
    buildArgs.challengeCategory = category;
    buildArgs.minigameDefinition = pickMinigame(category, recentGameNames);
  }

  // Date focal couple: pick the highest-tension couple in working state
  // that hasn't had a date in the last 3 date scenes. Mirrors the
  // live-gen rotation logic in the store so prefetched date nights
  // don't all land on the same pair.
  if (outline.type === "date" && working.couples.length > 0) {
    const focal = pickFocalDateCouple(working);
    if (focal) {
      buildArgs.forcedParticipants = [focal.a, focal.b];
    }
  }

  // Interview subject: pick a cast member we haven't interviewed
  // recently. Bare heuristic — the live-gen path uses drama scoring
  // for this; we approximate with "least recently interviewed" since
  // working state doesn't carry dramaScores.
  if (outline.type === "interview") {
    const subjectId = pickInterviewSubject(input.activeCast, working);
    if (subjectId) {
      buildArgs.interviewSubjectId = subjectId;
      buildArgs.forcedParticipants = [subjectId];
    }
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

// Pick the focal couple for a batched date night. Prefers couples that
// haven't been on a date in the most recent 3 date scenes; within that
// filter, picks the highest attraction pair. Returns null if no active
// couples are available.
function pickFocalDateCouple(
  working: WorkingState,
): { a: string; b: string } | null {
  if (working.couples.length === 0) return null;
  const recentDateKeys = new Set<string>();
  const recentDates = working.scenes.filter((s) => s.type === "date").slice(-3);
  for (const scene of recentDates) {
    const ids = (scene.participantIds ?? []).slice().sort();
    if (ids.length === 2) recentDateKeys.add(ids.join("|"));
  }
  const activeCouples = working.couples.filter((c) => {
    const bothActive =
      !working.eliminatedIds.includes(c.a) &&
      !working.eliminatedIds.includes(c.b);
    return bothActive;
  });
  if (activeCouples.length === 0) return null;
  const scored = activeCouples.map((c) => {
    const key = [c.a, c.b].sort().join("|");
    const wasRecent = recentDateKeys.has(key);
    const relAB = working.relationships.find(
      (r) => r.fromId === c.a && r.toId === c.b,
    );
    const relBA = working.relationships.find(
      (r) => r.fromId === c.b && r.toId === c.a,
    );
    const attractionSum = (relAB?.attraction ?? 0) + (relBA?.attraction ?? 0);
    // Non-recent couples always rank above recent ones via the 10000 bonus.
    return { couple: c, score: (wasRecent ? 0 : 10000) + attractionSum };
  });
  scored.sort((x, y) => y.score - x.score);
  return scored[0]?.couple ?? null;
}

// Pick an interview subject who hasn't had one recently. Falls back to
// any active (non-eliminated) cast member if everyone's been interviewed.
function pickInterviewSubject(
  activeCast: Agent[],
  working: WorkingState,
): string | null {
  const recentInterviewIds = new Set<string>();
  const recentInterviews = working.scenes
    .filter((s) => s.type === "interview")
    .slice(-3);
  for (const scene of recentInterviews) {
    for (const id of scene.participantIds ?? []) {
      recentInterviewIds.add(id);
    }
  }
  const available = activeCast.filter(
    (a) =>
      !working.eliminatedIds.includes(a.id) && !recentInterviewIds.has(a.id),
  );
  if (available.length > 0) {
    return available[Math.floor(Math.random() * available.length)]!.id;
  }
  // Everyone's been interviewed recently — fall back to any active agent.
  const activeAny = activeCast.filter(
    (a) => !working.eliminatedIds.includes(a.id),
  );
  if (activeAny.length === 0) return null;
  return activeAny[Math.floor(Math.random() * activeAny.length)]!.id;
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
  // On Anthropic (prod default) and Gemini, calls run in true parallel
  // so cold-start fill time becomes max(single-scene-latency) instead
  // of sum(single-scene-latency). On local Ollama with num_parallel=1
  // (dev default), Ollama serializes internally so parallel degrades
  // to sequential — bump OLLAMA_NUM_PARALLEL=4 on the runtime to
  // recover the speedup. See README for the config snippet.
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
    eliminatedIds: input.eliminatedIds,
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
