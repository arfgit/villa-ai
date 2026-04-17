import type { Episode, Agent, AgentMemory, SeasonSummary } from '@villa-ai/shared'
import { buildSeasonExport, buildRLExport } from './exportData.js'
import { addTrainingEntry, getTrainingEntries, saveWisdom, getWisdom } from '../services/firebase.js'

const MAX_SEASONS = 50

export interface TrainingArchive {
  seasons: SeasonSummary[]
  updatedAt: number
}

export async function loadWisdomArchive(): Promise<Map<string, AgentMemory[]>> {
  try {
    const data = await getWisdom('archive')
    if (!data) return new Map()
    const entries = (data as { entries: Array<[string, AgentMemory[]]> }).entries ?? []
    return new Map(entries)
  } catch {
    return new Map()
  }
}

export async function saveWisdomArchive(archive: Map<string, AgentMemory[]>): Promise<void> {
  try {
    await saveWisdom('archive', { entries: Array.from(archive.entries()) })
  } catch { /* Firestore write failed */ }
}

export async function loadMetaWisdom(): Promise<AgentMemory[]> {
  try {
    const data = await getWisdom('meta')
    if (!data) return []
    return (data as { wisdom: AgentMemory[] }).wisdom ?? []
  } catch {
    return []
  }
}

export async function saveMetaWisdom(wisdom: AgentMemory[]): Promise<void> {
  try {
    await saveWisdom('meta', { wisdom })
  } catch { /* Firestore write failed */ }
}

export async function autoSaveTrainingData(sessionId: string, episode: Episode, cast: Agent[]): Promise<string | null> {
  const summary = buildSeasonSummary(episode, cast)

  try {
    const seasonExport = buildSeasonExport(episode, cast)
    const rlExport = buildRLExport(episode, cast)
    const entryId = await addTrainingEntry({
      sessionId,
      seasonNumber: episode.number,
      summary,
      seasonExport,
      rlExport,
      exportedAt: Date.now(),
    })
    return entryId
  } catch { return null }
}

export async function loadTrainingArchive(): Promise<TrainingArchive> {
  try {
    const docs = await getTrainingEntries(MAX_SEASONS)
    const seasons = docs
      .map((d) => (d as { summary?: SeasonSummary }).summary)
      .filter((s): s is SeasonSummary => !!s)
    return { seasons, updatedAt: Date.now() }
  } catch {
    return { seasons: [], updatedAt: 0 }
  }
}

function buildSeasonSummary(episode: Episode, cast: Agent[]): SeasonSummary {
  const winnerNames: [string, string] | null = episode.winnerCouple
    ? [
        cast.find((c) => c.id === episode.winnerCouple!.a)?.name ?? episode.winnerCouple.a,
        cast.find((c) => c.id === episode.winnerCouple!.b)?.name ?? episode.winnerCouple.b,
      ]
    : null

  const highlights: string[] = []
  for (const scene of episode.scenes) {
    for (const event of scene.systemEvents) {
      if (event.type === 'couple_broken' && event.label) highlights.push(event.label)
      if (event.type === 'challenge_win' && event.label) highlights.push(event.label)
    }
    if (scene.type === 'bombshell' && scene.outcome) highlights.push(scene.outcome)
  }

  const lessons: string[] = []
  for (const brain of Object.values(episode.brains)) {
    const topReflection = brain.memories
      .filter((m) => m.type === 'reflection' && m.importance >= 7)
      .sort((a, b) => b.importance - a.importance)[0]
    if (topReflection) lessons.push(topReflection.content)
  }

  return {
    seasonNumber: episode.number,
    theme: episode.seasonTheme.split('\n')[0] ?? '',
    winnerNames,
    totalScenes: episode.scenes.length,
    eliminationCount: episode.eliminatedIds.length,
    highlights: highlights.slice(0, 3),
    lessons: lessons.slice(0, 3),
  }
}

export async function buildPastSeasonsPromptBlock(): Promise<string> {
  const archive = await loadTrainingArchive()
  if (archive.seasons.length === 0) return ''

  const blocks = archive.seasons.map((s) => {
    const winner = s.winnerNames ? `${s.winnerNames[0]} & ${s.winnerNames[1]}` : 'no winner'
    const hl = s.highlights.length > 0
      ? s.highlights.map((h) => `  - ${h}`).join('\n')
      : '  - (no notable moments recorded)'
    return `Season ${s.seasonNumber} (${s.totalScenes} scenes, ${s.eliminationCount} eliminations, winner: ${winner})
  Theme: ${s.theme}
  Key moments:\n${hl}`
  })

  return `\n## PAST SEASONS (reference for continuity)\n${blocks.join('\n')}\n`
}
