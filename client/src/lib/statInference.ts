import type { Scene, Relationship, Emotion, Couple } from "@villa-ai/shared";

type StatDelta = {
  trust: number;
  attraction: number;
  jealousy: number;
  compatibility: number;
};

const EMOTION_DELTA: Record<Emotion, StatDelta> = {
  flirty: { trust: 1.5, attraction: 4.5, jealousy: 0, compatibility: 0.3 },
  happy: { trust: 2.5, attraction: 1.5, jealousy: 0, compatibility: 1.0 },
  sad: { trust: 2.0, attraction: 0.5, jealousy: 0, compatibility: 0.8 },
  angry: { trust: -3.0, attraction: -1.5, jealousy: 2.0, compatibility: -1.5 },
  jealous: { trust: -1.5, attraction: 0, jealousy: 5.0, compatibility: -0.5 },
  anxious: { trust: 0.8, attraction: 0, jealousy: 0.5, compatibility: -0.3 },
  smug: { trust: -0.5, attraction: 1.5, jealousy: 0.5, compatibility: -0.2 },
  bored: { trust: -0.8, attraction: -0.8, jealousy: 0, compatibility: -0.8 },
  shocked: { trust: 0.3, attraction: 0.3, jealousy: 0, compatibility: 0.1 },
  neutral: { trust: 0.8, attraction: 0.4, jealousy: 0, compatibility: 0.2 },
};

const SHARED_SCENE_BASELINE: StatDelta = {
  trust: 0.8,
  attraction: 0.4,
  jealousy: 0,
  compatibility: 0.2,
};

const BROADCAST_FACTOR = 0.5;

const BROADCAST_ACTION_FACTOR = 0.25;

const ACTION_MODIFIERS: Array<{ match: RegExp; delta: StatDelta }> = [
  {
    match: /\b(kiss|kisses|kissed|snog)/i,
    delta: { trust: 3, attraction: 8, jealousy: 0, compatibility: 0.5 },
  },
  {
    match: /\b(hug|hugs|hugged|embrace)/i,
    delta: { trust: 4, attraction: 3, jealousy: 0, compatibility: 1.5 },
  },
  {
    match: /\b(laugh|laughs|grin|smile)/i,
    delta: { trust: 1.5, attraction: 1.5, jealousy: 0, compatibility: 0.8 },
  },
  {
    match: /\b(flirt|wink|whisper)/i,
    delta: { trust: 0.5, attraction: 4, jealousy: 0, compatibility: 0.2 },
  },
  {
    match: /\b(shout|yell|storm off)/i,
    delta: { trust: -4, attraction: -1.5, jealousy: 3, compatibility: -1.5 },
  },
  {
    match: /\b(cry|sob|tear)/i,
    delta: { trust: 3, attraction: 0, jealousy: 0, compatibility: 1.2 },
  },
  {
    match: /\b(glare|side-eye|ignore|scoff)/i,
    delta: {
      trust: -1.5,
      attraction: -1.5,
      jealousy: 1.5,
      compatibility: -0.8,
    },
  },
  {
    match: /\b(leans?|touch)/i,
    delta: { trust: 1.5, attraction: 3, jealousy: 0, compatibility: 0.3 },
  },
  {
    match: /\b(whisper|lean close|pull aside)/i,
    delta: { trust: 0, attraction: 2, jealousy: 3, compatibility: 0.5 },
  },
  {
    match: /\b(grab|hold hands|interlock)/i,
    delta: { trust: 2, attraction: 3, jealousy: 2, compatibility: 0.8 },
  },
];

const INFERENCE_STRENGTH = 1.5;

const PER_SCENE_CAP = {
  trust: 16,
  attraction: 16,
  jealousy: 18,
  compatibility: 8,
};

const JEALOUSY_TRIGGER_WEIGHT: Partial<Record<Emotion, number>> = {
  flirty: 1.0,
  happy: 0.4,
  smug: 0.5,
};

export interface InferredDelta {
  fromId: string;
  toId: string;
  trust: number;
  attraction: number;
  jealousy: number;
  compatibility: number;
}

function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

