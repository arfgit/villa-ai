import type { Agent, Relationship, Couple } from '@/types'

export type EliminationType = 'recouple_dump' | 'public_vote' | 'islander_vote' | 'producer_intervention'

export interface EliminationResult {
  eliminatedIds: string[]
  type: EliminationType
  narrative: string
}

function popularity(agentId: string, activeIds: string[], relationships: Relationship[]): number {
  let total = 0
  let count = 0
  for (const r of relationships) {
    if (r.toId === agentId && activeIds.includes(r.fromId)) {
      total += (r.trust + r.attraction) / 2
      count++
    }
  }
  return count > 0 ? total / count : 0
}

function coupleStrength(couple: Couple, relationships: Relationship[]): number {
  const ab = relationships.find((r) => r.fromId === couple.a && r.toId === couple.b)
  const ba = relationships.find((r) => r.fromId === couple.b && r.toId === couple.a)
  return (ab?.attraction ?? 0) + (ba?.attraction ?? 0) + (ab?.compatibility ?? 0) + (ba?.compatibility ?? 0)
}

// Dumps the unpaired person with lowest total attraction+compatibility when cast is odd
export function recoupleElimination(
  active: Agent[],
  couples: Couple[],
  relationships: Relationship[]
): EliminationResult {
  if (active.length % 2 === 0) return { eliminatedIds: [], type: 'recouple_dump', narrative: '' }

  const pairedIds = new Set<string>()
  for (const c of couples) {
    pairedIds.add(c.a)
    pairedIds.add(c.b)
  }
  const unpaired = active.filter((a) => !pairedIds.has(a.id))
  if (unpaired.length === 0) return { eliminatedIds: [], type: 'recouple_dump', narrative: '' }

  let lowestId = unpaired[0]!.id
  let lowestName = unpaired[0]!.name
  let lowestScore = Infinity
  for (const agent of unpaired) {
    const score = relationships
      .filter((r) => r.fromId === agent.id || r.toId === agent.id)
      .reduce((sum, r) => sum + r.attraction + r.compatibility, 0)
    if (score < lowestScore) {
      lowestScore = score
      lowestId = agent.id
      lowestName = agent.name
    }
  }

  return {
    eliminatedIds: [lowestId],
    type: 'recouple_dump',
    narrative: `${lowestName} was left single after the recoupling and has been dumped from the villa.`,
  }
}

// Simulated public vote — lowest popularity in the weakest couple gets dumped
export function publicVoteElimination(
  active: Agent[],
  couples: Couple[],
  relationships: Relationship[],
  viewerSentiment?: Record<string, number>
): EliminationResult {
  const activeIds = active.map((a) => a.id)

  function blendedPop(agentId: string): number {
    const relPop = popularity(agentId, activeIds, relationships)
    const viewerPop = viewerSentiment?.[agentId] ?? 50
    return viewerSentiment ? relPop * 0.4 + viewerPop * 0.6 : relPop
  }

  if (couples.length > 0) {
    const ranked = [...couples].sort((a, b) => coupleStrength(a, relationships) - coupleStrength(b, relationships))
    const weakest = ranked[0]!
    const popA = blendedPop(weakest.a)
    const popB = blendedPop(weakest.b)
    const dumpedId = popA < popB ? weakest.a : weakest.b
    const dumpedName = active.find((a) => a.id === dumpedId)?.name ?? dumpedId

    return {
      eliminatedIds: [dumpedId],
      type: 'public_vote',
      narrative: `The public has spoken! ${dumpedName} received the fewest votes and has been dumped from the island.`,
    }
  }

  let lowestId = active[0]!.id
  let lowestPop = Infinity
  for (const agent of active) {
    const pop = blendedPop(agent.id)
    if (pop < lowestPop) {
      lowestPop = pop
      lowestId = agent.id
    }
  }
  const name = active.find((a) => a.id === lowestId)?.name ?? lowestId
  return {
    eliminatedIds: [lowestId],
    type: 'public_vote',
    narrative: `The public has spoken! ${name} received the fewest votes and has been dumped from the island.`,
  }
}

// Fellow islanders vote out the least compatible person
export function islanderVoteElimination(
  active: Agent[],
  couples: Couple[],
  relationships: Relationship[]
): EliminationResult {
  const votes = new Map<string, number>()
  for (const a of active) votes.set(a.id, 0)

  for (const voter of active) {
    const partner = couples.find((c) => c.a === voter.id || c.b === voter.id)
    const partnerId = partner ? (partner.a === voter.id ? partner.b : partner.a) : null

    let worstId = ''
    let worstScore = -Infinity
    for (const candidate of active) {
      if (candidate.id === voter.id || candidate.id === partnerId) continue
      const rel = relationships.find((r) => r.fromId === voter.id && r.toId === candidate.id)
      const score = (100 - (rel?.trust ?? 50)) + (rel?.jealousy ?? 0) - (rel?.compatibility ?? 40)
      if (score > worstScore) {
        worstScore = score
        worstId = candidate.id
      }
    }
    if (worstId) {
      votes.set(worstId, (votes.get(worstId) ?? 0) + 1)
    }
  }

  let maxVotes = 0
  let dumpedId = active[0]!.id
  for (const [id, count] of votes) {
    if (count > maxVotes || (count === maxVotes && (
      relationships.filter((r) => r.fromId === id).reduce((s, r) => s + r.compatibility, 0) <
      relationships.filter((r) => r.fromId === dumpedId).reduce((s, r) => s + r.compatibility, 0)
    ))) {
      maxVotes = count
      dumpedId = id
    }
  }

  const name = active.find((a) => a.id === dumpedId)?.name ?? dumpedId
  return {
    eliminatedIds: [dumpedId],
    type: 'islander_vote',
    narrative: `The islanders have voted. ${name} must leave the villa tonight.`,
  }
}

// Producer shakes things up when drama is low
export function producerIntervention(
  active: Agent[],
  dramaScores: Record<string, number>,
  relationships: Relationship[]
): EliminationResult {
  let lowestDrama = Infinity
  let dumpedId = active[0]!.id

  for (const agent of active) {
    const drama = dramaScores[agent.id] ?? 0
    // Also consider relationship variance — flat stats = boring
    const agentRels = relationships.filter((r) => r.fromId === agent.id)
    const variance = agentRels.length > 0
      ? agentRels.reduce((s, r) => s + Math.abs(r.attraction - 50) + Math.abs(r.trust - 50), 0) / agentRels.length
      : 0
    const score = drama + variance * 0.5
    if (score < lowestDrama) {
      lowestDrama = score
      dumpedId = agent.id
    }
  }

  const name = active.find((a) => a.id === dumpedId)?.name ?? dumpedId
  return {
    eliminatedIds: [dumpedId],
    type: 'producer_intervention',
    narrative: `The producers have decided to shake things up... ${name}, your time in the villa is over.`,
  }
}
