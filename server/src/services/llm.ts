import type { LlmSceneResponse, LlmBatchSceneResponse } from '@villa-ai/shared'
import { generateSceneFromGemini, generateBatchFromGemini } from './gemini'
import { generateSceneFromOllama, generateBatchFromOllama } from './ollama'

export type LlmProvider = 'gemini' | 'ollama'

export function getProvider(): LlmProvider {
  const explicit = process.env.LLM_PROVIDER
  if (explicit === 'ollama' || explicit === 'gemini') return explicit
  return process.env.NODE_ENV !== "production" ? 'ollama' : 'gemini'
}

export async function generateScene(
  prompt: string,
  validAgentIds: string[],
  requiredSpeakerIds?: string[]
): Promise<LlmSceneResponse> {
  const provider = getProvider()
  if (provider === 'ollama') return generateSceneFromOllama(prompt, validAgentIds, requiredSpeakerIds)
  return generateSceneFromGemini(prompt, validAgentIds, requiredSpeakerIds)
}

export async function generateBatchScene(
  prompt: string,
  validAgentIds: string[],
  requiredSpeakerIds?: string[]
): Promise<LlmBatchSceneResponse> {
  const provider = getProvider()
  if (provider === 'ollama') return generateBatchFromOllama(prompt, validAgentIds, requiredSpeakerIds)
  return generateBatchFromGemini(prompt, validAgentIds, requiredSpeakerIds)
}
