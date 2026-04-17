import type {
  LlmSceneResponse,
  LlmBatchSceneResponse,
  Emotion,
  SystemEventType,
  TurnIntent,
  PlannedBeat,
} from "@villa-ai/shared";

const VALID_EMOTIONS: Emotion[] = [
  "happy",
  "flirty",
  "jealous",
  "angry",
  "sad",
  "smug",
  "anxious",
  "bored",
  "shocked",
  "neutral",
];
const VALID_EVENT_TYPES: SystemEventType[] = [
  "trust_change",
  "attraction_change",
  "jealousy_spike",
  "compatibility_change",
  "couple_formed",
  "couple_broken",
  "minigame_win",
  "challenge_win",
];
const VALID_INTENTS: TurnIntent[] = [
  "flirt",
  "deflect",
  "reassure",
  "challenge",
  "test",
  "manipulate",
  "escalate",
  "soften",
  "confess",
  "accuse",
  "reveal",
  "deny",
  "joke",
  "retreat",
  "declare",
];

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function asEmotion(v: unknown): Emotion {
  if (typeof v === "string" && (VALID_EMOTIONS as string[]).includes(v))
    return v as Emotion;
  return "neutral";
}

function asEventType(v: unknown): SystemEventType {
  if (typeof v === "string" && (VALID_EVENT_TYPES as string[]).includes(v))
    return v as SystemEventType;
  return "trust_change";
}

function asIntent(
  v: unknown,
  plannedBeats: PlannedBeat[] | undefined,
  beatIndex: number | undefined,
): TurnIntent {
  if (typeof v === "string" && (VALID_INTENTS as string[]).includes(v))
    return v as TurnIntent;
  if (
    plannedBeats &&
    typeof beatIndex === "number" &&
    plannedBeats[beatIndex]
  ) {
    return plannedBeats[beatIndex]!.intent;
  }
  return "deflect";
}

function asBeatIndex(v: unknown, plannedBeatCount: number): number | undefined {
  if (typeof v !== "number" || !Number.isFinite(v)) return undefined;
  if (plannedBeatCount === 0) return undefined;
  const idx = Math.floor(v);
  if (idx < 0 || idx >= plannedBeatCount) return undefined;
  return idx;
}

// Clean dialogue/action text the LLM produced. Models emit miscellaneous
// garbage the prompt doesn't ask for:
//   - control characters + the broken-bar ¦ and section sign §
//   - leading emoji/pictograph characters ("🕉 I'm so glad...", "✨Welcome✨",
//     "§heyyyy") that the model imitated from the cast block or added as
//     decoration. Strip at the START of the line regardless of whether
//     there's whitespace after — LLMs don't always insert one. Also strip
//     wrapping emoji at the END of the line (the "✨ ... ✨" sandwich
//     pattern host announcements love)
//   - other non-printable characters
//
// We strip these here so the bug is fixed once (server-side validation)
// rather than hunted through every render site. Preserves meaningful
// punctuation, action markers like "*sighs*", and inline emoji that
// occur mid-sentence (those stay — they're likely intentional).
// Character class covers: emoji presentation, extended pictographic (covers
// most modern emoji regardless of skin-tone modifiers), the U+FE0F variation
// selector (often trails an emoji like ❤️ = ❤ + FE0F), the U+200D zero-width
// joiner (binds compound emoji like 👨‍👩‍👧), and a few common stray chars
// the LLM sometimes emits as decoration (¦ § bullets). Whitespace too, so
// the leader/trailer strip also eats any gaps between emojis.
const DECORATOR_CLASS =
  "\\p{Emoji_Presentation}\\p{Extended_Pictographic}\\u200d\\ufe0f\\u00a6\\u00a7\\u2022\\u2043\\s";
const LEADER_STRIP_RE = new RegExp(`^[${DECORATOR_CLASS}]+`, "u");
const TRAILER_STRIP_RE = new RegExp(`[${DECORATOR_CLASS}]+$`, "u");

function sanitizeDialogueText(raw: string): string {
  let s = raw;
  // Strip control chars.
  s = s.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, "");
  // Strip leading emoji/pictograph/separator run. Whitespace-optional so
  // "✨Welcome" as well as "🕉 I'm so glad..." both get cleaned.
  s = s.replace(LEADER_STRIP_RE, "");
  s = s.trimStart();
  s = s.replace(TRAILER_STRIP_RE, "").trimEnd();
  // Strip whole-line asterisk wrap. The LLM sometimes emits every
  // dialogue line as "*babe, I'm nervous...*" — the whole line renders
  // italic (Markdown emphasis) and reads as narration instead of speech.
  // Detection: starts with * AND ends with * AND no other * appears
  // inside (if there were inline *action* markers, we'd see >= 3 stars).
  // In that narrow case, unwrap. Leaves "*sighs* said..." alone because
  // that pattern has * at positions 0 and 6 but NOT at the end.
  if (s.length >= 2 && s.startsWith("*") && s.endsWith("*")) {
    const inner = s.slice(1, -1);
    if (!inner.includes("*")) {
      s = inner.trim();
    }
  }
  return s;
}

