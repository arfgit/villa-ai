import type {
  LlmSceneResponse,
  LlmBatchSceneResponse,
  PlannedBeat,
} from "@villa-ai/shared";
import {
  generateSceneFromAnthropic,
  generateBatchFromAnthropic,
  isFallbackTriggeringError,
} from "./anthropic.js";
import { generateSceneFromGemini, generateBatchFromGemini } from "./gemini.js";
import { generateSceneFromOllama, generateBatchFromOllama } from "./ollama.js";

export type LlmProvider = "anthropic" | "gemini" | "ollama";

// Runtime override for the dev-only provider toggle. When set via
// setRuntimeProvider() (see routes/dev.ts), getProvider() returns this
// instead of reading the env. Null → fall through to env / default.
// Resets to null on every server restart by design — the UI toggle is
// for quick in-session A/B testing, not persistent config. Persistent
// changes belong in .env.
let runtimeProviderOverride: LlmProvider | null = null;

export function setRuntimeProvider(provider: LlmProvider | null): void {
  runtimeProviderOverride = provider;
}

export function getRuntimeProvider(): LlmProvider | null {
  return runtimeProviderOverride;
}

export function getProvider(): LlmProvider {
  if (runtimeProviderOverride) return runtimeProviderOverride;
  const explicit = process.env.LLM_PROVIDER;
  if (
    explicit === "anthropic" ||
    explicit === "ollama" ||
    explicit === "gemini"
  )
    return explicit;
  // Prod default priority: anthropic ONLY if the key is actually bound.
  // Firebase Functions deploys that haven't been updated to also bind
  // ANTHROPIC_API_KEY would otherwise 502 on every scene gen, because
  // the Anthropic client throws on missing-key BEFORE the Gemini fallback
  // gets a chance to run (missing-key isn't a fallback-triggering error
  // class — it's a config bug). Fall through to gemini if only that key
  // is bound. Dev default stays ollama (free, local).
  if (process.env.NODE_ENV === "production") {
    if (process.env.ANTHROPIC_API_KEY) return "anthropic";
    if (process.env.GEMINI_API_KEY) return "gemini";
    // Neither configured — still return "anthropic" so the error message
    // the client sees ("ANTHROPIC_API_KEY not set") is actionable.
    return "anthropic";
  }
  return "ollama";
}

// Anthropic-as-primary gets a Gemini safety net: if Haiku 4.5 is out of
// credits, rate-limited, or overloaded, we transparently retry on Gemini
// so the app keeps working. Ollama and Gemini primaries run solo — no
// fallback chain — because their failure modes (local Ollama down,
// Gemini free-tier exhausted) aren't improved by reaching for the other.
function getProviderChain(): LlmProvider[] {
  const primary = getProvider();
  if (primary === "anthropic" && process.env.GEMINI_API_KEY) {
    return ["anthropic", "gemini"];
  }
  return [primary];
}

async function runScene(
  provider: LlmProvider,
  prompt: string,
  validAgentIds: string[],
  requiredSpeakerIds?: string[],
  plannedBeats?: PlannedBeat[],
): Promise<LlmSceneResponse> {
  if (provider === "anthropic") {
    return generateSceneFromAnthropic(
      prompt,
      validAgentIds,
      requiredSpeakerIds,
      plannedBeats,
    );
  }
  if (provider === "ollama") {
    return generateSceneFromOllama(
      prompt,
      validAgentIds,
      requiredSpeakerIds,
      plannedBeats,
    );
  }
  return generateSceneFromGemini(
    prompt,
    validAgentIds,
    requiredSpeakerIds,
    plannedBeats,
  );
}

async function runBatch(
  provider: LlmProvider,
  prompt: string,
  validAgentIds: string[],
  requiredSpeakerIds?: string[],
): Promise<LlmBatchSceneResponse> {
  if (provider === "anthropic") {
    return generateBatchFromAnthropic(
      prompt,
      validAgentIds,
      requiredSpeakerIds,
    );
  }
  if (provider === "ollama") {
    return generateBatchFromOllama(prompt, validAgentIds, requiredSpeakerIds);
  }
  return generateBatchFromGemini(prompt, validAgentIds, requiredSpeakerIds);
}

// Generic fallback runner. Iterates the provider chain, transparently
// retrying on quota/credit/overload errors from Anthropic-as-primary
// (see isFallbackTriggeringError for the exact set). Parse errors and
// schema validation failures deliberately do NOT trip the fallback —
// those are bugs in the prompt/response, not provider problems, so
// retrying on Gemini would just burn budget on the same bad output.
// Extracted from the scene and batch paths to keep the retry/fallback
// logic in one place — the two public entry points only differ in
// their run function and the default error message.
async function runWithFallback<T>(
  run: (provider: LlmProvider) => Promise<T>,
  fallbackFailedError: string,
  label: string,
): Promise<T> {
  const chain = getProviderChain();
  let lastError: unknown = null;

  for (let i = 0; i < chain.length; i++) {
    const provider = chain[i]!;
    const isLast = i === chain.length - 1;
    try {
      return await run(provider);
    } catch (err) {
      lastError = err;
      if (
        !isLast &&
        provider === "anthropic" &&
        isFallbackTriggeringError(err)
      ) {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn(
          `[llm] anthropic ${label} failed (${msg}) — falling back to ${chain[i + 1]}`,
        );
        continue;
      }
      throw err;
    }
  }

  throw lastError instanceof Error ? lastError : new Error(fallbackFailedError);
}

export async function generateScene(
  prompt: string,
  validAgentIds: string[],
  requiredSpeakerIds?: string[],
  plannedBeats?: PlannedBeat[],
): Promise<LlmSceneResponse> {
  return runWithFallback(
    (provider) =>
      runScene(
        provider,
        prompt,
        validAgentIds,
        requiredSpeakerIds,
        plannedBeats,
      ),
    "LLM generation failed",
    "scene",
  );
}

export async function generateBatchScene(
  prompt: string,
  validAgentIds: string[],
  requiredSpeakerIds?: string[],
): Promise<LlmBatchSceneResponse> {
  return runWithFallback(
    (provider) => runBatch(provider, prompt, validAgentIds, requiredSpeakerIds),
    "LLM batch generation failed",
    "batch",
  );
}
