import type { SceneType, Scene, CasaAmorState, Couple } from "@villa-ai/shared";
import type { SceneOutline } from "@villa-ai/shared";

export type SeasonPhase =
  | "intro"
  | "early"
  | "midgame"
  | "lategame"
  | "finale_ceremony";

interface PlannerState {
  scenes: Scene[];
  activeCastCount: number;
  bombshellsIntroduced: number;
  bombshellPoolSize: number;
  coupleCount: number;
  lastBombshellScene: number | null;
  bombshellDatingUntilScene: number | null;
  avgDramaScore: number;
  casaAmorState?: CasaAmorState | null;
  recoupleCount?: number;
}

const CASA_AMOR_MIN_SCENES = 20;
const CASA_AMOR_MIN_RECOUPLES = 3;
const CASA_AMOR_MIN_COUPLES = 2;

const CASA_AMOR_BACKSTOP_SCENES = 24;

const CHILL_SPOTS: SceneType[] = ["firepit", "pool", "kitchen", "bedroom"];

function currentPhase(state: PlannerState): SeasonPhase {
  if (state.scenes.length === 0) return "intro";
  if (state.activeCastCount <= 2) return "finale_ceremony";

  if (state.activeCastCount === 4 && state.coupleCount === 2)
    return "finale_ceremony";
  const recouples = state.scenes.filter((s) => s.type === "recouple").length;
  if (recouples === 0) return "early";
  if (state.activeCastCount <= 4) return "lategame";
  return "midgame";
}

export function getSeasonPhase(state: PlannerState): SeasonPhase {
  return currentPhase(state);
}

export function nextSceneType(state: PlannerState): SceneType {
  const phase = currentPhase(state);
  const sceneCount = state.scenes.length;
  const scenesSinceLastRecouple = scenesAfterLastOfType(
    state.scenes,
    "recouple",
  );

  if (phase === "intro") return "introductions";

  if (phase === "finale_ceremony") {
    if (state.activeCastCount === 4 && state.coupleCount === 2)
      return "grand_finale";
    return "recouple";
  }

  if (sceneCount === 1) return "firepit";
  if (sceneCount === 2) return "pool";
  if (sceneCount === 3) return "recouple";
  if (sceneCount === 4) return "kitchen";

  if (
    state.bombshellDatingUntilScene !== null &&
    sceneCount < state.bombshellDatingUntilScene
  ) {
    const datesSinceBombshell =
      state.lastBombshellScene !== null
        ? state.scenes
            .slice(state.lastBombshellScene)
            .filter((s) => s.type === "date").length
        : 0;
    if (datesSinceBombshell < 2) return "date";
  }

  if (state.casaAmorState && state.casaAmorState.phase !== "post") {
    return nextCasaAmorSceneType(state.casaAmorState);
  }

  const recouples =
    state.recoupleCount ??
    state.scenes.filter((s) => s.type === "recouple").length;
  const casaAmorIdealWindow =
    phase === "midgame" &&
    !state.casaAmorState &&
    sceneCount >= CASA_AMOR_MIN_SCENES &&
    recouples >= CASA_AMOR_MIN_RECOUPLES &&
    state.coupleCount >= CASA_AMOR_MIN_COUPLES &&
    state.bombshellsIntroduced >= 1;

  const casaAmorBackstop =
    phase === "midgame" &&
    !state.casaAmorState &&
    sceneCount >= CASA_AMOR_BACKSTOP_SCENES &&
    state.bombshellsIntroduced >= 1;
  if (casaAmorIdealWindow || casaAmorBackstop) {
    return "casa_amor_arrival";
  }

  const dramaFactor = Math.min(state.avgDramaScore / 10, 1);
  const minScenesBetweenRecouples = 4 + Math.floor(dramaFactor * 2);
  const needsRecouple = scenesSinceLastRecouple >= minScenesBetweenRecouples;

  if (needsRecouple && phase !== "early") {
    if (shouldIntroduceBombshell(state, phase)) return "bombshell";
    return "recouple";
  }

  if (shouldIntroduceBombshell(state, phase) && scenesSinceLastRecouple >= 2) {
    return "bombshell";
  }

  const hasHadRecouple = state.scenes.some((s) => s.type === "recouple");
  if (hasHadRecouple && state.activeCastCount > 4) {
    const scenesSinceLastElim = scenesAfterLastOfTypes(state.scenes, [
      "recouple",
      "public_vote",
      "islander_vote",
      "producer_twist",
    ]);

    const elimInterval =
      state.activeCastCount >= 10 ? 2 : state.activeCastCount >= 6 ? 3 : 4;

    if (phase === "midgame" && scenesSinceLastElim >= elimInterval) {
      const elimChance =
        state.activeCastCount >= 12
          ? 1.0
          : state.activeCastCount >= 8
            ? 0.75
            : 0.5;
      if (Math.random() < elimChance) {
        return sceneCount % 3 === 0 ? "islander_vote" : "public_vote";
      }
    }
    if (phase === "lategame" && scenesSinceLastElim >= 2) {
      return sceneCount % 2 === 0 ? "public_vote" : "islander_vote";
    }
    if (
      phase !== "early" &&
      state.avgDramaScore < 3.0 &&
      sceneCount > 8 &&
      scenesSinceLastElim >= 2 &&
      Math.random() < 0.4
    ) {
      return "producer_twist";
    }
  }

  return pickVarietyScene(state);
}

