import type {
  Agent,
  AgentBrain,
  Couple,
  DialoguePattern,
  EmotionState,
  PerAgentSceneRole,
  PlannedBeat,
  Relationship,
  Scene,
  SceneContext,
  SceneType,
  Stakes,
  Subtext,
  SystemEvent,
  TurnIntent,
} from "@villa-ai/shared";

export interface BuildSceneContextArgs {
  sceneType: SceneType;
  participants: Agent[];
  allCast: Agent[];
  relationships: Relationship[];
  emotions: EmotionState[];
  couples: Couple[];
  brains: Record<string, AgentBrain>;
  dramaScores: Record<string, number>;
  recentScenes: Scene[];
  interviewSubjectId?: string;
  grandFinaleWinnerId?: string;
}

const SCENE_TYPE_TENSION_MOD: Partial<Record<SceneType, number>> = {
  recouple: 20,
  bombshell: 15,
  casa_amor_stickswitch: 25,
  casa_amor_arrival: 15,
  casa_amor_date: 10,
  casa_amor_challenge: 10,
  public_vote: 18,
  islander_vote: 18,
  producer_twist: 22,
  grand_finale: 10,
  challenge: 5,
  minigame: 3,
  date: -5,
  firepit: 0,
  pool: -3,
  kitchen: -3,
  bedroom: 4,
  interview: 8,
};

export function computeTension(args: BuildSceneContextArgs): number {
  const { participants, relationships, dramaScores, recentScenes, sceneType } =
    args;
  const participantIds = new Set(participants.map((a) => a.id));

  let dramaSum = 0;
  let dramaCount = 0;
  for (const id of participantIds) {
    const score = dramaScores[id];
    if (score !== undefined) {
      dramaSum += score;
      dramaCount += 1;
    }
  }
  const avgDrama = dramaCount > 0 ? dramaSum / dramaCount : 0;

  const dramaComponent = Math.min(40, avgDrama * 3);

  let maxJealousy = 0;
  for (const r of relationships) {
    if (participantIds.has(r.fromId) && participantIds.has(r.toId)) {
      if (r.jealousy > maxJealousy) maxJealousy = r.jealousy;
    }
  }
  const jealousyComponent = maxJealousy * 0.3;

  let eventBoost = 0;
  const recent = recentScenes.slice(-3);
  for (const s of recent) {
    for (const e of s.systemEvents) {
      if (e.type === "couple_broken") eventBoost = Math.max(eventBoost, 20);
      else if (e.type === "jealousy_spike" && (e.delta ?? 0) >= 6)
        eventBoost = Math.max(eventBoost, 12);
      else if (e.type === "couple_formed") eventBoost = Math.max(eventBoost, 8);
    }
  }

  const typeMod = SCENE_TYPE_TENSION_MOD[sceneType] ?? 0;

  return Math.max(
    0,
    Math.min(
      100,
      Math.round(dramaComponent + jealousyComponent + eventBoost + typeMod),
    ),
  );
}

export function selectPattern(
  sceneType: SceneType,
  tension: number,
  participantCount: number,
): DialoguePattern {
  if (sceneType === "interview") return "confession_cascade";
  if (
    sceneType === "casa_amor_stickswitch" ||
    sceneType === "casa_amor_arrival"
  )
    return "triangulation";
  if (sceneType === "grand_finale") return "confession_cascade";
  if (sceneType === "recouple")
    return tension >= 55 ? "soft_accusation" : "testing";
  if (sceneType === "bombshell") return "testing";
  if (sceneType === "date") return tension >= 50 ? "push_pull" : "freeform";
  if (participantCount <= 2) {
    if (tension >= 70) return "soft_accusation";
    if (tension >= 45) return "push_pull";
    return "question_deflection";
  }

  if (tension >= 70) return "triangulation";
  if (tension >= 45) return "soft_accusation";
  if (tension >= 25) return "question_deflection";
  return "freeform";
}

