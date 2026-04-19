import type { Episode, Agent, SeasonExport, RLExport, Couple } from '@villa-ai/shared'

export function buildSeasonExport(episode: Episode, _cast: Agent[]): SeasonExport {
  const eliminationOrder: SeasonExport['season']['eliminationOrder'] = []
  const recoupleSceneIndices = episode.scenes
    .map((s, i) => s.type === 'recouple' ? i : -1)
    .filter((i) => i >= 0)
  for (const id of episode.eliminatedIds) {
    let elimScene = episode.scenes.length
    for (const ri of recoupleSceneIndices) {
      const laterScenes = episode.scenes.slice(ri + 1)
      const appearsLater = laterScenes.some((s) => s.participantIds.includes(id))
      if (!appearsLater) {
        elimScene = ri + 1
        break
      }
    }
    eliminationOrder.push({ agentId: id, sceneNumber: elimScene })
  }

  const coupleHistory: SeasonExport['season']['coupleHistory'] = []
  const activeCouples = new Map<string, { couple: Couple; formedAt: number }>()

  for (let i = 0; i < episode.scenes.length; i++) {
    const scene = episode.scenes[i]!
    for (const event of scene.systemEvents) {
      if (event.type === 'couple_formed' && event.fromId && event.toId) {
        const key = [event.fromId, event.toId].sort().join('-')
        activeCouples.set(key, { couple: { a: event.fromId, b: event.toId }, formedAt: i + 1 })
      }
      if (event.type === 'couple_broken' && event.fromId && event.toId) {
        const key = [event.fromId, event.toId].sort().join('-')
        const entry = activeCouples.get(key)
        if (entry) {
          coupleHistory.push({ ...entry, brokenAt: i + 1 })
          activeCouples.delete(key)
        }
      }
    }
  }
  for (const entry of activeCouples.values()) {
    coupleHistory.push({ ...entry, brokenAt: null })
  }

  const keyMoments: SeasonExport['season']['keyMoments'] = []
  for (let i = 0; i < episode.scenes.length; i++) {
    const scene = episode.scenes[i]!
    if (scene.type === 'bombshell') {
      keyMoments.push({ sceneNumber: i + 1, description: scene.outcome, type: 'bombshell_arrival' })
    }
    for (const event of scene.systemEvents) {
      if (event.type === 'challenge_win') {
        keyMoments.push({ sceneNumber: i + 1, description: event.label, type: 'challenge_win' })
      }
      if (event.type === 'couple_broken') {
        keyMoments.push({ sceneNumber: i + 1, description: event.label, type: 'couple_broken' })
      }
    }
  }

  const scenes = episode.scenes.map((scene, i) => ({
    sceneNumber: i + 1,
    type: scene.type,
    title: scene.title,
    participantIds: scene.participantIds,
    dialogueSummary: scene.dialogue.map((d) => `${d.agentId}: ${d.text}`).join(' | '),
    systemEvents: scene.systemEvents,
    outcome: scene.outcome,
    sceneContext: scene.sceneContext,
  }))

  const snapshots: SeasonExport['relationships']['snapshots'] = [{
    afterScene: episode.scenes.length,
    relationships: episode.relationships,
  }]

  return {
    version: 2,
    exportedAt: Date.now(),
    season: {
      id: episode.id,
      number: episode.number,
      theme: episode.seasonTheme,
      castPool: episode.castPool,
      bombshellPool: episode.bombshellPool,
      winnerCouple: episode.winnerCouple,
      eliminationOrder,
      coupleHistory,
      keyMoments,
    },
    scenes,
    relationships: {
      final: episode.relationships,
      snapshots,
    },
  }
}

export function buildRLExport(episode: Episode, cast: Agent[]): RLExport {
  const agents = cast
    .filter((a) => episode.brains[a.id])
    .map((a) => {
      const brain = episode.brains[a.id]!
      return {
        agentId: a.id,
        name: a.name,
        archetype: a.archetype,
        goal: brain.goal,
        policy: brain.policy,
        cumulativeReward: brain.cumulativeReward,
        rewards: brain.rewards,
        memories: brain.memories.map(({ embedding, ...rest }) => rest),
      }
    })

  return {
    version: 2,
    exportedAt: Date.now(),
    seasonId: episode.id,
    agents,
  }
}
