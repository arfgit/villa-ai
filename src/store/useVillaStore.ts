import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Episode, Scene, SceneType, RelationshipMetric, LlmSceneResponse, Relationship, EmotionState, AgentBrain, AgentMemory, Agent, RewardEvent } from '@/types'
import { HOST } from '@/data/host'
import { sampleSeasonCast } from '@/data/castPool'
import { getSceneLabel } from '@/data/environments'
import { buildSeedRelationships, buildSeedEmotions } from '@/data/seedRelationships'
import { buildScenePrompt } from '@/lib/prompt'
import { generateScene as generateSceneFromLlm, generateBatchScene as generateBatchFromLlm } from '@/lib/llm'
import { embed } from '@/lib/embeddings'
import { retrieveMemories, buildRetrievalQuery } from '@/lib/memory'
import { extractObservationsForScene, reflectAcrossAgents } from '@/lib/memoryExtraction'
import { computeSceneRewards, sumRewards } from '@/lib/rewards'
import { inferStatDeltas, applyInferredDeltas } from '@/lib/statInference'
import { updateDramaScores, averageDramaScore, rankByDrama } from '@/lib/dramaScore'
import { nextSceneType as planNextScene, getSeasonPhase, bombshellArrivalCount } from '@/lib/seasonPlanner'
import { buildSeasonExport, buildRLExport } from '@/lib/exportData'
import { downloadJson } from '@/lib/download'
import { autoSaveTrainingData, loadWisdomArchive, saveWisdomArchive, loadMetaWisdom, saveMetaWisdom } from '@/lib/trainingData'
import { newId } from '@/lib/ids'

interface UiState {
  isCastOpen: boolean
  isRelationshipsOpen: boolean
  isScenarioPickerOpen: boolean
  activeRelationshipMetric: RelationshipMetric
  lineDelayMs: number
  tooltipsEnabled: boolean
  musicEnabled: boolean
  isPaused: boolean
}

interface VillaState {
  cast: Agent[]
  episode: Episode
  currentSceneId: string | null
  currentLineIndex: number
  isGenerating: boolean
  lastError: string | null
  generationProgress: { percent: number; label: string } | null
  sceneQueue: LlmSceneResponse[]
  ui: UiState

  startNewEpisode: () => void
  generateScene: (type?: SceneType) => Promise<void>
  advanceLine: () => void
  resetLineIndex: () => void
  toggleCast: () => void
  toggleRelationships: () => void
  setRelationshipMetric: (m: RelationshipMetric) => void
  selectScene: (sceneId: string) => void
  toggleTooltips: () => void
  toggleMusic: () => void
  togglePause: () => void
  exportSeasonData: () => void
  exportRLData: () => void
}

const CORE_TENSIONS = [
  'Two islanders have a scandalous shared past and don\'t want anyone else to find out',
  'One islander is hiding that they\'re here purely for the prize money',
  'Two islanders are in a fake alliance pretending they don\'t fancy each other',
  'A secret friendship rivalry is brewing — two islanders keep blocking each other romantically',
  'One islander is torn between two people who both want them',
  'A jealousy spiral is quietly starting between two pairs',
  'One islander is catching real feelings for someone they swore was their type',
  'Someone is double-dipping — flirting hard with two contestants at once',
  'One islander is plotting to sabotage a specific couple',
  'A contestant is hiding a major insecurity that will burst out at the wrong moment',
]

const HIDDEN_TWISTS = [
  'a bombshell arrives who shares history with one of the original cast',
  'one contestant will turn out to have a completely different motive than they stated in their intro',
  'an unexpected alliance between two opposites will form by scene 8',
  'a seemingly-loyal contestant will defect at the worst possible moment',
  'the quietest islander becomes the most dangerous strategist',
  'the front-runner couple will have a spectacular public blowup',
]

const VIBE_DIALS = [
  'slow-burn romantic',
  'chaotic messy',
  'scheming strategic',
  'high-drama explosive',
  'comedic and self-aware',
  'bittersweet and vulnerable',
]

const WILDCARD_DIRECTIVES = [
  'Someone will tell a damaging lie in an early scene that pays off mid-season',
  'Someone will break down crying in public',
  'Two contestants will share a secret kiss that no one else sees',
  'A bombshell will reject everyone and create a new kind of drama',
  'A couple will fake their bond for strategic reasons',
  'An unexpected friendship will matter more than any romance',
]

function pickFromArray<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]!
}

function pickRandomN<T>(arr: T[], n: number): T[] {
  const shuffled = [...arr].sort(() => Math.random() - 0.5)
  return shuffled.slice(0, n)
}

function pickTheme(): string {
  const core = pickFromArray(CORE_TENSIONS)
  const twist = pickFromArray(HIDDEN_TWISTS)
  const vibe = pickFromArray(VIBE_DIALS)
  const wildcard = pickFromArray(WILDCARD_DIRECTIVES)
  return `CORE TENSION: ${core}.
HIDDEN TWIST: By the end of the season, ${twist}.
VIBE: The overall tone is ${vibe}.
WILDCARD DIRECTIVE: ${wildcard}.`
}

const WISDOM_ARCHIVE: Map<string, AgentMemory[]> = loadWisdomArchive()
const MAX_ARCHIVED_PER_AGENT = 6
const WISDOM_IMPORTANCE_THRESHOLD = 7
const META_WISDOM: AgentMemory[] = loadMetaWisdom()
const MAX_META_WISDOM = 10

function archiveSeasonWisdom(episode: Episode, cast: Agent[]): void {
  const allSeasonReflections: AgentMemory[] = []

  for (const [agentId, brain] of Object.entries(episode.brains)) {
    const keep = brain.memories
      .filter((m) => m.type === 'reflection' && m.importance >= WISDOM_IMPORTANCE_THRESHOLD)
      .slice(-3)
      .map((m) => ({
        ...m,
        content: m.content.startsWith('[past season lesson]')
          ? m.content
          : `[past season lesson] ${m.content}`,
        id: `${m.id}-archived`,
      }))
    if (keep.length === 0) continue
    allSeasonReflections.push(...keep)
    const existing = WISDOM_ARCHIVE.get(agentId) ?? []
    const combined = [...existing, ...keep].slice(-MAX_ARCHIVED_PER_AGENT)
    WISDOM_ARCHIVE.set(agentId, combined)
  }

  const topMeta = allSeasonReflections
    .sort((a, b) => b.importance - a.importance)
    .slice(0, 3)
    .map((m) => ({
      ...m,
      content: m.content.startsWith('[villa meta-wisdom]')
        ? m.content
        : `[villa meta-wisdom] ${m.content}`,
      id: `${m.id}-meta`,
      agentId: 'meta',
    }))
  META_WISDOM.push(...topMeta)
  while (META_WISDOM.length > MAX_META_WISDOM) META_WISDOM.shift()

  saveWisdomArchive(WISDOM_ARCHIVE)
  saveMetaWisdom(META_WISDOM)

  autoSaveTrainingData(episode, cast)
}

let seasonCounter = 0

function createEpisode(): Episode {
  seasonCounter += 1
  const { cast: castPool, bombshells: bombshellPool } = sampleSeasonCast()
  const initialLocations: Record<string, SceneType> = {}
  const initialBrains: Record<string, AgentBrain> = {}
  for (const agent of castPool) {
    initialLocations[agent.id] = 'bedroom'
    // Returning contestants inherit their personal lessons. Generated (new)
    // contestants get 2-3 meta-wisdom entries so they "heard stories from
    // past seasons" — cross-season RL without personal history.
    const archivedWisdom = WISDOM_ARCHIVE.get(agent.id)
    const seedMemories = archivedWisdom
      ? [...archivedWisdom]
      : META_WISDOM.length > 0
        ? pickRandomN(META_WISDOM, Math.min(3, META_WISDOM.length)).map((m) => ({
            ...m,
            agentId: agent.id,
            id: `${m.id}-${agent.id}`,
          }))
        : []
    initialBrains[agent.id] = {
      agentId: agent.id,
      memories: seedMemories,
      goal: '',
      policy: '',
      personalityShift: '',
      rewards: [],
      cumulativeReward: 0,
      lastReflectionScene: 0,
    }
  }
  return {
    id: newId('ep'),
    number: seasonCounter,
    title: `Season ${seasonCounter}`,
    seasonTheme: pickTheme(),
    scenes: [],
    relationships: buildSeedRelationships(castPool),
    emotions: buildSeedEmotions(castPool),
    couples: [],
    eliminatedIds: [],
    unpairedStreak: {},
    winnerCouple: null,
    locations: initialLocations,
    brains: initialBrains,
    activeCastIds: castPool.map((c) => c.id),
    bombshellsIntroduced: [],
    soloSinceBombshell: {},
    graceExpiresAt: {},
    castPool,
    bombshellPool,
    sceneRotation: [],  // legacy — no longer used, season planner drives scene types
    seasonPhase: 'intro',
    dramaScores: {},
    lastBombshellScene: null,
    bombshellDatingUntilScene: null,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  }
}

