import Anthropic from "@anthropic-ai/sdk";
import { parseAndValidate, parseAndValidateBatch } from "../lib/schema.js";
import type {
  LlmSceneResponse,
  LlmBatchSceneResponse,
  PlannedBeat,
} from "@villa-ai/shared";

// Haiku 4.5 is the speed/price sweet spot for scene generation — faster
// than Sonnet, dramatically better at instruction-following and voice
// distinctiveness than local 3B models. See also MODEL_SONNET below;
// swap in via ANTHROPIC_MODEL env for higher-quality (costlier) runs.
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

// Anthropic returns its error class with .status + .error.type. We also
// defensively pattern-match the message because the SDK surface evolves.
// Fallback conditions: no credit, rate-limited, or provider is overloaded —
// anything that indicates "we can't serve you, try the next provider".
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

// Two extraction strategies are used against the Anthropic response:
// (1) most messages return a single text block, so grab its `.text`;
// (2) rarely the model emits JSON inside ```json fences — strip those
//     before handing the payload to the shared schema parser.
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
        // 6144 is comfortable for a long coupling scene. At 4096 we
        // occasionally hit max_tokens mid-dialogue — the JSON response
        // truncates, the repair logic salvages what it can, and we get
        // fragment strings like "tch, you think y" from a cut-off word.
        // Bumping up here is cheap: Haiku output is ~$5/M tokens, so
        // +2k slack is fractions of a cent per scene.
        max_tokens: 6144,
        temperature: attempt === 0 ? 0.95 : 0.7,
        // Prefilling the assistant turn with `{` nudges Haiku to emit JSON
        // directly — we prepend it back before parsing. Without the prefill
        // Haiku occasionally leads with a short preamble ("Here's the scene:")
        // which trips the parser's strict JSON.parse on the first try.
        messages: [
          { role: "user", content: prompt },
          { role: "assistant", content: "{" },
        ],
        system:
          "Respond ONLY with valid JSON matching the schema described in the user message. No preamble, no trailing commentary, no code fences.",
      });

      // max_tokens hit — the JSON is definitely truncated. Log so we
      // notice if it starts happening regularly (means the prompt is
      // asking for too much), but still attempt to parse: the repair
      // logic in schema.ts can usually salvage a usable scene from a
      // cut-off response, and the sanitizer now drops fragment strings.
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
        // Batch responses are multi-scene; 12288 gives headroom for the
        // typical 3-scene batch (~4k tokens each). Haiku max output is
        // 8192 for older models but 64k+ for 4.x — this is well within.
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
