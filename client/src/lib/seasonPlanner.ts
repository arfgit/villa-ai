import type { SceneType, Scene } from '@/types'

export type SeasonPhase = 'intro' | 'early' | 'midgame' | 'lategame' | 'finale_ceremony'

interface PlannerState {
  scenes: Scene[]
  activeCastCount: number
  bombshellsIntroduced: number
  bombshellPoolSize: number
  coupleCount: number
  /** Scene index where last bombshell arrived (null if none yet) */
  lastBombshellScene: number | null
  /** Tracks how many scenes since the last bombshell arrived for dating period */
  bombshellDatingUntilScene: number | null
  /** Per-agent drama scores for pacing decisions */
  avgDramaScore: number
}

const CHILL_SPOTS: SceneType[] = ['firepit', 'pool', 'kitchen', 'bedroom']

function currentPhase(state: PlannerState): SeasonPhase {
  if (state.scenes.length === 0) return 'intro'
  if (state.activeCastCount <= 2) return 'finale_ceremony'
  const recouples = state.scenes.filter((s) => s.type === 'recouple').length
  if (recouples === 0) return 'early'
  if (state.activeCastCount <= 4) return 'lategame'
  return 'midgame'
}

export function getSeasonPhase(state: PlannerState): SeasonPhase {
  return currentPhase(state)
}

/**
 * Determines the next scene type based on the current season state.
 * Replaces the fixed 24-scene rotation with dynamic, drama-driven pacing.
 */
export function nextSceneType(state: PlannerState): SceneType {
  const phase = currentPhase(state)
  const sceneCount = state.scenes.length
  const scenesSinceLastRecouple = scenesAfterLastOfType(state.scenes, 'recouple')

  // ── INTRO ──
  if (phase === 'intro') return 'firepit'

  // ── FINALE ──
  if (phase === 'finale_ceremony') return 'recouple'

  // ── EARLY PHASE ──
  // Scene 2 is always a minigame to build early bonds
  if (sceneCount === 1) return 'minigame'
  // Scene 3 is always the grace recouple (no eliminations)
  if (sceneCount === 2) return 'recouple'

  // ── BOMBSHELL DATING PERIOD ──
  // If a bombshell is in their dating window, schedule a date for them
  if (state.bombshellDatingUntilScene !== null && sceneCount < state.bombshellDatingUntilScene) {
    const datesSinceBombshell = state.lastBombshellScene !== null
      ? state.scenes.slice(state.lastBombshellScene).filter((s) => s.type === 'date').length
      : 0
    if (datesSinceBombshell < 2) return 'date'
  }

  // ── RECOUPLE TIMING ──
  // Drama-driven: higher drama = slightly longer arcs before recoupling
  const dramaFactor = Math.min(state.avgDramaScore / 10, 1) // 0-1
  const minScenesBetweenRecouples = 4 + Math.floor(dramaFactor * 2) // 4-6
  const needsRecouple = scenesSinceLastRecouple >= minScenesBetweenRecouples

  if (needsRecouple && phase !== 'early') {
    // Check if we should introduce a bombshell first (to shake things up before recouple)
    if (shouldIntroduceBombshell(state, phase)) return 'bombshell'
    return 'recouple'
  }

  // ── BOMBSHELL INTRODUCTION ──
  if (shouldIntroduceBombshell(state, phase) && scenesSinceLastRecouple >= 2) {
    return 'bombshell'
  }

  // ── VARIETY SCENES ──
  return pickVarietyScene(state)
}

function shouldIntroduceBombshell(state: PlannerState, phase: SeasonPhase): boolean {
  // Allow bombshells in midgame and lategame (lategame bombshells create chaos)
  if (phase !== 'midgame' && phase !== 'lategame') return false
  if (state.bombshellsIntroduced >= state.bombshellPoolSize) return false
  // Don't introduce during an active dating window
  if (state.bombshellDatingUntilScene !== null && state.scenes.length < state.bombshellDatingUntilScene) return false

  const scenesSinceLast = state.lastBombshellScene !== null
    ? state.scenes.length - state.lastBombshellScene
    : state.scenes.length

  // First bombshell: after scene 4
  if (state.bombshellsIntroduced === 0) return scenesSinceLast >= 4
  // Subsequent: at least 4 scenes apart (faster pace = more disruption)
  return scenesSinceLast >= 4
}

/**
 * Determine how many bombshells arrive this scene (1 or 2).
 * Double arrivals happen when there are enough bombshells left and
 * the active cast is large enough to absorb two newcomers.
 */
export function bombshellArrivalCount(
  bombshellsIntroduced: number,
  bombshellPoolSize: number,
  activeCastCount: number
): number {
  const remaining = bombshellPoolSize - bombshellsIntroduced
  if (remaining < 2) return 1
  // Double arrival when cast is 6+ and random chance (40%)
  if (activeCastCount >= 6 && Math.random() < 0.4) return 2
  return 1
}

function pickVarietyScene(state: PlannerState): SceneType {
  const sceneCount = state.scenes.length
  const recentTypes = state.scenes.slice(-3).map((s) => s.type)

  // Build weighted candidates
  const candidates: Array<{ type: SceneType; weight: number }> = []

  // Challenge: up to 2 per season, not recently
  const challengeCount = state.scenes.filter((s) => s.type === 'challenge').length
  if (challengeCount < 2 && !recentTypes.includes('challenge') && sceneCount > 5) {
    candidates.push({ type: 'challenge', weight: 3 })
  }

  // Reward date after challenge
  const lastScene = state.scenes[state.scenes.length - 1]
  if (lastScene?.type === 'challenge') {
    return 'date' // always follow a challenge with a date
  }

  // Interviews: drama-driven characters get more
  if (!recentTypes.includes('interview') && sceneCount > 3) {
    candidates.push({ type: 'interview', weight: 2 + (state.avgDramaScore > 5 ? 2 : 0) })
  }

  // Minigame: periodic
  const minigameCount = state.scenes.filter((s) => s.type === 'minigame').length
  if (!recentTypes.includes('minigame') && minigameCount < Math.ceil(sceneCount / 6)) {
    candidates.push({ type: 'minigame', weight: 3 })
  }

  // Date (non-reward): occasional
  if (!recentTypes.includes('date') && state.coupleCount > 0) {
    candidates.push({ type: 'date', weight: 2 })
  }

  // Filler: always available
  for (const spot of CHILL_SPOTS) {
    if (!recentTypes.includes(spot)) {
      candidates.push({ type: spot, weight: 1 })
    }
  }

  // If nothing eligible, fallback to random chill spot
  if (candidates.length === 0) {
    return CHILL_SPOTS[Math.floor(Math.random() * CHILL_SPOTS.length)]!
  }

  // Weighted random selection
  const totalWeight = candidates.reduce((sum, c) => sum + c.weight, 0)
  let r = Math.random() * totalWeight
  for (const c of candidates) {
    r -= c.weight
    if (r <= 0) return c.type
  }
  return candidates[candidates.length - 1]!.type
}

function scenesAfterLastOfType(scenes: Scene[], type: SceneType): number {
  for (let i = scenes.length - 1; i >= 0; i--) {
    if (scenes[i]!.type === type) return scenes.length - i - 1
  }
  return scenes.length
}

export function isSeasonComplete(activeCastCount: number, winnerCouple: unknown): boolean {
  return winnerCouple !== null || activeCastCount < 2
}
