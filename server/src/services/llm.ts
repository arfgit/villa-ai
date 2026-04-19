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

  if (process.env.NODE_ENV === "production") {
    if (process.env.ANTHROPIC_API_KEY) return "anthropic";
    if (process.env.GEMINI_API_KEY) return "gemini";

    return "anthropic";
  }
  return "ollama";
}

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
