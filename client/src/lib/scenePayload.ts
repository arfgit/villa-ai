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

// These are the 4 systemEvent types the prompt's recent-block filter
// keeps. Matching the filter client-side lets us drop the other deltas
// entirely (attraction_change, trust_change, jealousy_spike,
// compatibility_change) from the payload, since those are only used
// at commit time by the store's relationship reducer — NOT by the
// prompt when this scene is in the `recentScenes` window.
const RECENT_EVENT_TYPES = new Set<SystemEvent["type"]>([
  "couple_formed",
  "couple_broken",
  "minigame_win",
  "challenge_win",
]);

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
