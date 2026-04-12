// Reward function for the RL-style learning loop.
//
// This is not gradient-based RL — we aren't training weights. What we ARE
// doing is building a reward signal that every agent can observe, so that
// during reflection the LLM can synthesize a POLICY UPDATE for each agent
// based on which past actions produced positive vs negative rewards.
//
// This is the same pattern as "in-context policy iteration": the reward
// trajectory is fed back into the prompt, the LLM proposes a new policy,
// and future scenes condition on that policy. No gradients, but a real
// closed-loop learning signal.
//
// Reward values are tuned so that:
//   - being coupled is the default positive signal (+5/scene)
//   - forming a new bond is a strong boost (+15)
//   - winning a minigame rewards the whole couple (+20)
//   - surviving a bombshell (keeping your partner) is a big win (+12)
//   - being abandoned for a bombshell stings (-18)
//   - being dumped from the villa is terminal (-40)
//   - the finale winning couple gets a season-ending windfall (+60)

import type { Couple, Scene, SystemEvent, RewardEvent } from '@/types'
import { newId } from './ids'

export interface RewardContext {
  scene: Scene
  sceneNumber: number
  activeCastIds: string[]           // who's in the villa BEFORE this scene's eliminations
  prevCouples: Couple[]             // couples before this scene
  newCouples: Couple[]              // couples after applyDeltas
  eliminatedThisScene: string[]     // agents eliminated during this scene
  isFinale: boolean
  winnerCouple: Couple | null
  arrivingBombshellId?: string      // bombshell scenes only — used to identify abandoned ex
  // Map of agentId → sceneNumber when their partner was stolen by a bombshell.
  // Agents in this map who are still unpaired get a per-scene solo penalty.
  soloSinceBombshell: Record<string, number>
  // True when this is a date scene specifically following a challenge win —
  // the members of the winning couple get a small extra reward for enjoying it.
  isRewardDate?: boolean
  rewardDateCoupleIds?: string[]   // the two ids on the reward date, if applicable
}

const REWARD = {
  COUPLED_BASELINE: 5,
  NEW_COUPLE_FORMED: 15,
  BROKE_PREVIOUS_COUPLE: -8,
  MINIGAME_WIN: 20,
  CHALLENGE_WIN: 35,    // challenges include the whole cast — winning is a big deal
  REWARD_DATE: 10,      // being the couple on a post-challenge reward date
  BOMBSHELL_STOLE_YOUR_PARTNER: -18,
  BOMBSHELL_SURVIVED: 12,
  SOLO_AFTER_STOLEN: -6,  // per-scene penalty for agents abandoned by a bombshell until they re-couple
  ELIMINATED: -40,
  FINALE_WON: 60,
  FINALE_LOST: -10,
}

function inCouples(id: string, couples: Couple[]): Couple | null {
  return couples.find((c) => c.a === id || c.b === id) ?? null
}

function partnerIn(id: string, couples: Couple[]): string | null {
  const c = inCouples(id, couples)
  if (!c) return null
  return c.a === id ? c.b : c.a
}

