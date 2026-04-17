import type {
  LlmSceneResponse,
  LlmBatchSceneResponse,
  PlannedBeat,
} from "@villa-ai/shared";
import { generateSceneFromGemini, generateBatchFromGemini } from "./gemini.js";
import { generateSceneFromOllama, generateBatchFromOllama } from "./ollama.js";

export type LlmProvider = "gemini" | "ollama";

export function getProvider(): LlmProvider {
  const explicit = process.env.LLM_PROVIDER;
  if (explicit === "ollama" || explicit === "gemini") return explicit;
  return process.env.NODE_ENV !== "production" ? "ollama" : "gemini";
}

export async function generateScene(
  prompt: string,
  validAgentIds: string[],
  requiredSpeakerIds?: string[],
  plannedBeats?: PlannedBeat[],
): Promise<LlmSceneResponse> {
  const provider = getProvider();
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

export async function generateBatchScene(
  prompt: string,
  validAgentIds: string[],
  requiredSpeakerIds?: string[],
): Promise<LlmBatchSceneResponse> {
  const provider = getProvider();
  if (provider === "ollama") {
    return generateBatchFromOllama(prompt, validAgentIds, requiredSpeakerIds);
  }
  return generateBatchFromGemini(prompt, validAgentIds, requiredSpeakerIds);
}
