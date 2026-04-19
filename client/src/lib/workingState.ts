// Working state simulator for batch prefetch.
//
// The batch prefetcher realizes N scenes sequentially. Each scene's prompt
// should see the RELATIONSHIP + COUPLE state as it would be AFTER the
// previous scenes in the batch have committed — otherwise scene 4 in a
// firepit→pool→kitchen→bedroom batch would read as if scene 1's attraction
// deltas never happened, and the dialogue drifts off the arc.
//
// `cloneState` snapshots the subset of episode state the prefetch path
// reads. `applyRealizedScene` mutates that snapshot with the LLM response's
// systemEvents / emotionUpdates — mirroring the reducers the store runs at
// real commit time. Working state never touches the real store; it lives
// only inside a single runPrefetch invocation.
//
// Key invariant: this is ADVISORY. The store's real commit handler is the
// source of truth. If a scene is eventually played and mutates state
// differently (it shouldn't, but could), the store wins. Working state
// just gives the next prompt in the batch a reasonable forward-looking
// view so the arc doesn't break.

import type {
  Couple,
  EmotionState,
  LlmSceneResponse,
  Relationship,
  Scene,
  SceneType,
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

// Clamp a relationship metric to [0, 100]. Same bounds the store applies at
// real commit time — without clamping, repeated deltas could push metrics
// out of range and make prompt strings misleading.
function clampMetric(value: number): number {
  if (value < 0) return 0;
  if (value > 100) return 100;
  return value;
}

export function cloneState(committed: CommittedEpisodeSnapshot): WorkingState {
  // Deep-enough clone: we'll mutate relationship rows, couples, emotions,
  // and append to scenes. Each array gets a fresh spread; objects inside
  // get shallow clones as they're mutated (see applyRealizedScene).
  return {
    scenes: [...committed.scenes],
    relationships: committed.relationships.map((r) => ({ ...r })),
    emotions: committed.emotions.map((e) => ({ ...e })),
    couples: committed.couples.map((c) => ({ ...c })),
    eliminatedIds: [...committed.eliminatedIds],
  };
}

// Apply an LLM scene response to the working state. Mirrors the subset of
// the store's commit logic that the prefetcher depends on:
//   - attraction / trust / jealousy / compatibility deltas on relationships
//   - couple_formed / couple_broken mutate the couples list
//   - emotionUpdates rewrite the emotions list entries in place
// Returns the same WorkingState (mutated) for chaining convenience.
export function applyRealizedScene(
  state: WorkingState,
  sceneType: SceneType,
  response: LlmSceneResponse,
): WorkingState {
  // 1. System events → relationship deltas + couple mutations.
  for (const event of response.systemEvents) {
    applyEventToState(state, event);
  }

  // 2. Emotion updates rewrite the emotion row for that agent. No append —
  // there's one emotion entry per active agent and we overwrite in place.
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

  // 3. Append a stub scene so the planner + prompt's recentScenes logic
  // sees this slot as taken. The stub carries just enough shape for the
  // prompt's recentBlock to read (type + outcome + minimal dialogue) —
  // downstream code that flows to the server filters stubs by presence
  // of a real `id`, so stubs stay client-side.
  state.scenes.push({
    // Deliberately NO id — prefetch's realScenes filter skips these.
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

function applyEventToState(
  state: WorkingState,
  event: LlmSceneResponse["systemEvents"][number],
): void {
  const { type, fromId, toId, delta } = event;

  // Relationship-delta events. Find the forward-direction row and apply.
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

  // Couple formation — push a new couple if it doesn't already exist in
  // either direction. Defensive: the LLM sometimes emits couple_formed
  // between already-coupled agents.
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

  // Couple break — remove any couple that contains either agent. Matches
  // the store's real commit behavior: a break references one name, and
  // we dissolve any pair that person was in.
  if (type === "couple_broken") {
    const target = fromId ?? toId;
    if (!target) return;
    state.couples = state.couples.filter(
      (c) => c.a !== target && c.b !== target,
    );
    return;
  }

  // minigame_win / challenge_win don't mutate prefetch-relevant state
  // directly (rewards are delivered as side effects by the real commit
  // handler). No-op here — the working state's scenes.push below still
  // captures that the scene happened so sceneNumber advances correctly.
}

// Apply a deterministic elimination to the working state. Extension
// point: wiring this into runPrefetch is the prerequisite for adding
// islander_vote / public_vote to BATCHABLE_TYPES — those ceremonies
// compute their eliminated agent OUTSIDE the LLM via eliminationEngine,
// so the post-ceremony working state is predictable from committed
// inputs alone.
export function applyElimination(
  state: WorkingState,
  eliminatedId: string,
): WorkingState {
  if (state.eliminatedIds.includes(eliminatedId)) return state;
  state.eliminatedIds = [...state.eliminatedIds, eliminatedId];
  // Dissolve any couple the eliminated agent was in — mirrors the
  // store's real commit behavior.
  state.couples = state.couples.filter(
    (c) => c.a !== eliminatedId && c.b !== eliminatedId,
  );
  return state;
}
