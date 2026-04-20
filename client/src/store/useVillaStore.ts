import { create } from "zustand";
import type {
  Episode,
  Scene,
  SceneType,
  RelationshipMetric,
  LlmSceneResponse,
  Relationship,
  EmotionState,
  AgentBrain,
  AgentMemory,
  Agent,
  RewardEvent,
  ViewerMessage,
  Couple,
  SystemEvent,
  SeasonArchive,
} from "@villa-ai/shared";
import { HOST } from "@/data/host";
import { sampleSeasonCast } from "@/data/castPool";
import { getSceneLabel } from "@/data/environments";
import {
  buildSeedRelationships,
  buildSeedEmotions,
} from "@/data/seedRelationships";
import type { BuildArgs } from "@villa-ai/shared";
import { buildSceneContext } from "@/lib/sceneEngine";
import { generateScene as generateSceneFromLlm } from "@/lib/llm";
import {
  isBatchable,
  planPrefetch,
  prefetchScenes,
  resetPrefetchState,
  type QueuedScene,
} from "@/lib/scenePrefetch";
import { embed } from "@/lib/embeddings";
import { retrieveMemories, buildRetrievalQuery } from "@/lib/memory";
import {
  extractObservationsForScene,
  reflectAcrossAgents,
} from "@/lib/memoryExtraction";
import { computeSceneRewards, sumRewards } from "@/lib/rewards";
import { inferStatDeltas, applyInferredDeltas } from "@/lib/statInference";
import {
  updateDramaScores,
  averageDramaScore,
  rankByDrama,
} from "@/lib/dramaScore";
import {
  nextSceneType as planNextScene,
  getSeasonPhase,
  bombshellArrivalCount,
  nextChallengeCategory,
} from "@/lib/seasonPlanner";
import {
  publicVoteElimination,
  islanderVoteElimination,
  producerIntervention,
} from "@/lib/eliminationEngine";
import {
  generateCasaAmorCast,
  splitVilla,
  computeStickOrSwitchChoices,
  resolveStickOrSwitch,
  classifyCoupleArchetype,
} from "@/lib/casaAmor";
import type { CasaAmorState, StickOrSwitchChoice } from "@villa-ai/shared";
import type { ChallengeCategory } from "@villa-ai/shared";
import { generateViewerReactions } from "@/lib/viewerChat";
import {
  aggregateChatToPopularity,
  applySocialGravity,
} from "@/lib/social-gravity";
import { buildSeasonExport, buildRLExport } from "@/lib/exportData";
import { downloadJson } from "@/lib/download";
import {
  autoSaveTrainingData,
  loadWisdomArchive,
  loadMetaWisdom,
  persistWisdom,
  hydrateWisdom,
  refreshTrainingCache,
} from "@/lib/trainingData";
import {
  saveSession as saveSessionToServer,
  loadCurrentSession,
  loadSessionById,
  saveTrainingData,
  archiveSeason as archiveSeasonToServer,
  listPastSeasons as listPastSeasonsFromServer,
  fetchPastSeason as fetchPastSeasonFromServer,
} from "@/lib/api";
import {
  SESSION_KEY,
  rotateSessionId,
  touchRecentSession,
  getSessionId,
} from "@/lib/sessionId";
import { newId } from "@/lib/ids";
import {
  extractInlineAction,
  decodeUnicodeEscapes,
  isIntroductionLine,
} from "@/lib/dialogueIntensity";
import { pickMinigame } from "@/lib/minigames";
import { trimSceneForPrompt } from "@/lib/scenePayload";

interface UiState {
  isCastOpen: boolean;
  isRelationshipsOpen: boolean;
  isScenarioPickerOpen: boolean;
  activeRelationshipMetric: RelationshipMetric;
  lineDelayMs: number;
  tooltipsEnabled: boolean;
  musicEnabled: boolean;
  isPaused: boolean;
}

export interface PrefetchMetrics {
  batchesStarted: number;
  batchesCompleted: number;
  scenesReady: number;
  scenesFailed: number;
  fallbacksEmitted: number;
  lastBatchMs: number | null;
  lastReadyAt: number | null;
}

const INITIAL_PREFETCH_METRICS: PrefetchMetrics = {
  batchesStarted: 0,
  batchesCompleted: 0,
  scenesReady: 0,
  scenesFailed: 0,
  fallbacksEmitted: 0,
  lastBatchMs: null,
  lastReadyAt: null,
};

interface VillaState {
  cast: Agent[];
  episode: Episode;
  currentSceneId: string | null;
  currentLineIndex: number;
  isGenerating: boolean;
  lastError: string | null;
  generationProgress: { percent: number; label: string } | null;
  sceneQueue: QueuedScene[];
  prefetchMetrics: PrefetchMetrics;
  viewerMessages: ViewerMessage[];
  ui: UiState;

  pastSeasons: Array<{
    seasonNumber: number;
    episodeTitle: string | null;
    seasonTheme: string | null;
    winnerCouple: unknown;
    sceneCount: number;
  }>;
  pastSeasonsLoading: boolean;
  pastSeasonView: SeasonArchive | null;
  pastSeasonViewerOpen: boolean;
  refreshPastSeasons: () => Promise<void>;
  openPastSeasonSummary: (seasonNumber: number) => Promise<void>;
  closePastSeasonSummary: () => void;
  startPastSeasonViewer: () => void;
  closePastSeasonViewer: () => void;

  startNewVilla: () => Promise<void>;

  startNextSeason: () => Promise<void>;
  generateScene: (type?: SceneType) => Promise<void>;
  triggerPrefetch: (inProgressSceneType?: SceneType) => void;
  advanceLine: () => void;
  resetLineIndex: () => void;
  toggleCast: () => void;
  toggleRelationships: () => void;
  setRelationshipMetric: (m: RelationshipMetric) => void;
  selectScene: (sceneId: string) => void;
  toggleTooltips: () => void;
  toggleMusic: () => void;
  togglePause: () => void;
  exportSeasonData: () => void;
  exportRLData: () => void;
}

const CORE_TENSIONS = [
  "Two islanders have a scandalous shared past and don't want anyone else to find out",
  "One islander is hiding that they're here purely for the prize money",
  "Two islanders are in a fake alliance pretending they don't fancy each other",
  "A secret friendship rivalry is brewing — two islanders keep blocking each other romantically",
  "One islander is torn between two people who both want them",
  "A jealousy spiral is quietly starting between two pairs",
  "One islander is catching real feelings for someone they swore was their type",
  "Someone is double-dipping — flirting hard with two contestants at once",
  "One islander is plotting to sabotage a specific couple",
  "A contestant is hiding a major insecurity that will burst out at the wrong moment",
];

const HIDDEN_TWISTS = [
  "a bombshell arrives who shares history with one of the original cast",
  "one contestant will turn out to have a completely different motive than they stated in their intro",
  "an unexpected alliance between two opposites will form by scene 8",
  "a seemingly-loyal contestant will defect at the worst possible moment",
  "the quietest islander becomes the most dangerous strategist",
  "the front-runner couple will have a spectacular public blowup",
];

const VIBE_DIALS = [
  "slow-burn romantic",
  "chaotic messy",
  "scheming strategic",
  "high-drama explosive",
  "comedic and self-aware",
  "bittersweet and vulnerable",
];

const WILDCARD_DIRECTIVES = [
  "Someone will tell a damaging lie in an early scene that pays off mid-season",
  "Someone will break down crying in public",
  "Two contestants will share a secret kiss that no one else sees",
  "A bombshell will reject everyone and create a new kind of drama",
  "A couple will fake their bond for strategic reasons",
  "An unexpected friendship will matter more than any romance",
];

function pickFromArray<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]!;
}

function pickRandomN<T>(arr: T[], n: number): T[] {
  const shuffled = [...arr].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, n);
}

function pickTheme(): string {
  const core = pickFromArray(CORE_TENSIONS);
  const twist = pickFromArray(HIDDEN_TWISTS);
  const vibe = pickFromArray(VIBE_DIALS);
  const wildcard = pickFromArray(WILDCARD_DIRECTIVES);
  return `CORE TENSION: ${core}.
HIDDEN TWIST: By the end of the season, ${twist}.
VIBE: The overall tone is ${vibe}.
WILDCARD DIRECTIVE: ${wildcard}.`;
}

const MAX_ARCHIVED_PER_AGENT = 6;
const WISDOM_IMPORTANCE_THRESHOLD = 7;
const MAX_META_WISDOM = 10;

async function archiveSeasonWisdom(
  episode: Episode,
  cast: Agent[],
): Promise<void> {
  const archive = loadWisdomArchive();
  const meta = loadMetaWisdom();
  const allSeasonReflections: AgentMemory[] = [];

  for (const [agentId, brain] of Object.entries(episode.brains)) {
    const keep = brain.memories
      .filter(
        (m) =>
          m.type === "reflection" &&
          m.importance >= WISDOM_IMPORTANCE_THRESHOLD,
      )
      .slice(-3)
      .map((m) => ({
        ...m,
        content: m.content.startsWith("[past season lesson]")
          ? m.content
          : `[past season lesson] ${m.content}`,
        id: `${m.id}-archived`,
      }));
    if (keep.length === 0) continue;
    allSeasonReflections.push(...keep);
    const existing = archive.get(agentId) ?? [];
    const combined = [...existing, ...keep].slice(-MAX_ARCHIVED_PER_AGENT);
    archive.set(agentId, combined);
  }

  const topMeta = allSeasonReflections
    .sort((a, b) => b.importance - a.importance)
    .slice(0, 3)
    .map((m) => ({
      ...m,
      content: m.content.startsWith("[villa meta-wisdom]")
        ? m.content
        : `[villa meta-wisdom] ${m.content}`,
      id: `${m.id}-meta`,
      agentId: "meta",
    }));
  meta.push(...topMeta);
  while (meta.length > MAX_META_WISDOM) meta.shift();

  await persistWisdom();

  autoSaveTrainingData(episode, cast);
}

let seasonCounter = 0;