function powerOf(
  agentId: string,
  rels: Relationship[],
  couples: Couple[],
  participants: Agent[],
): PerAgentSceneRole["powerPosition"] {
  const inCouple = couples.some((c) => c.a === agentId || c.b === agentId);
  const partnerId = couples.find((c) => c.a === agentId || c.b === agentId);
  const partner = partnerId
    ? partnerId.a === agentId
      ? partnerId.b
      : partnerId.a
    : null;

  if (!inCouple) {
    const anyPresentCoupled = couples.some(
      (c) =>
        participants.some((p) => p.id === c.a) &&
        participants.some((p) => p.id === c.b),
    );
    if (anyPresentCoupled) return "outsider";
  }

  if (partner && participants.some((p) => p.id === partner)) {
    const selfToPartner = rels.find(
      (r) => r.fromId === agentId && r.toId === partner,
    );
    const partnerToSelf = rels.find(
      (r) => r.fromId === partner && r.toId === agentId,
    );
    const selfTrust = selfToPartner?.trust ?? 50;
    const partnerTrust = partnerToSelf?.trust ?? 50;
    if (selfTrust - partnerTrust >= 15) return "submissive";
    if (partnerTrust - selfTrust >= 15) return "dominant";
  }

  return "equal";
}

function inferGoal(
  _agent: Agent,
  sceneType: SceneType,
  brain: AgentBrain | undefined,
  tension: number,
): string {
  const base = (brain?.goal ?? "").trim();
  if (base.length > 0) return base;

  if (sceneType === "interview")
    return "justify what I've been doing to the audience";
  if (sceneType === "recouple")
    return "end tonight in a couple I actually want";
  if (sceneType === "bombshell")
    return "read the new arrival before deciding if they're a threat";
  if (sceneType === "casa_amor_date")
    return "explore chemistry without looking disloyal on camera";
  if (sceneType === "casa_amor_stickswitch")
    return "make the choice that keeps me in the villa";
  if (sceneType === "grand_finale")
    return "earn the public's vote on our journey together";
  if (sceneType === "date")
    return "deepen the connection or signal I'm not committed";
  if (tension >= 60) return "defend my position without backing down";
  return "stay interesting on camera";
}

function inferHiddenAgenda(
  agent: Agent,
  rels: Relationship[],
  participants: Agent[],
  tension: number,
): string | undefined {
  const agentRels = rels.filter((r) => r.fromId === agent.id);
  const lowTrustTargets = agentRels.filter(
    (r) => r.trust < 40 && participants.some((p) => p.id === r.toId),
  );
  const externalCrush = agentRels
    .filter(
      (r) => r.attraction > 55 && participants.some((p) => p.id === r.toId),
    )
    .sort((a, b) => b.attraction - a.attraction)[0];

  if (tension >= 55 && lowTrustTargets.length > 0) {
    const target = participants.find((p) => p.id === lowTrustTargets[0]!.toId);
    if (target)
      return `keep ${target.name} in the dark about how little I actually trust them`;
  }
  if (externalCrush) {
    const crushName = participants.find(
      (p) => p.id === externalCrush.toId,
    )?.name;
    if (crushName)
      return `keep ${crushName} as a backup option without committing publicly`;
  }
  return undefined;
}

function inferStakes(
  agent: Agent,
  sceneType: SceneType,
  couples: Couple[],
  rels: Relationship[],
): Stakes {
  const partner = couples.find((c) => c.a === agent.id || c.b === agent.id);
  const partnerId = partner
    ? partner.a === agent.id
      ? partner.b
      : partner.a
    : null;
  const partnerTrust = partnerId
    ? (rels.find((r) => r.fromId === partnerId && r.toId === agent.id)?.trust ??
      50)
    : 50;

  if (sceneType === "recouple" || sceneType === "casa_amor_stickswitch") {
    return {
      whatCanBeLost: partnerId
        ? `${partnerId}'s pick — I could end up solo tonight`
        : "getting picked at all",
      whatCanBeGained:
        "a stronger couple or a fresh start with someone I actually want",
    };
  }
  if (sceneType === "bombshell") {
    return {
      whatCanBeLost: partnerId
        ? `${partnerId}'s head turning`
        : "my spot in the villa",
      whatCanBeGained: "the new arrival's attention before anyone else gets it",
    };
  }
  if (sceneType === "grand_finale") {
    return {
      whatCanBeLost: "the public's vote",
      whatCanBeGained: "winning the season with the right partner",
    };
  }
  if (partnerTrust < 40) {
    return {
      whatCanBeLost: "the little trust that's left",
      whatCanBeGained: "a believable reset",
    };
  }
  return {
    whatCanBeLost: "looking boring on camera",
    whatCanBeGained: "a quotable moment and a stat boost",
  };
}

