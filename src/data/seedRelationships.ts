import type { Relationship, EmotionState, Agent } from '@/types'
import { baseCompatibility } from '@/lib/castGenerator'

export function buildSeedRelationships(cast: Agent[]): Relationship[] {
  const rels: Relationship[] = []
  for (const a of cast) {
    for (const b of cast) {
      if (a.id === b.id) continue
      const base = baseCompatibility(a.archetype, b.archetype)
      const jitter = Math.floor(Math.random() * 10) - 5
      rels.push({
        fromId: a.id,
        toId: b.id,
        trust: Math.floor(Math.random() * 6),
        attraction: Math.floor(Math.random() * 10),
        jealousy: 0,
        compatibility: Math.max(0, Math.min(100, base + jitter)),
      })
    }
  }
  return rels
}

export function buildSeedEmotions(cast: Agent[]): EmotionState[] {
  return cast.map((a) => ({
    agentId: a.id,
    primary: 'neutral' as const,
    intensity: 20,
  }))
}
