import type { Relationship, EmotionState, Agent } from '@/types'

// Contestants have NEVER met each other at the start of a season. Trust and
// attraction are near zero — they will build (or not) through actual scene
// interactions. A small random seed keeps first impressions slightly varied.
// Now takes `cast` as a parameter so different season cast selections work.
export function buildSeedRelationships(cast: Agent[]): Relationship[] {
  const rels: Relationship[] = []
  for (const a of cast) {
    for (const b of cast) {
      if (a.id === b.id) continue
      rels.push({
        fromId: a.id,
        toId: b.id,
        trust: Math.floor(Math.random() * 6),
        attraction: Math.floor(Math.random() * 10),
        jealousy: 0,
        compatibility: 30 + Math.floor(Math.random() * 20),
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
