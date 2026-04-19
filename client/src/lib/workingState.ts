import type {
  Couple,
  EmotionState,
  LlmSceneResponse,
  Relationship,
  Scene,
  SceneType,
  SystemEvent,
} from "@villa-ai/shared";

export interface WorkingState {
  scenes: Scene[];
  relationships: Relationship[];
  emotions: EmotionState[];
  couples: Couple[];
  eliminatedIds: string[];
}

export interface CommittedEpisodeSnapshot {
  scenes: Scene[];
  relationships: Relationship[];
  emotions: EmotionState[];
  couples: Couple[];
  eliminatedIds: string[];
}

function clampMetric(value: number): number {
  if (value < 0) return 0;
  if (value > 100) return 100;
  return value;
}

export function cloneState(committed: CommittedEpisodeSnapshot): WorkingState {

  return {
    scenes: [...committed.scenes],
    relationships: committed.relationships.map((r) => ({ ...r })),
    emotions: committed.emotions.map((e) => ({ ...e })),
    couples: committed.couples.map((c) => ({ ...c })),
    eliminatedIds: [...committed.eliminatedIds],
  };
}

export function applyRealizedScene(
  state: WorkingState,
  sceneType: SceneType,
  response: LlmSceneResponse,
): WorkingState {

  for (const event of response.systemEvents) {
    applyEventToState(state, event);
  }

  if (response.emotionUpdates.length > 0) {
    const byAgent = new Map(
      response.emotionUpdates.map((u) => [u.agentId, u] as const),
    );
    state.emotions = state.emotions.map((e) => {
      const update = byAgent.get(e.agentId);
      if (!update) return e;
      return {
        agentId: e.agentId,
        primary: update.primary,
        intensity: update.intensity,
      };
    });
  }

  state.scenes.push({

    type: sceneType,
    title: "",
    participantIds: Array.from(
      new Set(response.dialogue.map((d) => d.agentId)),
    ),
    dialogue: [],
    systemEvents: [],
    outcome: response.outcome,
    createdAt: Date.now(),
  } as unknown as Scene);

  return state;
}

type WorkingReducerEvent = Pick<
  SystemEvent,
  "type" | "fromId" | "toId" | "delta" | "metric"
>;

function applyEventToState(
  state: WorkingState,
  event: WorkingReducerEvent,
): void {
  const { type, fromId, toId, delta } = event;

  if (
    type === "attraction_change" ||
    type === "trust_change" ||
    type === "jealousy_spike" ||
    type === "compatibility_change"
  ) {
    if (!fromId || !toId || typeof delta !== "number") return;
    state.relationships = state.relationships.map((r) => {
      if (r.fromId !== fromId || r.toId !== toId) return r;
      const next = { ...r };
      if (type === "attraction_change")
        next.attraction = clampMetric(r.attraction + delta);
      if (type === "trust_change") next.trust = clampMetric(r.trust + delta);
      if (type === "jealousy_spike")
        next.jealousy = clampMetric(r.jealousy + delta);
      if (type === "compatibility_change")
        next.compatibility = clampMetric(r.compatibility + delta);
      return next;
    });
    return;
  }

  if (type === "gravity_shift" || type === "gravity_threshold") {
    if (!fromId || !toId || typeof delta !== "number" || !event.metric) return;
    state.relationships = state.relationships.map((r) => {
      if (r.fromId !== fromId || r.toId !== toId) return r;
      const next = { ...r };
      if (event.metric === "trust") next.trust = clampMetric(r.trust + delta);
      if (event.metric === "attraction")
        next.attraction = clampMetric(r.attraction + delta);
      return next;
    });
    return;
  }

  if (type === "couple_formed" && fromId && toId) {
    const alreadyCoupled = state.couples.some(
      (c) =>
        (c.a === fromId && c.b === toId) || (c.a === toId && c.b === fromId),
    );
    if (!alreadyCoupled) {
      state.couples = [...state.couples, { a: fromId, b: toId }];
    }
    return;
  }

  if (type === "couple_broken") {
    const target = fromId ?? toId;
    if (!target) return;
    state.couples = state.couples.filter(
      (c) => c.a !== target && c.b !== target,
    );
    return;
  }

}

export function applyElimination(
  state: WorkingState,
  eliminatedId: string,
): WorkingState {
  if (state.eliminatedIds.includes(eliminatedId)) return state;
  state.eliminatedIds = [...state.eliminatedIds, eliminatedId];

  state.couples = state.couples.filter(
    (c) => c.a !== eliminatedId && c.b !== eliminatedId,
  );
  return state;
}