function inferSubtext(
  _agent: Agent,
  goal: string,
  hiddenAgenda: string | undefined,
  powerPosition: PerAgentSceneRole["powerPosition"],
): Subtext {
  if (hiddenAgenda) {
    return {
      surface: goal,
      actual: hiddenAgenda,
    };
  }
  if (powerPosition === "submissive") {
    return {
      surface: goal,
      actual: `do not let anyone see I\'m more invested than they are`,
    };
  }
  if (powerPosition === "dominant") {
    return {
      surface: goal,
      actual: `remind them who\'s holding the leverage without saying it out loud`,
    };
  }
  if (powerPosition === "outsider") {
    return {
      surface: goal,
      actual: `find a crack to insert myself into a couple`,
    };
  }
  return { surface: goal, actual: goal };
}

function inferOpeningIntent(
  powerPosition: PerAgentSceneRole["powerPosition"],
  tension: number,
  sceneType: SceneType,
): TurnIntent {
  if (sceneType === "interview") return "confess";
  if (sceneType === "grand_finale") return "declare";
  if (sceneType === "bombshell") return "test";
  if (powerPosition === "outsider")
    return tension >= 50 ? "challenge" : "flirt";
  if (powerPosition === "dominant") return tension >= 60 ? "accuse" : "test";
  if (powerPosition === "submissive")
    return tension >= 60 ? "deflect" : "reassure";
  if (tension >= 70) return "escalate";
  if (tension >= 45) return "challenge";
  return "flirt";
}

export function buildPerAgentRoles(
  args: BuildSceneContextArgs,
  tension: number,
): PerAgentSceneRole[] {
  const { participants, relationships, couples, brains, sceneType } = args;
  return participants.map((agent) => {
    const powerPosition = powerOf(
      agent.id,
      relationships,
      couples,
      participants,
    );
    const goal = inferGoal(agent, sceneType, brains[agent.id], tension);
    const hiddenAgenda = inferHiddenAgenda(
      agent,
      relationships,
      participants,
      tension,
    );
    const stakes = inferStakes(agent, sceneType, couples, relationships);
    const subtext = inferSubtext(agent, goal, hiddenAgenda, powerPosition);
    const openingIntent = inferOpeningIntent(powerPosition, tension, sceneType);
    return {
      agentId: agent.id,
      goal,
      hiddenAgenda,
      stakes,
      subtext,
      powerPosition,
      openingIntent,
    };
  });
}

function summarizeRecentEvent(recentScenes: Scene[], cast: Agent[]): string {
  const nameOf = (id?: string) =>
    cast.find((a) => a.id === id)?.name ?? id ?? "someone";

  for (let i = recentScenes.length - 1; i >= 0; i--) {
    const s = recentScenes[i]!;
    for (const e of s.systemEvents) {
      if (e.type === "couple_broken")
        return `${nameOf(e.fromId)} and ${nameOf(e.toId)} split last scene`;
      if (e.type === "couple_formed")
        return `${nameOf(e.fromId)} and ${nameOf(e.toId)} just coupled up`;
      if (e.type === "jealousy_spike" && (e.delta ?? 0) >= 6)
        return `${nameOf(e.fromId)} is fuming at ${nameOf(e.toId)}`;
    }
    if (s.type === "bombshell")
      return "the villa is still reeling from the new arrival";
    if (s.type === "casa_amor_stickswitch")
      return "Casa Amor fallout is everywhere";
  }
  return "nothing major has shifted yet — the villa is simmering";
}

