import type { LlmSceneResponse, Emotion, SystemEventType } from '@/types'

const VALID_EMOTIONS: Emotion[] = ['happy', 'flirty', 'jealous', 'angry', 'sad', 'smug', 'anxious', 'bored', 'shocked', 'neutral']
const VALID_EVENT_TYPES: SystemEventType[] = ['trust_change', 'attraction_change', 'jealousy_spike', 'couple_formed', 'couple_broken']

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n))
}

function asEmotion(v: unknown): Emotion {
  if (typeof v === 'string' && (VALID_EMOTIONS as string[]).includes(v)) return v as Emotion
  return 'neutral'
}

function asEventType(v: unknown): SystemEventType {
  if (typeof v === 'string' && (VALID_EVENT_TYPES as string[]).includes(v)) return v as SystemEventType
  return 'trust_change'
}

export function parseAndValidate(raw: string, validAgentIds: string[]): LlmSceneResponse {
  let cleaned = raw.trim()

  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '')
  }

  const firstBrace = cleaned.indexOf('{')
  const lastBrace = cleaned.lastIndexOf('}')
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    cleaned = cleaned.slice(firstBrace, lastBrace + 1)
  }

  const data = JSON.parse(cleaned) as Record<string, unknown>

  const dialogue = Array.isArray(data.dialogue) ? data.dialogue : []
  const systemEvents = Array.isArray(data.systemEvents) ? data.systemEvents : []
  const emotionUpdates = Array.isArray(data.emotionUpdates) ? data.emotionUpdates : []
  const outcome = typeof data.outcome === 'string' ? data.outcome : 'The scene fades to commercial.'

  const validIds = new Set(validAgentIds)

  const validDialogue = (dialogue as Array<Record<string, unknown>>)
    .filter((d) => typeof d.agentId === 'string' && validIds.has(d.agentId) && typeof d.text === 'string' && d.text.length > 0)
    .map((d) => ({
      agentId: d.agentId as string,
      text: (d.text as string).slice(0, 280),
      emotion: asEmotion(d.emotion),
      action: typeof d.action === 'string' ? (d.action as string).slice(0, 80) : undefined,
      targetAgentId: typeof d.targetAgentId === 'string' && validIds.has(d.targetAgentId) ? d.targetAgentId as string : undefined,
    }))
    .slice(0, 12)

  const validEvents = (systemEvents as Array<Record<string, unknown>>)
    .filter((e) => typeof e.label === 'string')
    .map((e) => ({
      type: asEventType(e.type),
      fromId: typeof e.fromId === 'string' && validIds.has(e.fromId) ? e.fromId as string : undefined,
      toId: typeof e.toId === 'string' && validIds.has(e.toId) ? e.toId as string : undefined,
      delta: typeof e.delta === 'number' ? clamp(e.delta, -15, 15) : undefined,
      label: (e.label as string).slice(0, 80),
    }))
    .slice(0, 8)

  const validEmotions = (emotionUpdates as Array<Record<string, unknown>>)
    .filter((u) => typeof u.agentId === 'string' && validIds.has(u.agentId))
    .map((u) => ({
      agentId: u.agentId as string,
      primary: asEmotion(u.primary),
      intensity: typeof u.intensity === 'number' ? clamp(u.intensity, 0, 100) : 50,
    }))

  if (validDialogue.length === 0) {
    throw new Error('Scene response had no valid dialogue lines')
  }

  return {
    dialogue: validDialogue,
    systemEvents: validEvents,
    emotionUpdates: validEmotions,
    outcome,
  }
}