// Recouple defection: give singles a chance to be rescued. For each single
// contestant, check if any currently-coupled contestant has HIGHER mutual
// attraction to them than to their current partner. If so, that contestant
// defects — breaking their existing couple and pairing with the single.
// Processes the strongest defection first, then re-evaluates, until no
// more viable defections remain. This is how singles bounce back.
function applyRecoupleDefections(
  couples: { a: string; b: string }[],
  activeCast: Agent[],
  relationships: Relationship[],
  eliminatedIds: string[]
): { a: string; b: string }[] {
  // Add small random jitter so near-ties resolve differently across runs.
  // Without this, the same state always produces the same defection.
  function pairScore(aId: string, bId: string): number {
    const ab = relationships.find((r) => r.fromId === aId && r.toId === bId)
    const ba = relationships.find((r) => r.fromId === bId && r.toId === aId)
    return (ab?.attraction ?? 0) + (ba?.attraction ?? 0) + Math.random() * 6
  }

  let working = [...couples]

  // Re-run until no more defections land.
  for (let iter = 0; iter < 10; iter++) {
    const pairedIds = new Set<string>()
    for (const c of working) {
      pairedIds.add(c.a)
      pairedIds.add(c.b)
    }
    const singles = activeCast.filter(
      (a) => !pairedIds.has(a.id) && !eliminatedIds.includes(a.id)
    )
    if (singles.length === 0) break

    // Find all potential defections: (defector in a couple, their current partner, the single they prefer, score delta)
    const candidates: Array<{
      defector: string
      currentPartner: string
      target: string
      delta: number
    }> = []

    for (const c of working) {
      for (const memberId of [c.a, c.b]) {
        const partnerId = memberId === c.a ? c.b : c.a
        const currentScore = pairScore(memberId, partnerId)
        for (const single of singles) {
          const singleScore = pairScore(memberId, single.id)
          // Require a meaningful preference gap (>5) so we don't thrash on ties
          if (singleScore > currentScore + 5) {
            candidates.push({
              defector: memberId,
              currentPartner: partnerId,
              target: single.id,
              delta: singleScore - currentScore,
            })
          }
        }
      }
    }

    if (candidates.length === 0) break

    // Weighted random over top-3 defections instead of pure argmax. Bigger
    // deltas are more likely but not guaranteed — small ties don't lock in
    // the same defection every run.
    candidates.sort((a, b) => b.delta - a.delta)
    const topCandidates = candidates.slice(0, Math.min(3, candidates.length))
    const weights = topCandidates.map((c, i) => c.delta * (topCandidates.length - i + 1))
    const totalWeight = weights.reduce((a, b) => a + b, 0)
    let r = Math.random() * totalWeight
    let chosen = topCandidates[0]!
    for (let i = 0; i < topCandidates.length; i++) {
      r -= weights[i]!
      if (r <= 0) {
        chosen = topCandidates[i]!
        break
      }
    }

    // Break the defector's couple
    working = working.filter((c) => c.a !== chosen.defector && c.b !== chosen.defector)
    // Form the new couple with the single
    working.push({ a: chosen.defector, b: chosen.target })
    // Loop again: the newly-single currentPartner might now defect to someone else,
    // or be rescued by another defection in the next iteration.
  }

  return working
}

// Deterministic safety net: greedily pair any unpaired contestants by
// highest mutual attraction. Runs after the LLM applies its own couple events,
// so the small-model case (llama3.2 forgetting to emit enough couple_formed)
// doesn't leave the season stuck without couples.
function forcePairUnpaired(
  activeCast: Agent[],
  currentCouples: { a: string; b: string }[],
  relationships: Relationship[],
  eliminatedIds: string[]
): { a: string; b: string }[] {
  const pairedIds = new Set<string>()
  for (const c of currentCouples) {
    pairedIds.add(c.a)
    pairedIds.add(c.b)
  }
  const unpaired = activeCast.filter(
    (a) => !pairedIds.has(a.id) && !eliminatedIds.includes(a.id)
  )
  if (unpaired.length < 2) return currentCouples

  // Add a small random jitter to each pair score so near-ties resolve
  // differently across runs. With low seed values early in the season,
  // many pairs have identical raw scores, so jitter is what creates variety.
  function pairScore(aId: string, bId: string): number {
    const ab = relationships.find((r) => r.fromId === aId && r.toId === bId)
    const ba = relationships.find((r) => r.fromId === bId && r.toId === aId)
    return (ab?.attraction ?? 0) + (ba?.attraction ?? 0) + Math.random() * 8
  }

  const result = [...currentCouples]
  const remaining = [...unpaired]
  while (remaining.length >= 2) {
    let bestScore = -Infinity
    let bestI = 0
    let bestJ = 1
    for (let i = 0; i < remaining.length; i++) {
      for (let j = i + 1; j < remaining.length; j++) {
        const s = pairScore(remaining[i]!.id, remaining[j]!.id)
        if (s > bestScore) {
          bestScore = s
          bestI = i
          bestJ = j
        }
      }
    }
    result.push({ a: remaining[bestI]!.id, b: remaining[bestJ]!.id })
    remaining.splice(bestJ, 1)
    remaining.splice(bestI, 1)
  }

  return result
}

// When a bombshell arrives mid-season, we seed bidirectional relationships
// between them and every currently-active contestant. Bombshells are
// STRANGERS walking in — neither side knows each other — so trust starts
// near zero. Attraction gets a small initial boost because bombshells are
// visually striking "first impression" arrivals (5-15), still much lower
// than bonds earned through multiple scenes together.
function seedRelationshipsForNewAgent(
  newAgentId: string,
  existingAgentIds: string[]
): Relationship[] {
  const rels: Relationship[] = []
  for (const otherId of existingAgentIds) {
    rels.push({
      fromId: newAgentId,
      toId: otherId,
      trust: Math.floor(Math.random() * 5),         // 0-4
      attraction: 5 + Math.floor(Math.random() * 11), // 5-15 (first impression boost)
      jealousy: 0,
    })
    rels.push({
      fromId: otherId,
      toId: newAgentId,
      trust: Math.floor(Math.random() * 5),
      attraction: 5 + Math.floor(Math.random() * 11),
      jealousy: 0,
    })
  }
  return rels
}

const REFLECTION_INTERVAL = 3
const MAX_RETRIEVED_MEMORIES = 5

const CHILL_SPOTS: SceneType[] = ['firepit', 'pool', 'kitchen', 'bedroom']

function computeLocations(
  cast: Agent[],
  eliminatedIds: string[],
  participantIds: string[],
  sceneType: SceneType,
  prev: Record<string, SceneType>
): Record<string, SceneType> {
  const next: Record<string, SceneType> = { ...prev }
  const otherSpots = CHILL_SPOTS.filter((s) => s !== sceneType)
  for (const agent of cast) {
    if (eliminatedIds.includes(agent.id)) {
      delete next[agent.id]
      continue
    }
    if (participantIds.includes(agent.id)) {
      next[agent.id] = sceneType
    } else {
      const idx = Math.floor(Math.random() * otherSpots.length)
      next[agent.id] = otherSpots[idx] ?? 'bedroom'
    }
  }
  return next
}

