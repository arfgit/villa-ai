import type { LlmSceneResponse, LlmBatchSceneResponse, PlannedBeat } from '@/types'

export async function generateSceneFromGemini(
  prompt: string,
  validAgentIds: string[],
  requiredSpeakerIds?: string[],
  plannedBeats?: PlannedBeat[]
): Promise<LlmSceneResponse> {
  const res = await fetch('/api/llm/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt, validAgentIds, requiredSpeakerIds, plannedBeats }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }))
    throw new Error((err as { error?: string }).error ?? `LLM server error ${res.status}`)
  }
  return res.json() as Promise<LlmSceneResponse>
}

export async function generateBatchFromGemini(
  prompt: string,
  validAgentIds: string[],
  requiredSpeakerIds?: string[]
): Promise<LlmBatchSceneResponse> {
  const res = await fetch('/api/llm/batch', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt, validAgentIds, requiredSpeakerIds }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }))
    throw new Error((err as { error?: string }).error ?? `LLM server error ${res.status}`)
  }
  return res.json() as Promise<LlmBatchSceneResponse>
}
