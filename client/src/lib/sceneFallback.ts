// Templated fallback scene.
//
// The batch prefetcher realizes each outline against a working-state
// simulator. If the LLM fails twice on a given outline (rate limited,
// malformed JSON, whatever), we don't abandon the whole batch tail —
// that would cascade into 4 empty queue slots and a long "catching up"
// pause. Instead, we emit a scripted interstitial: a short, neutral
// scene that advances time without inventing plot. The LLM retries on
// the NEXT batch cycle from fresh state, so the fallback is a one-time
// papering-over, not a permanent regression.
//
// Design rules for the template:
//   - No system events (no attraction deltas, no couple changes). The
//     LLM couldn't write this scene; a template can't either without
//     risking bad relationship data.
//   - No emotion updates. Same reason.
//   - 2-3 short lines max. Short enough to feel like a beat, not a
//     scene.
//   - Lines MUST reference real participant names (not "[Name]")
//     because the prompt rules everywhere say so and consumers assume it.
//   - Neutral emotion. A fallback emits "neutral" across the board so
//     the next prompt doesn't react to fake high drama.

import type { Agent, LlmSceneResponse } from "@villa-ai/shared";
import type { SceneOutline } from "@villa-ai/shared";

// Short, context-free line templates. Picked deterministically by
// (sceneType, participantCount) so repeated fallbacks don't produce the
// same literal dialogue over and over.
const AMBIENT_BEATS: Record<string, string[]> = {
  firepit: [
    "needed a second to just sit with my thoughts.",
    "the fire's nice tonight. everyone's... settling.",
    "i think we're all just catching our breath.",
    "sometimes the villa just goes quiet for a minute.",
  ],
  pool: [
    "the pool's nice. feels like the first normal thing all day.",
    "i needed this. just some sun, no drama.",
    "nothing to say right now honestly. just vibing.",
    "the villa's a lot. this is a breather.",
  ],
  kitchen: [
    "passing round coffee. nobody really wants to talk.",
    "bit of a quiet morning, innit.",
    "the kitchen's always where the vibes reset.",
    "makin' breakfast. letting everyone find their own headspace.",
  ],
  bedroom: [
    "the lights are low. everyone's turning in.",
    "just wanted a minute before bed. it's been a day.",
    "this room holds a lot of conversations nobody wants on camera.",
    "i'm shattered. we'll pick this up in the morning.",
  ],
  default: [
    "sometimes the villa just has quiet moments.",
    "nothing dramatic right now. just a breath between things.",
    "we all needed a beat to process.",
  ],
};

const AMBIENT_OUTCOMES: Record<string, string> = {
  firepit: "A quiet firepit moment — the villa catches its breath.",
  pool: "An easy afternoon by the pool before the next twist.",
  kitchen: "A subdued morning in the villa kitchen.",
  bedroom: "The villa winds down for the night in near-silence.",
  default: "A quiet moment in the villa between bigger beats.",
};

/**
 * Build a minimal, scripted LlmSceneResponse that any consumer can
 * commit safely. The caller provides the active cast so we can pick
 * real speaker ids (the prompt validator elsewhere requires them).
 */
export function createFallbackScene(
  outline: SceneOutline,
  cast: Agent[],
): LlmSceneResponse {
  const beats =
    AMBIENT_BEATS[outline.type as keyof typeof AMBIENT_BEATS] ??
    AMBIENT_BEATS.default!;

  // Prefer the outline's listed participants, fall back to the first 2
  // active cast members. Bounded to 2 speakers so the fallback scene
  // reads like a short exchange, not a group hang.
  const speakerIds = outline.participants.slice(0, 2);
  if (speakerIds.length < 2) {
    for (const agent of cast) {
      if (speakerIds.includes(agent.id)) continue;
      speakerIds.push(agent.id);
      if (speakerIds.length === 2) break;
    }
  }

  // Deterministic beat pick by outline sequence so two adjacent
  // fallbacks don't accidentally use the same first line.
  const beatStart = Math.max(0, outline.sequence) % beats.length;

  const dialogue = speakerIds.slice(0, 2).map((agentId, idx) => {
    const text = beats[(beatStart + idx) % beats.length]!;
    return {
      agentId,
      text,
      emotion: "neutral" as const,
      intent: undefined,
      beatIndex: undefined,
      quotable: undefined,
    };
  });

  return {
    dialogue,
    systemEvents: [],
    emotionUpdates: [],
    outcome:
      AMBIENT_OUTCOMES[outline.type as keyof typeof AMBIENT_OUTCOMES] ??
      AMBIENT_OUTCOMES.default!,
  };
}
