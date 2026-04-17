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
} from "@/types";
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
import type { CasaAmorState, StickOrSwitchChoice } from "@/types";
import type { ChallengeCategory } from "@/types";
import {
  generateViewerReactions,
  updateViewerSentiment,
} from "@/lib/viewerChat";
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
} from "@/lib/api";
import { SESSION_KEY } from "@/lib/sessionId";
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

// Prefetch telemetry. Kept lightweight (counts + timings) — not a
// structured metrics pipeline. Read by devtools or a future debug
// panel. Counts are cumulative across the episode; reset on
// startNewEpisode.
export interface PrefetchMetrics {
  batchesStarted: number;
  batchesCompleted: number;
  scenesReady: number;
  scenesFailed: number;
  fallbacksEmitted: number;
  lastBatchMs: number | null;
  lastReadyAt: number | null; // epoch ms
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

  startNewEpisode: () => void;
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

// Wisdom caches live in the trainingData module; we read them via accessor
// functions so store code keeps synchronous semantics while the actual
// storage is server-backed (hydrated at boot by App.tsx).
const MAX_ARCHIVED_PER_AGENT = 6;
const WISDOM_IMPORTANCE_THRESHOLD = 7;
const MAX_META_WISDOM = 10;

function archiveSeasonWisdom(episode: Episode, cast: Agent[]): void {
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

  // Flush to backend. Fire-and-forget; the in-memory cache has already been
  // updated in-place so createEpisode below sees the new wisdom immediately.
  persistWisdom();

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
  // Dissolve ALL existing couples — everyone re-picks from scratch
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

  // Go down the line: each person picks their preferred partner from remaining pool
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

// Turn a list of deterministic couples into an ordered host-script: who the
// host calls forward, who they pick, and a short rationale derived from the
// strongest relationship dimension. The LLM then narrates *within* this
// structure instead of inventing pairings on its own.
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
  const newRels = rels.map((r) => ({ ...r }));
  let newCouples = couples.map((c) => ({ ...c }));

  for (const event of llm.systemEvents) {
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

// Ranks a couple for "most-in-need-of-a-date-night" by jealousy + trust gap.
// A struggling couple with low mutual trust or high jealousy is the one worth
// zooming in on — not a placid top-of-the-villa duo.
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

  // 1. Dump any unpaired islanders (the odd one out)
  const unpaired = activeContestants.filter((a) => !pairedIds.has(a.id));
  for (const agent of unpaired) {
    const graceExpiry = newGrace[agent.id];
    if (graceExpiry !== undefined && recoupleOrdinal < graceExpiry) continue;
    newEliminated.push(agent.id);
    delete newGrace[agent.id];
  }

  // 2. After the 2nd recouple, also dump the weakest couple (like the real show)
  //    This ensures the cast actually thins out, not just the odd person
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
  saveSessionToServer(payload, state.cast).catch(() => {
    // Retry once after 2s if server wasn't ready
    setTimeout(() => {
      saveSessionToServer(payload, state.cast).catch((err) => {
        console.warn(
          "[sync] failed to save to server:",
          err instanceof Error ? err.message : err,
        );
      });
    }, 2000);
  });

  // Save accumulated training data for this session (one doc per session, grows with scenes)
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

  startNewEpisode: () => {
    const prev = get();
    archiveSeasonWisdom(prev.episode, prev.cast);
    // archiveSeasonWisdom already persists the updated wisdom to the backend
    // fire-and-forget. Don't re-hydrate here — that would race the save and
    // could clobber the cache with stale pre-archive server state.
    refreshTrainingCache().catch(() => {});
    // Clear the prefetch in-flight guard so the new episode's cold-start
    // batch isn't blocked by a lingering flag from the previous episode.
    // Any pending resolve from the old episode is still fenced by the
    // episode-id check inside triggerPrefetch.
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

  // Fire-and-forget prefetch trigger. Callable from two sites now:
  //   1. generateScene POST-COMMIT (end of the scene action). Fresh state.
  //   2. useScenePlayback on line 0 — fires when a scene starts playing,
  //      belt-and-braces if the post-commit trigger didn't keep up.
  // (A third call site inside generateScene pre-LLM was removed — on
  // single-model Ollama it pipelined prefetch prompts behind the live
  // scene and halved its tokens-per-second.)
  //
  // Idempotent: the runner has a single-flight guard, and planPrefetch
  // returns null when the queue is already deep enough.
  //
  // inProgressSceneType param is kept for API stability but should be
  // left undefined from callers — simulating an in-progress state-mutator
  // (recouple/bombshell/minigame) causes us to prefetch SUBSEQUENT scenes
  // against stale couples/relationships, which then commit after the real
  // scene changes them.
  triggerPrefetch: (inProgressSceneType) => {
    const state = get();
    if (state.episode.winnerCouple) return;
    const activeCast = state.cast.filter(
      (a) => !state.episode.eliminatedIds.includes(a.id),
    );

    // Safety: refuse to simulate state-mutating types. If a caller ever
    // passes one (we don't today, but the signature still accepts it),
    // fall back to non-simulated mode so we don't prefetch against stale
    // couples that are about to change.
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
    // Metrics: batch started. scenesReady / lastReadyAt tick inside
    // onSceneReady as each scene lands. batchesCompleted + lastBatchMs
    // tick in the final .then() below.
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
      seasonTheme: state.episode.seasonTheme,
      bombshellsIntroduced: state.episode.bombshellsIntroduced,
      bombshellPool: state.episode.bombshellPool,
      lastBombshellScene: state.episode.lastBombshellScene,
      bombshellDatingUntilScene: state.episode.bombshellDatingUntilScene,
      casaAmorState: state.episode.casaAmorState,
      avgDramaScore: averageDramaScore(state.episode.dramaScores),
      gapToFill: policy.gapToFill,
      // Incremental enqueue — push each scene into the queue as it
      // lands, rather than waiting for the full batch. Episode-id fence
      // lives inside the callback so results from an abandoned batch
      // don't leak into a newly-started episode.
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
        // Metrics: batch finished. lastBatchMs captures wallclock from
        // trigger→done so devtools / debug panel can see whether
        // prefetch is keeping up with playback pace.
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

    // Regular (non-reward) dates focus on exactly ONE couple — mirrors the
    // reward-date path but picks the focal couple from current tension instead
    // of a recent challenge win. Without this, the LLM treats "date" as an
    // ensemble scene and drama spills in from the rest of the villa.
    if (
      sceneType === "date" &&
      !isRewardDate &&
      initial.episode.couples.length > 0
    ) {
      const rels = initial.episode.relationships;
      const ranked = [...initial.episode.couples].sort((x, y) => {
        const xScore = tensionForCouple(x, rels);
        const yScore = tensionForCouple(y, rels);
        return yScore - xScore;
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
        // Odd-parity invariant: after the bombshell walks in, the total cast
        // must be ODD so the next recouple naturally strands one unpaired
        // islander for the dumping. If the planned arrivals would make the
        // cast even, we delay the bombshell by one scene and run an
        // islander-vote dumping first — this keeps the show's rhythm and
        // restores parity before the new arrival lands. The bombshell will
        // be re-scheduled naturally on the next planner tick.
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

    // ── Casa Amor scene setup ──
    let casaAmorUpdate: Partial<CasaAmorState> | null = null;
    let casaAmorNewCast: Agent[] = [];

    if (sceneType === "casa_amor_arrival") {
      // Generate Casa Amor cast and split villa
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
      // Alternate between villa group and casa group each scene
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

    // ── Grand Finale: live-chat picks the winning couple ──
    // Pre-compute the winner from viewerSentiment (same pattern as ceremony elims)
    // so the LLM narrates the predetermined outcome rather than inventing one.
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
        // Tie on chat: fall back to relationship chemistry.
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
        // Pre-fill goals + policies synchronously (no I/O) so the async
        // retrieval loop below has less bookkeeping.
        for (const agent of retrievalParticipants) {
          const brain = initial.episode.brains[agent.id];
          if (!brain) continue;
          agentGoals[agent.id] = brain.goal;
          agentPolicies[agent.id] = brain.policy;
        }
        // Parallel embedding retrieval. Previously this loop awaited each
        // agent's retrieveMemories() in sequence — with 8 active cast
        // members that's 8 serial HTTP embed calls before every scene
        // (~2-3s just for round trips on local Ollama). Promise.all
        // collapses them into one parallel fan-out: same server-side
        // workload, ~8× less wallclock on the client. Per-agent errors
        // are caught individually so one failure doesn't lose all
        // memories for the scene.
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
        await Promise.all(retrievalTasks);
      }

      // Pre-compute elimination for ceremony scenes so the LLM can write the drama
      let ceremonyElim: { eliminatedIds: string[]; narrative: string } | null =
        null;
      const isCeremonyScene =
        sceneType === "public_vote" ||
        sceneType === "islander_vote" ||
        sceneType === "producer_twist";
      if (isCeremonyScene && activeCast.length <= 4) {
        // Not enough cast for a ceremony elimination — fall back to regular scene
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

      // Determine challenge category
      const challengeCategory: ChallengeCategory | undefined =
        sceneType === "minigame" || sceneType === "challenge"
          ? nextChallengeCategory(initial.episode.scenes)
          : undefined;

      const eliminatedNames = ceremonyElim
        ? ceremonyElim.eliminatedIds
            .map((id) => activeCast.find((a) => a.id === id)?.name ?? id)
            .join(" and ")
        : undefined;

      // ── Scene Engine ──
      // Derive structured scene context (tension, planned beats, per-agent roles)
      // BEFORE the LLM call so the prompt carries a concrete shape instead of
      // prose directives.
      //
      // Skip for:
      //   - the season opener (no tension yet, no relationships formed)
      //   - single-speaker scenes (engine needs ≥2 participants)
      //   - procedural scenes where the hardcoded direction IS the structure
      //     (recouple ceremony, minigame/challenge game rules, bombshell
      //     entrance, ceremonies, grand finale). Adding beat-level intent
      //     plans on top of those just makes the LLM pick one to follow and
      //     drop the other — producing the "Maren monologue" failure mode.
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

      // Pre-compute the recouple ceremony so the prompt carries a deterministic
      // 1-by-1 pairing script. The LLM narrates within it; the same
      // applyRecoupleDefections pass runs post-LLM as a safety net to guarantee
      // the state matches the script even if the model deviates.
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

      // Pick a specific minigame so the host can announce it by name with
      // real rules. Falls back to prompt-level defaults if undefined.
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
      };

      // Interviews are SOLO confessionals — only the subject is a valid speaker.
      // We have to enforce this at the id-whitelist level, not just the prompt,
      // because the LLM doesn't reliably obey "no other agents" instructions.
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

      // IMPORTANT: do NOT fire triggerPrefetch here. Firing it in-flight
      // caused a measurable regression on single-model Ollama setups —
      // the prefetch runner queued additional prompts onto the same
      // model instance as the in-progress scene, halving scene-0 TPS.
      // Prefetch runs post-commit (end of this function) and at scene
      // playback start via useScenePlayback — both of which happen
      // BEFORE or AFTER the live LLM call, never concurrent with it on
      // Ollama. Trade: scene 1 no longer overlaps with scene 0
      // generation, but scene 0 is back to its true solo latency.

      let llm: LlmSceneResponse;
      let sceneWasQueued = false;
      const queue = initial.sceneQueue;
      // Find the first queued scene whose outline type matches — the
      // prefetcher batches speculatively past non-batchable slots, so the
      // head might be a firepit tagged for a future scene while we're
      // currently doing a minigame. Skip-and-keep instead of discard.
      const matchIdx = queue.findIndex((q) => q.outline.type === sceneType);
      if (matchIdx >= 0) {
        llm = queue[matchIdx]!.scene;
        sceneWasQueued = true;
        // Functional update: the prefetch runner may have appended more
        // scenes between when we snapshot `queue` and when we write back,
        // and a naive .filter of the old snapshot would silently drop them.
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
        // No match — either the queue is empty, or it's holding scenes for
        // future non-current types. Live-gen this one. Label differentiates
        // "genuine live" (non-batchable type, always lives in main path)
        // from "queue miss" (prefetch didn't anticipate this), so it's
        // easier to diagnose whether prefetch is keeping up.
        const isExpectedLive = !isBatchable(sceneType, initial.episode.scenes);
        set({
          generationProgress: {
            percent: 10,
            label: isExpectedLive
              ? "writers room is working..."
              : "catching up...",
          },
        });
        llm = await generateSceneFromLlm(
          buildArgs,
          validSceneIds,
          requiredSpeakers,
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
          // In non-opener scenes, drop self-introduction lines the LLM drifts
          // back into — they reset viewer attention and break continuity.
          .filter((line) => isIntroduction || !isIntroductionLine(line.text)),
        systemEvents: sanitizedLlm.systemEvents.map((e) => ({
          id: newId("evt"),
          type: e.type,
          fromId: e.fromId,
          toId: e.toId,
          delta: e.delta,
          label: e.label,
        })),
        outcome: llm.outcome,
        createdAt: Date.now(),
        challengeCategory,
        // Queued scenes were prefetched via the batch path without a
        // scene-engine plan, so their dialogue wasn't written against the
        // context we just built — don't persist a plan that doesn't match.
        sceneContext: sceneWasQueued ? undefined : sceneContext,
      };

      let preDeltaRels = fresh.episode.relationships;
      let dynamicCast = fresh.cast;
      let nextBrainsBase: Record<string, AgentBrain> = {
        ...fresh.episode.brains,
      };
      let nextActiveCastIds = [...fresh.episode.activeCastIds];
      let nextBombshellsIntroduced = [...fresh.episode.bombshellsIntroduced];

      // Merge Casa Amor newcomers into the visible cast + relationships + brains during the arc,
      // but do NOT add them to activeCastIds. They're temporary contestants until stick/switch
      // resolves — adding them to active cast early contaminates computeStickOrSwitchChoices
      // (which treats any coupleless activeCast member as a singleton) and skews phase/planner math.
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

      // Ceremony eliminations were pre-computed before the LLM call (see ceremonyElim above)
      // Apply them now to state
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

      // Grand Finale: override couples/eliminations/winner with the pre-computed
      // viewer-sentiment outcome. The losing couple is dumped from the villa;
      // the winning couple is crowned, ending the season.
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

      // Resolve Casa Amor stick/switch early so downstream state (locations, rewards,
      // soloSinceBombshell, phase, eliminations) reflects the post-resolution couples.
      // activeCast here is OG-only because we didn't merge newcomers into activeCastIds.
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

      // Casa Amor state transitions. Stick/switch resolution already happened earlier
      // (see the early-resolve block above); this just propagates state shape.
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

      // Generate viewer reactions and update sentiment
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
      const updatedSentiment = updateViewerSentiment(
        postEp.viewerSentiment,
        scene,
        postEp.couples,
      );
      set((s) => ({
        viewerMessages: [...s.viewerMessages, ...newViewerMessages],
        episode: { ...s.episode, viewerSentiment: updatedSentiment },
      }));

      syncToServer({ episode: get().episode, cast: get().cast });

      // Post-commit prefetch: scene N just landed, fire gen for N+1..N+5 now
      // so by the time playback ends the queue has them ready. The playback
      // hook will also call triggerPrefetch at scene-start as belt-and-braces.
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
}

// Session IDs are opaque tokens we hand out. Accept only safe alphanumerics/
// hyphens/underscores, bounded length — never raw user input as a storage key.
const SAFE_SESSION_ID = /^[A-Za-z0-9_-]{1,128}$/;
function isValidSessionId(id: unknown): id is string {
  return typeof id === "string" && SAFE_SESSION_ID.test(id);
}

// String cap used during session restore. Defensive against a compromised/forged
// session document trying to smuggle prompt-injection payloads via long bios or
// dialogue fields. Values longer than the cap are truncated — we preserve the
// session but neutralize the payload.
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

// Shallow episode check — make sure the critical collections are actually arrays
// and that the content will survive downstream consumers. Deep field sanitization
// for dialogue/memories would be substantial; migrateEpisode + the prompt-side
// `clip()` layer together catch the residual risk.
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
  // Hydrate wisdom + training caches from the backend before any episode work.
  // Kept in parallel (no await on the training cache, which is prompt-only).
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
  // Loading a different session means the wisdom cache (per-session on the
  // server) is now stale — re-hydrate before continuing.
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
