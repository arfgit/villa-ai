import type {
  LlmSceneResponse,
  LlmBatchSceneResponse,
  Emotion,
  SystemEventType,
  TurnIntent,
  PlannedBeat,
} from "@/types";

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

// Soft-coerce an LLM-supplied intent. Unknown / missing → fall back to the
// planned beat's intent at beatIndex (if provided and valid), else 'deflect'.
// We deliberately do NOT reject the whole scene for a bad intent — retries
// are expensive and the engine can work with a default.
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
  } catch {}

  const noTrailing = stripTrailingCommas(cleaned);
  try {
    return JSON.parse(noTrailing) as Record<string, unknown>;
  } catch {}

  const closed = closeUnterminated(noTrailing);
  try {
    return JSON.parse(closed) as Record<string, unknown>;
  } catch (err) {
    const msg = err instanceof Error ? err.message : "parse failed";
    throw new Error(`Could not repair LLM JSON: ${msg}`);
  }
}

export function parseAndValidate(
  raw: string,
  validAgentIds: string[],
  requiredSpeakerIds?: string[],
  maxDialogueLines?: number,
  plannedBeats?: PlannedBeat[],
): LlmSceneResponse {
  // Raised cap so expanded scene arcs (setup → escalation → peak → fallout) aren't truncated.
  // Each contestant now gets ~2-4 lines, plus host lines and reactions.
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

  type ParsedDialogue = {
    agentId: string;
    text: string;
    emotion: Emotion;
    action: string | undefined;
    targetAgentId: string | undefined;
    intent: TurnIntent;
    beatIndex: number | undefined;
  };

  const validDialogue: ParsedDialogue[] = (
    dialogue as Array<Record<string, unknown>>
  )
    .filter(
      (d) =>
        typeof d.agentId === "string" &&
        validIds.has(d.agentId) &&
        typeof d.text === "string" &&
        d.text.length > 0,
    )
    .map((d): ParsedDialogue => {
      const beatIndex = asBeatIndex(d.beatIndex, plannedBeatCount);
      return {
        agentId: d.agentId as string,
        // 400 chars = enough for a peak-drama rant or confession without letting the LLM
        // ramble into monologues that break pacing.
        text: (d.text as string).slice(0, 400),
        emotion: asEmotion(d.emotion),
        action:
          typeof d.action === "string"
            ? (d.action as string).slice(0, 80)
            : undefined,
        targetAgentId:
          typeof d.targetAgentId === "string" && validIds.has(d.targetAgentId)
            ? (d.targetAgentId as string)
            : undefined,
        intent: asIntent(d.intent, plannedBeats, beatIndex),
        beatIndex,
      };
    })
    .slice(0, dialogueCap);

  // Coverage check: warn (don't reject) if >30% of planned beats never got
  // touched. This is a soft signal that the LLM ignored the skeleton so we
  // can tune the prompt without triggering a retry storm in production.
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
  // A short scene of real dialogue always reads better than a long scene
  // with "*claps enthusiastically*" filler. If ensemble scenes need broader
  // participation, fix it in the prompt (beat count / direction), not here.

  return {
    dialogue: validDialogue,
    systemEvents: validEvents,
    emotionUpdates: validEmotions,
    outcome,
  };
}

export function parseAndValidateBatch(
  raw: string,
  validAgentIds: string[],
  requiredSpeakerIds?: string[],
): LlmBatchSceneResponse {
  const data = repairAndParse(raw);

  if (Array.isArray(data.scenes)) {
    const scenes: LlmSceneResponse[] = [];
    for (const sceneData of data.scenes as Array<Record<string, unknown>>) {
      try {
        const sceneJson = JSON.stringify(sceneData);
        scenes.push(
          parseAndValidate(sceneJson, validAgentIds, requiredSpeakerIds),
        );
      } catch {
        continue;
      }
    }
    if (scenes.length === 0) {
      throw new Error("Batch response had no valid scenes");
    }
    return { scenes };
  }

  const single = parseAndValidate(raw, validAgentIds, requiredSpeakerIds);
  return { scenes: [single] };
}
