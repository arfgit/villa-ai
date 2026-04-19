import type { Agent, LlmSceneResponse } from "@villa-ai/shared";
import type { SceneOutline } from "@villa-ai/shared";

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

  const speakerIds = outline.participants.slice(0, 2);
  if (speakerIds.length < 2) {
    for (const agent of cast) {
      if (speakerIds.includes(agent.id)) continue;
      speakerIds.push(agent.id);
      if (speakerIds.length === 2) break;
    }
  }

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