function shouldIntroduceBombshell(
  state: PlannerState,
  phase: SeasonPhase,
): boolean {
  if (phase !== "midgame" && phase !== "lategame") return false;
  if (state.bombshellsIntroduced >= state.bombshellPoolSize) return false;
  if (
    state.bombshellDatingUntilScene !== null &&
    state.scenes.length < state.bombshellDatingUntilScene
  )
    return false;

  const scenesSinceLast =
    state.lastBombshellScene !== null
      ? state.scenes.length - state.lastBombshellScene
      : state.scenes.length;

  if (state.bombshellsIntroduced === 0) return scenesSinceLast >= 4;
  return scenesSinceLast >= 4;
}

export function bombshellArrivalCount(
  bombshellsIntroduced: number,
  bombshellPoolSize: number,
  activeCastCount: number,
): number {
  const remaining = bombshellPoolSize - bombshellsIntroduced;
  if (remaining < 2) return 1;
  if (activeCastCount >= 6 && Math.random() < 0.4) return 2;
  return 1;
}

function pickVarietyScene(state: PlannerState): SceneType {
  const sceneCount = state.scenes.length;
  const recentTypes = state.scenes.slice(-3).map((s) => s.type);

  const candidates: Array<{ type: SceneType; weight: number }> = [];

  const challengeCount = state.scenes.filter(
    (s) => s.type === "challenge",
  ).length;
  if (
    challengeCount < 2 &&
    !recentTypes.includes("challenge") &&
    sceneCount > 5
  ) {
    candidates.push({ type: "challenge", weight: 3 });
  }

  const lastScene = state.scenes[state.scenes.length - 1];
  if (lastScene?.type === "challenge" && state.coupleCount > 0) {
    return "date";
  }

  if (!recentTypes.includes("interview") && sceneCount > 3) {
    candidates.push({
      type: "interview",
      weight: 2 + (state.avgDramaScore > 5 ? 2 : 0),
    });
  }

  const minigameCount = state.scenes.filter(
    (s) => s.type === "minigame",
  ).length;
  if (
    !recentTypes.includes("minigame") &&
    minigameCount < Math.ceil(sceneCount / 6)
  ) {
    candidates.push({ type: "minigame", weight: 3 });
  }

  if (!recentTypes.includes("date") && state.coupleCount > 0) {
    candidates.push({ type: "date", weight: 2 });
  }

  for (const spot of CHILL_SPOTS) {
    if (!recentTypes.includes(spot)) {
      candidates.push({ type: spot, weight: 1 });
    }
  }

  if (candidates.length === 0) {
    return CHILL_SPOTS[Math.floor(Math.random() * CHILL_SPOTS.length)]!;
  }

  const totalWeight = candidates.reduce((sum, c) => sum + c.weight, 0);
  let r = Math.random() * totalWeight;
  for (const c of candidates) {
    r -= c.weight;
    if (r <= 0) return c.type;
  }
  return candidates[candidates.length - 1]!.type;
}

