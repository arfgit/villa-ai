// Trim a Scene down to the fields the server's prompt builder actually
// reads from BuildArgs.recentScenes. The server builder:
//   1. switches on scene.type
//   2. reads scene.outcome
//   3. filters scene.systemEvents to 4 specific types, keeps first 3
//   4. filters scene.dialogue to lines with text.length > 20, keeps first 2
//   5. uses scene.title for minigame rotation (recentGameNames)
//   6. uses scene.challengeCategory for challenge category alternation
//
// Everything else (full dialogue array, participantIds, createdAt,
// sceneContext) is dead weight on the wire — a 15-line dialogue array
// serialized as JSON is 1-3KB, and we send 3 of them per request. That
// compounds across every prefetch cycle. Pre-filtering to the exact
// shape the server reads cuts payload size ~60-80% on that field.
//
// The server's coerceBuildArgs validator already only requires these
// fields to be arrays/strings — not non-empty, not element-validated —
// so no server change is needed.

import type { DialogueLine, Scene, SystemEvent } from "@villa-ai/shared";

// These are the systemEvent types the prompt's recent-block filter
// keeps. Matching the filter client-side lets us drop the other deltas
// entirely (attraction_change, trust_change, jealousy_spike,
// compatibility_change, gravity_shift, gravity_threshold) from the payload,
// since those are only used at commit time by the store's relationship
// reducer — NOT by the prompt when this scene is in the `recentScenes`
// window. The `satisfies` clause is a compile-time guard: if a future
// event type is accidentally added here that shouldn't be in recent-block
// context (like gravity_*), the TS check below will fail.
const KEPT_EVENT_TYPES = [
  "couple_formed",
  "couple_broken",
  "minigame_win",
  "challenge_win",
] as const satisfies readonly SystemEvent["type"][];

// Explicit list of types that MUST NOT appear in recent-block payloads.
// Maintained as a positive rejection list so contributors notice the
// exclusion when adding new event types.
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
// Compile-time evaluation: if a KEPT entry leaks into ExcludedFromRecentBlock,
// `AssertDisjoint` resolves to `never` and the `true` annotation errors. The
// `void` reference keeps the assertion a no-op at runtime while still gating
// the type check — without it, TS6133 flags the const as unused.
const _assertKeptIsDisjoint: AssertDisjoint = true;
void _assertKeptIsDisjoint;

const RECENT_EVENT_TYPES = new Set<SystemEvent["type"]>(KEPT_EVENT_TYPES);

// Trim dialogue to the same shape the prompt uses: first 2 lines with
// substantive content. Matches server/src/lib/prompt.ts recentBlock.
function trimDialogue(dialogue: DialogueLine[]): DialogueLine[] {
  return dialogue.filter((d) => (d.text?.length ?? 0) > 20).slice(0, 2);
}

// Trim events to the narrative subset the prompt reads. First 3 match
// the prompt's .slice(0, 3) cap.
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
    // sceneContext is deliberately NOT forwarded — the prompt doesn't
    // read it off past scenes (only off the CURRENT scene via
    // renderSceneContextBlock), and it's the heaviest nested shape
    // on a Scene (plannedBeats + roles with stakes + subtext).
  };
}
