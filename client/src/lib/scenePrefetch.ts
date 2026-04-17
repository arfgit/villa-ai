// Scene prefetch policy + runner.
//
// The viewer experience goal is: after the opener renders, scenes flow one
// after another without a visible "generating…" spinner between them. We
// achieve that by generating the next few scenes in parallel and parking
// them in a queue the store can drain on demand.
//
// This file owns WHEN to prefetch and HOW MANY. The store owns committing
// scenes to state and consuming from the queue.

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
import { nextSceneType as planNextScene } from "./seasonPlanner";

// ── Policy ──────────────────────────────────────────────────────────────
//
// Scene types worth prefetching. We stick to ambient social scenes whose
// prompts depend only on the cast + relationship state, not on per-scene
// choices the main path makes (interview subject, reward-date couple,
// ensemble composition). Excluded:
//   - minigame, recouple, bombshell, casa_amor_* → procedural / state-picky
//   - interview → needs interviewSubjectId from the main path
//   - date → needs reward-date couple selection from the main path
//   - introductions → only fires on scene 0, which is never prefetched
//
// Tune this set if you add scene types that are safe to generate ahead.
const BATCHABLE_TYPES: ReadonlySet<SceneType> = new Set([
  "firepit",
  "pool",
  "kitchen",
  "bedroom",
]);

export function isBatchable(sceneType: SceneType): boolean {
  return BATCHABLE_TYPES.has(sceneType);
}

export interface PrefetchPolicy {
  depth: number;
}

/**
 * Decide whether to prefetch, and how deep. Returns null to skip.
 *
 * Default policy:
 *   - Right after the opener, batch 3 so the user doesn't stall between
 *     scenes 1-3.
 *   - Whenever the queue drops to 0 or 1, top up with 2 more.
 *
 * Change these numbers to make the villa feel snappier (deeper batch) or
 * cheaper to run (shallower batch).
 */
export function planPrefetch(
  queueLength: number,
  sceneCount: number,
  activeCastSize: number,
  isPaused: boolean,
): PrefetchPolicy | null {
  if (isPaused) return null;
  if (activeCastSize < 2) return null;

  if (sceneCount === 1 && queueLength === 0) return { depth: 3 };
  if (queueLength <= 1) return { depth: 2 };
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
  depth: number;
}

/**
 * A prefetched scene keeps the sceneType it was generated FOR. When the
 * main-path planner runs at consumption time, it checks the tag against
 * the freshly-planned type and skips the entry on mismatch — because
 * planNextScene has random weighting and couples-based branching, the
 * predicted type at prefetch time is not guaranteed to match.
 */
export interface QueuedScene {
  sceneType: SceneType;
  scene: LlmSceneResponse;
}

/**
 * Plan + generate N prefetch scenes in parallel. Returns the successfully
 * generated ones tagged with the sceneType they were written for.
 *
 * Planning is done linearly from the CURRENT state — we don't simulate
 * future state changes between prefetched scenes, so predictions get
 * fuzzier the deeper the batch. Depth > 3 is not recommended.
 *
 * If any predicted scene type isn't batchable (procedural / state-picky),
 * we stop planning at that point and return whatever we planned so far.
 */
export async function prefetchScenes(
  input: PrefetchInput,
): Promise<QueuedScene[]> {
  const activeIds = input.activeCast.map((a) => a.id);

  const planned: Array<{ sceneType: SceneType; buildArgs: BuildArgs }> = [];
  const recoupleCount = input.scenes.filter(
    (s) => s.type === "recouple",
  ).length;

  for (let i = 0; i < input.depth; i++) {
    // Fake-extend scenes with our planned types so the planner advances the
    // index; actual outcomes aren't known yet, but index-based branches are.
    const simulatedScenes: Scene[] = [
      ...input.scenes,
      ...planned.map((p) => ({ type: p.sceneType }) as Scene),
    ];

    const sceneType = planNextScene({
      scenes: simulatedScenes,
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

    if (!isBatchable(sceneType)) break;

    const buildArgs: BuildArgs = {
      cast: input.activeCast,
      relationships: input.relationships,
      emotions: input.emotions,
      couples: input.couples,
      recentScenes: input.scenes.slice(-3),
      sceneType,
      seasonTheme: input.seasonTheme,
      sceneNumber: input.scenes.length + planned.length + 1,
      isIntroduction: false,
      isFinale: false,
    };
    planned.push({ sceneType, buildArgs });
  }

  if (planned.length === 0) return [];

  const results = await Promise.all(
    planned.map((p) =>
      generateSceneFromLlm(p.buildArgs, activeIds)
        .then((scene): QueuedScene => ({ sceneType: p.sceneType, scene }))
        .catch((err) => {
          const msg = err instanceof Error ? err.message : String(err);
          console.warn("[scene-prefetch] scene failed:", msg);
          return null;
        }),
    ),
  );

  return results.filter((r): r is QueuedScene => r !== null);
}
