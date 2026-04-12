import type { Episode, Agent, AgentMemory } from '@/types'
import { buildSeasonExport, buildRLExport } from './exportData'

const TRAINING_KEY = 'villa-ai-training'
const WISDOM_KEY = 'villa-ai-wisdom'
const META_WISDOM_KEY = 'villa-ai-meta-wisdom'
const MAX_SEASONS = 5

export interface TrainingArchive {
  seasons: SeasonSummary[]
  updatedAt: number
}

export interface SeasonSummary {
  seasonNumber: number
  theme: string
  winnerNames: [string, string] | null
  totalScenes: number
  eliminationCount: number
  highlights: string[]
  lessons: string[]
}

export function loadWisdomArchive(): Map<string, AgentMemory[]> {
  try {
    const raw = localStorage.getItem(WISDOM_KEY)
    if (!raw) return new Map()
    const entries = JSON.parse(raw) as Array<[string, AgentMemory[]]>
    return new Map(entries)
  } catch {
    return new Map()
  }
}

export function saveWisdomArchive(archive: Map<string, AgentMemory[]>): void {
  try {
    const entries = Array.from(archive.entries())
    localStorage.setItem(WISDOM_KEY, JSON.stringify(entries))
  } catch {}
}

export function loadMetaWisdom(): AgentMemory[] {
  try {
    const raw = localStorage.getItem(META_WISDOM_KEY)
    if (!raw) return []
    return JSON.parse(raw) as AgentMemory[]
  } catch {
    return []
  }
}

export function saveMetaWisdom(wisdom: AgentMemory[]): void {
  try {
    localStorage.setItem(META_WISDOM_KEY, JSON.stringify(wisdom))
  } catch {}
}

export function autoSaveTrainingData(episode: Episode, cast: Agent[]): void {
  const summary = buildSeasonSummary(episode, cast)

  const archive = loadTrainingArchive()
  archive.seasons.push(summary)
  while (archive.seasons.length > MAX_SEASONS) archive.seasons.shift()
  archive.updatedAt = Date.now()

  try {
    localStorage.setItem(TRAINING_KEY, JSON.stringify(archive))
  } catch {}

  try {
    const seasonExport = buildSeasonExport(episode, cast)
    const rlExport = buildRLExport(episode, cast)
    const fullKey = 'villa-ai-exports'
    const existing = JSON.parse(localStorage.getItem(fullKey) ?? '[]') as unknown[]
    existing.push({ season: seasonExport, rl: rlExport })
    while (existing.length > MAX_SEASONS) existing.shift()
    localStorage.setItem(fullKey, JSON.stringify(existing))
  } catch {}
}

export function loadTrainingArchive(): TrainingArchive {
  try {
    const raw = localStorage.getItem(TRAINING_KEY)
    if (!raw) return { seasons: [], updatedAt: 0 }
    return JSON.parse(raw) as TrainingArchive
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
      if (event.type === 'couple_broken' && event.label) {
        highlights.push(event.label)
      }
      if (event.type === 'challenge_win' && event.label) {
        highlights.push(event.label)
      }
    }
    if (scene.type === 'bombshell' && scene.outcome) {
      highlights.push(scene.outcome)
    }
  }

  const lessons: string[] = []
  for (const brain of Object.values(episode.brains)) {
    const topReflection = brain.memories
      .filter((m) => m.type === 'reflection' && m.importance >= 7)
      .sort((a, b) => b.importance - a.importance)[0]
    if (topReflection) {
      lessons.push(topReflection.content)
    }
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

export function buildPastSeasonsPromptBlock(): string {
  const archive = loadTrainingArchive()
  if (archive.seasons.length === 0) return ''

  const blocks = archive.seasons.map((s) => {
    const winner = s.winnerNames ? `${s.winnerNames[0]} & ${s.winnerNames[1]}` : 'no winner'
    const hl = s.highlights.length > 0
      ? s.highlights.map((h) => `  - ${h}`).join('\n')
      : '  - (no notable moments recorded)'
    return `Season ${s.seasonNumber} (${s.totalScenes} scenes, ${s.eliminationCount} eliminations, winner: ${winner})
  Theme: ${s.theme}
  Key moments:
${hl}`
  })

  return `\n## PAST SEASONS (reference for continuity — contestants may have heard stories)
${blocks.join('\n')}\n`
}
