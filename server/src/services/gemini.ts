import { GoogleGenerativeAI } from '@google/generative-ai'
import { parseAndValidate, parseAndValidateBatch } from '../lib/schema.js'
import type { LlmSceneResponse, LlmBatchSceneResponse, PlannedBeat } from '@villa-ai/shared'

let genAI: GoogleGenerativeAI | null = null

function getGenAI(): GoogleGenerativeAI {
  if (!genAI) {
    const key = process.env.GEMINI_API_KEY
    if (!key) throw new Error('GEMINI_API_KEY not set in .env')
    genAI = new GoogleGenerativeAI(key)
  }
  return genAI
}

const MODELS = ['gemini-2.0-flash-lite', 'gemini-2.5-flash-lite', 'gemini-2.5-flash']

function describeRateLimit(rawMessage: string): string {
  const lower = rawMessage.toLowerCase()

  if (lower.includes('prepayment') || lower.includes('credits are depleted')) {
    return 'Your Gemini prepayment credits are depleted. Top up at https://ai.studio/projects or switch the billing account to invoiced billing.'
  }

  const isFreeTier = lower.includes('freetier') || lower.includes('free_tier') || lower.includes('free tier')
  const quotaMatch = rawMessage.match(/quota_id["\s:]+([A-Za-z0-9_-]+)/i)
  const quotaId = quotaMatch ? quotaMatch[1] : null

  if (isFreeTier) {
    let msg = 'Hit the FREE TIER quota — your API key is on a Cloud project that does not have billing linked.'
    if (quotaId) msg += ` (quota: ${quotaId})`
    msg += ' Link billing to that project, or generate a new key under your billed project.'
    return msg
  }

  if (quotaId) return `Rate limit reached (quota: ${quotaId}). Wait a moment and try again.`
  return 'Rate limit reached. Wait a moment and try again.'
}

export async function generateSceneFromGemini(prompt: string, validAgentIds: string[], requiredSpeakerIds?: string[], plannedBeats?: PlannedBeat[]): Promise<LlmSceneResponse> {
  const ai = getGenAI()

  let lastError: unknown = null

  for (const modelName of MODELS) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const model = ai.getGenerativeModel({
          model: modelName,
          generationConfig: {
            responseMimeType: 'application/json',
            temperature: attempt === 0 ? 0.95 : 0.7,
            maxOutputTokens: 4096,
          },
        })

        const result = await model.generateContent(prompt)
        const text = result.response.text()
        return parseAndValidate(text, validAgentIds, requiredSpeakerIds, undefined, plannedBeats)
      } catch (err) {
        lastError = err
        const msg = err instanceof Error ? err.message : ''
        if (msg.includes('429') || msg.toLowerCase().includes('resource_exhausted')) {
          // 429 is per-model — try the next model rather than bailing out
          break
        }
        const isParseErr = msg.includes('JSON') || msg.includes('repair') || msg.includes('dialogue')
        if (attempt === 0 && isParseErr) continue
        break
      }
    }
  }

  const finalMsg = lastError instanceof Error ? lastError.message : ''
  if (finalMsg.includes('429') || finalMsg.toLowerCase().includes('resource_exhausted')) {
    console.error('[gemini] full rate-limit error:', lastError)
    throw new Error(describeRateLimit(finalMsg))
  }

  throw lastError instanceof Error ? lastError : new Error('All models failed')
}

export async function generateBatchFromGemini(
  prompt: string,
  validAgentIds: string[],
  requiredSpeakerIds?: string[]
): Promise<LlmBatchSceneResponse> {
  const ai = getGenAI()
  let lastError: unknown = null

  for (const modelName of MODELS) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const model = ai.getGenerativeModel({
          model: modelName,
          generationConfig: {
            responseMimeType: 'application/json',
            temperature: attempt === 0 ? 0.95 : 0.7,
            maxOutputTokens: 8192,  // larger for batch
          },
        })
        const result = await model.generateContent(prompt)
        const text = result.response.text()
        return parseAndValidateBatch(text, validAgentIds, requiredSpeakerIds)
      } catch (err) {
        lastError = err
        const msg = err instanceof Error ? err.message : ''
        if (msg.includes('429') || msg.toLowerCase().includes('resource_exhausted')) break
        const isParseErr = msg.includes('JSON') || msg.includes('repair') || msg.includes('dialogue')
        if (attempt === 0 && isParseErr) continue
        break
      }
    }
  }

  const finalMsg = lastError instanceof Error ? lastError.message : ''
  if (finalMsg.includes('429') || finalMsg.toLowerCase().includes('resource_exhausted')) {
    throw new Error(describeRateLimit(finalMsg))
  }
  throw lastError instanceof Error ? lastError : new Error('All models failed')
}
