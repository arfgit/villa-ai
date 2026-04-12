import type { Scene, Relationship, Emotion, Couple } from '@/types'

const EMOTION_DELTA: Record<Emotion, { trust: number; attraction: number; jealousy: number }> = {
  flirty:  { trust: 1.5, attraction: 4.5, jealousy: 0    },
  happy:   { trust: 2.5, attraction: 1.5, jealousy: 0    },
  sad:     { trust: 2.0, attraction: 0.5, jealousy: 0    },
  angry:   { trust: -3.0, attraction: -1.5, jealousy: 2.0 },
  jealous: { trust: -1.5, attraction: 0,   jealousy: 5.0 },
  anxious: { trust: 0.8, attraction: 0,   jealousy: 0.5 },
  smug:    { trust: -0.5, attraction: 1.5, jealousy: 0.5 },
  bored:   { trust: -0.8, attraction: -0.8, jealousy: 0 },
  shocked: { trust: 0.3, attraction: 0.3, jealousy: 0   },
  neutral: { trust: 0.8, attraction: 0.4, jealousy: 0   },
}

const SHARED_SCENE_BASELINE = { trust: 0.8, attraction: 0.4, jealousy: 0 }

const BROADCAST_FACTOR = 0.5

const BROADCAST_ACTION_FACTOR = 0.25

const ACTION_MODIFIERS: Array<{ match: RegExp; delta: { trust: number; attraction: number; jealousy: number } }> = [
  { match: /\b(kiss|kisses|kissed|snog)/i,      delta: { trust: 3, attraction: 8, jealousy: 0 } },
  { match: /\b(hug|hugs|hugged|embrace)/i,      delta: { trust: 4, attraction: 3, jealousy: 0 } },
  { match: /\b(laugh|laughs|grin|smile)/i,      delta: { trust: 1.5, attraction: 1.5, jealousy: 0 } },
  { match: /\b(flirt|wink|whisper)/i,           delta: { trust: 0.5, attraction: 4, jealousy: 0 } },
  { match: /\b(shout|yell|storm off)/i,         delta: { trust: -4, attraction: -1.5, jealousy: 3 } },
  { match: /\b(cry|sob|tear)/i,                 delta: { trust: 3, attraction: 0, jealousy: 0 } },
  { match: /\b(glare|side-eye|ignore|scoff)/i,  delta: { trust: -1.5, attraction: -1.5, jealousy: 1.5 } },
  { match: /\b(leans?|touch)/i,                 delta: { trust: 1.5, attraction: 3, jealousy: 0 } },
  { match: /\b(whisper|lean close|pull aside)/i, delta: { trust: 0, attraction: 2, jealousy: 3 } },
  { match: /\b(grab|hold hands|interlock)/i,    delta: { trust: 2, attraction: 3, jealousy: 2 } },
]

const INFERENCE_STRENGTH = 2.0

const PER_SCENE_CAP = { trust: 14, attraction: 14, jealousy: 16 }

const JEALOUSY_TRIGGER_WEIGHT: Partial<Record<Emotion, number>> = {
  flirty: 1.0,
  happy: 0.4,
  smug: 0.5,
}

export interface InferredDelta {
  fromId: string
  toId: string
  trust: number
  attraction: number
  jealousy: number
}

function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val))
}

