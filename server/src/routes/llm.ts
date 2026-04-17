import { Router } from 'express'
import { generateSceneFromGemini, generateBatchFromGemini } from '../services/gemini.js'
import type { PlannedBeat, TurnIntent } from '@villa-ai/shared'

export const llmRouter = Router()

const VALID_INTENTS: TurnIntent[] = [
  'flirt', 'deflect', 'reassure', 'challenge', 'test', 'manipulate',
  'escalate', 'soften', 'confess', 'accuse', 'reveal', 'deny',
  'joke', 'retreat', 'declare',
]

// Shape-validate plannedBeats at the trust boundary. Coercion inside schema.ts
// assumes beats[i].intent is a valid TurnIntent — so reject any malformed beat
// up front rather than letting undefined slip through into the fallback chain.
function validatePlannedBeats(raw: unknown): PlannedBeat[] | undefined {
  if (!Array.isArray(raw)) return undefined
  if (raw.length === 0 || raw.length > 16) return undefined
  const out: PlannedBeat[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') return undefined
    const b = item as Record<string, unknown>
    if (typeof b.speakerId !== 'string' || typeof b.emotionalTone !== 'string') return undefined
    if (typeof b.intent !== 'string' || !(VALID_INTENTS as string[]).includes(b.intent)) return undefined
    out.push({
      speakerId: b.speakerId.slice(0, 64),
      intent: b.intent as TurnIntent,
      emotionalTone: b.emotionalTone.slice(0, 200),
      target: typeof b.target === 'string' ? b.target.slice(0, 64) : undefined,
      loud: typeof b.loud === 'boolean' ? b.loud : undefined,
    })
  }
  return out
}

// POST /api/llm/generate — proxy a single scene generation through server-side Gemini
llmRouter.post('/generate', async (req, res) => {
  try {
    const { prompt, validAgentIds, requiredSpeakerIds, plannedBeats } = req.body
    if (typeof prompt !== 'string' || !Array.isArray(validAgentIds) || prompt.length > 50000 || validAgentIds.length > 50) {
      res.status(400).json({ error: 'Invalid prompt or validAgentIds' })
      return
    }
    const beats = validatePlannedBeats(plannedBeats)
    const result = await generateSceneFromGemini(prompt, validAgentIds, requiredSpeakerIds, beats)
    res.json(result)
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'LLM generation failed'
    console.error('[llm] generate error:', msg)
    res.status(502).json({ error: msg })
  }
})

// POST /api/llm/batch — proxy batch scene generation
llmRouter.post('/batch', async (req, res) => {
  try {
    const { prompt, validAgentIds, requiredSpeakerIds } = req.body
    if (typeof prompt !== 'string' || !Array.isArray(validAgentIds) || prompt.length > 50000 || validAgentIds.length > 50) {
      res.status(400).json({ error: 'Invalid prompt or validAgentIds' })
      return
    }
    const result = await generateBatchFromGemini(prompt, validAgentIds, requiredSpeakerIds)
    res.json(result)
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'LLM batch generation failed'
    console.error('[llm] batch error:', msg)
    res.status(502).json({ error: msg })
  }
})