function scenesAfterLastOfType(scenes: Scene[], type: SceneType): number {
  for (let i = scenes.length - 1; i >= 0; i--) {
    if (scenes[i]!.type === type) return scenes.length - i - 1;
  }
  return scenes.length;
}

function scenesAfterLastOfTypes(scenes: Scene[], types: SceneType[]): number {
  for (let i = scenes.length - 1; i >= 0; i--) {
    if (types.includes(scenes[i]!.type)) return scenes.length - i - 1;
  }
  return scenes.length;
}

export function nextCasaAmorSceneType(state: CasaAmorState): SceneType {
  if (state.scenesCompleted <= 1) return "casa_amor_date";
  if (state.scenesCompleted === 2) return "casa_amor_date";
  if (state.scenesCompleted === 3) return "casa_amor_challenge";
  if (state.scenesCompleted === 4) return "casa_amor_challenge";
  return "casa_amor_stickswitch";
}

export function isSeasonComplete(
  activeCastCount: number,
  winnerCouple: unknown,
): boolean {
  return winnerCouple !== null || activeCastCount < 2;
}

export function nextChallengeCategory(
  scenes: Scene[],
): "learn_facts" | "explore_attraction" {
  for (let i = scenes.length - 1; i >= 0; i--) {
    const s = scenes[i]!;
    if (s.type !== "challenge" && s.type !== "minigame") continue;
    if (s.challengeCategory === "learn_facts") return "explore_attraction";
    if (s.challengeCategory === "explore_attraction") return "learn_facts";
  }
  return Math.random() < 0.5 ? "learn_facts" : "explore_attraction";
}

