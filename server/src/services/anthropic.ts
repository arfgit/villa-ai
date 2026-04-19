import Anthropic from "@anthropic-ai/sdk";
import { parseAndValidate, parseAndValidateBatch } from "../lib/schema.js";
import type {
  LlmSceneResponse,
  LlmBatchSceneResponse,
  PlannedBeat,
} from "@villa-ai/shared";

const MODEL_HAIKU = "claude-haiku-4-5";
const MODEL_SONNET = "claude-sonnet-4-6";

let client: Anthropic | null = null;

function getClient(): Anthropic {
  if (!client) {
    const key = process.env.ANTHROPIC_API_KEY;
    if (!key) throw new Error("ANTHROPIC_API_KEY not set in .env");
    client = new Anthropic({ apiKey: key });
  }
  return client;
}

function getModel(): string {
  return process.env.ANTHROPIC_MODEL ?? MODEL_HAIKU;
}

export function isFallbackTriggeringError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const anthErr = err as Error & {
    status?: number;
    error?: { type?: string; message?: string };
  };
  const status = anthErr.status;
  const type = anthErr.error?.type;
  const msg = (anthErr.error?.message ?? err.message ?? "").toLowerCase();

  if (status === 429) return true;
  if (status === 529) return true;
  if (type === "rate_limit_error") return true;
  if (type === "overloaded_error") return true;
  if (msg.includes("credit balance is too low")) return true;
  if (msg.includes("insufficient credits")) return true;
  if (msg.includes("quota")) return true;
  return false;
}

function extractText(message: Anthropic.Messages.Message): string {
  const block = message.content.find((b) => b.type === "text");
  if (!block || block.type !== "text") {
    throw new Error("Anthropic response missing text block");
  }
  let text = block.text.trim();
  if (text.startsWith("```")) {
    text = text
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/```\s*$/, "")
      .trim();
  }
  return text;
}

export async function generateSceneFromAnthropic(
  prompt: string,
  validAgentIds: string[],
  requiredSpeakerIds?: string[],
  plannedBeats?: PlannedBeat[],
): Promise<LlmSceneResponse> {
  const anth = getClient();
  const model = getModel();

  let lastError: unknown = null;

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const message = await anth.messages.create({
        model,

        max_tokens: 6144,
        temperature: attempt === 0 ? 0.95 : 0.7,

        messages: [
          { role: "user", content: prompt },
          { role: "assistant", content: "{" },
        ],
        system:
          "Respond ONLY with valid JSON matching the schema described in the user message. No preamble, no trailing commentary, no code fences.",
      });

      if (message.stop_reason === "max_tokens") {
        console.warn(
          `[anthropic] response hit max_tokens (${message.usage.output_tokens} tokens) — JSON may be truncated`,
        );
      }

      const text = "{" + extractText(message);
      return parseAndValidate(
        text,
        validAgentIds,
        requiredSpeakerIds,
        undefined,
        plannedBeats,
      );
    } catch (err) {
      lastError = err;
      const msg = err instanceof Error ? err.message : "";
      const isParseErr =
        msg.includes("JSON") ||
        msg.includes("repair") ||
        msg.includes("dialogue");
      if (attempt === 0 && isParseErr) continue;
      throw err;
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("Anthropic generation failed");
}

export async function generateBatchFromAnthropic(
  prompt: string,
  validAgentIds: string[],
  requiredSpeakerIds?: string[],
): Promise<LlmBatchSceneResponse> {
  const anth = getClient();
  const model = getModel();

  let lastError: unknown = null;

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const message = await anth.messages.create({
        model,
        max_tokens: 12288,
        temperature: attempt === 0 ? 0.95 : 0.7,
        messages: [
          { role: "user", content: prompt },
          { role: "assistant", content: "{" },
        ],
        system:
          "Respond ONLY with valid JSON matching the schema described in the user message. No preamble, no trailing commentary, no code fences.",
      });
      if (message.stop_reason === "max_tokens") {
        console.warn(
          `[anthropic] batch response hit max_tokens (${message.usage.output_tokens} tokens) — JSON may be truncated`,
        );
      }
      const text = "{" + extractText(message);
      return parseAndValidateBatch(text, validAgentIds, requiredSpeakerIds);
    } catch (err) {
      lastError = err;
      const msg = err instanceof Error ? err.message : "";
      const isParseErr =
        msg.includes("JSON") ||
        msg.includes("repair") ||
        msg.includes("dialogue");
      if (attempt === 0 && isParseErr) continue;
      throw err;
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("Anthropic batch generation failed");
}

export { MODEL_HAIKU, MODEL_SONNET };
