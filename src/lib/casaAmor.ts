import type { Agent, Couple, Relationship, Scene, CoupleArchetype, StickOrSwitchChoice } from '@/types'
import { generateCast } from './castGenerator'

export function classifyCoupleArchetype(
  couple: Couple | null | undefined,
  relationships: Relationship[],
  scenes: Scene[],
): CoupleArchetype {
  if (!couple) return 'singleton'
  const ab = relationships.find((r) => r.fromId === couple.a && r.toId === couple.b)
  const ba = relationships.find((r) => r.fromId === couple.b && r.toId === couple.a)

  const avgTrust = ((ab?.trust ?? 0) + (ba?.trust ?? 0)) / 2
  const avgAttraction = ((ab?.attraction ?? 0) + (ba?.attraction ?? 0)) / 2
  const avgCompat = ((ab?.compatibility ?? 40) + (ba?.compatibility ?? 40)) / 2

  // Mom & Dad: rock solid
  if (avgTrust > 65 && avgCompat > 60 && avgAttraction > 50) {
    return 'mom_and_dad'
  }

  // Friend Couple: low attraction but decent trust. Only classify as friend-couple
  // variants if at least ONE partner has a stronger pull to someone else — otherwise
  // they're just a low-spark but loyal couple and should fall through to later checks.
  if (avgAttraction < 35 && avgTrust > 40) {
    const aHasExternalCrush = relationships
      .filter((r) => r.fromId === couple.a && r.toId !== couple.b)
      .some((r) => r.attraction > avgAttraction + 15)
    const bHasExternalCrush = relationships
      .filter((r) => r.fromId === couple.b && r.toId !== couple.a)
      .some((r) => r.attraction > avgAttraction + 15)

    if (aHasExternalCrush && bHasExternalCrush) return 'friend_couple'
    if (aHasExternalCrush || bHasExternalCrush) return 'friend_couple_incognito'
    // else fall through: they're just quietly loyal
  }

  // Star-Crossed: high attraction but haven't been coupled long or had bombshell threats.
  // Walk scenes in reverse to find the most recent couple_formed — reference equality
  // would break after any serialization round-trip (e.g. Firebase sync).
  let mostRecentFormedIdx = -1
  for (let i = scenes.length - 1; i >= 0; i--) {
    const formed = scenes[i]!.systemEvents.some((e) =>
      e.type === 'couple_formed' &&
      ((e.fromId === couple.a && e.toId === couple.b) || (e.fromId === couple.b && e.toId === couple.a))
    )
    if (formed) { mostRecentFormedIdx = i; break }
  }
  const scenesSinceCoupled = mostRecentFormedIdx >= 0
    ? scenes.length - mostRecentFormedIdx - 1
    : scenes.length

  if (avgAttraction > 55 && scenesSinceCoupled < 5) {
    return 'star_crossed'
  }

  // Default to mom_and_dad if stats are generally positive
  if (avgAttraction > 45 && avgTrust > 45) return 'mom_and_dad'

  return 'star_crossed'
}

export function generateCasaAmorCast(existingIds: string[]): Agent[] {
  // Generate enough for temptation but not so many they bloat the cast
  // In the real show, most Casa Amor people get dumped at stick/switch
  const count = Math.min(4, Math.max(3, Math.floor(existingIds.length / 3)))
  return generateCast(count, existingIds)
}

export function splitVilla(
  activeCast: Agent[],
  couples: Couple[]
): { villaGroupIds: string[]; casaAmorGroupIds: string[] } {
  const half = Math.ceil(activeCast.length / 2)
  const villaGroupIds: string[] = []
  const casaAmorGroupIds: string[] = []
  const assigned = new Set<string>()

  // Split couples across villas for drama
  for (const couple of couples) {
    if (assigned.has(couple.a) || assigned.has(couple.b)) continue
    if (villaGroupIds.length < half) {
      villaGroupIds.push(couple.a)
      casaAmorGroupIds.push(couple.b)
    } else {
      casaAmorGroupIds.push(couple.a)
      villaGroupIds.push(couple.b)
    }
    assigned.add(couple.a)
    assigned.add(couple.b)
  }

  // Assign remaining singles
  for (const agent of activeCast) {
    if (assigned.has(agent.id)) continue
    if (villaGroupIds.length < half) {
      villaGroupIds.push(agent.id)
    } else {
      casaAmorGroupIds.push(agent.id)
    }
    assigned.add(agent.id)
  }

  return { villaGroupIds, casaAmorGroupIds }
}