function outlineShape(
  sceneType: SceneType,
  state: BatchPlanState,
): { goal: string; stakes: string; subtext: string[]; tension: number } {
  const { coupleCount, couplesList, activeCastCount } = state;
  const hasCouples = coupleCount > 0;

  switch (sceneType) {
    case "introductions":
      return {
        goal: "Introduce every contestant and seed first-impression chemistry.",
        stakes:
          "First impressions stick — who reads as a safe bet vs a wildcard shapes every decision after.",
        subtext: [
          "everyone is performing a version of themselves",
          "attractions are being clocked silently",
        ],
        tension: 20,
      };
    case "firepit":
      return {
        goal: hasCouples
          ? "Let couples check in and gossip about each other — the first cracks show up at the firepit."
          : "Build real chemistry before coupling — flirty testing of the waters.",
        stakes: "Who feels secure vs threatened by the dynamic forming.",
        subtext: hasCouples
          ? [
              "alliances over attraction",
              "one person is overperforming their confidence",
            ]
          : [
              "early favorites are forming",
              "some people are already scanning for backups",
            ],
        tension: hasCouples ? 45 : 25,
      };
    case "pool":
      return {
        goal: "Lower-stakes hang — physical closeness nudges attractions harder than words have been.",
        stakes: "Proximity chemistry vs stated preferences collide.",
        subtext: [
          "someone's partner is watching",
          "the sun and skin raise the heat",
        ],
        tension: hasCouples ? 40 : 30,
      };
    case "kitchen":
      return {
        goal: "Morning-after gossip — who paired off, what was said, what wasn't.",
        stakes: "Coffee-table truths can reshape the villa before lunch.",
        subtext: [
          "the girls and the boys are running parallel recaps",
          "silence at the counter means something",
        ],
        tension: 35,
      };
    case "bedroom":
      return {
        goal: "Night falls, private conversations land hardest — confessions, fears, late pivots.",
        stakes:
          "Under the covers everyone drops the act. Who they chose to talk to matters.",
        subtext: ["the walls are thin", "tomorrow's energy depends on tonight"],
        tension: 50,
      };
    case "recouple":
      return {
        goal: hasCouples
          ? "Recoupling ceremony — pairs break, new pairs form, one islander goes home."
          : "First coupling — pair up based on the chemistry built in the first days.",
        stakes: hasCouples
          ? "Every wrong pick risks eliminating someone important."
          : "This is the pairing that frames the first arc of the season.",
        subtext: [
          "the choice is a statement, not just a pairing",
          hasCouples
            ? "old partners are watching the new choice like a verdict"
            : "nobody wants to be the one not picked",
        ],
        tension: hasCouples ? 85 : 60,
      };
    case "date":
      return {
        goal: "A single couple alone — unguarded honesty about where the relationship actually is.",
        stakes: "Real answers about whether this pairing is genuine.",
        subtext: [
          "the villa noise falls away",
          "one of them wants a bigger conversation than the other is ready for",
        ],
        tension: 55,
      };
    case "challenge":
    case "minigame":
      return {
        goal: "A game that exposes what couples really think about each other.",
        stakes:
          "Winners get a reward date. Losers lose face in front of the villa.",
        subtext: [
          "the quiz answers reveal gaps in knowledge",
          "trash talk lands differently when the group is watching",
        ],
        tension: 50,
      };
    case "bombshell":
      return {
        goal: "A new islander arrives — heads should turn and every existing pair should wobble.",
        stakes: "Comfortable couples are suddenly not safe.",
        subtext: [
          "the new arrival is sizing up who's gettable",
          "partners are watching their partners' reactions",
        ],
        tension: 80,
      };
    case "interview":
      return {
        goal: "A solo confessional — the contestant speaks honestly to the audience about their real read on the villa.",
        stakes:
          "What they say here diverges from what they've been performing on camera.",
        subtext: [
          "the mask slips",
          "they have a strategy they haven't admitted aloud",
        ],
        tension: 40,
      };
    case "public_vote":
    case "islander_vote":
    case "producer_twist":
      return {
        goal: "Eliminate an islander — frame the loss with real emotional weight.",
        stakes: `One of the ${activeCastCount} remaining islanders is leaving tonight.`,
        subtext: [
          "their partner's reaction is the real story",
          "relief and grief share the same room",
        ],
        tension: 90,
      };
    case "casa_amor_arrival":
    case "casa_amor_date":
    case "casa_amor_challenge":
    case "casa_amor_stickswitch":
      return {
        goal: "Casa Amor chaos — loyalty tested against temptation.",
        stakes: "Every existing couple can be rewritten tonight.",
        subtext: [
          "distance makes the heart do weird things",
          "the absent partner is a ghost in every conversation",
        ],
        tension: 90,
      };
    case "grand_finale":
      return {
        goal: "Crown the winning couple — the whole season lands here.",
        stakes: "The public vote decides. Both finalists get their moment.",
        subtext: [
          "this is the ending of the character arc, not just the show",
          "every couple has earned a callback",
        ],
        tension: 100,
      };
    default: {
      return {
        goal: `Advance the ${couplesList.length}-couple villa state through a ${sceneType} beat.`,
        stakes: "Something shifts that matters for next scene.",
        subtext: ["undercurrents that haven't surfaced yet"],
        tension: 40,
      };
    }
  }
}

