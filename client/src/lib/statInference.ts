// Dialogue → relationship delta inference.
//
// The LLM is inconsistent about emitting explicit system events (trust_change,
// attraction_change, jealousy_spike). On a 3B model it might emit 2-4 events
// per scene when realistically 10+ interactions are happening. As a result
// relationship stats barely move and the RL loop starves.
//
// This module reads the scene's dialogue + emotions + participant structure
// and INFERS small per-pair deltas. It runs AFTER applyDeltas (which handles
// LLM-explicit events), so the LLM's signal takes precedence and this just
// fills in the gaps from what the LLM already said but didn't tag.
//
// Per-scene deltas are capped so no single scene can swing a relationship
// from 0 → 100. The dynamics are tuned for continuous, earned growth.

import type { Scene, Relationship, Emotion, Couple } from '@/types'

// How much each emotion contributes per directed dialogue line (speaker → target).
// Values are raw, will be scaled by INFERENCE_STRENGTH below.
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

// Baseline bump for every pair that shared a scene even without direct interaction.
// Being in the same room matters.
const SHARED_SCENE_BASELINE = { trust: 0.8, attraction: 0.4, jealousy: 0 }

// Broadcast factor: lines without an explicit targetAgentId still affect how
// the room reads the speaker. The speaker's emotion radiates to every other
// scene participant at this fraction of a targeted line's effect.
const BROADCAST_FACTOR = 0.5

// Physical/action signals (kiss, hug, etc.) in untargeted lines are more
// ambiguous than when directed at a specific person — dampen further to
// prevent a single action-heavy line from pinning multiple relationships.
const BROADCAST_ACTION_FACTOR = 0.25

// Actions that imply strong physical/emotional signals. Scanned via keyword.
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

// Scale-up factor applied to all raw emotion/action values before they're
// written as integer deltas. Tuned so dialogue actually moves the needle
// scene-to-scene instead of plateauing at low values.
const INFERENCE_STRENGTH = 2.0

// Max delta per stat per scene per ordered pair, so one wild scene doesn't
// swing a relationship too hard.
const PER_SCENE_CAP = { trust: 14, attraction: 14, jealousy: 16 }

// Jealousy triggers: when a taken person directs positive attention at a
// non-partner, the partner develops jealousy. Flirty is the strongest signal
// but happy/smug banter also registers (at reduced weight).
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

/**
 * Compute per-pair relationship deltas for a scene based on the dialogue,
 * emotions, actions, and the current couple structure.
 *
 * Returns a flat list of directed deltas. Caller applies them to `rels`.
 */
export function inferStatDeltas(
  scene: Scene,
  rels: Relationship[],
  couples: Couple[]
): InferredDelta[] {
  const { dialogue, participantIds } = scene

  // Accumulator: key = `${from}->${to}`
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

  // Pair lookup: who is each participant coupled with?
  function partnerOf(id: string): string | null {
    const c = couples.find((c) => c.a === id || c.b === id)
    if (!c) return null
    return c.a === id ? c.b : c.a
  }

  // 1) Shared-scene baseline: every pair of participants gets a tiny bidirectional bump
  for (let i = 0; i < participantIds.length; i++) {
    for (let j = 0; j < participantIds.length; j++) {
      if (i === j) continue
      const from = participantIds[i]!
      const to = participantIds[j]!
      bump(from, to, SHARED_SCENE_BASELINE)
    }
  }

  // 2) Per-line deltas based on emotion + target + action text
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

      // Love triangle detection: when a taken person shows positive attention
      // to a non-partner, their partner develops jealousy. Flirty is strongest
      // but happy/smug banter also triggers it (people notice when their
      // partner is laughing with someone else).
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
      // Untargeted line: the speaker is addressing the room. Their emotion
      // radiates to every other participant at a reduced factor so general
      // dialogue still shifts relationships instead of dropping to the floor.
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

  // 3) Couple reinforcement: coupled pairs get a small consistent bond bump
  //    from just being together this scene
  for (const c of couples) {
    if (participantIds.includes(c.a) && participantIds.includes(c.b)) {
      bump(c.a, c.b, { trust: 1.5, attraction: 1.5, jealousy: -0.5 })
      bump(c.b, c.a, { trust: 1.5, attraction: 1.5, jealousy: -0.5 })
    }
  }

  // Materialize into integer deltas, applying cap + strength
  const result: InferredDelta[] = []
  for (const [key, d] of acc.entries()) {
    const [fromId, toId] = key.split('->')
    if (!fromId || !toId) continue
    const trust = Math.round(clamp(d.trust * INFERENCE_STRENGTH, -PER_SCENE_CAP.trust, PER_SCENE_CAP.trust))
    const attraction = Math.round(clamp(d.attraction * INFERENCE_STRENGTH, -PER_SCENE_CAP.attraction, PER_SCENE_CAP.attraction))
    const jealousy = Math.round(clamp(d.jealousy * INFERENCE_STRENGTH, -PER_SCENE_CAP.jealousy, PER_SCENE_CAP.jealousy))
    // Skip zero deltas to keep the result tidy
    if (trust === 0 && attraction === 0 && jealousy === 0) continue
    result.push({ fromId, toId, trust, attraction, jealousy })
  }

  // Just-so the caller doesn't have to: ensure relationships rows exist for
  // the pairs we're updating. Returning deltas; the caller will apply them
  // via `applyInferredDeltas` below.
  void rels
  return result
}

/**
 * Apply a list of inferred deltas to a relationship matrix. Returns a new
 * array (immutable). Values are clamped 0-100.
 */
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