export function computeStickOrSwitchChoices(
  activeCast: Agent[],
  couples: Couple[],
  relationships: Relationship[],
  casaAmorCast: Agent[],
  scenes: Scene[]
): StickOrSwitchChoice[] {
  const choices: StickOrSwitchChoice[] = []
  const takenCasaIds = new Set<string>()

  for (const agent of activeCast) {
    const couple = couples.find((c) => c.a === agent.id || c.b === agent.id)
    if (!couple) {
      // Singleton — always switch to the best available Casa Amor person
      const bestCasa = findBestCasaMatch(agent.id, casaAmorCast, relationships, takenCasaIds)
      if (bestCasa) {
        takenCasaIds.add(bestCasa)
        choices.push({ ogIslanderId: agent.id, choice: 'switch', newPartnerId: bestCasa })
      } else {
        choices.push({ ogIslanderId: agent.id, choice: 'stick' })
      }
      continue
    }

    const archetype = classifyCoupleArchetype(couple, relationships, scenes)
    const roll = Math.random()

    let willSwitch = false
    if (archetype === 'mom_and_dad') willSwitch = roll < 0.1
    else if (archetype === 'friend_couple') willSwitch = roll < 0.7
    else if (archetype === 'friend_couple_incognito') willSwitch = roll < 0.6
    else if (archetype === 'star_crossed') willSwitch = roll < 0.5

    if (willSwitch) {
      const bestCasa = findBestCasaMatch(agent.id, casaAmorCast, relationships, takenCasaIds)
      if (bestCasa) {
        takenCasaIds.add(bestCasa)
        choices.push({ ogIslanderId: agent.id, choice: 'switch', newPartnerId: bestCasa })
      } else {
        choices.push({ ogIslanderId: agent.id, choice: 'stick' })
      }
    } else {
      choices.push({ ogIslanderId: agent.id, choice: 'stick' })
    }
  }

  return choices
}

function findBestCasaMatch(
  agentId: string,
  casaAmorCast: Agent[],
  relationships: Relationship[],
  takenIds: Set<string>
): string | null {
  const available = casaAmorCast.filter((a) => !takenIds.has(a.id))
  if (available.length === 0) return null

  let bestId = available[0]!.id
  let bestScore = -Infinity
  for (const casa of available) {
    const rel = relationships.find((r) => r.fromId === agentId && r.toId === casa.id)
    const score = (rel?.attraction ?? 30) + (rel?.compatibility ?? 30) + Math.random() * 15
    if (score > bestScore) {
      bestScore = score
      bestId = casa.id
    }
  }
  return bestId
}

export function resolveStickOrSwitch(
  choices: StickOrSwitchChoice[],
  originalCouples: Couple[],
  casaAmorCast: Agent[]
): {
  newCouples: Couple[]
  eliminatedIds: string[]
} {
  const newCouples: Couple[] = []
  const chosenCasaIds = new Set<string>()

  // Process choices
  for (const choice of choices) {
    if (choice.choice === 'switch' && choice.newPartnerId) {
      newCouples.push({ a: choice.ogIslanderId, b: choice.newPartnerId })
      chosenCasaIds.add(choice.newPartnerId)
    }
  }

  // Stick pairs: reform original couple if BOTH stuck
  for (const original of originalCouples) {
    const choiceA = choices.find((c) => c.ogIslanderId === original.a)
    const choiceB = choices.find((c) => c.ogIslanderId === original.b)
    if (choiceA?.choice === 'stick' && choiceB?.choice === 'stick') {
      newCouples.push({ a: original.a, b: original.b })
    }
    // If one stuck but the other switched, the sticker is now single (dramatic!)
  }

  // Eliminate Casa Amor people who weren't chosen
  const eliminatedIds = casaAmorCast
    .filter((a) => !chosenCasaIds.has(a.id))
    .map((a) => a.id)

  return { newCouples, eliminatedIds }
}
