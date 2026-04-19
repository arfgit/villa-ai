import type { Couple, Scene, SystemEvent, RewardEvent } from '@villa-ai/shared'
import { newId } from './ids'

export interface RewardContext {
  scene: Scene
  sceneNumber: number
  activeCastIds: string[]
  prevCouples: Couple[]
  newCouples: Couple[]
  eliminatedThisScene: string[]
  isFinale: boolean
  winnerCouple: Couple | null
  arrivingBombshellId?: string
  soloSinceBombshell: Record<string, number>
  isRewardDate?: boolean
  rewardDateCoupleIds?: string[]
}

const REWARD = {
  COUPLED_BASELINE: 5,
  NEW_COUPLE_FORMED: 15,
  BROKE_PREVIOUS_COUPLE: -8,
  MINIGAME_WIN: 20,
  CHALLENGE_WIN: 35,
  REWARD_DATE: 10,
  BOMBSHELL_STOLE_YOUR_PARTNER: -18,
  BOMBSHELL_SURVIVED: 12,
  SOLO_AFTER_STOLEN: -6,
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
    if (newPartner && newPartner !== prevPartner) {
      push(id, REWARD.NEW_COUPLE_FORMED, `formed a new bond with ${newPartner}`)
    }

    if (prevPartner && prevPartner !== newPartner) {
      push(id, REWARD.BROKE_PREVIOUS_COUPLE, `split from ${prevPartner}`)
    }
  }

  if (ctx.scene.type === 'bombshell' && ctx.arrivingBombshellId) {
    const bombshellId = ctx.arrivingBombshellId
    const bombshellNewPartner = partnerIn(bombshellId, ctx.newCouples)

    if (bombshellNewPartner) {
      const abandonedEx = partnerIn(bombshellNewPartner, ctx.prevCouples)
      if (abandonedEx && abandonedEx !== bombshellId) {
        push(
          abandonedEx,
          REWARD.BOMBSHELL_STOLE_YOUR_PARTNER,
          `${bombshellNewPartner} left for the bombshell`
        )
      }
    }

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

  const winEvents = ctx.scene.systemEvents.filter((e: SystemEvent) => e.type === 'minigame_win')
  for (const evt of winEvents) {
    if (evt.fromId) push(evt.fromId, REWARD.MINIGAME_WIN, 'won the minigame')
    if (evt.toId) push(evt.toId, REWARD.MINIGAME_WIN, 'won the minigame with partner')
  }

  const challengeEvents = ctx.scene.systemEvents.filter((e: SystemEvent) => e.type === 'challenge_win')
  for (const evt of challengeEvents) {
    if (evt.fromId) push(evt.fromId, REWARD.CHALLENGE_WIN, 'won the villa challenge')
    if (evt.toId) push(evt.toId, REWARD.CHALLENGE_WIN, 'won the villa challenge with partner')
  }

  for (const [agentId, sinceScene] of Object.entries(ctx.soloSinceBombshell)) {
    if (ctx.eliminatedThisScene.includes(agentId)) continue
    if (!ctx.activeCastIds.includes(agentId)) continue
    if (sinceScene >= ctx.sceneNumber) continue
    if (partnerIn(agentId, ctx.newCouples)) continue
    const scenesAlone = ctx.sceneNumber - sinceScene
    push(agentId, REWARD.SOLO_AFTER_STOLEN, `solo for ${scenesAlone} scene${scenesAlone === 1 ? '' : 's'} since partner was stolen`)
  }

  if (ctx.isRewardDate && ctx.rewardDateCoupleIds) {
    for (const id of ctx.rewardDateCoupleIds) {
      if (!ctx.eliminatedThisScene.includes(id)) {
        push(id, REWARD.REWARD_DATE, 'enjoying the reward date from the challenge')
      }
    }
  }

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

export function formatRewardTrajectory(events: RewardEvent[]): string {
  if (events.length === 0) return '(no rewards yet)'
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