export function inferStatDeltas(
  scene: Scene,
  rels: Relationship[],
  couples: Couple[],
): InferredDelta[] {
  const { dialogue, participantIds } = scene;

  const acc = new Map<string, StatDelta>();

  function bump(from: string, to: string, d: StatDelta) {
    if (from === to) return;
    const key = `${from}->${to}`;
    const cur = acc.get(key) ?? {
      trust: 0,
      attraction: 0,
      jealousy: 0,
      compatibility: 0,
    };
    cur.trust += d.trust;
    cur.attraction += d.attraction;
    cur.jealousy += d.jealousy;
    cur.compatibility += d.compatibility;
    acc.set(key, cur);
  }

  function partnerOf(id: string): string | null {
    const c = couples.find((c) => c.a === id || c.b === id);
    if (!c) return null;
    return c.a === id ? c.b : c.a;
  }

  for (let i = 0; i < participantIds.length; i++) {
    for (let j = 0; j < participantIds.length; j++) {
      if (i === j) continue;
      const from = participantIds[i]!;
      const to = participantIds[j]!;
      bump(from, to, SHARED_SCENE_BASELINE);
    }
  }

  for (const line of dialogue) {
    const emotionDelta = EMOTION_DELTA[line.emotion] ?? EMOTION_DELTA.neutral;
    const text = `${line.action ?? ""} ${line.text}`.toLowerCase();
    const matchedActions = ACTION_MODIFIERS.filter((mod) =>
      mod.match.test(text),
    );
    const target = line.targetAgentId;

    if (target) {
      bump(line.agentId, target, emotionDelta);
      for (const mod of matchedActions) {
        bump(line.agentId, target, mod.delta);
      }

      const jealousyWeight = JEALOUSY_TRIGGER_WEIGHT[line.emotion] ?? 0;
      if (jealousyWeight > 0) {
        const speakerPartner = partnerOf(line.agentId);
        const targetPartner = partnerOf(target);
        if (speakerPartner && speakerPartner !== target) {
          bump(speakerPartner, target, {
            trust: -2 * jealousyWeight,
            attraction: 0,
            jealousy: 6 * jealousyWeight,
            compatibility: -0.3 * jealousyWeight,
          });
        }
        if (targetPartner && targetPartner !== line.agentId) {
          bump(targetPartner, line.agentId, {
            trust: -2 * jealousyWeight,
            attraction: 0,
            jealousy: 6 * jealousyWeight,
            compatibility: -0.3 * jealousyWeight,
          });
        }

        for (const observer of participantIds) {
          if (observer === line.agentId || observer === target) continue;
          if (observer === speakerPartner || observer === targetPartner)
            continue;
          const obsToSpeaker = rels.find(
            (r) => r.fromId === observer && r.toId === line.agentId,
          );
          const obsToTarget = rels.find(
            (r) => r.fromId === observer && r.toId === target,
          );
          if ((obsToSpeaker?.attraction ?? 0) > 35) {
            bump(observer, target, {
              trust: 0,
              attraction: 0,
              jealousy: 3 * jealousyWeight,
              compatibility: 0,
            });
          }
          if ((obsToTarget?.attraction ?? 0) > 35) {
            bump(observer, line.agentId, {
              trust: 0,
              attraction: 0,
              jealousy: 3 * jealousyWeight,
              compatibility: 0,
            });
          }
        }
      }
    } else {
      const broadcast: StatDelta = {
        trust: emotionDelta.trust * BROADCAST_FACTOR,
        attraction: emotionDelta.attraction * BROADCAST_FACTOR,
        jealousy: emotionDelta.jealousy * BROADCAST_FACTOR,
        compatibility: emotionDelta.compatibility * BROADCAST_FACTOR,
      };
      for (const listener of participantIds) {
        if (listener === line.agentId) continue;
        bump(line.agentId, listener, broadcast);
        for (const mod of matchedActions) {
          bump(line.agentId, listener, {
            trust: mod.delta.trust * BROADCAST_ACTION_FACTOR,
            attraction: mod.delta.attraction * BROADCAST_ACTION_FACTOR,
            jealousy: mod.delta.jealousy * BROADCAST_ACTION_FACTOR,
            compatibility: mod.delta.compatibility * BROADCAST_ACTION_FACTOR,
          });
        }
      }
    }
  }

  for (const c of couples) {
    if (participantIds.includes(c.a) && participantIds.includes(c.b)) {
      bump(c.a, c.b, {
        trust: 0.8,
        attraction: 0.5,
        jealousy: -0.3,
        compatibility: 0.5,
      });
      bump(c.b, c.a, {
        trust: 0.8,
        attraction: 0.5,
        jealousy: -0.3,
        compatibility: 0.5,
      });
    }
  }

  const result: InferredDelta[] = [];
  for (const [key, d] of acc.entries()) {
    const [fromId, toId] = key.split("->");
    if (!fromId || !toId) continue;
    const trust = Math.round(
      clamp(
        d.trust * INFERENCE_STRENGTH,
        -PER_SCENE_CAP.trust,
        PER_SCENE_CAP.trust,
      ),
    );
    const attraction = Math.round(
      clamp(
        d.attraction * INFERENCE_STRENGTH,
        -PER_SCENE_CAP.attraction,
        PER_SCENE_CAP.attraction,
      ),
    );
    const jealousy = Math.round(
      clamp(
        d.jealousy * INFERENCE_STRENGTH,
        -PER_SCENE_CAP.jealousy,
        PER_SCENE_CAP.jealousy,
      ),
    );
    const compatibility = Math.round(
      clamp(
        d.compatibility * INFERENCE_STRENGTH,
        -PER_SCENE_CAP.compatibility,
        PER_SCENE_CAP.compatibility,
      ),
    );
    if (
      trust === 0 &&
      attraction === 0 &&
      jealousy === 0 &&
      compatibility === 0
    )
      continue;
    result.push({ fromId, toId, trust, attraction, jealousy, compatibility });
  }

  void rels;
  return result;
}

export function applyInferredDeltas(
  rels: Relationship[],
  deltas: InferredDelta[],
): Relationship[] {
  const out = rels.map((r) => ({ ...r }));
  for (const d of deltas) {
    const row = out.find((r) => r.fromId === d.fromId && r.toId === d.toId);
    if (!row) continue;
    row.trust = clamp(row.trust + d.trust, 0, 100);
    row.attraction = clamp(row.attraction + d.attraction, 0, 100);
    row.jealousy = clamp(row.jealousy + d.jealousy, 0, 100);
    row.compatibility = clamp(row.compatibility + d.compatibility, 0, 100);
  }
  return out;
}
