import type { SceneType, Scene } from '@/types'

export type SeasonPhase = 'intro' | 'early' | 'midgame' | 'lategame' | 'finale_ceremony'

interface PlannerState {
  scenes: Scene[]
  activeCastCount: number
  bombshellsIntroduced: number
  bombshellPoolSize: number
  coupleCount: number
  lastBombshellScene: number | null
  bombshellDatingUntilScene: number | null
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

export function nextSceneType(state: PlannerState): SceneType {
  const phase = currentPhase(state)
  const sceneCount = state.scenes.length
  const scenesSinceLastRecouple = scenesAfterLastOfType(state.scenes, 'recouple')

  if (phase === 'intro') return 'firepit'

  if (phase === 'finale_ceremony') return 'recouple'

  if (sceneCount === 1) return 'minigame'
  if (sceneCount === 2) return 'recouple'

  if (state.bombshellDatingUntilScene !== null && sceneCount < state.bombshellDatingUntilScene) {
    const datesSinceBombshell = state.lastBombshellScene !== null
      ? state.scenes.slice(state.lastBombshellScene).filter((s) => s.type === 'date').length
      : 0
    if (datesSinceBombshell < 2) return 'date'
  }

  const dramaFactor = Math.min(state.avgDramaScore / 10, 1)
  const minScenesBetweenRecouples = 4 + Math.floor(dramaFactor * 2)
  const needsRecouple = scenesSinceLastRecouple >= minScenesBetweenRecouples

  if (needsRecouple && phase !== 'early') {
    if (shouldIntroduceBombshell(state, phase)) return 'bombshell'
    return 'recouple'
  }

  if (shouldIntroduceBombshell(state, phase) && scenesSinceLastRecouple >= 2) {
    return 'bombshell'
  }

  return pickVarietyScene(state)
}

function shouldIntroduceBombshell(state: PlannerState, phase: SeasonPhase): boolean {
  if (phase !== 'midgame' && phase !== 'lategame') return false
  if (state.bombshellsIntroduced >= state.bombshellPoolSize) return false
  if (state.bombshellDatingUntilScene !== null && state.scenes.length < state.bombshellDatingUntilScene) return false

  const scenesSinceLast = state.lastBombshellScene !== null
    ? state.scenes.length - state.lastBombshellScene
    : state.scenes.length

  if (state.bombshellsIntroduced === 0) return scenesSinceLast >= 4
  return scenesSinceLast >= 4
}

export function bombshellArrivalCount(
  bombshellsIntroduced: number,
  bombshellPoolSize: number,
  activeCastCount: number
): number {
  const remaining = bombshellPoolSize - bombshellsIntroduced
  if (remaining < 2) return 1
  if (activeCastCount >= 6 && Math.random() < 0.4) return 2
  return 1
}

function pickVarietyScene(state: PlannerState): SceneType {
  const sceneCount = state.scenes.length
  const recentTypes = state.scenes.slice(-3).map((s) => s.type)

  const candidates: Array<{ type: SceneType; weight: number }> = []

  const challengeCount = state.scenes.filter((s) => s.type === 'challenge').length
  if (challengeCount < 2 && !recentTypes.includes('challenge') && sceneCount > 5) {
    candidates.push({ type: 'challenge', weight: 3 })
  }

  const lastScene = state.scenes[state.scenes.length - 1]
  if (lastScene?.type === 'challenge') {
    return 'date'
  }

  if (!recentTypes.includes('interview') && sceneCount > 3) {
    candidates.push({ type: 'interview', weight: 2 + (state.avgDramaScore > 5 ? 2 : 0) })
  }

  const minigameCount = state.scenes.filter((s) => s.type === 'minigame').length
  if (!recentTypes.includes('minigame') && minigameCount < Math.ceil(sceneCount / 6)) {
    candidates.push({ type: 'minigame', weight: 3 })
  }

  if (!recentTypes.includes('date') && state.coupleCount > 0) {
    candidates.push({ type: 'date', weight: 2 })
  }

  for (const spot of CHILL_SPOTS) {
    if (!recentTypes.includes(spot)) {
      candidates.push({ type: spot, weight: 1 })
    }
  }

  if (candidates.length === 0) {
    return CHILL_SPOTS[Math.floor(Math.random() * CHILL_SPOTS.length)]!
  }

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