function applyRelDelta(rels: Relationship[], from: string, to: string, type: 'trust_change' | 'attraction_change' | 'jealousy_spike', delta: number) {
  const r = rels.find((x) => x.fromId === from && x.toId === to)
  if (!r) return
  if (type === 'trust_change') r.trust = clamp(r.trust + delta)
  if (type === 'attraction_change') r.attraction = clamp(r.attraction + delta)
  if (type === 'jealousy_spike') r.jealousy = clamp(r.jealousy + Math.abs(delta))
}

function applyDeltas(
  rels: Relationship[],
  emotions: EmotionState[],
  couples: { a: string; b: string }[],
  llm: LlmSceneResponse
): { rels: Relationship[]; emotions: EmotionState[]; couples: { a: string; b: string }[] } {
  const newRels = rels.map((r) => ({ ...r }))
  let newCouples = couples.map((c) => ({ ...c }))

  for (const event of llm.systemEvents) {
    if (event.type === 'couple_formed' && event.fromId && event.toId) {
      newCouples = newCouples.filter((c) => c.a !== event.fromId && c.b !== event.fromId && c.a !== event.toId && c.b !== event.toId)
      newCouples.push({ a: event.fromId, b: event.toId })
      continue
    }
    if (event.type === 'couple_broken' && event.fromId && event.toId) {
      newCouples = newCouples.filter((c) =>
        !((c.a === event.fromId && c.b === event.toId) || (c.a === event.toId && c.b === event.fromId))
      )
      continue
    }

    if (!event.fromId || !event.toId || event.delta === undefined) continue
    if (event.type === 'trust_change' || event.type === 'attraction_change' || event.type === 'jealousy_spike') {
      applyRelDelta(newRels, event.fromId, event.toId, event.type, event.delta)
    }
  }

  const newEmotions = emotions.map((e) => ({ ...e }))
  for (const update of llm.emotionUpdates) {
    const idx = newEmotions.findIndex((e) => e.agentId === update.agentId)
    if (idx >= 0) {
      newEmotions[idx] = { agentId: update.agentId, primary: update.primary, intensity: update.intensity }
    }
  }

  return { rels: newRels, emotions: newEmotions, couples: newCouples }
}

function clamp(n: number): number {
  return Math.max(0, Math.min(100, n))
}

/**
 * Progressively narrows the cast toward 1 couple at finale.
 *
 * Recouple ordinals:
 *   - 1 = grace recouple (no eliminations, just locks in graceExpiresAt for bombshell victims)
 *   - 2+ = elimination recouples — dump the weakest couple OR any unpaired
 *          contestants whose grace period has expired
 *   - finale = crown the top couple by combined attraction, eliminate all others
 *
 * "Weakest couple" is the one with the lowest (combined attraction) score.
 * Vulnerability is computed stat-driven — no LLM involvement.
 *
 * Grace protection: anyone in graceExpiresAt whose expiry >= current recouple
 * ordinal is protected from elimination this round even if they're unpaired.
 */
function applyEliminations(
  cast: Agent[],
  couples: { a: string; b: string }[],
  eliminatedIds: string[],
  sceneType: SceneType,
  recoupleOrdinal: number,
  isFinale: boolean,
  relationships: Relationship[],
  graceExpiresAt: Record<string, number>
): {
  eliminatedIds: string[]
  couples: { a: string; b: string }[]
  winnerCouple: { a: string; b: string } | null
  graceExpiresAt: Record<string, number>
} {
  const newEliminated = [...eliminatedIds]
  const newGrace = { ...graceExpiresAt }
  let activeCouples = couples.filter(
    (c) => !newEliminated.includes(c.a) && !newEliminated.includes(c.b)
  )

  function pairScore(a: string, b: string): number {
    const ab = relationships.find((r) => r.fromId === a && r.toId === b)
    const ba = relationships.find((r) => r.fromId === b && r.toId === a)
    return (ab?.attraction ?? 0) + (ba?.attraction ?? 0)
  }

  // ── FINALE ──
  // When exactly 2 active contestants remain (1 couple), crown them.
  // When more remain, eliminate the weakest couple and defer the finale —
  // no mass eliminations. The season naturally converges as each recouple
  // removes one couple at a time.
  if (isFinale) {
    const stillActive = cast.filter((a) => !newEliminated.includes(a.id))

    // True finale: exactly 2 active contestants → crown the winner
    if (stillActive.length <= 2 && activeCouples.length === 1) {
      return {
        eliminatedIds: newEliminated,
        couples: activeCouples,
        winnerCouple: activeCouples[0]!,
        graceExpiresAt: newGrace,
      }
    }

    // More than 1 couple remains: eliminate only the weakest couple
    if (activeCouples.length > 1) {
      const sorted = [...activeCouples].sort(
        (x, y) => pairScore(x.a, x.b) - pairScore(y.a, y.b)
      )
      const weakest = sorted[0]!
      newEliminated.push(weakest.a, weakest.b)
      delete newGrace[weakest.a]
      delete newGrace[weakest.b]
      activeCouples = activeCouples.filter(
        (c) => !((c.a === weakest.a && c.b === weakest.b) || (c.a === weakest.b && c.b === weakest.a))
      )

      // After removing the weakest, if 1 couple is left, crown them now
      if (activeCouples.length === 1) {
        return {
          eliminatedIds: newEliminated,
          couples: activeCouples,
          winnerCouple: activeCouples[0]!,
          graceExpiresAt: newGrace,
        }
      }
    } else if (activeCouples.length === 1) {
      // 1 couple but extra unpaired stragglers — eliminate the stragglers
      for (const agent of stillActive) {
        if (agent.id === activeCouples[0]!.a || agent.id === activeCouples[0]!.b) continue
        if (!newEliminated.includes(agent.id)) {
          newEliminated.push(agent.id)
          delete newGrace[agent.id]
        }
      }
      return {
        eliminatedIds: newEliminated,
        couples: activeCouples,
        winnerCouple: activeCouples[0]!,
        graceExpiresAt: newGrace,
      }
    } else {
      // No couples at all (edge case) — pair the two highest-attraction
      // active contestants and crown them
      let champion: { a: string; b: string } | null = null
      if (stillActive.length >= 2) {
        champion = { a: stillActive[0]!.id, b: stillActive[1]!.id }
        let best = pairScore(champion.a, champion.b)
        for (let i = 0; i < stillActive.length; i++) {
          for (let j = i + 1; j < stillActive.length; j++) {
            const score = pairScore(stillActive[i]!.id, stillActive[j]!.id)
            if (score > best) {
              best = score
              champion = { a: stillActive[i]!.id, b: stillActive[j]!.id }
            }
          }
        }
      }
      if (champion) {
        for (const agent of cast) {
          if (agent.id === champion.a || agent.id === champion.b) continue
          if (!newEliminated.includes(agent.id)) {
            newEliminated.push(agent.id)
            delete newGrace[agent.id]
          }
        }
        activeCouples = [champion]
      }
      return {
        eliminatedIds: newEliminated,
        couples: activeCouples,
        winnerCouple: champion,
        graceExpiresAt: newGrace,
      }
    }

    // Still more than 1 couple — no winner yet, keep going
    return {
      eliminatedIds: newEliminated,
      couples: activeCouples,
      winnerCouple: null,
      graceExpiresAt: newGrace,
    }
  }

  // ── NON-RECOUPLE SCENES ──
  if (sceneType !== 'recouple') {
    return {
      eliminatedIds: newEliminated,
      couples: activeCouples,
      winnerCouple: null,
      graceExpiresAt: newGrace,
    }
  }

  // ── GRACE RECOUPLE (ordinal 1) ──
  // No eliminations. Just carry state forward.
  if (recoupleOrdinal <= 1) {
    return {
      eliminatedIds: newEliminated,
      couples: activeCouples,
      winnerCouple: null,
      graceExpiresAt: newGrace,
    }
  }

  // ── ELIMINATION RECOUPLE (ordinal >= 2) ──
  // ONLY unpaired contestants (whose grace period expired) get eliminated.
  // Couples are SAFE at recouples — if you're in a couple, you survive.
  // Narrowing toward 1 couple happens organically via:
  //   - Defections (applyRecoupleDefections before this) — contestants leave
  //     their partner for a single when attraction is higher
  //   - Bombshell steals creating abandoned exes
  //   - Grace expiry when those exes don't re-couple in time
  // The finale's hard-elimination branch handles the final narrowing.
  const activeContestants = cast.filter((a) => !newEliminated.includes(a.id))
  const pairedIds = new Set<string>()
  for (const c of activeCouples) {
    pairedIds.add(c.a)
    pairedIds.add(c.b)
  }

  for (const agent of activeContestants) {
    if (pairedIds.has(agent.id)) {
      // Coupled contestants are safe at recouples. Clear any stale grace.
      delete newGrace[agent.id]
      continue
    }
    const graceExpiry = newGrace[agent.id]
    if (graceExpiry !== undefined && recoupleOrdinal < graceExpiry) {
      // Still protected — has more recouples to re-couple
      continue
    }
    // Unpaired, no grace → eliminated
    newEliminated.push(agent.id)
    delete newGrace[agent.id]
  }

  // Recompute activeCouples after eliminations (in case an agent's partner
  // was somehow also eliminated — shouldn't happen here but defensive).
  activeCouples = activeCouples.filter(
    (c) => !newEliminated.includes(c.a) && !newEliminated.includes(c.b)
  )

  // Do NOT set winnerCouple outside of the finale branch. If a mid-season
  // recouple happens to leave exactly 1 couple, the season should continue
  // to the scheduled finale scene where the winner is officially crowned.
  // Otherwise generateScene would early-exit on winnerCouple and skip the
  // finale scene entirely.
  return {
    eliminatedIds: newEliminated,
    couples: activeCouples,
    winnerCouple: null,
    graceExpiresAt: newGrace,
  }
}

