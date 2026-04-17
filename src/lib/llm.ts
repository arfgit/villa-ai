import type { LlmSceneResponse, LlmBatchSceneResponse, PlannedBeat } from '@/types'
import { generateSceneFromGemini, generateBatchFromGemini } from './gemini'
import { generateSceneFromOllama, generateBatchFromOllama } from './ollama'

export type LlmProvider = 'gemini' | 'ollama'

export function getProvider(): LlmProvider {
  const explicit = import.meta.env.VITE_LLM_PROVIDER as string | undefined
  if (explicit === 'ollama' || explicit === 'gemini') return explicit
  return import.meta.env.DEV ? 'ollama' : 'gemini'
}

export async function generateScene(
  prompt: string,
  validAgentIds: string[],
  requiredSpeakerIds?: string[],
  plannedBeats?: PlannedBeat[]
): Promise<LlmSceneResponse> {
  const provider = getProvider()
  if (provider === 'ollama') return generateSceneFromOllama(prompt, validAgentIds, requiredSpeakerIds, plannedBeats)
  return generateSceneFromGemini(prompt, validAgentIds, requiredSpeakerIds, plannedBeats)
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