export function inferStatDeltas(
  scene: Scene,
  rels: Relationship[],
  couples: Couple[]
): InferredDelta[] {
  const { dialogue, participantIds } = scene

  const acc = new Map<string, { trust: number; attraction: number; jealousy: number }>()

  function bump(from: string, to: string, d: { trust: number; attraction: number; jealousy: number }) {
    if (from === to) return
    const key = `${from}->${to}`
    const cur = acc.get(key) ?? { trust: 0, attraction: 0, jealousy: 0 }
    cur.trust += d.trust
    cur.attraction += d.attraction
    cur.jealousy += d.jealousy
    acc.set(key, cur)
  }

  function partnerOf(id: string): string | null {
    const c = couples.find((c) => c.a === id || c.b === id)
    if (!c) return null
    return c.a === id ? c.b : c.a
  }

  for (let i = 0; i < participantIds.length; i++) {
    for (let j = 0; j < participantIds.length; j++) {
      if (i === j) continue
      const from = participantIds[i]!
      const to = participantIds[j]!
      bump(from, to, SHARED_SCENE_BASELINE)
    }
  }

  for (const line of dialogue) {
    const emotionDelta = EMOTION_DELTA[line.emotion] ?? EMOTION_DELTA.neutral
    const text = `${line.action ?? ''} ${line.text}`.toLowerCase()
    const matchedActions = ACTION_MODIFIERS.filter((mod) => mod.match.test(text))
    const target = line.targetAgentId

    if (target) {
      bump(line.agentId, target, emotionDelta)
      for (const mod of matchedActions) {
        bump(line.agentId, target, mod.delta)
      }

      const jealousyWeight = JEALOUSY_TRIGGER_WEIGHT[line.emotion] ?? 0
      if (jealousyWeight > 0) {
        const speakerPartner = partnerOf(line.agentId)
        const targetPartner = partnerOf(target)
        if (speakerPartner && speakerPartner !== target) {
          bump(speakerPartner, target, {
            trust: -2 * jealousyWeight,
            attraction: 0,
            jealousy: 6 * jealousyWeight,
          })
        }
        if (targetPartner && targetPartner !== line.agentId) {
          bump(targetPartner, line.agentId, {
            trust: -2 * jealousyWeight,
            attraction: 0,
            jealousy: 6 * jealousyWeight,
          })
        }
      }
    } else {
      const broadcast = {
        trust: emotionDelta.trust * BROADCAST_FACTOR,
        attraction: emotionDelta.attraction * BROADCAST_FACTOR,
        jealousy: emotionDelta.jealousy * BROADCAST_FACTOR,
      }
      for (const listener of participantIds) {
        if (listener === line.agentId) continue
        bump(line.agentId, listener, broadcast)
        for (const mod of matchedActions) {
          bump(line.agentId, listener, {
            trust: mod.delta.trust * BROADCAST_ACTION_FACTOR,
            attraction: mod.delta.attraction * BROADCAST_ACTION_FACTOR,
            jealousy: mod.delta.jealousy * BROADCAST_ACTION_FACTOR,
          })
        }
      }
    }
  }

  for (const c of couples) {
    if (participantIds.includes(c.a) && participantIds.includes(c.b)) {
      bump(c.a, c.b, { trust: 1.5, attraction: 1.5, jealousy: -0.5 })
      bump(c.b, c.a, { trust: 1.5, attraction: 1.5, jealousy: -0.5 })
    }
  }

  const result: InferredDelta[] = []
  for (const [key, d] of acc.entries()) {
    const [fromId, toId] = key.split('->')
    if (!fromId || !toId) continue
    const trust = Math.round(clamp(d.trust * INFERENCE_STRENGTH, -PER_SCENE_CAP.trust, PER_SCENE_CAP.trust))
    const attraction = Math.round(clamp(d.attraction * INFERENCE_STRENGTH, -PER_SCENE_CAP.attraction, PER_SCENE_CAP.attraction))
    const jealousy = Math.round(clamp(d.jealousy * INFERENCE_STRENGTH, -PER_SCENE_CAP.jealousy, PER_SCENE_CAP.jealousy))
    if (trust === 0 && attraction === 0 && jealousy === 0) continue
    result.push({ fromId, toId, trust, attraction, jealousy })
  }

  void rels
  return result
}

export function applyInferredDeltas(
  rels: Relationship[],
  deltas: InferredDelta[]
): Relationship[] {
  const out = rels.map((r) => ({ ...r }))
  for (const d of deltas) {
    const row = out.find((r) => r.fromId === d.fromId && r.toId === d.toId)
    if (!row) continue
    row.trust = clamp(row.trust + d.trust, 0, 100)
    row.attraction = clamp(row.attraction + d.attraction, 0, 100)
    row.jealousy = clamp(row.jealousy + d.jealousy, 0, 100)
  }
  return out
}
