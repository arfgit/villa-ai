import type { Scene } from '@villa-ai/shared'

const DECAY = 0.9

/**
 * Update per-agent drama scores based on a completed scene.
 * Higher drama = more screen time and longer arcs before recoupling.
 */
export function updateDramaScores(
  scene: Scene,
  prevScores: Record<string, number>
): Record<string, number> {
  // Start with decayed previous scores
  const scores: Record<string, number> = {}
  for (const [id, score] of Object.entries(prevScores)) {
    scores[id] = score * DECAY
  }

  // +3 for couple break involvement
  for (const event of scene.systemEvents) {
    if (event.type === 'couple_broken') {
      if (event.fromId) scores[event.fromId] = (scores[event.fromId] ?? 0) + 3
      if (event.toId) scores[event.toId] = (scores[event.toId] ?? 0) + 3
    }
    // +2 for jealousy spike involvement
    if (event.type === 'jealousy_spike') {
      if (event.fromId) scores[event.fromId] = (scores[event.fromId] ?? 0) + 2
      if (event.toId) scores[event.toId] = (scores[event.toId] ?? 0) + 2
    }
  }

  // +2 for angry/jealous emotion in dialogue, +1 for confrontational lines
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

/**
 * Returns agent IDs sorted by drama score descending (most dramatic first).
 * Used for participant weighting in interviews, dates, and filler scenes.
 */
export function rankByDrama(
  scores: Record<string, number>,
  agentIds: string[]
): string[] {
  return [...agentIds].sort(
    (a, b) => (scores[b] ?? 0) - (scores[a] ?? 0)
  )
}
