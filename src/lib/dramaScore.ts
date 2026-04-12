import type { Scene } from '@/types'

const DECAY = 0.9

export function updateDramaScores(
  scene: Scene,
  prevScores: Record<string, number>
): Record<string, number> {
  const scores: Record<string, number> = {}
  for (const [id, score] of Object.entries(prevScores)) {
    scores[id] = score * DECAY
  }

  for (const event of scene.systemEvents) {
    if (event.type === 'couple_broken') {
      if (event.fromId) scores[event.fromId] = (scores[event.fromId] ?? 0) + 3
      if (event.toId) scores[event.toId] = (scores[event.toId] ?? 0) + 3
    }
    if (event.type === 'jealousy_spike') {
      if (event.fromId) scores[event.fromId] = (scores[event.fromId] ?? 0) + 2
      if (event.toId) scores[event.toId] = (scores[event.toId] ?? 0) + 2
    }
  }

  for (const line of scene.dialogue) {
    if (line.emotion === 'angry' || line.emotion === 'jealous') {
      scores[line.agentId] = (scores[line.agentId] ?? 0) + 2
    }
    if (line.emotion === 'angry' && line.targetAgentId) {
      scores[line.agentId] = (scores[line.agentId] ?? 0) + 1
    }
  }

  return scores
}

export function averageDramaScore(scores: Record<string, number>): number {
  const values = Object.values(scores)
  if (values.length === 0) return 0
  return values.reduce((a, b) => a + b, 0) / values.length
}

export function rankByDrama(
  scores: Record<string, number>,
  agentIds: string[]
): string[] {
  return [...agentIds].sort(
    (a, b) => (scores[b] ?? 0) - (scores[a] ?? 0)
  )
}