function stripTrailingCommas(s: string): string {
  let out = "";
  let inString = false;
  let escape = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i]!;
    if (escape) {
      out += ch;
      escape = false;
      continue;
    }
    if (ch === "\\" && inString) {
      out += ch;
      escape = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      out += ch;
      continue;
    }
    if (!inString && ch === ",") {
      let j = i + 1;
      while (j < s.length && /\s/.test(s[j]!)) j++;
      if (j < s.length && (s[j] === "]" || s[j] === "}")) continue;
    }
    out += ch;
  }
  return out;
}

function closeUnterminated(s: string): string {
  const stack: string[] = [];
  let inString = false;
  let escape = false;
  let lastSafeLen = 0;
  let lastSafeStack = 0;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i]!;
    if (escape) {
      escape = false;
      continue;
    }
    if (inString) {
      if (ch === "\\") {
        escape = true;
        continue;
      }
      if (ch === '"') {
        inString = false;
      }
      continue;
    }
    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === "{" || ch === "[") {
      stack.push(ch);
      continue;
    }
    if (ch === "}" || ch === "]") {
      stack.pop();
      continue;
    }
    if (ch === "," && stack.length > 0) {
      lastSafeLen = i;
      lastSafeStack = stack.length;
    }
  }

  if (!inString && stack.length === 0) return s;

  let truncated = s;
  if (inString || stack.length > lastSafeStack) {
    truncated = s.slice(0, lastSafeLen);
  }

  const reStack: string[] = [];
  let reInString = false;
  let reEscape = false;
  for (let i = 0; i < truncated.length; i++) {
    const ch = truncated[i]!;
    if (reEscape) {
      reEscape = false;
      continue;
    }
    if (reInString) {
      if (ch === "\\") {
        reEscape = true;
        continue;
      }
      if (ch === '"') reInString = false;
      continue;
    }
    if (ch === '"') {
      reInString = true;
      continue;
    }
    if (ch === "{" || ch === "[") reStack.push(ch);
    else if (ch === "}" || ch === "]") reStack.pop();
  }

  let closing = "";
  while (reStack.length > 0) {
    const open = reStack.pop();
    closing += open === "{" ? "}" : "]";
  }
  return truncated + closing;
}

function repairAndParse(text: string): Record<string, unknown> {
  let cleaned = text.trim();

  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
  }

  const firstBrace = cleaned.indexOf("{");
  const lastBrace = cleaned.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    cleaned = cleaned.slice(firstBrace, lastBrace + 1);
  } else if (firstBrace !== -1) {
    cleaned = cleaned.slice(firstBrace);
  }

  try {
    return JSON.parse(cleaned) as Record<string, unknown>;
  } catch {
    // continue to repair
  }

  const noTrailing = stripTrailingCommas(cleaned);
  try {
    return JSON.parse(noTrailing) as Record<string, unknown>;
  } catch {
    // continue
  }

  const closed = closeUnterminated(noTrailing);
  try {
    return JSON.parse(closed) as Record<string, unknown>;
  } catch (err) {
    const msg = err instanceof Error ? err.message : "parse failed";
    throw new Error(`Could not repair LLM JSON: ${msg}`);
  }
}

/**
 * @param requiredSpeakerIds — if provided, any agent in this list who has
 *   zero dialogue lines gets a synthetic reaction appended. Used for
 *   minigame/challenge scenes where ALL cast must appear.
 */