function pickParticipants(
  sceneType: SceneType,
  state: BatchPlanState,
): string[] {
  const { activeCastIds, couplesList } = state;
  if (
    sceneType === "introductions" ||
    sceneType === "recouple" ||
    sceneType === "bombshell" ||
    sceneType === "minigame" ||
    sceneType === "challenge" ||
    sceneType === "public_vote" ||
    sceneType === "islander_vote" ||
    sceneType === "producer_twist" ||
    sceneType === "grand_finale" ||
    sceneType.startsWith("casa_amor")
  ) {
    return [...activeCastIds];
  }
  if (sceneType === "date") {
    const firstCouple = couplesList[0];
    if (firstCouple) return [firstCouple.a, firstCouple.b];
    return activeCastIds.slice(0, 2);
  }
  if (sceneType === "interview") {
    return activeCastIds.slice(0, 1);
  }
  const groupSize = Math.max(
    3,
    Math.min(5, Math.floor(activeCastIds.length / 2)),
  );
  return activeCastIds.slice(0, groupSize);
}

interface BatchPlanState {
  scenes: Scene[];
  activeCastIds: string[];
  activeCastCount: number;
  bombshellsIntroduced: number;
  bombshellPoolSize: number;
  couplesList: Couple[];
  coupleCount: number;
  lastBombshellScene: number | null;
  bombshellDatingUntilScene: number | null;
  avgDramaScore: number;
  casaAmorState: CasaAmorState | null;
}

export interface PlanBatchInput {
  scenes: Scene[];
  activeCastIds: string[];
  couples: Couple[];
  bombshellsIntroduced: number;
  bombshellPoolSize: number;
  lastBombshellScene: number | null;
  bombshellDatingUntilScene: number | null;
  avgDramaScore: number;
  casaAmorState: CasaAmorState | null;
  batchSize: number;
}

/**
 * Plan the next batch of scene outlines.
 *
 * Walks the scene-type planner forward `batchSize` steps, building an
 * outline per step with a narrative goal / stakes / subtext drawn from
 * the scene type and the current villa state. Deterministic given the
 * input — no LLM call, no side effects.
 *
 * The batch is a mini-arc: each outline's simulated advance updates the
 * planner's view of scene count and couples so downstream types react
 * to what came before (e.g. if Scene 21 is a recouple, Scene 22's
 * tension bumps because hasCouples is now true).
 */
export function planBatch(input: PlanBatchInput): SceneOutline[] {
  const outlines: SceneOutline[] = [];
  const simulatedTypes: SceneType[] = [];

  const makeBatchState = (): BatchPlanState => ({
    scenes: [
      ...input.scenes,
      ...simulatedTypes.map((type) => ({ type }) as unknown as Scene),
    ],
    activeCastIds: input.activeCastIds,
    activeCastCount: input.activeCastIds.length,
    bombshellsIntroduced: input.bombshellsIntroduced,
    bombshellPoolSize: input.bombshellPoolSize,
    couplesList: input.couples,
    coupleCount: input.couples.length,
    lastBombshellScene: input.lastBombshellScene,
    bombshellDatingUntilScene: input.bombshellDatingUntilScene,
    avgDramaScore: input.avgDramaScore,
    casaAmorState: input.casaAmorState ?? null,
  });

  for (let i = 0; i < input.batchSize; i++) {
    const batchState = makeBatchState();
    const sceneType = nextSceneType({
      scenes: batchState.scenes,
      activeCastCount: batchState.activeCastCount,
      bombshellsIntroduced: batchState.bombshellsIntroduced,
      bombshellPoolSize: batchState.bombshellPoolSize,
      coupleCount: batchState.coupleCount,
      lastBombshellScene: batchState.lastBombshellScene,
      bombshellDatingUntilScene: batchState.bombshellDatingUntilScene,
      avgDramaScore: batchState.avgDramaScore,
      casaAmorState: batchState.casaAmorState,
      recoupleCount: batchState.scenes.filter((s) => s.type === "recouple")
        .length,
    });

    const shape = outlineShape(sceneType, batchState);
    outlines.push({
      sequence: i,
      type: sceneType,
      participants: pickParticipants(sceneType, batchState),
      location: sceneType,
      goal: shape.goal,
      tension: shape.tension,
      stakes: shape.stakes,
      subtext: shape.subtext,
      dependsOnSequence: i === 0 ? undefined : i - 1,
    });
    simulatedTypes.push(sceneType);
  }

  return outlines;
}
