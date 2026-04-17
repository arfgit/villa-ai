import type { SceneType, Scene, CasaAmorState } from '@/types'

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
  casaAmorState?: CasaAmorState | null
  recoupleCount?: number
}

// Casa Amor should feel mid-season — not early. Require enough recouples,
// at least one bombshell disruption, and a meaningful episode count.
const CASA_AMOR_MIN_SCENES = 14
const CASA_AMOR_MIN_RECOUPLES = 3
const CASA_AMOR_MIN_COUPLES = 3

const CHILL_SPOTS: SceneType[] = ['firepit', 'pool', 'kitchen', 'bedroom']

function currentPhase(state: PlannerState): SeasonPhase {
  if (state.scenes.length === 0) return 'intro'
  if (state.activeCastCount <= 2) return 'finale_ceremony'
  // 4 cast + 2 couples = grand-finale stalemate. We can't eliminate anyone
  // without breaking a couple, so bump to finale_ceremony to trigger the
  // viewer-chat-decides grand_finale scene.
  if (state.activeCastCount === 4 && state.coupleCount === 2) return 'finale_ceremony'
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

  if (phase === 'finale_ceremony') {
    // 4 cast + 2 couples → grand_finale (live chat picks the winning couple).
    // Otherwise (≤2 cast or singles remaining), the classic recouple finale.
    if (state.activeCastCount === 4 && state.coupleCount === 2) return 'grand_finale'
    return 'recouple'
  }

  if (sceneCount === 1) return 'minigame'
  // Scene #2 is the first recouple — this is what establishes initial pairings.
  // Do NOT gate it on coupleCount: couples only form via recouple, so gating
  // creates a chicken-and-egg deadlock where no one ever pairs up.
  if (sceneCount === 2) return 'recouple'

  if (state.bombshellDatingUntilScene !== null && sceneCount < state.bombshellDatingUntilScene) {
    const datesSinceBombshell = state.lastBombshellScene !== null
      ? state.scenes.slice(state.lastBombshellScene).filter((s) => s.type === 'date').length
      : 0
    if (datesSinceBombshell < 2) return 'date'
  }

  // Casa Amor: if active, delegate to arc scene type
  if (state.casaAmorState && state.casaAmorState.phase !== 'post') {
    return nextCasaAmorSceneType(state.casaAmorState)
  }

  // Casa Amor trigger: midgame, enough scenes/recouples/couples, at least one bombshell
  // has already shaken things up, and it hasn't happened yet.
  const recouples = state.recoupleCount ?? state.scenes.filter((s) => s.type === 'recouple').length
  if (
    phase === 'midgame' &&
    !state.casaAmorState &&
    sceneCount >= CASA_AMOR_MIN_SCENES &&
    recouples >= CASA_AMOR_MIN_RECOUPLES &&
    state.coupleCount >= CASA_AMOR_MIN_COUPLES &&
    state.bombshellsIntroduced >= 1
  ) {
    return 'casa_amor_arrival'
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

  // Elimination ceremonies — frequency scales with cast size
  const hasHadRecouple = state.scenes.some((s) => s.type === 'recouple')
  if (hasHadRecouple && state.activeCastCount > 4) {
    const scenesSinceLastElim = scenesAfterLastOfTypes(state.scenes, ['recouple', 'public_vote', 'islander_vote', 'producer_twist'])

    // Large cast (10+): eliminate every 2-3 scenes to thin the herd
    // Medium cast (6-9): every 3-4 scenes
    // Small cast (5): every 4 scenes
    const elimInterval = state.activeCastCount >= 10 ? 2 : state.activeCastCount >= 6 ? 3 : 4

    if (phase === 'midgame' && scenesSinceLastElim >= elimInterval) {
      // Higher chance with more cast — guaranteed when 12+ people
      const elimChance = state.activeCastCount >= 12 ? 1.0 : state.activeCastCount >= 8 ? 0.75 : 0.5
      if (Math.random() < elimChance) {
        return sceneCount % 3 === 0 ? 'islander_vote' : 'public_vote'
      }
    }
    if (phase === 'lategame' && scenesSinceLastElim >= 2) {
      return sceneCount % 2 === 0 ? 'public_vote' : 'islander_vote'
    }
    if (phase !== 'early' && state.avgDramaScore < 3.0 && sceneCount > 8 && scenesSinceLastElim >= 2 && Math.random() < 0.4) {
      return 'producer_twist'
    }
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
  if (lastScene?.type === 'challenge' && state.coupleCount > 0) {
    // Reward-date after a challenge only makes sense when at least one couple exists.
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

function scenesAfterLastOfTypes(scenes: Scene[], types: SceneType[]): number {
  for (let i = scenes.length - 1; i >= 0; i--) {
    if (types.includes(scenes[i]!.type)) return scenes.length - i - 1
  }
  return scenes.length
}

export function nextCasaAmorSceneType(state: CasaAmorState): SceneType {
  // Arc: arrival (sc=1) → date #1 (sc=2) → date #2 (sc=3) → challenge #1 (sc=4)
  //   → challenge #2 (sc=5) → stickswitch (sc=6). Each date/challenge pair is
  //   scheduled twice so both split groups get their own scene with the Casa cast.
  if (state.scenesCompleted <= 1) return 'casa_amor_date'
  if (state.scenesCompleted === 2) return 'casa_amor_date'
  if (state.scenesCompleted === 3) return 'casa_amor_challenge'
  if (state.scenesCompleted === 4) return 'casa_amor_challenge'
  return 'casa_amor_stickswitch'
}

export function isSeasonComplete(activeCastCount: number, winnerCouple: unknown): boolean {
  return winnerCouple !== null || activeCastCount < 2
}

export function nextChallengeCategory(scenes: Scene[]): 'learn_facts' | 'explore_attraction' {
  // Alternate relative to the most recent game with a known category.
  for (let i = scenes.length - 1; i >= 0; i--) {
    const s = scenes[i]!
    if (s.type !== 'challenge' && s.type !== 'minigame') continue
    if (s.challengeCategory === 'learn_facts') return 'explore_attraction'
    if (s.challengeCategory === 'explore_attraction') return 'learn_facts'
  }
  return Math.random() < 0.5 ? 'learn_facts' : 'explore_attraction'
}
