import { GoogleGenerativeAI } from '@google/generative-ai'
import { parseAndValidate } from './schema'
import type { LlmSceneResponse } from '@/types'

let genAI: GoogleGenerativeAI | null = null

function getGenAI(): GoogleGenerativeAI {
  if (!genAI) {
    const key = import.meta.env.VITE_GEMINI_API_KEY
    if (!key) throw new Error('VITE_GEMINI_API_KEY not set in .env')
    genAI = new GoogleGenerativeAI(key)
  }
  return genAI
}

const MODELS = ['gemini-2.0-flash-lite', 'gemini-2.5-flash-lite', 'gemini-2.5-flash']

export async function generateSceneFromGemini(prompt: string, validAgentIds: string[]): Promise<LlmSceneResponse> {
  const ai = getGenAI()

  let lastError: unknown = null

  for (const modelName of MODELS) {
    try {
      const model = ai.getGenerativeModel({
        model: modelName,
        generationConfig: {
          responseMimeType: 'application/json',
          temperature: 0.95,
          maxOutputTokens: 2048,
        },
      })

      const result = await model.generateContent(prompt)
      const text = result.response.text()
      try {
        return parseAndValidate(text, validAgentIds)
      } catch (parseErr) {
        const detail = parseErr instanceof Error ? parseErr.message : ''
        throw new Error(`The AI returned an invalid scene. ${detail}`.trim())
      }
    } catch (err) {
      lastError = err
      const msg = err instanceof Error ? err.message : ''
      const isTransient = msg.includes('429') || msg.includes('404') || msg.includes('500') || msg.includes('503') || msg.includes('overloaded')
      const isLast = modelName === MODELS[MODELS.length - 1]

      if (isTransient && !isLast) continue
      if (!isTransient) {
        throw err
      }

      if (msg.includes('429')) {
        throw new Error('Rate limit reached. The free tier resets daily. Wait a moment and try again.')
      }
      throw err
    }
  }

  throw lastError instanceof Error ? lastError : new Error('All models failed')
}
