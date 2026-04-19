import type { DialogueLine } from "@villa-ai/shared";

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

export function decodeUnicodeEscapes(text: string): string {
  if (!text || !text.includes("\\u")) return text;
  return text.replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) =>
    String.fromCharCode(parseInt(hex, 16)),
  );
}

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

export function isLoudLine(line: DialogueLine): boolean {
  const text = line.text;
  if (!text) return false;

  if (/[!?]{2,}/.test(text)) return true;

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