function summarizePowerDynamic(
  roles: PerAgentSceneRole[],
  cast: Agent[],
): string {
  const dom = roles.find((r) => r.powerPosition === "dominant");
  const sub = roles.find((r) => r.powerPosition === "submissive");
  const out = roles.find((r) => r.powerPosition === "outsider");
  const nameOf = (id: string) => cast.find((a) => a.id === id)?.name ?? id;
  if (dom && sub)
    return `${nameOf(dom.agentId)} holds the leverage; ${nameOf(sub.agentId)} is more invested`;
  if (out)
    return `${nameOf(out.agentId)} is circling from the outside looking for a crack`;
  return "everyone in the scene is on roughly equal footing — leverage is contested";
}

const PATTERN_INTENT_SEQUENCES: Record<DialoguePattern, TurnIntent[]> = {
  freeform: ["flirt", "joke", "challenge", "reassure", "declare"],
  push_pull: ["flirt", "deflect", "test", "challenge", "escalate", "retreat"],
  question_deflection: [
    "challenge",
    "deflect",
    "test",
    "deflect",
    "escalate",
    "reveal",
  ],
  soft_accusation: [
    "accuse",
    "deny",
    "challenge",
    "confess",
    "escalate",
    "retreat",
  ],
  testing: ["test", "deflect", "challenge", "reveal", "escalate", "declare"],
  confession_cascade: ["confess", "reveal", "confess", "declare"],
  triangulation: ["flirt", "test", "accuse", "deflect", "escalate", "declare"],
};

const LOUD_INTENTS: Set<TurnIntent> = new Set([
  "escalate",
  "accuse",
  "challenge",
  "reveal",
]);
const LOUD_TENSION_FLOOR = 60;

function pickSpeaker(
  intent: TurnIntent,
  roles: PerAgentSceneRole[],
  lastSpeakerId: string | null,
): PerAgentSceneRole {
  const candidates = roles.filter((r) => r.agentId !== lastSpeakerId);
  const pool = candidates.length > 0 ? candidates : roles;

  const prefer = (pred: (r: PerAgentSceneRole) => boolean) => {
    const hit = pool.find(pred);
    return hit ?? pool[0]!;
  };

  switch (intent) {
    case "accuse":
    case "escalate":
    case "declare":
      return prefer(
        (r) =>
          r.powerPosition === "dominant" ||
          r.openingIntent === "accuse" ||
          r.openingIntent === "escalate",
      );
    case "deflect":
    case "soften":
    case "retreat":
      return prefer(
        (r) =>
          r.powerPosition === "submissive" || r.openingIntent === "deflect",
      );
    case "test":
    case "challenge":
      return prefer((r) => r.powerPosition !== "submissive");
    case "flirt":
      return prefer((r) => r.openingIntent === "flirt");
    case "confess":
      return prefer(
        (r) =>
          r.powerPosition === "submissive" || r.powerPosition === "outsider",
      );
    case "manipulate":
    case "reveal":
      return prefer((r) => r.hiddenAgenda !== undefined);
    default:
      return pool[0]!;
  }
}

