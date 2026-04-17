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
import type { BuildArgs } from "@villa-ai/shared";
import { generateScene as generateSceneFromLlm } from "./llm";
import {
  nextSceneType as planNextScene,
  nextChallengeCategory,
} from "./seasonPlanner";
import { pickMinigame } from "./minigames";

// ── Policy ──────────────────────────────────────────────────────────────

// Scene types we prefetch. Ambient social scenes have prompts that depend
// only on cast + relationship state (no per-scene choices). Minigame is
// also here because its setup (challengeCategory + minigameDefinition) is
// derivable from current state via pure functions — so we can generate it
// during playback of the previous scene. Still excluded:
//   - recouple: needs recoupleScript built from live relationships, which
//     a prior minigame may have just mutated
//   - interview: needs interviewSubjectId picked from drama scores
//   - date: needs reward-couple selection from a just-finished challenge
//   - bombshell / casa_amor_*: needs arriving-cast selection + state change
const BATCHABLE_TYPES: ReadonlySet<SceneType> = new Set([
  "firepit",
  "pool",
  "kitchen",
  "bedroom",
  "minigame",
]);

// Scene types that mutate game state enough that we can't reliably keep
// generating PAST them (e.g., a minigame picks a winner couple, which
// changes who's on a reward date next). Prefetch stops after queuing one
// of these — the next cycle can resume from the fresh post-commit state.
const STOP_AFTER_TYPES: ReadonlySet<SceneType> = new Set(["minigame"]);

export function isBatchable(sceneType: SceneType): boolean {
  return BATCHABLE_TYPES.has(sceneType);
}

// Maximum number of prefetched scenes to hold at once. Deeper queue = less
// chance of a user waiting, more wasted generation on mispredicts. 5 covers
// a typical 5-scene lookahead window without getting spicy on mispredicts.
const TARGET_QUEUE_DEPTH = 5;

// Only top up when the queue drops below this. Prevents us from firing a
// batch on every single playback-start event. 3 leaves plenty of buffer
// while letting the queue drain to 2 before re-filling.
const TOPUP_THRESHOLD = 3;

// How many slots ahead we'll PLAN past a non-batchable scene. Each slot
// we skip is one less LLM call; this bounds the waste.
const MAX_LOOKAHEAD = 8;

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
}

// A prefetched scene keeps the sceneType it was generated FOR. At
// consumption time, the store checks this tag against the freshly-planned
// sceneType and only pops on a match. Mismatched entries stay at the head
// of the queue until the planner lines up with them.
export interface QueuedScene {
  sceneType: SceneType;
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

function simulateFutureScenes(
  existing: Scene[],
  plannedTypes: SceneType[],
): Scene[] {
  // Planner reads `scenes.length`, `scenes.filter(type === 'recouple')`, etc.
  // Stub scenes with just the `type` field — other fields are not consulted
  // by the planner's branching logic.
  return [
    ...existing,
    ...plannedTypes.map((type) => ({ type }) as unknown as Scene),
  ];
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

async function runPrefetch(input: PrefetchInput): Promise<QueuedScene[]> {
  const activeIds = input.activeCast.map((a) => a.id);
  const recoupleCount = input.scenes.filter(
    (s) => s.type === "recouple",
  ).length;

  const planned: Array<{ sceneType: SceneType; buildArgs: BuildArgs }> = [];
  const simulatedTypes: SceneType[] = [];
  let stepsExamined = 0;

  while (planned.length < input.gapToFill && stepsExamined < MAX_LOOKAHEAD) {
    stepsExamined++;

    const sceneType = planNextScene({
      scenes: simulateFutureScenes(input.scenes, simulatedTypes),
      activeCastCount: input.activeCast.length,
      bombshellsIntroduced: input.bombshellsIntroduced.length,
      bombshellPoolSize: input.bombshellPool.length,
      coupleCount: input.couples.length,
      lastBombshellScene: input.lastBombshellScene,
      bombshellDatingUntilScene: input.bombshellDatingUntilScene,
      avgDramaScore: input.avgDramaScore,
      casaAmorState: input.casaAmorState,
      recoupleCount,
    });

    // Stop at the first non-batchable slot. Continuing past would generate
    // scenes against stale state (see the module-level comment).
    if (!isBatchable(sceneType)) break;
    simulatedTypes.push(sceneType);

    const buildArgs: BuildArgs = {
      cast: input.activeCast,
      relationships: input.relationships,
      emotions: input.emotions,
      couples: input.couples,
      recentScenes: input.scenes.slice(-3),
      sceneType,
      seasonTheme: input.seasonTheme,
      sceneNumber: input.scenes.length + simulatedTypes.length,
      isIntroduction: false,
      isFinale: false,
    };

    // Minigame-specific setup. Both functions are pure — challengeCategory
    // alternates deterministically from past scenes, pickMinigame reads
    // `recentGameNames` (last 6 game scenes). Same computation the main
    // path does at commit time, so the prefetched scene gets the same
    // game the user would have seen on live gen.
    if (sceneType === "minigame") {
      const category = nextChallengeCategory(input.scenes);
      const recentGameNames = input.scenes
        .slice(-6)
        .filter((s) => s.type === "minigame" || s.type === "challenge")
        .map((s) => s.title);
      buildArgs.challengeCategory = category;
      buildArgs.minigameDefinition = pickMinigame(category, recentGameNames);
    }

    planned.push({ sceneType, buildArgs });

    // Some scene types mutate state so heavily that continuing the
    // lookahead from pre-mutation state would produce stale successors.
    // Queue this one, then stop — next cycle resumes from fresh state.
    if (STOP_AFTER_TYPES.has(sceneType)) break;
  }

  if (planned.length === 0) return [];

  const settled = await Promise.allSettled(
    planned.map((p) =>
      generateSceneFromLlm(p.buildArgs, activeIds).then(
        (scene): QueuedScene => ({ sceneType: p.sceneType, scene }),
      ),
    ),
  );

  const scenes: QueuedScene[] = [];
  for (const r of settled) {
    if (r.status === "fulfilled") {
      scenes.push(r.value);
    } else {
      const msg =
        r.reason instanceof Error ? r.reason.message : String(r.reason);
      console.warn("[scene-prefetch] scene failed:", msg);
    }
  }
  return scenes;
}
