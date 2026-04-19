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

const STOP_AFTER_TYPES: ReadonlySet<SceneType> = new Set([
  "minigame",
  "recouple",
]);

function isFirstCoupling(scenes: Scene[]): boolean {
  return scenes.every((s) => s.type !== "recouple");
}

export function isBatchable(sceneType: SceneType, scenes: Scene[]): boolean {
  if (BATCHABLE_TYPES.has(sceneType)) return true;
  if (sceneType === "recouple" && isFirstCoupling(scenes)) return true;
  return false;
}

const TARGET_QUEUE_DEPTH = 5;

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

  if (sceneCount === 1 && queueLength === 0) {
    return { gapToFill: TARGET_QUEUE_DEPTH };
  }
  if (queueLength < TOPUP_THRESHOLD) {
    return { gapToFill: TARGET_QUEUE_DEPTH - queueLength };
  }
  return null;
}

export interface PrefetchInput {
  activeCast: Agent[];
  scenes: Scene[];
  relationships: Relationship[];
  emotions: EmotionState[];
  couples: Couple[];

  eliminatedIds: string[];
  seasonTheme: string;
  bombshellsIntroduced: string[];
  bombshellPool: Agent[];
  lastBombshellScene: number | null;
  bombshellDatingUntilScene: number | null;
  casaAmorState: CasaAmorState | null;
  avgDramaScore: number;
  gapToFill: number;

  viewerSentiment?: Record<string, number>;

  onSceneReady?: (queued: QueuedScene) => void;
}

export interface QueuedScene {
  outline: SceneOutline;
  scene: LlmSceneResponse;
}

let inFlight = false;

export function isPrefetchInFlight(): boolean {
  return inFlight;
}

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

function buildArgsFor(
  outline: SceneOutline,
  working: WorkingState,
  input: PrefetchInput,
): BuildArgs {
  const realScenes = working.scenes.filter(
    (s): s is Scene => typeof (s as Scene).id === "string",
  );

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

  if (outline.type === "date" && working.couples.length > 0) {
    const focal = pickFocalDateCouple(working);
    if (focal) {
      buildArgs.forcedParticipants = [focal.a, focal.b];
    }
  }

  if (outline.type === "interview") {
    const subjectId = pickInterviewSubject(input.activeCast, working);
    if (subjectId) {
      buildArgs.interviewSubjectId = subjectId;
      buildArgs.forcedParticipants = [subjectId];
    }
  }

  if (outline.type === "recouple") {
    const hadPriorRecouple = working.scenes.some((s) => s.type === "recouple");
    buildArgs.isFirstCoupling = !hadPriorRecouple;
  }

  return buildArgs;
}

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

    return { couple: c, score: (wasRecent ? 0 : 10000) + attractionSum };
  });
  scored.sort((x, y) => y.score - x.score);
  return scored[0]?.couple ?? null;
}

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

  const activeAny = activeCast.filter(
    (a) => !working.eliminatedIds.includes(a.id),
  );
  if (activeAny.length === 0) return null;
  return activeAny[Math.floor(Math.random() * activeAny.length)]!.id;
}

async function runPrefetch(input: PrefetchInput): Promise<QueuedScene[]> {
  const activeIds = input.activeCast.map((a) => a.id);

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

  const realizable: SceneOutline[] = [];
  const combinedScenes = [...input.scenes];
  for (const outline of outlines) {
    const snapshot = [...combinedScenes];
    if (!isBatchable(outline.type, snapshot)) break;
    realizable.push(outline);
    combinedScenes.push({ type: outline.type } as unknown as Scene);

    if (STOP_AFTER_TYPES.has(outline.type)) break;
  }

  if (realizable.length === 0) return [];

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
  }
  const runMs = Math.round(performance.now() - runStartedAt);
  console.log(
    `[timing] prefetch-batch size=${realizable.length} ready=${scenes.length} ms=${runMs}`,
  );
  return scenes;
}

const FALLBACK_SAFE_TYPES: ReadonlySet<SceneType> = new Set([
  "firepit",
  "pool",
  "kitchen",
  "bedroom",
]);

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
