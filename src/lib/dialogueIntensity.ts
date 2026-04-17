import type { DialogueLine } from "@/types";

// Strip leading/trailing `*stage action*` segments from a dialogue line's text
// and fold them into the dedicated action field. The LLM occasionally inlines
// stage directions as "*leans in* I like you." instead of emitting the action
// field — when that happens the action renders as part of the quote rather
// than the italic stage-direction line above it. Normalizing here guarantees
// actions always sit on top of the quote.
const ASTERISK_ACTION_RE = /^\s*\*([^*\n]{1,140})\*\s*/;
const TRAILING_ACTION_RE = /\s*\*([^*\n]{1,140})\*\s*$/;

export function extractInlineAction(
  text: string,
  existingAction: string | undefined,
): { text: string; action: string | undefined } {
  const extracted: string[] = [];
  let remaining = text;

  const leading = remaining.match(ASTERISK_ACTION_RE);
  if (leading) {
    extracted.push(leading[1]!.trim());
    remaining = remaining.replace(ASTERISK_ACTION_RE, "");
  }

  const trailing = remaining.match(TRAILING_ACTION_RE);
  if (trailing) {
    extracted.push(trailing[1]!.trim());
    remaining = remaining.replace(TRAILING_ACTION_RE, "");
  }

  if (extracted.length === 0) {
    return { text: remaining.trim(), action: existingAction };
  }

  const merged = [existingAction, ...extracted]
    .filter((s) => s && s.length > 0)
    .join("; ");
  return {
    text: remaining.trim(),
    action: merged.length > 0 ? merged : undefined,
  };
}

// Convert literal `\uXXXX` escape sequences that sometimes leak through the
// LLM's JSON output (e.g. "\u2705\u2014 I'm sensing...") into the actual
// characters they represent. Standards-compliant JSON parsers decode these
// already, but when the model double-escapes a string we receive the literal
// six-character sequence and need to unescape it here.
export function decodeUnicodeEscapes(text: string): string {
  if (!text || !text.includes("\\u")) return text;
  return text.replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) =>
    String.fromCharCode(parseInt(hex, 16)),
  );
}

// Detect self-introduction lines that should only appear in Scene 1.
// The LLM repeatedly drifts back into "Hey guys, I'm [Name], a [age]-year-old
// [job] from [place]" patterns in mid-season scenes — which reads like a
// reset. Heuristic: a line counts as an intro if it contains an explicit
// "I'm [Name]" self-identifier combined with either an age declaration or a
// location origin. We also catch the greeting "Hey/Hi guys" on its own as a
// strong signal.
const INTRO_GREETING_RE =
  /^\s*(?:hi|hey|hello),?\s+(?:guys|everyone|islanders)[\s,!.]/i;
const INTRO_SELF_RE = /\bI['’]?m\s+[A-Z][a-z]+/;
const INTRO_AGE_RE = /\b\d{1,2}[ -]?(?:year[s]?[ -]?old|yo)\b/i;
const INTRO_ORIGIN_RE = /\bfrom\s+[A-Z][a-zA-Z]+/;

export function isIntroductionLine(text: string): boolean {
  if (!text) return false;
  if (INTRO_GREETING_RE.test(text)) return true;
  if (
    INTRO_SELF_RE.test(text) &&
    (INTRO_AGE_RE.test(text) || INTRO_ORIGIN_RE.test(text))
  ) {
    return true;
  }
  return false;
}

// "Loud" lines earn special visual treatment — screen shake + red-glow bubble.
// We intentionally gate this tightly so shake is reserved for the peak beat of
// a scene (the prompt asks for 1-2 loud lines, not every angry line).
//
// A line is loud when ANY of these is true:
//   - stacked exclamation / interrobang ("!!", "!?!", "?!?") — the LLM is
//     visibly yelling on purpose,
//   - ≥25% of its letters are uppercase (Unicode-aware, so ÉCOUTE-MOI /
//     ŁUKASZ register as CAPS just like ENGLISH),
//   - emotion is angry/shocked AND the line has at least one exclamation —
//     emotion alone is too permissive; the LLM tags plenty of mild complaints
//     as "angry" without actually yelling.
export function isLoudLine(line: DialogueLine): boolean {
  const text = line.text;
  if (!text) return false;

  if (/[!?]{2,}/.test(text)) return true;

  // Unicode-aware CAPS ratio: count all letters, count uppercase ones.
  const letters = text.match(/\p{L}/gu);
  if (letters && letters.length >= 6) {
    const uppers = text.match(/\p{Lu}/gu)?.length ?? 0;
    if (uppers / letters.length >= 0.25) return true;
  }

  if (
    (line.emotion === "angry" || line.emotion === "shocked") &&
    /!/.test(text)
  ) {
    return true;
  }

  return false;
}