// Safety cap: prevents runaway seasons. The season planner normally converges
// to a finale well before this, but this is a hard stop just in case.
const MAX_SCENES = 50

// Build the initial episode once, then derive the cast slot from it.
const INITIAL_EPISODE = createEpisode()

const DEFAULT_UI: UiState = {
  isCastOpen: false,
  isRelationshipsOpen: false,
  isScenarioPickerOpen: false,
  activeRelationshipMetric: 'attraction',
  lineDelayMs: 2200,
  tooltipsEnabled: true,
  musicEnabled: false,
  isPaused: false,
}

export const useVillaStore = create<VillaState>()(
  persist(
    (set, get) => ({
  cast: INITIAL_EPISODE.castPool,
  episode: INITIAL_EPISODE,
  currentSceneId: null,
  currentLineIndex: 0,
  isGenerating: false,
  lastError: null,
  generationProgress: null,
  sceneQueue: [],
  ui: { ...DEFAULT_UI },

  startNewEpisode: () => {
    // Archive high-importance reflections from the current season before
    // resetting. The new season's cast will inherit these via createEpisode.
    const prev = get()
    archiveSeasonWisdom(prev.episode, prev.cast)
    const newEpisode = createEpisode()
    set((s) => ({
      cast: newEpisode.castPool,
      episode: newEpisode,
      currentSceneId: null,
      currentLineIndex: 0,
      lastError: null,
      generationProgress: null,
      sceneQueue: [],
      ui: { ...s.ui, isPaused: false },
    }))
  },

  generateScene: async (type) => {
    const initial = get()
    if (initial.isGenerating) return
    if (initial.episode.winnerCouple) return
    // Safety cap: prevent runaway seasons (should rarely hit with the planner)
    if (initial.episode.scenes.length >= MAX_SCENES) return
    if (initial.ui.isPaused) return

    const activeCast = initial.cast.filter((a) => !initial.episode.eliminatedIds.includes(a.id))
    if (activeCast.length < 2) return

    const isIntroduction = initial.episode.scenes.length === 0
    // Finale triggers when only 2 active contestants (1 couple) remain
    const isFinaleScene = activeCast.length <= 2

    // Use the season planner state machine to determine scene type
    let sceneType = type ?? planNextScene({
      scenes: initial.episode.scenes,
      activeCastCount: activeCast.length,
      bombshellsIntroduced: initial.episode.bombshellsIntroduced.length,
      bombshellPoolSize: initial.episode.bombshellPool.length,
      coupleCount: initial.episode.couples.length,
      lastBombshellScene: initial.episode.lastBombshellScene,
      bombshellDatingUntilScene: initial.episode.bombshellDatingUntilScene,
      avgDramaScore: averageDramaScore(initial.episode.dramaScores),
    })

    // ── Scene-type-specific pre-computation ──
    let arrivingBombshell: Agent | undefined
    let arrivingBombshells: Agent[] = []
    let interviewSubjectId: string | undefined
    let competingCoupleIds: string[][] | undefined
    let forcedParticipants: string[] | undefined
    let isRewardDate = false
    let rewardDateCoupleIds: string[] | undefined
    let rewardDateCoupleNames: [string, string] | undefined

    // If the previous scene was a challenge with a challenge_win event, this
    // scene becomes a reward date for the winning couple.
    const prevScene = initial.episode.scenes[initial.episode.scenes.length - 1]
    if (sceneType === 'date' && prevScene?.type === 'challenge') {
      const winEvent = prevScene.systemEvents.find((e) => e.type === 'challenge_win')
      if (winEvent?.fromId && winEvent?.toId) {
        const aAgent = initial.cast.find((c) => c.id === winEvent.fromId)
        const bAgent = initial.cast.find((c) => c.id === winEvent.toId)
        if (aAgent && bAgent) {
          isRewardDate = true
          rewardDateCoupleIds = [winEvent.fromId, winEvent.toId]
          rewardDateCoupleNames = [aAgent.name, bAgent.name]
          forcedParticipants = rewardDateCoupleIds
        }
      }
    }

    if (sceneType === 'bombshell') {
      // Pick 1-2 unused bombshells from THIS SEASON's sampled pool.
      const unused = initial.episode.bombshellPool.filter(
        (b: Agent) => !initial.episode.bombshellsIntroduced.includes(b.id)
      )
      if (unused.length === 0) {
        sceneType = 'firepit'
      } else {
        const count = bombshellArrivalCount(
          initial.episode.bombshellsIntroduced.length,
          initial.episode.bombshellPool.length,
          activeCast.length
        )
        const shuffled = [...unused].sort(() => Math.random() - 0.5)
        arrivingBombshells = shuffled.slice(0, Math.min(count, shuffled.length))
        arrivingBombshell = arrivingBombshells[0]  // primary for backward compat
        forcedParticipants = [
          ...activeCast.map((a) => a.id),
          ...arrivingBombshells.map((b) => b.id),
        ]
      }
    }

    if (sceneType === 'interview') {
      // Drama-weighted pick: higher drama agents get more screen time.
      // Skip recently-interviewed agents to keep variety.
      const recentInterviewIds = new Set<string>()
      for (const s of initial.episode.scenes.slice(-8)) {
        if (s.type === 'interview' && s.participantIds[0]) {
          recentInterviewIds.add(s.participantIds[0])
        }
      }
      const eligible = activeCast.filter((a) => !recentInterviewIds.has(a.id))
      const pool = eligible.length > 0 ? eligible : activeCast
      // Rank by drama score — most dramatic characters get interviews first
      const ranked = rankByDrama(
        initial.episode.dramaScores,
        pool.map((a) => a.id)
      )
      // Weighted random: top-ranked more likely but not deterministic
      const weights = ranked.map((_, i) => ranked.length - i + 1)
      const totalW = weights.reduce((a, b) => a + b, 0)
      let r = Math.random() * totalW
      let pickedId = ranked[0]!
      for (let i = 0; i < ranked.length; i++) {
        r -= weights[i]!
        if (r <= 0) { pickedId = ranked[i]!; break }
      }
      interviewSubjectId = pickedId
      if (interviewSubjectId) {
        forcedParticipants = [interviewSubjectId]
      }
    }

    if (sceneType === 'minigame') {
      // Minigames include the ENTIRE active cast. Couples compete together,
      // singles are paired ad hoc for the game only (no state change). This
      // also ensures bombshells are always in minigames once they've arrived.
      const activeCouples = initial.episode.couples.filter(
        (c) => !initial.episode.eliminatedIds.includes(c.a) && !initial.episode.eliminatedIds.includes(c.b)
      )
      competingCoupleIds = activeCouples.map((c) => [c.a, c.b])
      forcedParticipants = activeCast.map((a) => a.id)
    }

    if (isIntroduction || isFinaleScene) {
      forcedParticipants = activeCast.map((a) => a.id)
    }

    // Use getSceneLabel so the first recouple of the season is titled
    // "First Coupling" instead of "Recoupling" — nobody is recoupling yet.
    const upcomingRecoupleOrdinal = sceneType === 'recouple'
      ? initial.episode.scenes.filter((s) => s.type === 'recouple').length + 1
      : 0
    const sceneInfo = getSceneLabel(sceneType, upcomingRecoupleOrdinal)
    const generationEpisodeId = initial.episode.id

    set({ isGenerating: true, lastError: null, generationProgress: { percent: 5, label: 'preparing scene...' } })

    try {
      const sceneNumber = initial.episode.scenes.length + 1

      // ── PRE-SCENE: retrieve relevant memories + policies per participant ──
      // Use this scene's actual forcedParticipants (when set) for the retrieval
      // query so each agent's query is specific to who they'll actually interact
      // with in this scene. Otherwise queries stay near-identical scene-to-scene
      // and memory retrieval keeps surfacing the same results.
      const retrievalParticipants = activeCast
      const sceneParticipantNames = forcedParticipants
        ? forcedParticipants
            .map((id) => activeCast.find((a) => a.id === id)?.name ?? id)
        : activeCast.map((a) => a.name)
      const agentMemories: Record<string, AgentMemory[]> = {}
      const agentGoals: Record<string, string> = {}
      const agentPolicies: Record<string, string> = {}
      if (!isIntroduction) {
        for (const agent of retrievalParticipants) {
          const brain = initial.episode.brains[agent.id]
          if (!brain) continue
          agentGoals[agent.id] = brain.goal
          agentPolicies[agent.id] = brain.policy
          if (brain.memories.length === 0) {
            agentMemories[agent.id] = []
            continue
          }
          // Per-agent jitter via current emotion so the query string varies.
          const emotion = initial.episode.emotions.find((e) => e.agentId === agent.id)
          const emotionTag = emotion ? ` (feeling ${emotion.primary})` : ''
          const otherNames = sceneParticipantNames.filter((n) => n !== agent.name)
          const query = buildRetrievalQuery({
            agentName: agent.name + emotionTag,
            otherParticipantNames: otherNames,
            sceneType,
            seasonTheme: initial.episode.seasonTheme,
          })
          try {
            agentMemories[agent.id] = await retrieveMemories(
              brain.memories,
              query,
              sceneNumber,
              MAX_RETRIEVED_MEMORIES
            )
          } catch (err) {
            console.warn('[memory] retrieval failed for', agent.id, err)
            agentMemories[agent.id] = []
          }
        }
      }

      const needsHost = isIntroduction || isFinaleScene || sceneType === 'bombshell' || sceneType === 'minigame' || sceneType === 'recouple' || sceneType === 'challenge'

      const prompt = buildScenePrompt({
        cast: activeCast,
        host: needsHost ? HOST : undefined,
        relationships: initial.episode.relationships,
        emotions: initial.episode.emotions,
        couples: initial.episode.couples,
        recentScenes: initial.episode.scenes.slice(-3),
        sceneType,
        seasonTheme: initial.episode.seasonTheme,
        sceneNumber,
        isIntroduction,
        isFinale: isFinaleScene,
        forcedParticipants,
        agentMemories,
        agentGoals,
        agentPolicies,
        arrivingBombshell,
        arrivingBombshells,
        interviewSubjectId,
        competingCoupleIds,
        isRewardDate,
        rewardDateCoupleNames,
      })

      // Scene generation accepts host + bombshell as valid ids alongside active cast
      const validSceneIds = [
        ...activeCast.map((a) => a.id),
        ...(needsHost ? [HOST.id] : []),
        ...arrivingBombshells.map((b) => b.id),
      ]
      // Key ensemble scenes: every cast member should react
      const ensembleScenes = ['minigame', 'challenge', 'recouple', 'bombshell']
      const requiredSpeakers = ensembleScenes.includes(sceneType)
        ? activeCast.map((a) => a.id)
        : undefined

      // Check scene queue first — if a pre-generated scene is available, use it
      let llm: LlmSceneResponse
      const queue = initial.sceneQueue
      if (queue.length > 0) {
        llm = queue[0]!
        set({ sceneQueue: queue.slice(1), generationProgress: { percent: 40, label: 'processing queued scene...' } })
      } else {
        set({ generationProgress: { percent: 10, label: 'writers room is working...' } })
        llm = await generateSceneFromLlm(prompt, validSceneIds, requiredSpeakers)
      }

      set({ generationProgress: { percent: 40, label: 'scene written, processing...' } })

      const fresh = get()
      if (fresh.episode.id !== generationEpisodeId) {
        set({ isGenerating: false })
        return
      }
      // User paused while we were fetching from the LLM. Drop the result so
      // the screen does not jump to a new scene behind their back. They will
      // re-trigger generation when they unpause.
      if (fresh.ui.isPaused) {
        set({ isGenerating: false })
        return
      }

      // Strip any system events involving the host — host is a narrator,
      // never coupled, never scored. Their dialogue lines are kept.
      const sanitizedLlm: LlmSceneResponse = {
        ...llm,
        systemEvents: llm.systemEvents.filter(
          (e) => e.fromId !== HOST.id && e.toId !== HOST.id
        ),
      }

      // Scene participants exclude the host (they're a narrator, not a contestant)
      const participantIds = Array.from(
        new Set(llm.dialogue.map((d) => d.agentId).filter((id) => id !== HOST.id))
      )

      const scene: Scene = {
        id: newId('scene'),
        type: sceneType,
        title: sceneInfo.title,
        participantIds,
        dialogue: llm.dialogue.map((d) => ({
          id: newId('line'),
          agentId: d.agentId,
          text: d.text,
          emotion: d.emotion,
          action: d.action,
          targetAgentId: d.targetAgentId,
        })),
        systemEvents: sanitizedLlm.systemEvents.map((e) => ({
          id: newId('evt'),
          type: e.type,
          fromId: e.fromId,
          toId: e.toId,
          delta: e.delta,
          label: e.label,
        })),
        outcome: llm.outcome,
        createdAt: Date.now(),
      }

      // ── BOMBSHELL INJECTION ──
      // If this is a bombshell scene, expand the relationships matrix and
      // register the new brain + extend the cast BEFORE applying deltas,
      // so the LLM's couple_formed / attraction_change events for the new
      // contestant actually land on real relationship rows.
      let preDeltaRels = fresh.episode.relationships
      let dynamicCast = fresh.cast
      let nextBrainsBase: Record<string, AgentBrain> = { ...fresh.episode.brains }
      let nextActiveCastIds = [...fresh.episode.activeCastIds]
      let nextBombshellsIntroduced = [...fresh.episode.bombshellsIntroduced]

      if (sceneType === 'bombshell' && arrivingBombshells.length > 0) {
        // Inject ALL arriving bombshells (1 or 2)
        // Track already-seeded IDs to avoid duplicate relationship rows between co-arriving bombshells
        const alreadySeededIds = new Set<string>()
        for (const bombshell of arrivingBombshells) {
          const existingIds = [...activeCast.map((a) => a.id), ...alreadySeededIds].filter((id) => id !== bombshell.id)
          const newRels = seedRelationshipsForNewAgent(bombshell.id, existingIds)
          alreadySeededIds.add(bombshell.id)
          preDeltaRels = [...preDeltaRels, ...newRels]
          dynamicCast = [...dynamicCast, bombshell]
          nextActiveCastIds = [...nextActiveCastIds, bombshell.id]
          nextBombshellsIntroduced = [...nextBombshellsIntroduced, bombshell.id]
          nextBrainsBase[bombshell.id] = {
            agentId: bombshell.id,
            memories: [],
            goal: '',
            policy: '',
            personalityShift: '',
            rewards: [],
            cumulativeReward: 0,
            lastReflectionScene: 0,
          }
        }
      }

      let { rels, emotions, couples } = applyDeltas(
        preDeltaRels,
        fresh.episode.emotions,
        fresh.episode.couples,
        sanitizedLlm
      )

      set({ generationProgress: { percent: 50, label: 'analyzing relationships...' } })
      // ── STAT INFERENCE ──
      // The LLM is inconsistent about emitting explicit relationship events.
      // Read the scene's dialogue + emotions + actions + couple context and
      // derive additional per-pair deltas so relationship stats actually
      // move from every interaction, not just the ones the LLM tagged.
      // This runs AFTER applyDeltas so LLM-explicit events take precedence.
      const inferredDeltas = inferStatDeltas(
        // Build a scene-shape object just for inference (no id/title needed)
        {
          id: 'inference-temp',
          type: sceneType,
          title: '',
          participantIds,
          dialogue: scene.dialogue,
          systemEvents: scene.systemEvents,
          outcome: scene.outcome,
          createdAt: Date.now(),
        },
        rels,
        couples
      )
      rels = applyInferredDeltas(rels, inferredDeltas)

      // ── BOMBSHELL DATING PERIOD ──
      // Bombshells do NOT immediately couple. They arrive single and get a
      // dating period (2-3 scenes) to explore chemistry before the next
      // recouple forces them to couple up or leave. The LLM may still emit
      // couple_formed if the narrative calls for it, but we don't force it.
      // Track the dating window so the season planner schedules dates.

      // ── RECOUPLE DEFECTION + FORCE-PAIR SAFETY NET ──
      // On recouples (not finale), first apply defections: coupled contestants
      // with meaningfully higher attraction to a single can leave their partner
      // for the single. This gives singles a real chance to bounce back.
      // Then force-pair any remaining unpaired contestants deterministically
      // so the season always progresses.
      const shouldRecouple = sceneType === 'recouple' && !isFinaleScene
      const couplesBeforeDefections = couples.map((c) => ({ ...c }))
      if (shouldRecouple) {
        couples = applyRecoupleDefections(couples, dynamicCast, rels, fresh.episode.eliminatedIds)
        // NOTE: forcePairUnpaired moved to AFTER applyEliminations so singles
        // can actually be eliminated. Previously it ran here, pairing everyone
        // before eliminations could check for unpaired contestants.
      }
      if (isFinaleScene) {
        couples = applyRecoupleDefections(couples, dynamicCast, rels, fresh.episode.eliminatedIds)
      }

      // Recouple ordinal: 1 = grace, 2 = first elim, etc. Computed as the
      // count of recouple scenes up to AND including this one (if it is a
      // recouple). Non-recouple scenes pass ordinal 0.
      const recoupleOrdinal = sceneType === 'recouple'
        ? fresh.episode.scenes.filter((s) => s.type === 'recouple').length + 1
        : 0

      // Grace protection helper: grants 2 recouple rounds of immunity.
      const currentRecouples = fresh.episode.scenes.filter((s) => s.type === 'recouple').length
      const preElimGrace = { ...fresh.episode.graceExpiresAt }
      function grantGrace(agentId: string) {
        preElimGrace[agentId] = currentRecouples + 3 // survives rounds currentRecouples+1 and +2
      }

      // If any bombshell just stole a partner, the abandoned ex gets grace.
      if (sceneType === 'bombshell' && arrivingBombshells.length > 0) {
        for (const bombshell of arrivingBombshells) {
          const bombshellCouple = couples.find(
            (c) => c.a === bombshell.id || c.b === bombshell.id
          )
          if (bombshellCouple) {
            const targetId = bombshellCouple.a === bombshell.id ? bombshellCouple.b : bombshellCouple.a
            const prevCouple = fresh.episode.couples.find(
              (c) => (c.a === targetId || c.b === targetId) && c.a !== bombshell.id && c.b !== bombshell.id
            )
            if (prevCouple) {
              const exId = prevCouple.a === targetId ? prevCouple.b : prevCouple.a
              if (exId && exId !== targetId) {
                grantGrace(exId)
              }
            }
          }
        }
      }

      // Bombshells arrive single — grant them grace so they survive their
      // dating period (2-3 scenes) without being eliminated at the next recouple.
      if (sceneType === 'bombshell' && arrivingBombshells.length > 0) {
        for (const bombshell of arrivingBombshells) {
          grantGrace(bombshell.id)
        }
      }

      // Grant grace to partners abandoned by defections. If someone was
      // coupled before defections but is now unpaired (and not eliminated),
      // they get the same 2-recouple grace so they aren't immediately dumped.
      if (shouldRecouple || isFinaleScene) {
        const previouslyPaired = new Set<string>()
        for (const c of couplesBeforeDefections) {
          previouslyPaired.add(c.a)
          previouslyPaired.add(c.b)
        }
        const nowPaired = new Set<string>()
        for (const c of couples) {
          nowPaired.add(c.a)
          nowPaired.add(c.b)
        }
        for (const id of previouslyPaired) {
          if (!nowPaired.has(id) && !fresh.episode.eliminatedIds.includes(id)) {
            grantGrace(id)
          }
        }
      }

      const elim = applyEliminations(
        dynamicCast,
        couples,
        fresh.episode.eliminatedIds,
        sceneType,
        recoupleOrdinal,
        isFinaleScene,
        rels,
        preElimGrace
      )

      // Force-pair any remaining unpaired survivors AFTER eliminations.
      // This safety net ensures the season can always progress — any singles
      // who survived (via grace) get paired by highest mutual attraction.
      let finalCouples = elim.couples
      if (shouldRecouple || isFinaleScene) {
        finalCouples = forcePairUnpaired(dynamicCast, elim.couples, rels, elim.eliminatedIds)
      }

      const nextLocations = computeLocations(
        dynamicCast,
        elim.eliminatedIds,
        participantIds,
        sceneType,
        fresh.episode.locations
      )

      // Update active cast ids to drop anyone eliminated this scene
      nextActiveCastIds = nextActiveCastIds.filter((id) => !elim.eliminatedIds.includes(id))

      // ── RL REWARD SIGNAL ──
      // Compute per-agent rewards from this scene's state transitions and
      // fold them into each agent's brain. This is the signal the reflection
      // step will use to propose a policy update.
      const eliminatedThisScene = elim.eliminatedIds.filter(
        (id) => !fresh.episode.eliminatedIds.includes(id)
      )
      const scoringActiveIds = sceneType === 'bombshell' && arrivingBombshells.length > 0
        ? [...activeCast.map((a) => a.id), ...arrivingBombshells.map((b) => b.id)]
        : activeCast.map((a) => a.id)
      const rewardsByAgent = computeSceneRewards({
        scene,
        sceneNumber,
        activeCastIds: scoringActiveIds,
        prevCouples: fresh.episode.couples,
        newCouples: finalCouples,
        eliminatedThisScene,
        isFinale: isFinaleScene,
        winnerCouple: elim.winnerCouple,
        arrivingBombshellId: arrivingBombshell?.id,
        soloSinceBombshell: fresh.episode.soloSinceBombshell,
        isRewardDate,
        rewardDateCoupleIds,
      })

      // ── Update soloSinceBombshell map for next scene ──
      // 1. If this is a bombshell scene: mark the abandoned ex as solo.
      // 2. Remove anyone who is now paired (including newly paired this scene).
      // 3. Remove anyone who was eliminated this scene.
      const nextSoloSinceBombshell: Record<string, number> = { ...fresh.episode.soloSinceBombshell }
      if (sceneType === 'bombshell' && arrivingBombshells.length > 0) {
        for (const bombshell of arrivingBombshells) {
          const bombshellPartner = finalCouples.find(
            (c) => c.a === bombshell.id || c.b === bombshell.id
          )
          if (bombshellPartner) {
            const targetId = bombshellPartner.a === bombshell.id ? bombshellPartner.b : bombshellPartner.a
            const abandonedEx = fresh.episode.couples.find(
              (c) => (c.a === targetId || c.b === targetId) && c.a !== bombshell.id && c.b !== bombshell.id
            )
            if (abandonedEx) {
              const exId = abandonedEx.a === targetId ? abandonedEx.b : abandonedEx.a
              if (exId && exId !== targetId) {
                nextSoloSinceBombshell[exId] = sceneNumber
              }
            }
          }
        }
      }
      // Clear anyone now paired or eliminated
      for (const id of Object.keys(nextSoloSinceBombshell)) {
        if (elim.eliminatedIds.includes(id)) {
          delete nextSoloSinceBombshell[id]
          continue
        }
        const nowPaired = finalCouples.some((c) => c.a === id || c.b === id)
        if (nowPaired) {
          delete nextSoloSinceBombshell[id]
        }
      }

      // Fold rewards into the brains
      for (const [agentId, events] of Object.entries(rewardsByAgent)) {
        const brain = nextBrainsBase[agentId]
        if (!brain) continue
        const updatedRewards = [...brain.rewards, ...events]
        nextBrainsBase = {
          ...nextBrainsBase,
          [agentId]: {
            ...brain,
            rewards: updatedRewards,
            cumulativeReward: sumRewards(updatedRewards),
          },
        }
      }

      // Pause guard before long post-processing begins. If the user paused
      // between the scene LLM call and here, bail out without committing so
      // the screen doesn't jump forward.
      if (get().ui.isPaused) {
        set({ isGenerating: false })
        return
      }

      set({ generationProgress: { percent: 65, label: 'extracting memories...' } })
      // ── POST-SCENE: extract observations for each participant, embed, store ──
      // Observe from every INTENDED participant's POV, not just agents who
      // happened to have a dialogue line. If the LLM forgot to give the
      // bombshell a line, they still witnessed the scene and should form
      // memories of it.
      const observingIds = new Set<string>([
        ...participantIds,
        ...(forcedParticipants ?? []),
      ])
      const sceneParticipantAgents = dynamicCast.filter((a) => observingIds.has(a.id))
      let nextBrains: Record<string, AgentBrain> = nextBrainsBase
      try {
        // Pass each participant's prior memories AND current policy so the
        // extraction LLM filters observations through each agent's character.
        const prevMemoriesByAgent: Record<string, AgentMemory[]> = {}
        const policiesByAgent: Record<string, string> = {}
        for (const agent of sceneParticipantAgents) {
          const brain = nextBrainsBase[agent.id]
          prevMemoriesByAgent[agent.id] = brain?.memories ?? []
          policiesByAgent[agent.id] = brain?.policy ?? ''
        }
        const observations = await extractObservationsForScene({
          participants: sceneParticipantAgents,
          dialogue: scene.dialogue,
          outcome: scene.outcome,
          prevMemoriesByAgent,
          policiesByAgent,
        })

        // Embed each observation. Sequential — Ollama serializes per model.
        for (const obs of observations) {
          let embedding: number[]
          try {
            embedding = await embed(obs.content)
          } catch (err) {
            console.warn('[memory] embed failed for observation, skipping:', err)
            continue
          }
          const memory: AgentMemory = {
            id: newId('mem'),
            agentId: obs.agentId,
            sceneId: scene.id,
            sceneNumber,
            timestamp: Date.now(),
            type: 'observation',
            content: obs.content,
            importance: obs.importance,
            embedding,
            relatedAgentIds: obs.relatedAgentIds,
          }
          const brain = nextBrains[obs.agentId]
          if (brain) {
            nextBrains = {
              ...nextBrains,
              [obs.agentId]: { ...brain, memories: [...brain.memories, memory] },
            }
          }
        }
      } catch (err) {
        console.warn('[memory] observation extraction failed:', err)
      }

      set({ generationProgress: { percent: 80, label: 'agents reflecting...' } })
      // ── PERIODIC REFLECTION (RL POLICY UPDATE) ──
      // Every REFLECTION_INTERVAL scenes, each active contestant looks at
      // their reward trajectory + recent memories and synthesizes both an
      // insight AND a new policy (strategy label). The updated policy is
      // injected into future scene prompts and shapes behavior.
      const shouldReflect =
        sceneNumber >= REFLECTION_INTERVAL &&
        sceneNumber % REFLECTION_INTERVAL === 0 &&
        !isIntroduction
      // Another pause check before the (potentially slow) reflection call
      if (get().ui.isPaused) {
        set({ isGenerating: false })
        return
      }
      if (shouldReflect) {
        try {
          const activeForReflection = dynamicCast.filter((a) => !elim.eliminatedIds.includes(a.id))
          const memoriesByAgent: Record<string, AgentMemory[]> = {}
          const currentGoals: Record<string, string> = {}
          const currentPolicies: Record<string, string> = {}
          const rewardTrajectories: Record<string, RewardEvent[]> = {}
          for (const agent of activeForReflection) {
            const brain = nextBrains[agent.id]
            const recent = (brain?.memories ?? []).slice(-10)
            memoriesByAgent[agent.id] = recent
            currentGoals[agent.id] = brain?.goal ?? ''
            currentPolicies[agent.id] = brain?.policy ?? ''
            // Recent rewards — limit to last 15 for prompt size
            rewardTrajectories[agent.id] = (brain?.rewards ?? []).slice(-15)
          }

          const reflections = await reflectAcrossAgents({
            cast: activeForReflection,
            memoriesByAgent,
            currentGoals,
            currentPolicies,
            rewardTrajectories,
          })

          for (const r of reflections) {
            let embedding: number[]
            try {
              embedding = await embed(r.insight)
            } catch (err) {
              console.warn('[memory] embed failed for reflection, skipping:', err)
              continue
            }
            const reflectionMemory: AgentMemory = {
              id: newId('mem'),
              agentId: r.agentId,
              sceneId: scene.id,
              sceneNumber,
              timestamp: Date.now(),
              type: 'reflection',
              content: r.insight,
              importance: r.importance,
              embedding,
              relatedAgentIds: [],
            }
            const brain = nextBrains[r.agentId]
            if (brain) {
              nextBrains = {
                ...nextBrains,
                [r.agentId]: {
                  ...brain,
                  memories: [...brain.memories, reflectionMemory],
                  goal: r.newGoal || brain.goal,
                  policy: r.newPolicy || brain.policy,
                  lastReflectionScene: sceneNumber,
                },
              }
            }
          }
        } catch (err) {
          console.warn('[memory] reflection failed:', err)
        }
      }

      set({ generationProgress: { percent: 95, label: 'finalizing scene...' } })
      // Final pause check before committing
      if (get().ui.isPaused) {
        set({ isGenerating: false })
        return
      }

      // ── DRAMA SCORES ──
      const nextDramaScores = updateDramaScores(scene, fresh.episode.dramaScores)

      // ── SEASON PHASE + BOMBSHELL DATING TRACKING ──
      const nextScenes = [...fresh.episode.scenes, scene]
      let nextLastBombshellScene = fresh.episode.lastBombshellScene
      let nextBombshellDatingUntil = fresh.episode.bombshellDatingUntilScene
      if (sceneType === 'bombshell' && arrivingBombshell) {
        nextLastBombshellScene = nextScenes.length - 1
        nextBombshellDatingUntil = nextScenes.length + 2 // 2 more scenes of dating
      }
      // Clear dating window once we pass it
      if (nextBombshellDatingUntil !== null && nextScenes.length >= nextBombshellDatingUntil) {
        nextBombshellDatingUntil = null
      }
      const nextPhase = getSeasonPhase({
        scenes: nextScenes,
        activeCastCount: nextActiveCastIds.length,
        bombshellsIntroduced: nextBombshellsIntroduced.length,
        bombshellPoolSize: fresh.episode.bombshellPool.length,
        coupleCount: finalCouples.length,
        lastBombshellScene: nextLastBombshellScene,
        bombshellDatingUntilScene: nextBombshellDatingUntil,
        avgDramaScore: averageDramaScore(nextDramaScores),
      })

      set({
        cast: dynamicCast,
        episode: {
          ...fresh.episode,
          scenes: nextScenes,
          relationships: rels,
          emotions,
          couples: finalCouples,
          eliminatedIds: elim.eliminatedIds,
          winnerCouple: elim.winnerCouple,
          locations: nextLocations,
          brains: nextBrains,
          activeCastIds: nextActiveCastIds,
          bombshellsIntroduced: nextBombshellsIntroduced,
          soloSinceBombshell: nextSoloSinceBombshell,
          graceExpiresAt: elim.graceExpiresAt,
          dramaScores: nextDramaScores,
          seasonPhase: nextPhase,
          lastBombshellScene: nextLastBombshellScene,
          bombshellDatingUntilScene: nextBombshellDatingUntil,
          updatedAt: Date.now(),
        },
        currentSceneId: scene.id,
        currentLineIndex: 0,
        isGenerating: false,
        generationProgress: null,
      })

      // ── BACKGROUND PREFETCH ──
      // After committing a scene, prefetch the next 2 scenes into the queue
      // if the next scene is a "chill" type (not recouple, bombshell, finale).
      // This is non-blocking — failures are silent.
      const postState = get()
      const chillTypes = new Set(['firepit', 'pool', 'kitchen', 'bedroom', 'date'])
      const postActiveCast = postState.cast.filter((a) => !postState.episode.eliminatedIds.includes(a.id))
      if (
        postState.sceneQueue.length === 0 &&
        !postState.episode.winnerCouple &&
        postActiveCast.length > 4 &&
        !postState.ui.isPaused
      ) {
        const predictedNext = planNextScene({
          scenes: postState.episode.scenes,
          activeCastCount: postActiveCast.length,
          bombshellsIntroduced: postState.episode.bombshellsIntroduced.length,
          bombshellPoolSize: postState.episode.bombshellPool.length,
          coupleCount: postState.episode.couples.length,
          lastBombshellScene: postState.episode.lastBombshellScene,
          bombshellDatingUntilScene: postState.episode.bombshellDatingUntilScene,
          avgDramaScore: averageDramaScore(postState.episode.dramaScores),
        })
        if (chillTypes.has(predictedNext)) {
          // Build a lightweight prompt for chill scenes and batch-generate
          const batchPrompt = buildScenePrompt({
            cast: postActiveCast,
            relationships: postState.episode.relationships,
            emotions: postState.episode.emotions,
            couples: postState.episode.couples,
            recentScenes: postState.episode.scenes.slice(-3),
            sceneType: predictedNext,
            seasonTheme: postState.episode.seasonTheme,
            sceneNumber: postState.episode.scenes.length + 1,
            isIntroduction: false,
            isFinale: false,
          })
          const batchIds = postActiveCast.map((a) => a.id)
          generateBatchFromLlm(batchPrompt, batchIds)
            .then((batch) => {
              // Only populate queue if we're still in the same episode
              if (get().episode.id === postState.episode.id && get().sceneQueue.length === 0) {
                // First scene in batch will be consumed next, rest go to queue
                set({ sceneQueue: batch.scenes.slice(0, 2) })
              }
            })
            .catch(() => { /* prefetch failure is silent */ })
        }
      }
    } catch (err) {
      const raw = err instanceof Error ? err.message : 'Unknown error'
      // Redact API keys / tokens that may appear in provider error responses
      // but keep plain URLs (e.g. Ollama host) since they help with debugging.
      const safe = raw.replace(/[?&](key|token|api_key|apikey)=[^\s&]+/gi, '?$1=[redacted]').replace(/\b(key|token|api_key|apikey)[=:]\s*\S+/gi, '$1=[redacted]')
      set({
        isGenerating: false,
        lastError: safe,
        generationProgress: null,
      })
    }
  },

  advanceLine: () => {
    const state = get()
    const scene = state.episode.scenes.find((s) => s.id === state.currentSceneId)
    if (!scene) return
    if (state.currentLineIndex < scene.dialogue.length - 1) {
      set({ currentLineIndex: state.currentLineIndex + 1 })
    }
  },

  resetLineIndex: () => set({ currentLineIndex: 0 }),

  toggleCast: () => set((s) => ({ ui: { ...s.ui, isCastOpen: !s.ui.isCastOpen } })),

  toggleRelationships: () => set((s) => ({ ui: { ...s.ui, isRelationshipsOpen: !s.ui.isRelationshipsOpen } })),

  setRelationshipMetric: (m) => set((s) => ({ ui: { ...s.ui, activeRelationshipMetric: m } })),

  selectScene: (sceneId) => {
    const state = get()
    const scene = state.episode.scenes.find((s) => s.id === sceneId)
    const lineIdx = scene ? Math.max(0, scene.dialogue.length - 1) : 0
    set({ currentSceneId: sceneId, currentLineIndex: lineIdx })
  },

  toggleTooltips: () => set((s) => ({ ui: { ...s.ui, tooltipsEnabled: !s.ui.tooltipsEnabled } })),

  toggleMusic: () => set((s) => ({ ui: { ...s.ui, musicEnabled: !s.ui.musicEnabled } })),

  togglePause: () => set((s) => ({ ui: { ...s.ui, isPaused: !s.ui.isPaused } })),

  exportSeasonData: () => {
    const { episode, cast } = get()
    const data = buildSeasonExport(episode, cast)
    downloadJson(data, `villa-ai-season-${episode.number}.json`)
    // Cache in localStorage (last 5)
    try {
      const key = 'villa-ai-exports'
      const existing = JSON.parse(localStorage.getItem(key) ?? '[]') as unknown[]
      existing.push(data)
      while (existing.length > 5) existing.shift()
      localStorage.setItem(key, JSON.stringify(existing))
    } catch { /* quota exceeded — skip caching */ }
  },

  exportRLData: () => {
    const { episode, cast } = get()
    const data = buildRLExport(episode, cast)
    downloadJson(data, `villa-ai-rl-season-${episode.number}.json`)
  },
}),
    {
      name: 'villa-ai-state',
      // Only persist game state, not transient UI or generation flags.
      // Embeddings in memories make the payload large, so we strip them
      // on save and regenerate lazily on next retrieval if needed.
      partialize: (state) => {
        // Strip embeddings from memories to keep localStorage under quota.
        // Embeddings are large float arrays (768 dims) that aren't needed for
        // playback — they're only used for memory retrieval during generation.
        const strippedBrains: Record<string, AgentBrain> = {}
        for (const [id, brain] of Object.entries(state.episode.brains)) {
          strippedBrains[id] = {
            ...brain,
            memories: brain.memories.map((m) => ({ ...m, embedding: [] })),
          }
        }
        return {
          cast: state.cast,
          episode: { ...state.episode, brains: strippedBrains },
          currentSceneId: state.currentSceneId,
          currentLineIndex: state.currentLineIndex,
        }
      },
      merge: (persisted, current) => {
        const saved = persisted as Partial<VillaState> | undefined
        if (!saved?.episode || !saved.cast || saved.episode.scenes.length === 0) {
          return current  // no meaningful state to restore
        }
        // Sync the module-level season counter so the next "new season"
        // continues numbering from where the restored season left off.
        seasonCounter = saved.episode.number ?? seasonCounter
        return {
          ...current,
          cast: saved.cast,
          episode: saved.episode,
          currentSceneId: saved.currentSceneId ?? null,
          currentLineIndex: saved.currentLineIndex ?? 0,
          // Always reset transient state on reload
          isGenerating: false,
          lastError: null,
          generationProgress: null,
          sceneQueue: [],
          ui: { ...DEFAULT_UI },
        }
      },
    }
  )
)
