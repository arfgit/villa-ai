import type { DialogueLine, Scene, SystemEvent } from "@villa-ai/shared";

const KEPT_EVENT_TYPES = [
  "couple_formed",
  "couple_broken",
  "minigame_win",
  "challenge_win",
] as const satisfies readonly SystemEvent["type"][];

type ExcludedFromRecentBlock =
  | "trust_change"
  | "attraction_change"
  | "jealousy_spike"
  | "compatibility_change"
  | "gravity_shift"
  | "gravity_threshold";
type AssertDisjoint =
  Extract<
    (typeof KEPT_EVENT_TYPES)[number],
    ExcludedFromRecentBlock
  > extends never
    ? true
    : never;

const _assertKeptIsDisjoint: AssertDisjoint = true;
void _assertKeptIsDisjoint;

const RECENT_EVENT_TYPES = new Set<SystemEvent["type"]>(KEPT_EVENT_TYPES);

function trimDialogue(dialogue: DialogueLine[]): DialogueLine[] {
  return dialogue.filter((d) => (d.text?.length ?? 0) > 20).slice(0, 2);
}

function trimEvents(events: SystemEvent[]): SystemEvent[] {
  return events.filter((e) => RECENT_EVENT_TYPES.has(e.type)).slice(0, 3);
}

/**
 * Return a Scene-shaped object that only carries what the server prompt
 * reads. Safe to pass directly to `recentScenes` on BuildArgs — the
 * server validator's per-field shape checks all pass (arrays are still
 * arrays, strings are still strings).
 */
export function trimSceneForPrompt(scene: Scene): Scene {
  return {
    id: scene.id,
    type: scene.type,
    title: scene.title,
    participantIds: scene.participantIds,
    dialogue: trimDialogue(scene.dialogue),
    systemEvents: trimEvents(scene.systemEvents),
    outcome: scene.outcome,
    createdAt: scene.createdAt,
    challengeCategory: scene.challengeCategory,

  };
}