export function parseAndValidate(
  raw: string,
  validAgentIds: string[],
  requiredSpeakerIds?: string[],
  maxDialogueLines?: number,
  plannedBeats?: PlannedBeat[],
): LlmSceneResponse {
  const dialogueCap =
    maxDialogueLines ??
    Math.min(50, Math.max(20, (requiredSpeakerIds?.length ?? 0) * 3 + 6));
  const data = repairAndParse(raw);

  const dialogue = Array.isArray(data.dialogue) ? data.dialogue : [];
  const systemEvents = Array.isArray(data.systemEvents)
    ? data.systemEvents
    : [];
  const emotionUpdates = Array.isArray(data.emotionUpdates)
    ? data.emotionUpdates
    : [];
  const outcome =
    typeof data.outcome === "string" && data.outcome.trim().length > 0
      ? data.outcome.trim().slice(0, 500)
      : "The scene fades to commercial.";

  const validIds = new Set(validAgentIds);
  const plannedBeatCount = plannedBeats?.length ?? 0;

  const validDialogue = (dialogue as Array<Record<string, unknown>>)
    .filter(
      (d) =>
        typeof d.agentId === "string" &&
        validIds.has(d.agentId) &&
        typeof d.text === "string" &&
        d.text.length > 0,
    )
    .map((d) => {
      const beatIndex = asBeatIndex(d.beatIndex, plannedBeatCount);
      const cleanedText = sanitizeDialogueText(d.text as string).slice(0, 400);
      return {
        agentId: d.agentId as string,
        text: cleanedText,
        emotion: asEmotion(d.emotion),
        action:
          typeof d.action === "string"
            ? sanitizeDialogueText(d.action as string).slice(0, 80)
            : undefined,
        targetAgentId:
          typeof d.targetAgentId === "string" && validIds.has(d.targetAgentId)
            ? (d.targetAgentId as string)
            : undefined,
        intent: asIntent(d.intent, plannedBeats, beatIndex),
        beatIndex,
        quotable: d.quotable === true ? true : undefined,
      };
    })
    .filter((d) => d.text.length > 0) // sanitization may have nuked a pure-emoji line
    .slice(0, dialogueCap);

  if (plannedBeats && plannedBeats.length > 0) {
    const touched = new Set(
      validDialogue
        .map((d) => d.beatIndex)
        .filter((i): i is number => typeof i === "number"),
    );
    const missed = plannedBeats.length - touched.size;
    if (missed / plannedBeats.length > 0.3) {
      console.warn(
        `[scene-engine] LLM skipped ${missed}/${plannedBeats.length} planned beats`,
      );
    }
  }

  // Prioritize couple_formed / couple_broken events over numeric deltas —
  // an intro with 8 contestants needs 4 couple_formed events, and a truncation
  // cap of 8 would drop them if the LLM emits deltas first.
  const allEvents = (systemEvents as Array<Record<string, unknown>>)
    .filter((e) => typeof e.label === "string")
    .map((e) => ({
      type: asEventType(e.type),
      fromId:
        typeof e.fromId === "string" && validIds.has(e.fromId)
          ? (e.fromId as string)
          : undefined,
      toId:
        typeof e.toId === "string" && validIds.has(e.toId)
          ? (e.toId as string)
          : undefined,
      delta: typeof e.delta === "number" ? clamp(e.delta, -10, 10) : undefined,
      label: (e.label as string).slice(0, 80),
    }));
  const coupleEvents = allEvents.filter(
    (e) => e.type === "couple_formed" || e.type === "couple_broken",
  );
  const otherEvents = allEvents.filter(
    (e) => e.type !== "couple_formed" && e.type !== "couple_broken",
  );
  const validEvents = [
    ...coupleEvents.slice(0, 10),
    ...otherEvents.slice(0, 8),
  ];

  const validEmotions = (emotionUpdates as Array<Record<string, unknown>>)
    .filter((u) => typeof u.agentId === "string" && validIds.has(u.agentId))
    .map((u) => ({
      agentId: u.agentId as string,
      primary: asEmotion(u.primary),
      intensity:
        typeof u.intensity === "number" ? clamp(u.intensity, 0, 100) : 50,
    }));

  if (validDialogue.length === 0) {
    throw new Error("Scene response had no valid dialogue lines");
  }

  // Deliberately NOT padding missing required speakers with canned reactions.
  // Short real dialogue beats fake filler every time. Fix ensemble coverage
  // upstream via the prompt (beat count / direction), not here.

  return {
    dialogue: validDialogue,
    systemEvents: validEvents,
    emotionUpdates: validEmotions,
    outcome,
  };
}

/**
 * Parse a batch LLM response containing multiple scenes.
 * Falls back to wrapping a single scene if the response doesn't have a `scenes` array.
 */
export function parseAndValidateBatch(
  raw: string,
  validAgentIds: string[],
  requiredSpeakerIds?: string[],
): LlmBatchSceneResponse {
  const data = repairAndParse(raw);

  // If the response has a `scenes` array, parse each scene individually
  if (Array.isArray(data.scenes)) {
    const scenes: LlmSceneResponse[] = [];
    for (const sceneData of data.scenes as Array<Record<string, unknown>>) {
      try {
        const sceneJson = JSON.stringify(sceneData);
        scenes.push(
          parseAndValidate(sceneJson, validAgentIds, requiredSpeakerIds),
        );
      } catch {
        // Skip malformed scenes in the batch
        continue;
      }
    }
    if (scenes.length === 0) {
      throw new Error("Batch response had no valid scenes");
    }
    return { scenes };
  }

  // Fallback: treat as a single scene response
  const single = parseAndValidate(raw, validAgentIds, requiredSpeakerIds);
  return { scenes: [single] };
}
