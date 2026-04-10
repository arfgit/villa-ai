import type { Relationship, EmotionState } from '@/types'
import { CAST } from './cast'

export function buildSeedRelationships(): Relationship[] {
  const rels: Relationship[] = []
  for (const a of CAST) {
    for (const b of CAST) {
      if (a.id === b.id) continue
      rels.push({
        fromId: a.id,
        toId: b.id,
        trust: 50 + Math.floor(Math.random() * 20) - 10,
        attraction: 30 + Math.floor(Math.random() * 40),
        jealousy: 5 + Math.floor(Math.random() * 15),
      })
    }
  }
  return rels
}

export function buildSeedEmotions(): EmotionState[] {
  return CAST.map((a) => ({
    agentId: a.id,
    primary: 'neutral' as const,
    intensity: 30,
  }))
}
