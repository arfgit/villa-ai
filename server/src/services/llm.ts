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
  // Default to gemini — Cloud Functions sets NODE_ENV=production, and even
  // in dev we'd rather fail loudly on a missing GEMINI_API_KEY than hang
  // trying to reach an Ollama instance that might not be running. Set
  // LLM_PROVIDER=ollama explicitly to opt in to the local path.
  return "gemini";
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