function createEpisode(): Episode {
  seasonCounter += 1;
  const { cast: castPool, bombshells: bombshellPool } = sampleSeasonCast();
  const initialLocations: Record<string, SceneType> = {};
  const initialBrains: Record<string, AgentBrain> = {};
  const wisdomArchive = loadWisdomArchive();
  const metaWisdom = loadMetaWisdom();
  for (const agent of castPool) {
    initialLocations[agent.id] = "bedroom";
    const archivedWisdom = wisdomArchive.get(agent.id);
    const seedMemories = archivedWisdom
      ? [...archivedWisdom]
      : metaWisdom.length > 0
        ? pickRandomN(metaWisdom, Math.min(3, metaWisdom.length)).map((m) => ({
            ...m,
            agentId: agent.id,
            id: `${m.id}-${agent.id}`,
          }))
        : [];
    initialBrains[agent.id] = {
      agentId: agent.id,
      memories: seedMemories,
      goal: "",
      policy: "",
      personalityShift: "",
      rewards: [],
      cumulativeReward: 0,
      lastReflectionScene: 0,
    };
  }
  return {
    id: newId("ep"),
    number: seasonCounter,
    title: `Season ${seasonCounter}`,
    seasonTheme: pickTheme(),
    scenes: [],
    relationships: buildSeedRelationships(castPool),
    emotions: buildSeedEmotions(castPool),
    couples: [],
    eliminatedIds: [],
    unpairedStreak: {},
    winnerCouple: null,
    locations: initialLocations,
    brains: initialBrains,
    activeCastIds: castPool.map((c) => c.id),
    bombshellsIntroduced: [],
    soloSinceBombshell: {},
    graceExpiresAt: {},
    castPool,
    bombshellPool,
    sceneRotation: [],
    seasonPhase: "intro",
    dramaScores: {},
    lastBombshellScene: null,
    bombshellDatingUntilScene: null,
    casaAmorState: null,
    viewerSentiment: {},
    crossedThresholds: [],
    gravityCumulative: {},
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

function applyRecoupleDefections(
  _couples: { a: string; b: string }[],
  activeCast: Agent[],
  relationships: Relationship[],
  eliminatedIds: string[],
): { a: string; b: string }[] {
  const eligible = activeCast.filter((a) => !eliminatedIds.includes(a.id));
  const remaining = [...eligible];
  const newCouples: { a: string; b: string }[] = [];

  function pairScore(aId: string, bId: string): number {
    const ab = relationships.find((r) => r.fromId === aId && r.toId === bId);
    const ba = relationships.find((r) => r.fromId === bId && r.toId === aId);
    return (
      (ab?.attraction ?? 0) +
      (ba?.attraction ?? 0) +
      (ab?.trust ?? 0) +
      (ba?.trust ?? 0) +
      (ab?.compatibility ?? 0) +
      (ba?.compatibility ?? 0) +
      Math.random() * 10
    );
  }

  const MAX_COUPLES = 7;
  while (remaining.length >= 2 && newCouples.length < MAX_COUPLES) {
    const chooser = remaining[0]!;
    remaining.splice(0, 1);

    let bestIdx = 0;
    let bestScore = -Infinity;
    for (let i = 0; i < remaining.length; i++) {
      const score = pairScore(chooser.id, remaining[i]!.id);
      if (score > bestScore) {
        bestScore = score;
        bestIdx = i;
      }
    }

    const chosen = remaining[bestIdx]!;
    remaining.splice(bestIdx, 1);
    newCouples.push({ a: chooser.id, b: chosen.id });
  }

  return newCouples;
}

function buildRecoupleScript(
  couples: { a: string; b: string }[],
  activeCast: Agent[],
  relationships: Relationship[],
): {
  steps: Array<{
    chooserId: string;
    chooserName: string;
    partnerId: string;
    partnerName: string;
    rationale: string;
  }>;
  unpairedId?: string;
  unpairedName?: string;
} {
  const nameOf = (id: string) =>
    activeCast.find((a) => a.id === id)?.name ?? id;

  function rationaleFor(aId: string, bId: string): string {
    const ab = relationships.find((r) => r.fromId === aId && r.toId === bId);
    const ba = relationships.find((r) => r.fromId === bId && r.toId === aId);
    const att = ((ab?.attraction ?? 0) + (ba?.attraction ?? 0)) / 2;
    const trust = ((ab?.trust ?? 0) + (ba?.trust ?? 0)) / 2;
    const compat = ((ab?.compatibility ?? 0) + (ba?.compatibility ?? 0)) / 2;
    const top = Math.max(att, trust, compat);
    if (top === att && att >= 55) return "the chemistry is undeniable";
    if (top === trust && trust >= 55) return "they feel safe with this person";
    if (top === compat && compat >= 55)
      return "they click in a way the villa can see";
    if (att >= 40) return "a spark worth exploring further";
    return "a strategic choice — staying in the game is survival";
  }

  const steps = couples.map((c) => ({
    chooserId: c.a,
    chooserName: nameOf(c.a),
    partnerId: c.b,
    partnerName: nameOf(c.b),
    rationale: rationaleFor(c.a, c.b),
  }));

  const pairedIds = new Set<string>();
  for (const c of couples) {
    pairedIds.add(c.a);
    pairedIds.add(c.b);
  }
  const unpaired = activeCast.find((a) => !pairedIds.has(a.id));
  return {
    steps,
    unpairedId: unpaired?.id,
    unpairedName: unpaired?.name,
  };
}

function forcePairUnpaired(
  activeCast: Agent[],
  currentCouples: { a: string; b: string }[],
  relationships: Relationship[],
  eliminatedIds: string[],
): { a: string; b: string }[] {
  const pairedIds = new Set<string>();
  for (const c of currentCouples) {
    pairedIds.add(c.a);
    pairedIds.add(c.b);
  }
  const unpaired = activeCast.filter(
    (a) => !pairedIds.has(a.id) && !eliminatedIds.includes(a.id),
  );
  if (unpaired.length < 2) return currentCouples;

  function pairScore(aId: string, bId: string): number {
    const ab = relationships.find((r) => r.fromId === aId && r.toId === bId);
    const ba = relationships.find((r) => r.fromId === bId && r.toId === aId);
    return (
      (ab?.attraction ?? 0) +
      (ba?.attraction ?? 0) +
      (ab?.compatibility ?? 0) +
      (ba?.compatibility ?? 0) +
      Math.random() * 8
    );
  }

  const MAX_COUPLES = 7;
  const result = [...currentCouples];
  const remaining = [...unpaired];
  while (remaining.length >= 2 && result.length < MAX_COUPLES) {
    let bestScore = -Infinity;
    let bestI = 0;
    let bestJ = 1;
    for (let i = 0; i < remaining.length; i++) {
      for (let j = i + 1; j < remaining.length; j++) {
        const s = pairScore(remaining[i]!.id, remaining[j]!.id);
        if (s > bestScore) {
          bestScore = s;
          bestI = i;
          bestJ = j;
        }
      }
    }
    result.push({ a: remaining[bestI]!.id, b: remaining[bestJ]!.id });
    remaining.splice(bestJ, 1);
    remaining.splice(bestI, 1);
  }

  return result;
}

function seedRelationshipsForNewAgent(
  newAgentId: string,
  existingAgentIds: string[],
): Relationship[] {
  const rels: Relationship[] = [];
  for (const otherId of existingAgentIds) {
    rels.push({
      fromId: newAgentId,
      toId: otherId,
      trust: Math.floor(Math.random() * 5),
      attraction: 5 + Math.floor(Math.random() * 11),
      jealousy: 0,
      compatibility: 30 + Math.floor(Math.random() * 20),
    });
    rels.push({
      fromId: otherId,
      toId: newAgentId,
      trust: Math.floor(Math.random() * 5),
      attraction: 5 + Math.floor(Math.random() * 11),
      jealousy: 0,
      compatibility: 30 + Math.floor(Math.random() * 20),
    });
  }
  return rels;
}

const REFLECTION_INTERVAL = 3;
const MAX_RETRIEVED_MEMORIES = 5;

const CHILL_SPOTS: SceneType[] = ["firepit", "pool", "kitchen", "bedroom"];

function computeLocations(
  cast: Agent[],
  eliminatedIds: string[],
  participantIds: string[],
  sceneType: SceneType,
  prev: Record<string, SceneType>,
): Record<string, SceneType> {
  const next: Record<string, SceneType> = { ...prev };
  const otherSpots = CHILL_SPOTS.filter((s) => s !== sceneType);
  for (const agent of cast) {
    if (eliminatedIds.includes(agent.id)) {
      delete next[agent.id];
      continue;
    }
    if (participantIds.includes(agent.id)) {
      next[agent.id] = sceneType;
    } else {
      const idx = Math.floor(Math.random() * otherSpots.length);
      next[agent.id] = otherSpots[idx] ?? "bedroom";
    }
  }
  return next;
}

function applyRelDelta(
  rels: Relationship[],
  from: string,
  to: string,
  type:
    | "trust_change"
    | "attraction_change"
    | "jealousy_spike"
    | "compatibility_change",
  delta: number,
) {
  const r = rels.find((x) => x.fromId === from && x.toId === to);
  if (!r) return;
  if (type === "trust_change") r.trust = clamp(r.trust + delta);
  if (type === "attraction_change") r.attraction = clamp(r.attraction + delta);
  if (type === "jealousy_spike")
    r.jealousy = clamp(r.jealousy + Math.abs(delta));
  if (type === "compatibility_change")
    r.compatibility = clamp(r.compatibility + delta);
}

type ReducerEvent = Pick<
  SystemEvent,
  "type" | "fromId" | "toId" | "delta" | "metric"
>;

function applyGravityEvent(rels: Relationship[], event: ReducerEvent) {
  if (!event.fromId || !event.toId || event.delta === undefined) return;
  if (!event.metric) return;
  const r = rels.find(
    (x) => x.fromId === event.fromId && x.toId === event.toId,
  );
  if (!r) return;
  if (event.metric === "trust") r.trust = clamp(r.trust + event.delta);
  if (event.metric === "attraction")
    r.attraction = clamp(r.attraction + event.delta);
}

function applyEventList(
  rels: Relationship[],
  couples: { a: string; b: string }[],
  events: readonly ReducerEvent[],
): {
  rels: Relationship[];
  couples: { a: string; b: string }[];
} {
  const newRels = rels.map((r) => ({ ...r }));
  let newCouples = couples.map((c) => ({ ...c }));

  for (const event of events) {
    if (event.type === "couple_formed" && event.fromId && event.toId) {
      newCouples = newCouples.filter(
        (c) =>
          c.a !== event.fromId &&
          c.b !== event.fromId &&
          c.a !== event.toId &&
          c.b !== event.toId,
      );
      newCouples.push({ a: event.fromId, b: event.toId });
      continue;
    }
    if (event.type === "couple_broken" && event.fromId && event.toId) {
      newCouples = newCouples.filter(
        (c) =>
          !(
            (c.a === event.fromId && c.b === event.toId) ||
            (c.a === event.toId && c.b === event.fromId)
          ),
      );
      continue;
    }

    if (event.type === "gravity_shift" || event.type === "gravity_threshold") {
      applyGravityEvent(newRels, event);
      continue;
    }

    if (!event.fromId || !event.toId || event.delta === undefined) continue;
    if (
      event.type === "trust_change" ||
      event.type === "attraction_change" ||
      event.type === "jealousy_spike" ||
      event.type === "compatibility_change"
    ) {
      applyRelDelta(newRels, event.fromId, event.toId, event.type, event.delta);
    }
  }

  return { rels: newRels, couples: newCouples };
}

function applyDeltas(
  rels: Relationship[],
  emotions: EmotionState[],
  couples: { a: string; b: string }[],
  llm: LlmSceneResponse,
): {
  rels: Relationship[];
  emotions: EmotionState[];
  couples: { a: string; b: string }[];
} {
  const { rels: newRels, couples: newCouples } = applyEventList(
    rels,
    couples,
    llm.systemEvents,
  );

  const newEmotions = emotions.map((e) => ({ ...e }));
  for (const update of llm.emotionUpdates) {
    const idx = newEmotions.findIndex((e) => e.agentId === update.agentId);
    if (idx >= 0) {
      newEmotions[idx] = {
        agentId: update.agentId,
        primary: update.primary,
        intensity: update.intensity,
      };
    }
  }

  return { rels: newRels, emotions: newEmotions, couples: newCouples };
}

function clamp(n: number): number {
  return Math.max(0, Math.min(100, n));
}

function tensionForCouple(couple: Couple, rels: Relationship[]): number {
  const ab = rels.find((r) => r.fromId === couple.a && r.toId === couple.b);
  const ba = rels.find((r) => r.fromId === couple.b && r.toId === couple.a);
  const jealousy = (ab?.jealousy ?? 0) + (ba?.jealousy ?? 0);
  const trustGap = Math.abs((ab?.trust ?? 50) - (ba?.trust ?? 50));
  const avgTrust = ((ab?.trust ?? 50) + (ba?.trust ?? 50)) / 2;
  return jealousy + trustGap + (50 - avgTrust);
}

function applyEliminations(
  cast: Agent[],
  couples: { a: string; b: string }[],
  eliminatedIds: string[],
  sceneType: SceneType,
  recoupleOrdinal: number,
  isFinale: boolean,
  relationships: Relationship[],
  graceExpiresAt: Record<string, number>,
): {
  eliminatedIds: string[];
  couples: { a: string; b: string }[];
  winnerCouple: { a: string; b: string } | null;
  graceExpiresAt: Record<string, number>;
} {
  const newEliminated = [...eliminatedIds];
  const newGrace = { ...graceExpiresAt };
  let activeCouples = couples.filter(
    (c) => !newEliminated.includes(c.a) && !newEliminated.includes(c.b),
  );

  function pairScore(a: string, b: string): number {
    const ab = relationships.find((r) => r.fromId === a && r.toId === b);
    const ba = relationships.find((r) => r.fromId === b && r.toId === a);
    return (
      (ab?.attraction ?? 0) +
      (ba?.attraction ?? 0) +
      (ab?.compatibility ?? 0) +
      (ba?.compatibility ?? 0)
    );
  }

  if (isFinale) {
    const stillActive = cast.filter((a) => !newEliminated.includes(a.id));

    if (stillActive.length <= 2 && activeCouples.length === 1) {
      return {
        eliminatedIds: newEliminated,
        couples: activeCouples,
        winnerCouple: activeCouples[0]!,
        graceExpiresAt: newGrace,
      };
    }

    if (activeCouples.length > 1) {
      const sorted = [...activeCouples].sort(
        (x, y) => pairScore(x.a, x.b) - pairScore(y.a, y.b),
      );
      const weakest = sorted[0]!;
      newEliminated.push(weakest.a, weakest.b);
      delete newGrace[weakest.a];
      delete newGrace[weakest.b];
      activeCouples = activeCouples.filter(
        (c) =>
          !(
            (c.a === weakest.a && c.b === weakest.b) ||
            (c.a === weakest.b && c.b === weakest.a)
          ),
      );

      if (activeCouples.length === 1) {
        return {
          eliminatedIds: newEliminated,
          couples: activeCouples,
          winnerCouple: activeCouples[0]!,
          graceExpiresAt: newGrace,
        };
      }
    } else if (activeCouples.length === 1) {
      for (const agent of stillActive) {
        if (
          agent.id === activeCouples[0]!.a ||
          agent.id === activeCouples[0]!.b
        )
          continue;
        if (!newEliminated.includes(agent.id)) {
          newEliminated.push(agent.id);
          delete newGrace[agent.id];
        }
      }
      return {
        eliminatedIds: newEliminated,
        couples: activeCouples,
        winnerCouple: activeCouples[0]!,
        graceExpiresAt: newGrace,
      };
    } else {
      let champion: { a: string; b: string } | null = null;
      if (stillActive.length >= 2) {
        champion = { a: stillActive[0]!.id, b: stillActive[1]!.id };
        let best = pairScore(champion.a, champion.b);
        for (let i = 0; i < stillActive.length; i++) {
          for (let j = i + 1; j < stillActive.length; j++) {
            const score = pairScore(stillActive[i]!.id, stillActive[j]!.id);
            if (score > best) {
              best = score;
              champion = { a: stillActive[i]!.id, b: stillActive[j]!.id };
            }
          }
        }
      }
      if (champion) {
        for (const agent of cast) {
          if (agent.id === champion.a || agent.id === champion.b) continue;
          if (!newEliminated.includes(agent.id)) {
            newEliminated.push(agent.id);
            delete newGrace[agent.id];
          }
        }
        activeCouples = [champion];
      }
      return {
        eliminatedIds: newEliminated,
        couples: activeCouples,
        winnerCouple: champion,
        graceExpiresAt: newGrace,
      };
    }

    return {
      eliminatedIds: newEliminated,
      couples: activeCouples,
      winnerCouple: null,
      graceExpiresAt: newGrace,
    };
  }

  if (sceneType !== "recouple") {
    return {
      eliminatedIds: newEliminated,
      couples: activeCouples,
      winnerCouple: null,
      graceExpiresAt: newGrace,
    };
  }

  if (recoupleOrdinal <= 1) {
    return {
      eliminatedIds: newEliminated,
      couples: activeCouples,
      winnerCouple: null,
      graceExpiresAt: newGrace,
    };
  }

  const activeContestants = cast.filter((a) => !newEliminated.includes(a.id));
  const pairedIds = new Set<string>();
  for (const c of activeCouples) {
    pairedIds.add(c.a);
    pairedIds.add(c.b);
  }

  const unpaired = activeContestants.filter((a) => !pairedIds.has(a.id));
  for (const agent of unpaired) {
    const graceExpiry = newGrace[agent.id];
    if (graceExpiry !== undefined && recoupleOrdinal < graceExpiry) continue;
    newEliminated.push(agent.id);
    delete newGrace[agent.id];
  }

  if (
    recoupleOrdinal >= 3 &&
    activeCouples.length > 2 &&
    activeContestants.length > 6
  ) {
    const sorted = [...activeCouples].sort(
      (x, y) => pairScore(x.a, x.b) - pairScore(y.a, y.b),
    );
    const weakest = sorted[0]!;
    if (!newEliminated.includes(weakest.a)) {
      newEliminated.push(weakest.a);
      delete newGrace[weakest.a];
    }
    if (!newEliminated.includes(weakest.b)) {
      newEliminated.push(weakest.b);
      delete newGrace[weakest.b];
    }
  }

  activeCouples = activeCouples.filter(
    (c) => !newEliminated.includes(c.a) && !newEliminated.includes(c.b),
  );

  return {
    eliminatedIds: newEliminated,
    couples: activeCouples,
    winnerCouple: null,
    graceExpiresAt: newGrace,
  };
}

const INITIAL_EPISODE = createEpisode();

const DEFAULT_UI: UiState = {
  isCastOpen: false,
  isRelationshipsOpen: false,
  isScenarioPickerOpen: false,
  activeRelationshipMetric: "attraction",
  lineDelayMs: 2200,
  tooltipsEnabled: true,
  musicEnabled: false,
  isPaused: false,
};

function stripEmbeddings(
  brains: Record<string, AgentBrain>,
): Record<string, AgentBrain> {
  const stripped: Record<string, AgentBrain> = {};
  for (const [id, brain] of Object.entries(brains)) {
    stripped[id] = {
      ...brain,
      memories: brain.memories.map((m) => ({ ...m, embedding: [] })),
    };
  }
  return stripped;
}

function syncToServer(state: { episode: Episode; cast: Agent[] }): void {
  const payload = {
    ...state.episode,
    brains: stripEmbeddings(state.episode.brains),
  };
  const id = localStorage.getItem(SESSION_KEY);
  if (id) {
    const scenes = state.episode.scenes.length;
    const theme = state.episode.seasonTheme.split("\n")[0]?.slice(0, 40) ?? "";
    const label = theme
      ? `Season ${state.episode.number} · ${scenes} scenes · ${theme}`
      : `Season ${state.episode.number} · ${scenes} scenes`;
    touchRecentSession(id, label);
  }
  saveSessionToServer(payload, state.cast).catch(() => {
    setTimeout(() => {
      saveSessionToServer(payload, state.cast).catch((err) => {
        console.warn(
          "[sync] failed to save to server:",
          err instanceof Error ? err.message : err,
        );
      });
    }, 2000);
  });

  if (state.episode.scenes.length > 0) {
    const castNames = state.cast.reduce(
      (acc, a) => {
        acc[a.id] = a.name;
        return acc;
      },
      {} as Record<string, string>,
    );
    const trainingPayload = {
      seasonNumber: state.episode.number,
      seasonTheme: state.episode.seasonTheme,
      seasonPhase: state.episode.seasonPhase,
      totalScenes: state.episode.scenes.length,
      castNames,
      scenes: state.episode.scenes.map((s, i) => ({
        sceneNumber: i + 1,
        sceneType: s.type,
        title: s.title,
        dialogue: s.dialogue,
        systemEvents: s.systemEvents,
        outcome: s.outcome,
        participantIds: s.participantIds,
      })),
      relationships: state.episode.relationships,
      couples: state.episode.couples,
      eliminatedIds: state.episode.eliminatedIds,
      winnerCouple: state.episode.winnerCouple,
      dramaScores: state.episode.dramaScores,
      viewerSentiment: state.episode.viewerSentiment,
      casaAmorState: state.episode.casaAmorState,
    };
    saveTrainingData(trainingPayload).catch(() => {
      setTimeout(() => {
        saveTrainingData(trainingPayload).catch((err) => {
          console.warn(
            "[sync] failed to save training data:",
            err instanceof Error ? err.message : err,
          );
        });
      }, 2000);
    });
  }
}

export const useVillaStore = create<VillaState>()((set, get) => ({
  cast: INITIAL_EPISODE.castPool,
  episode: INITIAL_EPISODE,
  currentSceneId: null,
  currentLineIndex: 0,
  isGenerating: false,
  lastError: null,
  generationProgress: null,
  sceneQueue: [],
  prefetchMetrics: { ...INITIAL_PREFETCH_METRICS },
  viewerMessages: [],
  ui: { ...DEFAULT_UI },

  pastSeasons: [],
  pastSeasonsLoading: false,
  pastSeasonView: null,
  pastSeasonViewerOpen: false,

  refreshPastSeasons: async () => {
    const sessionId = getSessionId();
    if (!sessionId) return;
    set({ pastSeasonsLoading: true });
    try {
      const data = await listPastSeasonsFromServer(sessionId);
      set({
        pastSeasons: data.seasons.map((s) => ({
          seasonNumber: s.seasonNumber,
          episodeTitle: s.episodeTitle,
          seasonTheme: s.seasonTheme,
          winnerCouple: s.winnerCouple,
          sceneCount: s.sceneCount,
        })),
        pastSeasonsLoading: false,
      });
    } catch (err) {
      console.warn(
        "[past-seasons] list failed:",
        err instanceof Error ? err.message : err,
      );
      set({ pastSeasonsLoading: false });
    }
  },

  openPastSeasonSummary: async (seasonNumber: number) => {
    const sessionId = getSessionId();
    if (!sessionId) return;
    try {
      const data = (await fetchPastSeasonFromServer(
        sessionId,
        seasonNumber,
      )) as SeasonArchive;
      set({ pastSeasonView: data, pastSeasonViewerOpen: false });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[past-seasons] fetch failed:", msg);
      set({
        lastError: `Could not load Season ${seasonNumber} (${msg}).`,
      });
    }
  },

  closePastSeasonSummary: () => {
    set({ pastSeasonView: null, pastSeasonViewerOpen: false });
  },

  startPastSeasonViewer: () => {
    const { pastSeasonView } = get();
    if (!pastSeasonView) return;
    set({ pastSeasonViewerOpen: true });
  },

  closePastSeasonViewer: () => {
    set({ pastSeasonViewerOpen: false });
  },

  startNewVilla: async () => {
    const prev = get();
    if (prev.isGenerating) {
      set({
        lastError:
          "Wait for the current scene to finish before starting a new episode.",
      });
      return;
    }
    try {
      await archiveSeasonWisdom(prev.episode, prev.cast);
    } catch (err) {
      console.warn(
        "[new-episode] wisdom archive failed, continuing anyway:",
        err instanceof Error ? err.message : err,
      );
    }
    refreshTrainingCache().catch(() => {});

    try {
      await rotateSessionId();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[new-episode] UUID rotation failed:", msg);
      set({
        lastError: `Could not start a new episode — session rotation failed (${msg}). Check your connection and try again.`,
      });
      return;
    }

    seasonCounter = 0;

    resetPrefetchState();
    const newEpisode = createEpisode();
    set((s) => ({
      cast: newEpisode.castPool,
      episode: newEpisode,
      currentSceneId: null,
      currentLineIndex: 0,
      lastError: null,
      generationProgress: null,
      sceneQueue: [],
      prefetchMetrics: { ...INITIAL_PREFETCH_METRICS },
      viewerMessages: [],
      ui: { ...s.ui, isPaused: false },
    }));
    syncToServer({ episode: newEpisode, cast: newEpisode.castPool });
  },

  startNextSeason: async () => {
    const prev = get();
    if (prev.isGenerating) {
      set({
        lastError:
          "Wait for the current scene to finish before starting a new season.",
      });
      return;
    }

    try {
      await archiveSeasonWisdom(prev.episode, prev.cast);
    } catch (err) {
      console.warn(
        "[new-season] wisdom archive failed, continuing anyway:",
        err instanceof Error ? err.message : err,
      );
    }
    refreshTrainingCache().catch(() => {});

    const sessionId = getSessionId();
    const archive: SeasonArchive = {
      sessionId,
      seasonNumber: prev.episode.number,
      archivedAt: Date.now(),
      episodeId: prev.episode.id,
      episodeTitle: prev.episode.title,
      seasonTheme: prev.episode.seasonTheme,
      castPool: prev.episode.castPool,
      bombshellPool: prev.episode.bombshellPool,
      winnerCouple: prev.episode.winnerCouple,
      eliminatedIds: prev.episode.eliminatedIds,
      scenes: prev.episode.scenes,
      finalRelationships: prev.episode.relationships,
      finalViewerSentiment: prev.episode.viewerSentiment,
      dramaScores: prev.episode.dramaScores,
      viewerMessages: prev.viewerMessages,
    };
    try {
      await archiveSeasonToServer(
        sessionId,
        prev.episode.number,
        archive as unknown as Record<string, unknown>,
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[new-season] season archive failed:", msg);
      set({
        lastError: `Could not archive the finished season (${msg}). Check your connection and try again — past seasons need to be saved before starting the next one.`,
      });
      return;
    }

    resetPrefetchState();
    const newEpisode = createEpisode();
    set((s) => ({
      cast: newEpisode.castPool,
      episode: newEpisode,
      currentSceneId: null,
      currentLineIndex: 0,
      lastError: null,
      generationProgress: null,
      sceneQueue: [],
      prefetchMetrics: { ...INITIAL_PREFETCH_METRICS },
      viewerMessages: [],
      ui: { ...s.ui, isPaused: false },
    }));
    syncToServer({ episode: newEpisode, cast: newEpisode.castPool });
  },

  triggerPrefetch: (inProgressSceneType) => {
    const state = get();
    if (state.episode.winnerCouple) return;
    const activeCast = state.cast.filter(
      (a) => !state.episode.eliminatedIds.includes(a.id),
    );

    const STATE_MUTATING: ReadonlySet<SceneType> = new Set([
      "recouple",
      "bombshell",
      "minigame",
      "challenge",
      "public_vote",
      "islander_vote",
      "producer_twist",
      "casa_amor_arrival",
      "casa_amor_date",
      "casa_amor_challenge",
      "casa_amor_stickswitch",
    ]);
    const safeToSimulate =
      inProgressSceneType && !STATE_MUTATING.has(inProgressSceneType);
    const simulatedScenes = safeToSimulate
      ? [
          ...state.episode.scenes,
          { type: inProgressSceneType } as unknown as Scene,
        ]
      : state.episode.scenes;

    const policy = planPrefetch(
      state.sceneQueue.length,
      simulatedScenes.length,
      activeCast.length,
      state.ui.isPaused,
    );
    if (!policy) return;

    const snapshotEpisodeId = state.episode.id;
    const batchStartedAt = Date.now();
    set((s) => ({
      prefetchMetrics: {
        ...s.prefetchMetrics,
        batchesStarted: s.prefetchMetrics.batchesStarted + 1,
      },
    }));
    prefetchScenes({
      activeCast,
      scenes: simulatedScenes,
      relationships: state.episode.relationships,
      emotions: state.episode.emotions,
      couples: state.episode.couples,
      eliminatedIds: state.episode.eliminatedIds,
      seasonTheme: state.episode.seasonTheme,
      bombshellsIntroduced: state.episode.bombshellsIntroduced,
      bombshellPool: state.episode.bombshellPool,
      lastBombshellScene: state.episode.lastBombshellScene,
      bombshellDatingUntilScene: state.episode.bombshellDatingUntilScene,
      casaAmorState: state.episode.casaAmorState,
      avgDramaScore: averageDramaScore(state.episode.dramaScores),
      gapToFill: policy.gapToFill,
      viewerSentiment: state.episode.viewerSentiment,
      onSceneReady: (queued) => {
        if (get().episode.id !== snapshotEpisodeId) return;
        set((s) => ({
          sceneQueue: [...s.sceneQueue, queued],
          prefetchMetrics: {
            ...s.prefetchMetrics,
            scenesReady: s.prefetchMetrics.scenesReady + 1,
            lastReadyAt: Date.now(),
          },
        }));
      },
    })
      .then(() => {
        if (get().episode.id !== snapshotEpisodeId) return;
        const elapsed = Date.now() - batchStartedAt;
        set((s) => ({
          prefetchMetrics: {
            ...s.prefetchMetrics,
            batchesCompleted: s.prefetchMetrics.batchesCompleted + 1,
            lastBatchMs: elapsed,
          },
        }));
        console.log(
          `[scene-prefetch] batch done — ${elapsed}ms, queue depth ${get().sceneQueue.length}`,
        );
      })
      .catch((err) => {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn("[scene-prefetch] run failed:", msg);
      });
  },

  generateScene: async (type) => {
    const initial = get();
    if (initial.isGenerating) return;
    if (initial.episode.winnerCouple) return;
    if (initial.ui.isPaused) return;

    const activeCast = initial.cast.filter(
      (a) => !initial.episode.eliminatedIds.includes(a.id),
    );
    if (activeCast.length < 2) return;

    const isIntroduction = initial.episode.scenes.length === 0;
    const isFinaleScene = activeCast.length <= 2;

    let sceneType =
      type ??
      planNextScene({
        scenes: initial.episode.scenes,
        activeCastCount: activeCast.length,
        bombshellsIntroduced: initial.episode.bombshellsIntroduced.length,
        bombshellPoolSize: initial.episode.bombshellPool.length,
        coupleCount: initial.episode.couples.length,
        lastBombshellScene: initial.episode.lastBombshellScene,
        bombshellDatingUntilScene: initial.episode.bombshellDatingUntilScene,
        avgDramaScore: averageDramaScore(initial.episode.dramaScores),
        casaAmorState: initial.episode.casaAmorState,
        recoupleCount: initial.episode.scenes.filter(
          (s) => s.type === "recouple",
        ).length,
      });

    let arrivingBombshell: Agent | undefined;
    let arrivingBombshells: Agent[] = [];
    let interviewSubjectId: string | undefined;
    let competingCoupleIds: string[][] | undefined;
    let forcedParticipants: string[] | undefined;
    let isRewardDate = false;
    let rewardDateCoupleIds: string[] | undefined;
    let rewardDateCoupleNames: [string, string] | undefined;

    const prevScene = initial.episode.scenes[initial.episode.scenes.length - 1];
    if (
      sceneType === "date" &&
      (prevScene?.type === "challenge" || prevScene?.type === "minigame")
    ) {
      const winEventType =
        prevScene.type === "challenge" ? "challenge_win" : "minigame_win";
      const winEvent = prevScene.systemEvents.find(
        (e) => e.type === winEventType,
      );
      if (winEvent?.fromId && winEvent?.toId) {
        const aAgent = initial.cast.find((c) => c.id === winEvent.fromId);
        const bAgent = initial.cast.find((c) => c.id === winEvent.toId);
        if (aAgent && bAgent) {
          isRewardDate = true;
          rewardDateCoupleIds = [winEvent.fromId, winEvent.toId];
          rewardDateCoupleNames = [aAgent.name, bAgent.name];
          forcedParticipants = rewardDateCoupleIds;
        }
      }
    }

    if (
      sceneType === "date" &&
      !isRewardDate &&
      initial.episode.couples.length > 0
    ) {
      const rels = initial.episode.relationships;
      const recentDates = initial.episode.scenes
        .filter((s) => s.type === "date")
        .slice(-3);
      const scenesSinceDateByPair = new Map<string, number>();
      for (let i = recentDates.length - 1; i >= 0; i--) {
        const scene = recentDates[i]!;
        const key = [...scene.participantIds].sort().join("|");
        if (!scenesSinceDateByPair.has(key)) {
          scenesSinceDateByPair.set(key, recentDates.length - 1 - i);
        }
      }
      const ranked = [...initial.episode.couples].sort((x, y) => {
        const xKey = [x.a, x.b].sort().join("|");
        const yKey = [y.a, y.b].sort().join("|");
        const xRecency = scenesSinceDateByPair.get(xKey) ?? Infinity;
        const yRecency = scenesSinceDateByPair.get(yKey) ?? Infinity;
        if (xRecency !== yRecency) return yRecency - xRecency;
        return tensionForCouple(y, rels) - tensionForCouple(x, rels);
      });
      const focal = ranked[0]!;
      forcedParticipants = [focal.a, focal.b];
    }

    if (sceneType === "bombshell") {
      const unused = initial.episode.bombshellPool.filter(
        (b: Agent) => !initial.episode.bombshellsIntroduced.includes(b.id),
      );
      if (unused.length === 0) {
        sceneType = "firepit";
      } else {
        const count = bombshellArrivalCount(
          initial.episode.bombshellsIntroduced.length,
          initial.episode.bombshellPool.length,
          activeCast.length,
        );
        const projected = activeCast.length + count;
        if (projected % 2 === 0 && activeCast.length > 4) {
          sceneType = "islander_vote" as SceneType;
        } else {
          const shuffled = [...unused].sort(() => Math.random() - 0.5);
          arrivingBombshells = shuffled.slice(
            0,
            Math.min(count, shuffled.length),
          );
          arrivingBombshell = arrivingBombshells[0];
          forcedParticipants = [
            ...activeCast.map((a) => a.id),
            ...arrivingBombshells.map((b) => b.id),
          ];
        }
      }
    }

    let casaAmorUpdate: Partial<CasaAmorState> | null = null;
    let casaAmorNewCast: Agent[] = [];

    if (sceneType === "casa_amor_arrival") {
      casaAmorNewCast = generateCasaAmorCast(initial.cast.map((a) => a.id));
      const { villaGroupIds, casaAmorGroupIds } = splitVilla(
        activeCast,
        initial.episode.couples,
      );
      casaAmorUpdate = {
        phase: "active",
        originalCouples: [...initial.episode.couples],
        casaAmorCast: casaAmorNewCast,
        villaGroupIds,
        casaAmorGroupIds,
        scenesCompleted: 0,
        stickOrSwitchResults: [],
      };
      forcedParticipants = [
        ...activeCast.map((a) => a.id),
        ...casaAmorNewCast.map((a) => a.id),
      ];
    }

    if (
      (sceneType === "casa_amor_date" || sceneType === "casa_amor_challenge") &&
      initial.episode.casaAmorState
    ) {
      const casa = initial.episode.casaAmorState;
      const groupIds =
        casa.scenesCompleted % 2 === 0
          ? casa.villaGroupIds
          : casa.casaAmorGroupIds;
      casaAmorNewCast = casa.casaAmorCast;
      forcedParticipants = [...groupIds, ...casa.casaAmorCast.map((a) => a.id)];
    }

    if (
      sceneType === "casa_amor_stickswitch" &&
      initial.episode.casaAmorState
    ) {
      const casa = initial.episode.casaAmorState;
      casaAmorNewCast = casa.casaAmorCast;
      forcedParticipants = [
        ...activeCast.map((a) => a.id),
        ...casa.casaAmorCast.map((a) => a.id),
      ];
    }

    let grandFinaleResult: {
      winnerCouple: Couple;
      loserCouple: Couple;
      ranking: string;
    } | null = null;
    if (sceneType === "grand_finale" && initial.episode.couples.length === 2) {
      const [c1, c2] = initial.episode.couples as [Couple, Couple];
      const sentiment = initial.episode.viewerSentiment;
      const sum = (c: Couple) => (sentiment[c.a] ?? 0) + (sentiment[c.b] ?? 0);
      const rels = initial.episode.relationships;
      const chem = (c: Couple) => {
        const ab = rels.find((r) => r.fromId === c.a && r.toId === c.b);
        const ba = rels.find((r) => r.fromId === c.b && r.toId === c.a);
        return (
          (ab?.attraction ?? 0) +
          (ba?.attraction ?? 0) +
          (ab?.compatibility ?? 0) +
          (ba?.compatibility ?? 0)
        );
      };
      const s1 = sum(c1);
      const s2 = sum(c2);
      let winner: Couple;
      let loser: Couple;
      if (s1 > s2) {
        winner = c1;
        loser = c2;
      } else if (s2 > s1) {
        winner = c2;
        loser = c1;
      } else {
        if (chem(c1) >= chem(c2)) {
          winner = c1;
          loser = c2;
        } else {
          winner = c2;
          loser = c1;
        }
      }
      const nameOf = (id: string) =>
        activeCast.find((a) => a.id === id)?.name ?? id;
      grandFinaleResult = {
        winnerCouple: winner,
        loserCouple: loser,
        ranking: [
          `1st (WINNERS): ${nameOf(winner.a)} & ${nameOf(winner.b)} — live chat score ${sum(winner).toFixed(1)}`,
          `2nd (runners-up): ${nameOf(loser.a)} & ${nameOf(loser.b)} — live chat score ${sum(loser).toFixed(1)}`,
        ].join("\n"),
      };
      forcedParticipants = activeCast.map((a) => a.id);
    }

    if (sceneType === "interview") {
      const recentInterviewIds = new Set<string>();
      for (const s of initial.episode.scenes.slice(-8)) {
        if (s.type === "interview" && s.participantIds[0]) {
          recentInterviewIds.add(s.participantIds[0]);
        }
      }
      const eligible = activeCast.filter((a) => !recentInterviewIds.has(a.id));
      const pool = eligible.length > 0 ? eligible : activeCast;
      const ranked = rankByDrama(
        initial.episode.dramaScores,
        pool.map((a) => a.id),
      );
      const weights = ranked.map((_, i) => ranked.length - i + 1);
      const totalW = weights.reduce((a, b) => a + b, 0);
      let r = Math.random() * totalW;
      let pickedId = ranked[0]!;
      for (let i = 0; i < ranked.length; i++) {
        r -= weights[i]!;
        if (r <= 0) {
          pickedId = ranked[i]!;
          break;
        }
      }
      interviewSubjectId = pickedId;
      if (interviewSubjectId) {
        forcedParticipants = [interviewSubjectId];
      }
    }

    if (sceneType === "minigame") {
      const activeCouples = initial.episode.couples.filter(
        (c) =>
          !initial.episode.eliminatedIds.includes(c.a) &&
          !initial.episode.eliminatedIds.includes(c.b),
      );
      competingCoupleIds = activeCouples.map((c) => [c.a, c.b]);
      forcedParticipants = activeCast.map((a) => a.id);
    }

    if (isIntroduction || isFinaleScene) {
      forcedParticipants = activeCast.map((a) => a.id);
    }

    const upcomingRecoupleOrdinal =
      sceneType === "recouple"
        ? initial.episode.scenes.filter((s) => s.type === "recouple").length + 1
        : 0;
    const sceneInfo = getSceneLabel(sceneType, upcomingRecoupleOrdinal);
    const generationEpisodeId = initial.episode.id;

    set({
      isGenerating: true,
      lastError: null,
      generationProgress: { percent: 5, label: "preparing scene..." },
    });

    try {
      const sceneNumber = initial.episode.scenes.length + 1;

      const retrievalParticipants = activeCast;
      const sceneParticipantNames = forcedParticipants
        ? forcedParticipants.map(
            (id) => activeCast.find((a) => a.id === id)?.name ?? id,
          )
        : activeCast.map((a) => a.name);
      const agentMemories: Record<string, AgentMemory[]> = {};
      const agentGoals: Record<string, string> = {};
      const agentPolicies: Record<string, string> = {};
      if (!isIntroduction) {
        for (const agent of retrievalParticipants) {
          const brain = initial.episode.brains[agent.id];
          if (!brain) continue;
          agentGoals[agent.id] = brain.goal;
          agentPolicies[agent.id] = brain.policy;
        }
        const retrievalTasks = retrievalParticipants
          .map((agent) => {
            const brain = initial.episode.brains[agent.id];
            if (!brain || brain.memories.length === 0) {
              agentMemories[agent.id] = [];
              return null;
            }
            const emotion = initial.episode.emotions.find(
              (e) => e.agentId === agent.id,
            );
            const emotionTag = emotion ? ` (feeling ${emotion.primary})` : "";
            const otherNames = sceneParticipantNames.filter(
              (n) => n !== agent.name,
            );
            const query = buildRetrievalQuery({
              agentName: agent.name + emotionTag,
              otherParticipantNames: otherNames,
              sceneType,
              seasonTheme: initial.episode.seasonTheme,
            });
            return retrieveMemories(
              brain.memories,
              query,
              sceneNumber,
              MAX_RETRIEVED_MEMORIES,
            )
              .then((mems) => {
                agentMemories[agent.id] = mems;
              })
              .catch((err) => {
                console.warn("[memory] retrieval failed for", agent.id, err);
                agentMemories[agent.id] = [];
              });
          })
          .filter((p): p is Promise<void> => p !== null);
        const memStartedAt = performance.now();
        await Promise.all(retrievalTasks);
        if (retrievalTasks.length > 0) {
          const memMs = Math.round(performance.now() - memStartedAt);
          console.log(
            `[timing] memory-retrieval agents=${retrievalTasks.length} ms=${memMs}`,
          );
        }
      }

      let ceremonyElim: {
        eliminatedIds: string[];
        narrative: string;
        reason?: string;
      } | null = null;
      const isCeremonyScene =
        sceneType === "public_vote" ||
        sceneType === "islander_vote" ||
        sceneType === "producer_twist";
      if (isCeremonyScene && activeCast.length <= 4) {
        sceneType = "firepit" as SceneType;
      } else if (isCeremonyScene) {
        if (sceneType === "public_vote") {
          ceremonyElim = publicVoteElimination(
            activeCast,
            initial.episode.couples,
            initial.episode.relationships,
            initial.episode.viewerSentiment,
          );
        } else if (sceneType === "islander_vote") {
          ceremonyElim = islanderVoteElimination(
            activeCast,
            initial.episode.couples,
            initial.episode.relationships,
            initial.episode.viewerSentiment,
          );
        } else if (sceneType === "producer_twist") {
          ceremonyElim = producerIntervention(
            activeCast,
            initial.episode.dramaScores,
            initial.episode.relationships,
          );
        }
        if (ceremonyElim) {
          forcedParticipants = activeCast.map((a) => a.id);
        }
      }

      const needsHost =
        isIntroduction ||
        isFinaleScene ||
        sceneType === "bombshell" ||
        sceneType === "minigame" ||
        sceneType === "recouple" ||
        sceneType === "challenge" ||
        sceneType === "public_vote" ||
        sceneType === "islander_vote" ||
        sceneType === "producer_twist" ||
        sceneType.startsWith("casa_amor") ||
        sceneType === "grand_finale";

      const challengeCategory: ChallengeCategory | undefined =
        sceneType === "minigame" || sceneType === "challenge"
          ? nextChallengeCategory(initial.episode.scenes)
          : undefined;

      const eliminatedNames = ceremonyElim
        ? ceremonyElim.eliminatedIds
            .map((id) => activeCast.find((a) => a.id === id)?.name ?? id)
            .join(" and ")
        : undefined;

      const PROCEDURAL_SCENE_TYPES = new Set<SceneType>([
        "recouple",
        "bombshell",
        "minigame",
        "challenge",
        "public_vote",
        "islander_vote",
        "producer_twist",
        "casa_amor_arrival",
        "casa_amor_stickswitch",
        "grand_finale",
      ]);
      const sceneParticipants = forcedParticipants
        ? activeCast.filter((a) => forcedParticipants!.includes(a.id))
        : activeCast;
      const canUseSceneEngine =
        !isIntroduction &&
        sceneParticipants.length >= 2 &&
        !PROCEDURAL_SCENE_TYPES.has(sceneType);
      const sceneContext = canUseSceneEngine
        ? buildSceneContext({
            sceneType,
            participants: sceneParticipants,
            allCast: activeCast,
            relationships: initial.episode.relationships,
            emotions: initial.episode.emotions,
            couples: initial.episode.couples,
            brains: initial.episode.brains,
            dramaScores: initial.episode.dramaScores,
            recentScenes: initial.episode.scenes.slice(-5),
            interviewSubjectId,
          })
        : undefined;

      const recoupleScript =
        sceneType === "recouple" && !isFinaleScene
          ? buildRecoupleScript(
              applyRecoupleDefections(
                initial.episode.couples,
                activeCast,
                initial.episode.relationships,
                initial.episode.eliminatedIds,
              ),
              activeCast,
              initial.episode.relationships,
            )
          : undefined;

      const recentGameNames = initial.episode.scenes
        .slice(-6)
        .filter((s) => s.type === "minigame" || s.type === "challenge")
        .map((s) => s.title);
      const minigameDefinition =
        (sceneType === "minigame" || sceneType === "challenge") &&
        challengeCategory
          ? pickMinigame(challengeCategory, recentGameNames)
          : undefined;

      const buildArgs: BuildArgs = {
        cast: activeCast,
        host: needsHost ? HOST : undefined,
        relationships: initial.episode.relationships,
        emotions: initial.episode.emotions,
        couples: initial.episode.couples,
        recentScenes: initial.episode.scenes.slice(-3).map(trimSceneForPrompt),
        sceneType,
        seasonTheme: initial.episode.seasonTheme,
        sceneNumber,
        isIntroduction,
        isFirstCoupling:
          sceneType === "recouple" &&
          initial.episode.scenes.every((s) => s.type !== "recouple"),
        isFinale: isFinaleScene,
        forcedParticipants,
        agentMemories,
        agentGoals,
        agentPolicies,
        arrivingBombshell,
        arrivingBombshells,
        interviewSubjectId,
        competingCoupleIds,
        isRewardDate,
        rewardDateCoupleNames,
        eliminationNarrative: ceremonyElim?.narrative,
        eliminatedNames,
        challengeCategory,
        casaAmorCast: casaAmorNewCast.length > 0 ? casaAmorNewCast : undefined,
        casaAmorCoupleArchetypes:
          sceneType === "casa_amor_arrival"
            ? [
                ...initial.episode.couples.map((c) => {
                  const arch = classifyCoupleArchetype(
                    c,
                    initial.episode.relationships,
                    initial.episode.scenes,
                  );
                  const nameA =
                    activeCast.find((a) => a.id === c.a)?.name ?? c.a;
                  const nameB =
                    activeCast.find((a) => a.id === c.b)?.name ?? c.b;
                  return `${nameA} & ${nameB}: ${arch.replace(/_/g, " ")}`;
                }),
                ...activeCast
                  .filter(
                    (a) =>
                      !initial.episode.couples.some(
                        (c) => c.a === a.id || c.b === a.id,
                      ),
                  )
                  .map((a) => `${a.name}: singleton`),
              ].join("\n")
            : undefined,
        grandFinaleRanking: grandFinaleResult?.ranking,
        sceneContext,
        recoupleScript,
        minigameDefinition,
        viewerSentiment: initial.episode.viewerSentiment,
      };

      const validSceneIds =
        sceneType === "interview" && interviewSubjectId
          ? [interviewSubjectId]
          : [
              ...activeCast.map((a) => a.id),
              ...(needsHost ? [HOST.id] : []),
              ...arrivingBombshells.map((b) => b.id),
              ...casaAmorNewCast.map((a) => a.id),
            ];
      const ensembleScenes = ["minigame", "challenge", "recouple", "bombshell"];
      const requiredSpeakers =
        isIntroduction || ensembleScenes.includes(sceneType)
          ? activeCast.map((a) => a.id)
          : undefined;

      let llm: LlmSceneResponse;
      let sceneWasQueued = false;
      const queue = initial.sceneQueue;
      const matchIdx = queue.findIndex((q) => q.outline.type === sceneType);
      if (matchIdx >= 0) {
        llm = queue[matchIdx]!.scene;
        sceneWasQueued = true;
        set((s) => ({
          sceneQueue: s.sceneQueue.filter(
            (_, i, arr) => arr[i] !== queue[matchIdx],
          ),
          generationProgress: {
            percent: 40,
            label: "processing queued scene...",
          },
        }));
      } else {
        const isExpectedLive = !isBatchable(sceneType, initial.episode.scenes);
        set({
          generationProgress: {
            percent: 10,
            label: isExpectedLive
              ? "writers room is working..."
              : "catching up...",
          },
        });
        const llmStartedAt = performance.now();
        llm = await generateSceneFromLlm(
          buildArgs,
          validSceneIds,
          requiredSpeakers,
        );
        const llmMs = Math.round(performance.now() - llmStartedAt);
        console.log(
          `[timing] live-gen sceneNumber=${sceneNumber} type=${sceneType} ms=${llmMs}`,
        );
      }

      set({
        generationProgress: {
          percent: 40,
          label: "scene written, processing...",
        },
      });

      const fresh = get();
      if (fresh.episode.id !== generationEpisodeId) {
        set({ isGenerating: false });
        return;
      }
      if (fresh.ui.isPaused) {
        set({ isGenerating: false });
        return;
      }

      const sanitizedLlm: LlmSceneResponse = {
        ...llm,
        systemEvents: llm.systemEvents.filter(
          (e) => e.fromId !== HOST.id && e.toId !== HOST.id,
        ),
      };

      const participantIds = Array.from(
        new Set(
          llm.dialogue.map((d) => d.agentId).filter((id) => id !== HOST.id),
        ),
      );

      const scene: Scene = {
        id: newId("scene"),
        type: sceneType,
        title: sceneInfo.title,
        participantIds,
        dialogue: llm.dialogue
          .map((d) => {
            const decodedText = decodeUnicodeEscapes(d.text ?? "");
            const decodedAction = d.action
              ? decodeUnicodeEscapes(d.action)
              : d.action;
            const { text, action } = extractInlineAction(
              decodedText,
              decodedAction,
            );
            return {
              id: newId("line"),
              agentId: d.agentId,
              text,
              emotion: d.emotion,
              action,
              targetAgentId: d.targetAgentId,
              intent: d.intent,
              beatIndex: d.beatIndex,
              quotable: d.quotable === true,
            };
          })
          .filter((line) => isIntroduction || !isIntroductionLine(line.text)),
        systemEvents: sanitizedLlm.systemEvents.map((e) => ({
          id: newId("evt"),
          type: e.type,
          fromId: e.fromId,
          toId: e.toId,
          delta: e.delta,
          label: e.label,
        })),
        outcome: ceremonyElim?.reason
          ? `${llm.outcome}\n\n${ceremonyElim.reason}`
          : llm.outcome,
        createdAt: Date.now(),
        challengeCategory,
        sceneContext: sceneWasQueued ? undefined : sceneContext,
      };

      let preDeltaRels = fresh.episode.relationships;
      let dynamicCast = fresh.cast;
      let nextBrainsBase: Record<string, AgentBrain> = {
        ...fresh.episode.brains,
      };
      let nextActiveCastIds = [...fresh.episode.activeCastIds];
      let nextBombshellsIntroduced = [...fresh.episode.bombshellsIntroduced];

      if (casaAmorNewCast.length > 0 && sceneType.startsWith("casa_amor")) {
        for (const newAgent of casaAmorNewCast) {
          if (!dynamicCast.some((a) => a.id === newAgent.id)) {
            const existingIds = dynamicCast.map((a) => a.id);
            const newRels = seedRelationshipsForNewAgent(
              newAgent.id,
              existingIds,
            );
            preDeltaRels = [...preDeltaRels, ...newRels];
            dynamicCast = [...dynamicCast, newAgent];
            nextBrainsBase[newAgent.id] = {
              agentId: newAgent.id,
              memories: [],
              goal: "",
              policy: "",
              personalityShift: "",
              rewards: [],
              cumulativeReward: 0,
              lastReflectionScene: 0,
            };
          }
        }
      }

      if (sceneType === "bombshell" && arrivingBombshells.length > 0) {
        const alreadySeededIds = new Set<string>();
        for (const bombshell of arrivingBombshells) {
          const existingIds = [
            ...activeCast.map((a) => a.id),
            ...alreadySeededIds,
          ].filter((id) => id !== bombshell.id);
          const newRels = seedRelationshipsForNewAgent(
            bombshell.id,
            existingIds,
          );
          alreadySeededIds.add(bombshell.id);
          preDeltaRels = [...preDeltaRels, ...newRels];
          dynamicCast = [...dynamicCast, bombshell];
          nextActiveCastIds = [...nextActiveCastIds, bombshell.id];
          nextBombshellsIntroduced = [
            ...nextBombshellsIntroduced,
            bombshell.id,
          ];
          nextBrainsBase[bombshell.id] = {
            agentId: bombshell.id,
            memories: [],
            goal: "",
            policy: "",
            personalityShift: "",
            rewards: [],
            cumulativeReward: 0,
            lastReflectionScene: 0,
          };
        }
      }

      let { rels, emotions, couples } = applyDeltas(
        preDeltaRels,
        fresh.episode.emotions,
        fresh.episode.couples,
        sanitizedLlm,
      );

      set({
        generationProgress: {
          percent: 50,
          label: "analyzing relationships...",
        },
      });
      const inferredDeltas = inferStatDeltas(
        {
          id: "inference-temp",
          type: sceneType,
          title: "",
          participantIds,
          dialogue: scene.dialogue,
          systemEvents: scene.systemEvents,
          outcome: scene.outcome,
          createdAt: Date.now(),
        },
        rels,
        couples,
      );
      rels = applyInferredDeltas(rels, inferredDeltas);

      const shouldRecouple = sceneType === "recouple" && !isFinaleScene;
      const couplesBeforeDefections = couples.map((c) => ({ ...c }));
      if (shouldRecouple) {
        couples = applyRecoupleDefections(
          couples,
          dynamicCast,
          rels,
          fresh.episode.eliminatedIds,
        );
      }
      if (isFinaleScene) {
        couples = applyRecoupleDefections(
          couples,
          dynamicCast,
          rels,
          fresh.episode.eliminatedIds,
        );
      }

      const recoupleOrdinal =
        sceneType === "recouple"
          ? fresh.episode.scenes.filter((s) => s.type === "recouple").length + 1
          : 0;

      const currentRecouples = fresh.episode.scenes.filter(
        (s) => s.type === "recouple",
      ).length;
      const preElimGrace = { ...fresh.episode.graceExpiresAt };
      function grantGrace(agentId: string) {
        preElimGrace[agentId] = currentRecouples + 3;
      }

      if (sceneType === "bombshell" && arrivingBombshells.length > 0) {
        for (const bombshell of arrivingBombshells) {
          const bombshellCouple = couples.find(
            (c) => c.a === bombshell.id || c.b === bombshell.id,
          );
          if (bombshellCouple) {
            const targetId =
              bombshellCouple.a === bombshell.id
                ? bombshellCouple.b
                : bombshellCouple.a;
            const prevCouple = fresh.episode.couples.find(
              (c) =>
                (c.a === targetId || c.b === targetId) &&
                c.a !== bombshell.id &&
                c.b !== bombshell.id,
            );
            if (prevCouple) {
              const exId =
                prevCouple.a === targetId ? prevCouple.b : prevCouple.a;
              if (exId && exId !== targetId) {
                grantGrace(exId);
              }
            }
          }
        }
      }

      if (sceneType === "bombshell" && arrivingBombshells.length > 0) {
        for (const bombshell of arrivingBombshells) {
          grantGrace(bombshell.id);
        }
      }

      if (shouldRecouple || isFinaleScene) {
        const previouslyPaired = new Set<string>();
        for (const c of couplesBeforeDefections) {
          previouslyPaired.add(c.a);
          previouslyPaired.add(c.b);
        }
        const nowPaired = new Set<string>();
        for (const c of couples) {
          nowPaired.add(c.a);
          nowPaired.add(c.b);
        }
        for (const id of previouslyPaired) {
          if (!nowPaired.has(id) && !fresh.episode.eliminatedIds.includes(id)) {
            grantGrace(id);
          }
        }
      }

      const elim = applyEliminations(
        dynamicCast,
        couples,
        fresh.episode.eliminatedIds,
        sceneType,
        recoupleOrdinal,
        isFinaleScene,
        rels,
        preElimGrace,
      );

      if (ceremonyElim && ceremonyElim.eliminatedIds.length > 0) {
        elim.eliminatedIds.push(...ceremonyElim.eliminatedIds);
        elim.couples = elim.couples.filter(
          (c) =>
            !ceremonyElim!.eliminatedIds.includes(c.a) &&
            !ceremonyElim!.eliminatedIds.includes(c.b),
        );
      }

      let finalCouples = elim.couples;
      if (shouldRecouple || isFinaleScene) {
        finalCouples = forcePairUnpaired(
          dynamicCast,
          elim.couples,
          rels,
          elim.eliminatedIds,
        );
      }

      if (grandFinaleResult) {
        finalCouples = [grandFinaleResult.winnerCouple];
        for (const id of [
          grandFinaleResult.loserCouple.a,
          grandFinaleResult.loserCouple.b,
        ]) {
          if (!elim.eliminatedIds.includes(id)) elim.eliminatedIds.push(id);
        }
        elim.winnerCouple = grandFinaleResult.winnerCouple;
      }

      let stickSwitchChoices: StickOrSwitchChoice[] | null = null;
      let casaAmorResolvedChanges: {
        phase: "post";
        scenesCompleted: number;
      } | null = null;
      if (
        fresh.episode.casaAmorState &&
        sceneType === "casa_amor_stickswitch"
      ) {
        const casaState = fresh.episode.casaAmorState;
        stickSwitchChoices = computeStickOrSwitchChoices(
          activeCast,
          casaState.originalCouples,
          rels,
          casaState.casaAmorCast,
          fresh.episode.scenes,
        );
        const result = resolveStickOrSwitch(
          stickSwitchChoices,
          casaState.originalCouples,
          casaState.casaAmorCast,
        );
        finalCouples = result.newCouples;
        for (const id of result.eliminatedIds) {
          if (!elim.eliminatedIds.includes(id)) elim.eliminatedIds.push(id);
        }
        const chosenCasaIds = new Set(
          stickSwitchChoices
            .filter((c) => c.choice === "switch" && c.newPartnerId)
            .map((c) => c.newPartnerId!),
        );
        const chosenCasaCast = casaState.casaAmorCast.filter((a) =>
          chosenCasaIds.has(a.id),
        );
        for (const newAgent of chosenCasaCast) {
          if (!nextActiveCastIds.includes(newAgent.id)) {
            nextActiveCastIds = [...nextActiveCastIds, newAgent.id];
          }
        }
        casaAmorResolvedChanges = {
          phase: "post",
          scenesCompleted: casaState.scenesCompleted + 1,
        };
      }

      const nextLocations = computeLocations(
        dynamicCast,
        elim.eliminatedIds,
        participantIds,
        sceneType,
        fresh.episode.locations,
      );

      nextActiveCastIds = nextActiveCastIds.filter(
        (id) => !elim.eliminatedIds.includes(id),
      );

      const eliminatedThisScene = elim.eliminatedIds.filter(
        (id) => !fresh.episode.eliminatedIds.includes(id),
      );
      const scoringActiveIds =
        sceneType === "bombshell" && arrivingBombshells.length > 0
          ? [
              ...activeCast.map((a) => a.id),
              ...arrivingBombshells.map((b) => b.id),
            ]
          : activeCast.map((a) => a.id);
      const rewardsByAgent = computeSceneRewards({
        scene,
        sceneNumber,
        activeCastIds: scoringActiveIds,
        prevCouples: fresh.episode.couples,
        newCouples: finalCouples,
        eliminatedThisScene,
        isFinale: isFinaleScene,
        winnerCouple: elim.winnerCouple,
        arrivingBombshellId: arrivingBombshell?.id,
        soloSinceBombshell: fresh.episode.soloSinceBombshell,
        isRewardDate,
        rewardDateCoupleIds,
      });

      const nextSoloSinceBombshell: Record<string, number> = {
        ...fresh.episode.soloSinceBombshell,
      };
      if (sceneType === "bombshell" && arrivingBombshells.length > 0) {
        for (const bombshell of arrivingBombshells) {
          const bombshellPartner = finalCouples.find(
            (c) => c.a === bombshell.id || c.b === bombshell.id,
          );
          if (bombshellPartner) {
            const targetId =
              bombshellPartner.a === bombshell.id
                ? bombshellPartner.b
                : bombshellPartner.a;
            const abandonedEx = fresh.episode.couples.find(
              (c) =>
                (c.a === targetId || c.b === targetId) &&
                c.a !== bombshell.id &&
                c.b !== bombshell.id,
            );
            if (abandonedEx) {
              const exId =
                abandonedEx.a === targetId ? abandonedEx.b : abandonedEx.a;
              if (exId && exId !== targetId) {
                nextSoloSinceBombshell[exId] = sceneNumber;
              }
            }
          }
        }
      }
      for (const id of Object.keys(nextSoloSinceBombshell)) {
        if (elim.eliminatedIds.includes(id)) {
          delete nextSoloSinceBombshell[id];
          continue;
        }
        const nowPaired = finalCouples.some((c) => c.a === id || c.b === id);
        if (nowPaired) {
          delete nextSoloSinceBombshell[id];
        }
      }

      for (const [agentId, events] of Object.entries(rewardsByAgent)) {
        const brain = nextBrainsBase[agentId];
        if (!brain) continue;
        const updatedRewards = [...brain.rewards, ...events];
        nextBrainsBase = {
          ...nextBrainsBase,
          [agentId]: {
            ...brain,
            rewards: updatedRewards,
            cumulativeReward: sumRewards(updatedRewards),
          },
        };
      }

      if (get().ui.isPaused) {
        set({ isGenerating: false });
        return;
      }

      set({
        generationProgress: { percent: 65, label: "extracting memories..." },
      });
      const observingIds = new Set<string>([
        ...participantIds,
        ...(forcedParticipants ?? []),
      ]);
      const sceneParticipantAgents = dynamicCast.filter((a) =>
        observingIds.has(a.id),
      );
      let nextBrains: Record<string, AgentBrain> = nextBrainsBase;
      try {
        const prevMemoriesByAgent: Record<string, AgentMemory[]> = {};
        const policiesByAgent: Record<string, string> = {};
        for (const agent of sceneParticipantAgents) {
          const brain = nextBrainsBase[agent.id];
          prevMemoriesByAgent[agent.id] = brain?.memories ?? [];
          policiesByAgent[agent.id] = brain?.policy ?? "";
        }
        const observations = await extractObservationsForScene({
          participants: sceneParticipantAgents,
          dialogue: scene.dialogue,
          outcome: scene.outcome,
          prevMemoriesByAgent,
          policiesByAgent,
        });

        for (const obs of observations) {
          let embedding: number[];
          try {
            embedding = await embed(obs.content);
          } catch (err) {
            console.warn(
              "[memory] embed failed for observation, skipping:",
              err,
            );
            continue;
          }
          const memory: AgentMemory = {
            id: newId("mem"),
            agentId: obs.agentId,
            sceneId: scene.id,
            sceneNumber,
            timestamp: Date.now(),
            type: "observation",
            content: obs.content,
            importance: obs.importance,
            embedding,
            relatedAgentIds: obs.relatedAgentIds,
          };
          const brain = nextBrains[obs.agentId];
          if (brain) {
            nextBrains = {
              ...nextBrains,
              [obs.agentId]: {
                ...brain,
                memories: [...brain.memories, memory],
              },
            };
          }
        }
      } catch (err) {
        console.warn("[memory] observation extraction failed:", err);
      }

      set({
        generationProgress: { percent: 80, label: "agents reflecting..." },
      });
      const shouldReflect =
        sceneNumber >= REFLECTION_INTERVAL &&
        sceneNumber % REFLECTION_INTERVAL === 0 &&
        !isIntroduction;
      if (get().ui.isPaused) {
        set({ isGenerating: false });
        return;
      }
      if (shouldReflect) {
        try {
          const activeForReflection = dynamicCast.filter(
            (a) => !elim.eliminatedIds.includes(a.id),
          );
          const memoriesByAgent: Record<string, AgentMemory[]> = {};
          const currentGoals: Record<string, string> = {};
          const currentPolicies: Record<string, string> = {};
          const rewardTrajectories: Record<string, RewardEvent[]> = {};
          for (const agent of activeForReflection) {
            const brain = nextBrains[agent.id];
            const recent = (brain?.memories ?? []).slice(-10);
            memoriesByAgent[agent.id] = recent;
            currentGoals[agent.id] = brain?.goal ?? "";
            currentPolicies[agent.id] = brain?.policy ?? "";
            rewardTrajectories[agent.id] = (brain?.rewards ?? []).slice(-15);
          }

          const reflections = await reflectAcrossAgents({
            cast: activeForReflection,
            memoriesByAgent,
            currentGoals,
            currentPolicies,
            rewardTrajectories,
          });

          for (const r of reflections) {
            let embedding: number[];
            try {
              embedding = await embed(r.insight);
            } catch (err) {
              console.warn(
                "[memory] embed failed for reflection, skipping:",
                err,
              );
              continue;
            }
            const reflectionMemory: AgentMemory = {
              id: newId("mem"),
              agentId: r.agentId,
              sceneId: scene.id,
              sceneNumber,
              timestamp: Date.now(),
              type: "reflection",
              content: r.insight,
              importance: r.importance,
              embedding,
              relatedAgentIds: [],
            };
            const brain = nextBrains[r.agentId];
            if (brain) {
              nextBrains = {
                ...nextBrains,
                [r.agentId]: {
                  ...brain,
                  memories: [...brain.memories, reflectionMemory],
                  goal: r.newGoal || brain.goal,
                  policy: r.newPolicy || brain.policy,
                  lastReflectionScene: sceneNumber,
                },
              };
            }
          }
        } catch (err) {
          console.warn("[memory] reflection failed:", err);
        }
      }

      set({
        generationProgress: { percent: 95, label: "finalizing scene..." },
      });
      if (get().ui.isPaused) {
        set({ isGenerating: false });
        return;
      }

      const nextDramaScores = updateDramaScores(
        scene,
        fresh.episode.dramaScores,
      );

      const nextScenes = [...fresh.episode.scenes, scene];
      let nextLastBombshellScene = fresh.episode.lastBombshellScene;
      let nextBombshellDatingUntil = fresh.episode.bombshellDatingUntilScene;
      if (sceneType === "bombshell" && arrivingBombshell) {
        nextLastBombshellScene = nextScenes.length - 1;
        nextBombshellDatingUntil = nextScenes.length + 2;
      }
      if (
        nextBombshellDatingUntil !== null &&
        nextScenes.length >= nextBombshellDatingUntil
      ) {
        nextBombshellDatingUntil = null;
      }
      const nextPhase = getSeasonPhase({
        scenes: nextScenes,
        activeCastCount: nextActiveCastIds.length,
        bombshellsIntroduced: nextBombshellsIntroduced.length,
        bombshellPoolSize: fresh.episode.bombshellPool.length,
        coupleCount: finalCouples.length,
        lastBombshellScene: nextLastBombshellScene,
        bombshellDatingUntilScene: nextBombshellDatingUntil,
        avgDramaScore: averageDramaScore(nextDramaScores),
      });

      let nextCasaAmorState = fresh.episode.casaAmorState;
      if (casaAmorUpdate && sceneType === "casa_amor_arrival") {
        nextCasaAmorState = {
          ...(casaAmorUpdate as CasaAmorState),
          scenesCompleted: 1,
        };
      } else if (
        nextCasaAmorState &&
        (sceneType === "casa_amor_date" || sceneType === "casa_amor_challenge")
      ) {
        nextCasaAmorState = {
          ...nextCasaAmorState,
          scenesCompleted: nextCasaAmorState.scenesCompleted + 1,
        };
      } else if (
        nextCasaAmorState &&
        sceneType === "casa_amor_stickswitch" &&
        stickSwitchChoices &&
        casaAmorResolvedChanges
      ) {
        nextCasaAmorState = {
          ...nextCasaAmorState,
          phase: casaAmorResolvedChanges.phase,
          stickOrSwitchResults: stickSwitchChoices,
          scenesCompleted: casaAmorResolvedChanges.scenesCompleted,
        };
      }

      set({
        cast: dynamicCast,
        episode: {
          ...fresh.episode,
          casaAmorState: nextCasaAmorState,
          scenes: nextScenes,
          relationships: rels,
          emotions,
          couples: finalCouples,
          eliminatedIds: elim.eliminatedIds,
          winnerCouple: elim.winnerCouple,
          locations: nextLocations,
          brains: nextBrains,
          activeCastIds: nextActiveCastIds,
          bombshellsIntroduced: nextBombshellsIntroduced,
          soloSinceBombshell: nextSoloSinceBombshell,
          graceExpiresAt: elim.graceExpiresAt,
          dramaScores: nextDramaScores,
          seasonPhase: nextPhase,
          lastBombshellScene: nextLastBombshellScene,
          bombshellDatingUntilScene: nextBombshellDatingUntil,
          updatedAt: Date.now(),
        },
        currentSceneId: scene.id,
        currentLineIndex: 0,
        isGenerating: false,
        generationProgress: null,
      });

      const postEp = get().episode;
      const newlyEliminated = postEp.eliminatedIds.filter(
        (id) => !fresh.episode.eliminatedIds.includes(id),
      );
      const newViewerMessages = generateViewerReactions(
        scene,
        postEp.couples,
        get().cast,
        newlyEliminated,
        postEp.casaAmorState,
        postEp.scenes.length,
      );
      const activeCastForGravity = get().cast.filter(
        (a) => !postEp.eliminatedIds.includes(a.id),
      );
      const prevSentiment = postEp.viewerSentiment;
      const updatedSentiment = aggregateChatToPopularity(
        newViewerMessages,
        scene,
        prevSentiment,
        activeCastForGravity,
      );

      const seasonCumulativeMap = new Map(
        Object.entries(postEp.gravityCumulative),
      );
      const gravityResult = applySocialGravity(
        updatedSentiment,
        postEp.relationships,
        activeCastForGravity,
        seasonCumulativeMap,
        prevSentiment,
        postEp.crossedThresholds,
      );

      const { rels: postGravityRels } = applyEventList(
        postEp.relationships,
        postEp.couples,
        gravityResult.events,
      );
      const committedSceneIdx = postEp.scenes.findIndex(
        (s) => s.id === scene.id,
      );
      const updatedScenes =
        committedSceneIdx >= 0
          ? postEp.scenes.map((s, i) =>
              i === committedSceneIdx
                ? {
                    ...s,
                    systemEvents: [...s.systemEvents, ...gravityResult.events],
                  }
                : s,
            )
          : postEp.scenes;

      set((s) => ({
        viewerMessages: [...s.viewerMessages, ...newViewerMessages],
        episode: {
          ...s.episode,
          scenes: updatedScenes,
          relationships: postGravityRels,
          viewerSentiment: updatedSentiment,
          crossedThresholds: [
            ...postEp.crossedThresholds,
            ...gravityResult.crossedThresholds,
          ],
          gravityCumulative: Object.fromEntries(gravityResult.nextCumulative),
        },
      }));

      syncToServer({ episode: get().episode, cast: get().cast });

      get().triggerPrefetch();
    } catch (err) {
      const raw = err instanceof Error ? err.message : "Unknown error";
      const safe = raw
        .replace(/[?&](key|token|api_key|apikey)=[^\s&]+/gi, "?$1=[redacted]")
        .replace(/\b(key|token|api_key|apikey)[=:]\s*\S+/gi, "$1=[redacted]");
      set({
        isGenerating: false,
        lastError: safe,
        generationProgress: null,
      });
    }
  },

  advanceLine: () => {
    const state = get();
    const scene = state.episode.scenes.find(
      (s) => s.id === state.currentSceneId,
    );
    if (!scene) return;
    if (state.currentLineIndex < scene.dialogue.length - 1) {
      set({ currentLineIndex: state.currentLineIndex + 1 });
    }
  },

  resetLineIndex: () => set({ currentLineIndex: 0 }),

  toggleCast: () =>
    set((s) => ({ ui: { ...s.ui, isCastOpen: !s.ui.isCastOpen } })),

  toggleRelationships: () =>
    set((s) => ({
      ui: { ...s.ui, isRelationshipsOpen: !s.ui.isRelationshipsOpen },
    })),

  setRelationshipMetric: (m) =>
    set((s) => ({ ui: { ...s.ui, activeRelationshipMetric: m } })),

  selectScene: (sceneId) => {
    const state = get();
    const scene = state.episode.scenes.find((s) => s.id === sceneId);
    const lineIdx = scene ? Math.max(0, scene.dialogue.length - 1) : 0;
    set({ currentSceneId: sceneId, currentLineIndex: lineIdx });
  },

  toggleTooltips: () =>
    set((s) => ({ ui: { ...s.ui, tooltipsEnabled: !s.ui.tooltipsEnabled } })),

  toggleMusic: () =>
    set((s) => ({ ui: { ...s.ui, musicEnabled: !s.ui.musicEnabled } })),

  togglePause: () =>
    set((s) => ({ ui: { ...s.ui, isPaused: !s.ui.isPaused } })),

  exportSeasonData: () => {
    const { episode, cast } = get();
    const data = buildSeasonExport(episode, cast);
    downloadJson(data, `villa-ai-season-${episode.number}.json`);
  },

  exportRLData: () => {
    const { episode, cast } = get();
    const data = buildRLExport(episode, cast);
    downloadJson(data, `villa-ai-rl-season-${episode.number}.json`);
  },
}));

function migrateEpisode(episode: Episode): void {
  for (const r of episode.relationships) {
    if (r.compatibility === undefined || r.compatibility === null) {
      (r as unknown as { compatibility: number }).compatibility = 40;
    }
  }
  if (episode.casaAmorState === undefined) {
    (episode as unknown as { casaAmorState: null }).casaAmorState = null;
  }
  if (episode.viewerSentiment === undefined) {
    (
      episode as unknown as { viewerSentiment: Record<string, number> }
    ).viewerSentiment = {};
  }
  if (episode.crossedThresholds === undefined) {
    (episode as unknown as { crossedThresholds: string[] }).crossedThresholds =
      [];
  }
  if (episode.gravityCumulative === undefined) {
    (
      episode as unknown as { gravityCumulative: Record<string, number> }
    ).gravityCumulative = {};
  }
}

const SAFE_SESSION_ID = /^[A-Za-z0-9_-]{1,128}$/;
function isValidSessionId(id: unknown): id is string {
  return typeof id === "string" && SAFE_SESSION_ID.test(id);
}

const MAX_STRING = 2000;

function sanitizeString(v: unknown, max = MAX_STRING): string {
  if (typeof v !== "string") return "";
  return v.slice(0, max);
}

function sanitizeAgent(raw: unknown): Agent | null {
  if (!raw || typeof raw !== "object") return null;
  const a = raw as Record<string, unknown>;
  if (typeof a.id !== "string" || typeof a.name !== "string") return null;
  return {
    id: sanitizeString(a.id, 64),
    name: sanitizeString(a.name, 80),
    age: typeof a.age === "number" ? Math.max(18, Math.min(99, a.age)) : 21,
    archetype: sanitizeString(a.archetype, 80),
    emojiFace: sanitizeString(a.emojiFace, 8),
    hairAscii: sanitizeString(a.hairAscii, 32),
    personality: sanitizeString(a.personality, 400),
    voice: sanitizeString(a.voice, 300),
    bio: sanitizeString(a.bio, 500),
    colorClass: sanitizeString(a.colorClass, 64),
  };
}

function sanitizeCast(raw: unknown): Agent[] | null {
  if (!Array.isArray(raw)) return null;
  const out: Agent[] = [];
  for (const item of raw) {
    const a = sanitizeAgent(item);
    if (a) out.push(a);
  }
  return out.length > 0 ? out : null;
}

function sanitizeEpisode(raw: unknown): Episode | null {
  if (!raw || typeof raw !== "object") return null;
  const e = raw as Record<string, unknown>;
  if (
    !Array.isArray(e.scenes) ||
    !Array.isArray(e.relationships) ||
    !Array.isArray(e.couples)
  ) {
    return null;
  }
  return raw as Episode;
}

export async function restoreFromServer(): Promise<boolean> {
  hydrateWisdom().catch(() => {});
  refreshTrainingCache().catch(() => {});
  try {
    const saved = await loadCurrentSession();
    if (!saved?.episode || !saved?.cast) return false;
    const episode = sanitizeEpisode(saved.episode);
    const cast = sanitizeCast(saved.cast);
    if (!episode || !cast) {
      console.warn("[restore] session payload failed validation");
      return false;
    }
    if (episode.scenes.length === 0) return false;
    migrateEpisode(episode);
    seasonCounter = episode.number ?? seasonCounter;
    useVillaStore.setState({
      cast,
      episode,
      currentSceneId: episode.scenes[episode.scenes.length - 1]?.id ?? null,
      currentLineIndex: 0,
      isGenerating: false,
      lastError: null,
      generationProgress: null,
      sceneQueue: [],
    });
    return true;
  } catch (err) {
    console.warn(
      "[restore] failed to load from server:",
      err instanceof Error ? err.message : err,
    );
    return false;
  }
}

export async function loadSessionByKey(sessionId: string): Promise<boolean> {
  if (!isValidSessionId(sessionId)) {
    console.warn("[restore] refusing to load invalid sessionId");
    return false;
  }
  if (useVillaStore.getState().isGenerating) {
    useVillaStore.setState({
      lastError:
        "Wait for the current scene to finish generating before switching sessions.",
    });
    return false;
  }
  hydrateWisdom().catch(() => {});
  try {
    const saved = await loadSessionById(sessionId);
    if (!saved?.episode || !saved?.cast) return false;
    const episode = sanitizeEpisode(saved.episode);
    const cast = sanitizeCast(saved.cast);
    if (!episode || !cast) {
      console.warn("[restore] session payload failed validation");
      return false;
    }
    migrateEpisode(episode);
    seasonCounter = episode.number ?? seasonCounter;

    localStorage.setItem(SESSION_KEY, sessionId);

    useVillaStore.setState({
      cast,
      episode,
      currentSceneId:
        episode.scenes.length > 0
          ? episode.scenes[episode.scenes.length - 1]!.id
          : null,
      currentLineIndex: 0,
      isGenerating: false,
      lastError: null,
      generationProgress: null,
      sceneQueue: [],
      viewerMessages: [],
    });

    refreshTrainingCache().catch(() => {});
    return true;
  } catch (err) {
    console.warn(
      "[restore] failed to load session:",
      err instanceof Error ? err.message : err,
    );
    return false;
  }
}
