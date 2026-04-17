import type { Episode, Agent, AgentMemory } from '@/types'
import {
  fetchTrainingArchive as fetchFromServer,
  fetchWisdom,
  saveWisdom as saveWisdomApi,
  fetchAggregateWisdom,
} from './api'

let cachedPastSeasonsBlock = ''
let cacheInitialized = false

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

// In-memory caches. Hydrated from the server on boot by `hydrateWisdom()`;
// mutated by the store during play; flushed back via `persistWisdom()`.
// We keep a synchronous read API so callers (createEpisode) don't have to go
// async in the hot path — the cache is always populated at boot time.
let wisdomArchiveCache: Map<string, AgentMemory[]> = new Map()
let metaWisdomCache: AgentMemory[] = []
let wisdomHydrated = false
let localArchiveCache: TrainingArchive = { seasons: [], updatedAt: 0 }
const MAX_SEASONS = 5

export function loadWisdomArchive(): Map<string, AgentMemory[]> {
  return wisdomArchiveCache
}

export function loadMetaWisdom(): AgentMemory[] {
  return metaWisdomCache
}

// Fetch wisdom from the backend and populate the in-memory caches. Called
// once on app boot (alongside restoreFromServer). Safe to call again after
// session-id changes. Falls back to the cross-session aggregate pool if this
// session has no meta-wisdom yet — gives fresh machines a head start on RL.
export async function hydrateWisdom(): Promise<void> {
  try {
    const { archive, meta } = await fetchWisdom()
    const entries = Object.entries(archive) as Array<[string, AgentMemory[]]>
    wisdomArchiveCache = new Map(entries)
    metaWisdomCache = (meta as AgentMemory[]) ?? []

    if (metaWisdomCache.length === 0) {
      const aggregate = await fetchAggregateWisdom(15)
      metaWisdomCache = (aggregate.meta as AgentMemory[]) ?? []
    }
  } catch {
    // Server unreachable — caches stay empty; the app still works, new agents
    // just don't get seed wisdom until next boot.
    wisdomArchiveCache = new Map()
    metaWisdomCache = []
  } finally {
    wisdomHydrated = true
  }
}

export function isWisdomHydrated(): boolean {
  return wisdomHydrated
}

// Flush the in-memory wisdom caches to the server. Fire-and-forget — callers
// don't need to await. Errors are swallowed (the cache is the source of truth
// for the current session either way).
export function persistWisdom(): void {
  const archiveObj: Record<string, AgentMemory[]> = {}
  for (const [agentId, memories] of wisdomArchiveCache) {
    archiveObj[agentId] = memories
  }
  saveWisdomApi(archiveObj, metaWisdomCache).catch(() => {})
}

export function autoSaveTrainingData(episode: Episode, _cast: Agent[]): void {
  // Training data itself is persisted server-side by the store's syncToServer
  // flow. This function now just refreshes the lightweight per-session summary
  // cache so buildPastSeasonsPromptBlock has a fallback if the network's down.
  const summary = buildSeasonSummary(episode, _cast)
  localArchiveCache.seasons.push(summary)
  while (localArchiveCache.seasons.length > MAX_SEASONS) localArchiveCache.seasons.shift()
  localArchiveCache.updatedAt = Date.now()
}

export function loadTrainingArchive(): TrainingArchive {
  return localArchiveCache
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

export async function refreshTrainingCache(): Promise<void> {
  try {
    const { entries } = await fetchFromServer(50)
    if (!entries || entries.length === 0) {
      cachedPastSeasonsBlock = ''
      cacheInitialized = true
      return
    }

    // Each entry is a full session: { seasonNumber, seasonTheme, scenes: [...], castNames, ... }
    const dialogueSamples: string[] = []
    const seasonSummaries: string[] = []

    for (const entry of entries.slice(0, 10)) {
      const d = entry as Record<string, unknown>
      const castNames = (d.castNames ?? {}) as Record<string, string>
      const scenes = Array.isArray(d.scenes) ? d.scenes as Array<Record<string, unknown>> : []
      const totalScenes = scenes.length

      if (totalScenes > 0) {
        const winner = d.winnerCouple
          ? `${castNames[(d.winnerCouple as { a: string }).a] ?? '?'} & ${castNames[(d.winnerCouple as { b: string }).b] ?? '?'}`
          : 'ongoing'
        seasonSummaries.push(`Season ${d.seasonNumber} (${totalScenes} scenes, ${d.seasonTheme ?? 'no theme'}, winner: ${winner})`)

        // Sample up to 3 scenes per session for dialogue reference
        const sampled = scenes.slice(-3)
        for (const scene of sampled) {
          const lines = Array.isArray(scene.dialogue)
            ? (scene.dialogue as Array<{ agentId: string; text: string }>)
                .slice(0, 3)
                .map((l) => `    ${castNames[l.agentId] ?? l.agentId}: "${l.text}"`)
                .join('\n')
            : ''
          if (lines) {
            dialogueSamples.push(`  Scene ${scene.sceneNumber} (${scene.sceneType}): ${scene.outcome ?? ''}\n${lines}`)
          }
        }
      }
    }

    const parts: string[] = []
    if (seasonSummaries.length > 0) {
      parts.push(`## PAST SEASONS (reference for continuity)\n${seasonSummaries.join('\n')}`)
    }
    if (dialogueSamples.length > 0) {
      parts.push(`## PAST DIALOGUE SAMPLES (style reference for the writers room)\n${dialogueSamples.slice(0, 15).join('\n')}`)
    }

    cachedPastSeasonsBlock = parts.length > 0 ? '\n' + parts.join('\n\n') + '\n' : ''
    cacheInitialized = true
  } catch {
    cachedPastSeasonsBlock = ''
  }
}

export function buildPastSeasonsPromptBlock(): string {
  if (cacheInitialized) return cachedPastSeasonsBlock

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