function toneFor(intent: TurnIntent, tension: number): string {
  const highT = tension >= 60;
  switch (intent) {
    case "flirt":
      return highT
        ? "charged flirtation over an undercurrent of suspicion"
        : "easy, playful flirtation";
    case "deflect":
      return highT
        ? "brittle deflection, obvious it's a cover"
        : "light, smiling deflection";
    case "reassure":
      return highT
        ? "tense reassurance, not quite landing"
        : "warm, steadying reassurance";
    case "challenge":
      return highT ? "sharp, cornering challenge" : "teasing challenge";
    case "test":
      return "probing test with plausible deniability";
    case "manipulate":
      return "calculated, soft-spoken manipulation";
    case "escalate":
      return "voice rising, boundaries dropping";
    case "soften":
      return "a half-step back, voice lowering";
    case "confess":
      return highT
        ? "raw, trembling confession"
        : "quiet, vulnerable confession";
    case "accuse":
      return "pointed accusation — the room notices";
    case "reveal":
      return "the thing nobody was supposed to say out loud";
    case "deny":
      return "flat denial with a flicker of something underneath";
    case "joke":
      return "a joke to cut the tension — whether it works is another question";
    case "retreat":
      return "pulling back, signaling done-ness";
    case "declare":
      return "a statement they can't walk back";
  }
}

export function planBeats(
  roles: PerAgentSceneRole[],
  pattern: DialoguePattern,
  tension: number,
  desiredBeatCount: number,
): PlannedBeat[] {
  const sequence = PATTERN_INTENT_SEQUENCES[pattern];
  const count = Math.max(4, Math.min(16, desiredBeatCount));

  const intents: TurnIntent[] = [];
  const closing = sequence[sequence.length - 1]!;
  const interior = sequence.slice(0, -1);
  for (let i = 0; i < count - 1; i++) {
    intents.push(interior[i % interior.length]!);
  }
  intents.push(closing);

  const beats: PlannedBeat[] = [];
  let lastSpeakerId: string | null = null;

  intents.forEach((intent, idx) => {
    const role = pickSpeaker(intent, roles, lastSpeakerId);
    const target = roles.find((r) => r.agentId !== role.agentId)?.agentId;
    const loud =
      tension >= LOUD_TENSION_FLOOR &&
      LOUD_INTENTS.has(intent) &&
      idx >= Math.floor(count / 2);
    beats.push({
      speakerId: role.agentId,
      intent,
      emotionalTone: toneFor(intent, tension),
      target,
      loud,
    });
    lastSpeakerId = role.agentId;
  });

  let loudCount = 0;
  for (const b of beats) {
    if (b.loud) {
      if (loudCount >= 2) b.loud = false;
      else loudCount += 1;
    }
  }

  return beats;
}

const SCENE_TYPE_BEAT_COUNT: Partial<Record<SceneType, number>> = {
  interview: 4,
  firepit: 5,
  pool: 5,
  kitchen: 5,
  bedroom: 5,
  date: 6,
  grand_finale: 7,
  recouple: 8,
  bombshell: 7,
  casa_amor_stickswitch: 8,
  casa_amor_arrival: 6,
  casa_amor_date: 6,
  casa_amor_challenge: 6,
  public_vote: 6,
  islander_vote: 6,
  producer_twist: 6,
  minigame: 6,
  challenge: 6,
};

const ENSEMBLE_SCENE_TYPES = new Set<SceneType>([
  "minigame",
  "challenge",
  "recouple",
  "bombshell",
]);

export function buildSceneContext(args: BuildSceneContextArgs): SceneContext {
  const tension = computeTension(args);
  const pattern = selectPattern(
    args.sceneType,
    tension,
    args.participants.length,
  );
  const roles = buildPerAgentRoles(args, tension);
  const baseBeats = SCENE_TYPE_BEAT_COUNT[args.sceneType] ?? 6;
  const desiredBeats = ENSEMBLE_SCENE_TYPES.has(args.sceneType)
    ? Math.max(baseBeats, args.participants.length + 2)
    : baseBeats;
  const plannedBeats = planBeats(roles, pattern, tension, desiredBeats);
  const recentEvent = summarizeRecentEvent(args.recentScenes, args.allCast);
  const powerDynamic = summarizePowerDynamic(roles, args.allCast);

  return {
    sceneType: args.sceneType,
    tension,
    powerDynamic,
    recentEvent,
    pattern,
    plannedBeats,
    roles,
    callbackHooks: [],
  };
}

export function isLoudIntent(intent: TurnIntent): boolean {
  return LOUD_INTENTS.has(intent);
}

export type { SystemEvent };