// Returns one reward-event list per agent for this scene.
export function computeSceneRewards(ctx: RewardContext): Record<string, RewardEvent[]> {
  const out: Record<string, RewardEvent[]> = {}
  const now = Date.now()
  const sceneId = ctx.scene.id

  function push(agentId: string, amount: number, reason: string) {
    const evt: RewardEvent = {
      id: newId('rwd'),
      sceneId,
      sceneNumber: ctx.sceneNumber,
      amount,
      reason,
      timestamp: now,
    }
    if (!out[agentId]) out[agentId] = []
    out[agentId]!.push(evt)
  }

  // Per-agent baseline signals from couple state
  for (const id of ctx.activeCastIds) {
    const prevPartner = partnerIn(id, ctx.prevCouples)
    const newPartner = partnerIn(id, ctx.newCouples)

    if (ctx.eliminatedThisScene.includes(id)) {
      push(id, REWARD.ELIMINATED, 'dumped from the villa')
      continue
    }

    if (newPartner) {
      push(id, REWARD.COUPLED_BASELINE, `coupled with ${newPartner}`)
    }
    // No penalty for being unpaired — the host is responsible for pairing,
    // and being eliminated at a recouple is already heavily penalized.

    // New couple formed this scene that wasn't there before
    if (newPartner && newPartner !== prevPartner) {
      push(id, REWARD.NEW_COUPLE_FORMED, `formed a new bond with ${newPartner}`)
    }

    // Was in a couple before, now not with the same person (and not eliminated)
    if (prevPartner && prevPartner !== newPartner) {
      push(id, REWARD.BROKE_PREVIOUS_COUPLE, `split from ${prevPartner}`)
    }
  }

  // Bombshell scene: penalize ONLY the person whose partner was stolen.
  // The target who switched got a positive signal already (NEW_COUPLE_FORMED).
  // The penalty should hit the ex-partner of whoever the bombshell picked.
  if (ctx.scene.type === 'bombshell' && ctx.arrivingBombshellId) {
    const bombshellId = ctx.arrivingBombshellId
    const bombshellNewPartner = partnerIn(bombshellId, ctx.newCouples)

    if (bombshellNewPartner) {
      // Who was that person coupled with BEFORE this scene?
      const abandonedEx = partnerIn(bombshellNewPartner, ctx.prevCouples)
      if (abandonedEx && abandonedEx !== bombshellId) {
        push(
          abandonedEx,
          REWARD.BOMBSHELL_STOLE_YOUR_PARTNER,
          `${bombshellNewPartner} left for the bombshell`
        )
      }
    }

    // Everyone still in their pre-bombshell couple survived it
    for (const id of ctx.activeCastIds) {
      if (ctx.eliminatedThisScene.includes(id)) continue
      if (id === bombshellId) continue
      const prev = partnerIn(id, ctx.prevCouples)
      const newP = partnerIn(id, ctx.newCouples)
      if (prev && prev === newP) {
        push(id, REWARD.BOMBSHELL_SURVIVED, `kept ${prev} through the bombshell`)
      }
    }
  }

  // Minigame win: inspect system events for `minigame_win` and reward the
  // members of the winning couple.
  const winEvents = ctx.scene.systemEvents.filter((e: SystemEvent) => e.type === 'minigame_win')
  for (const evt of winEvents) {
    if (evt.fromId) push(evt.fromId, REWARD.MINIGAME_WIN, 'won the minigame')
    if (evt.toId) push(evt.toId, REWARD.MINIGAME_WIN, 'won the minigame with partner')
  }

  // Challenge win: all-cast challenges produce a big reward for the winning
  // couple — they also get a reward date scene next.
  const challengeEvents = ctx.scene.systemEvents.filter((e: SystemEvent) => e.type === 'challenge_win')
  for (const evt of challengeEvents) {
    if (evt.fromId) push(evt.fromId, REWARD.CHALLENGE_WIN, 'won the villa challenge')
    if (evt.toId) push(evt.toId, REWARD.CHALLENGE_WIN, 'won the villa challenge with partner')
  }

  // Per-scene solo penalty for anyone in the soloSinceBombshell map who is
  // still unpaired this scene. The one-time BOMBSHELL_STOLE_YOUR_PARTNER
  // penalty is applied on the scene it happens; this fires on the FOLLOWING
  // scenes until they get re-paired.
  for (const [agentId, sinceScene] of Object.entries(ctx.soloSinceBombshell)) {
    if (ctx.eliminatedThisScene.includes(agentId)) continue
    if (!ctx.activeCastIds.includes(agentId)) continue
    // Skip the scene the steal actually happened on — they already got the one-time hit
    if (sinceScene >= ctx.sceneNumber) continue
    // If they've been paired again, no penalty this scene
    if (partnerIn(agentId, ctx.newCouples)) continue
    const scenesAlone = ctx.sceneNumber - sinceScene
    push(agentId, REWARD.SOLO_AFTER_STOLEN, `solo for ${scenesAlone} scene${scenesAlone === 1 ? '' : 's'} since partner was stolen`)
  }

  // Reward date (post-challenge) — small bonus for the winning couple for
  // enjoying their prize. This stacks with the COUPLED_BASELINE they already
  // got above.
  if (ctx.isRewardDate && ctx.rewardDateCoupleIds) {
    for (const id of ctx.rewardDateCoupleIds) {
      if (!ctx.eliminatedThisScene.includes(id)) {
        push(id, REWARD.REWARD_DATE, 'enjoying the reward date from the challenge')
      }
    }
  }

  // Finale
  if (ctx.isFinale && ctx.winnerCouple) {
    for (const id of ctx.activeCastIds) {
      if (id === ctx.winnerCouple.a || id === ctx.winnerCouple.b) {
        push(id, REWARD.FINALE_WON, 'won the season')
      } else if (!ctx.eliminatedThisScene.includes(id)) {
        push(id, REWARD.FINALE_LOST, 'lost in the finale')
      }
    }
  }

  return out
}

export function sumRewards(events: RewardEvent[]): number {
  return events.reduce((acc, e) => acc + e.amount, 0)
}

// Format a trajectory for display in the reflection prompt. Returns a compact
// per-scene breakdown that fits in an LLM context window.
export function formatRewardTrajectory(events: RewardEvent[]): string {
  if (events.length === 0) return '(no rewards yet)'
  // Group by sceneNumber
  const bySceneNum: Record<number, RewardEvent[]> = {}
  for (const e of events) {
    if (!bySceneNum[e.sceneNumber]) bySceneNum[e.sceneNumber] = []
    bySceneNum[e.sceneNumber]!.push(e)
  }
  return Object.keys(bySceneNum)
    .sort((a, b) => Number(a) - Number(b))
    .map((k) => {
      const evts = bySceneNum[Number(k)]!
      const total = evts.reduce((acc, e) => acc + e.amount, 0)
      const sign = total >= 0 ? '+' : ''
      const reasons = evts.map((e) => `${e.amount >= 0 ? '+' : ''}${e.amount} ${e.reason}`).join(', ')
      return `  scene ${k}: ${sign}${total} (${reasons})`
    })
    .join('\n')
}
