import type {
  Agent,
  AgentMemory,
  Couple,
  EmotionState,
  Host,
  Relationship,
  Scene,
  SceneType,
} from "@villa-ai/shared";
import type { BuildArgs } from "./prompt.js";

// Validate untrusted BuildArgs from the wire. The prompt builder itself
// uses clip() on every interpolated string (strips control chars, caps
// length) so this layer focuses on:
//   1. shape correctness (no crash in the builder)
//   2. array/string size caps (reject DoS-sized payloads early)
//   3. enum membership for the fields the builder switches on
//
// Returns `null` on any violation. The caller translates that to a 400.

const MAX_CAST = 30;
const MAX_RELATIONSHIPS = 900; // 30 * 30
const MAX_MEMORIES_PER_AGENT = 50;
const MAX_RECENT_SCENES = 10;
const MAX_STRING = 2000;
const MAX_THEME_LEN = 4000;

const VALID_SCENE_TYPES: ReadonlySet<string> = new Set([
  "introductions",
  "firepit",
  "pool",
  "kitchen",
  "bedroom",
  "recouple",
  "date",
  "challenge",
  "interview",
  "bombshell",
  "minigame",
  "public_vote",
  "islander_vote",
  "producer_twist",
  "casa_amor_arrival",
  "casa_amor_date",
  "casa_amor_challenge",
  "casa_amor_stickswitch",
  "grand_finale",
]);

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function isShortString(v: unknown, max = MAX_STRING): v is string {
  return typeof v === "string" && v.length <= max;
}

function isAgent(v: unknown): v is Agent {
  if (!isObj(v)) return false;
  return (
    isShortString(v.id, 64) &&
    isShortString(v.name, 80) &&
    typeof v.age === "number" &&
    isShortString(v.archetype, 120) &&
    isShortString(v.emojiFace, 20) &&
    isShortString(v.hairAscii, 200) &&
    isShortString(v.personality, 500) &&
    isShortString(v.voice, 500) &&
    isShortString(v.bio, 1000) &&
    isShortString(v.colorClass, 64)
  );
}

function isHost(v: unknown): v is Host {
  if (!isObj(v)) return false;
  return (
    v.id === "host" &&
    isShortString(v.name, 80) &&
    isShortString(v.colorClass, 64) &&
    isShortString(v.voice, 500) &&
    isShortString(v.emojiFace, 20) &&
    isShortString(v.hairAscii, 200)
  );
}

function isRelationship(v: unknown): v is Relationship {
  if (!isObj(v)) return false;
  return (
    isShortString(v.fromId, 64) &&
    isShortString(v.toId, 64) &&
    typeof v.trust === "number" &&
    typeof v.attraction === "number" &&
    typeof v.jealousy === "number" &&
    typeof v.compatibility === "number"
  );
}

function isEmotion(v: unknown): v is EmotionState {
  if (!isObj(v)) return false;
  return (
    isShortString(v.agentId, 64) &&
    typeof v.primary === "string" &&
    typeof v.intensity === "number"
  );
}

function isCouple(v: unknown): v is Couple {
  if (!isObj(v)) return false;
  return isShortString(v.a, 64) && isShortString(v.b, 64);
}

function isScene(v: unknown): v is Scene {
  if (!isObj(v)) return false;
  return (
    isShortString(v.id, 64) &&
    typeof v.type === "string" &&
    VALID_SCENE_TYPES.has(v.type) &&
    Array.isArray(v.dialogue) &&
    Array.isArray(v.systemEvents) &&
    Array.isArray(v.participantIds) &&
    typeof v.outcome === "string"
  );
}

function isMemory(v: unknown): v is AgentMemory {
  if (!isObj(v)) return false;
  return (
    isShortString(v.id, 64) &&
    isShortString(v.agentId, 64) &&
    (v.type === "observation" || v.type === "reflection") &&
    isShortString(v.content, 2000) &&
    typeof v.importance === "number" &&
    typeof v.sceneNumber === "number" &&
    Array.isArray(v.embedding)
  );
}

function isStringDict(
  v: unknown,
  maxLen = MAX_STRING,
): v is Record<string, string> {
  if (!isObj(v)) return false;
  for (const [k, val] of Object.entries(v)) {
    if (k.length > 64) return false;
    if (!isShortString(val, maxLen)) return false;
  }
  return true;
}

function isMemoryDict(v: unknown): v is Record<string, AgentMemory[]> {
  if (!isObj(v)) return false;
  for (const [k, val] of Object.entries(v)) {
    if (k.length > 64) return false;
    if (!Array.isArray(val) || val.length > MAX_MEMORIES_PER_AGENT)
      return false;
    if (!val.every(isMemory)) return false;
  }
  return true;
}

function isStringArray(v: unknown, maxLen = 64, maxItems = 50): v is string[] {
  return (
    Array.isArray(v) &&
    v.length <= maxItems &&
    v.every((item) => isShortString(item, maxLen))
  );
}

// Public entry point. Returns the narrowed BuildArgs or null if any
// field fails validation. Null responses carry no detail on purpose —
// developer tooling can inspect console logs, but the wire never tells
// clients which field tripped the check.
export function coerceBuildArgs(raw: unknown): BuildArgs | null {
  if (!isObj(raw)) return null;

  if (
    !Array.isArray(raw.cast) ||
    raw.cast.length === 0 ||
    raw.cast.length > MAX_CAST
  ) {
    return null;
  }
  if (!raw.cast.every(isAgent)) return null;

  if (raw.host !== undefined && !isHost(raw.host)) return null;

  if (
    !Array.isArray(raw.relationships) ||
    raw.relationships.length > MAX_RELATIONSHIPS ||
    !raw.relationships.every(isRelationship)
  ) {
    return null;
  }

  if (
    !Array.isArray(raw.emotions) ||
    raw.emotions.length > MAX_CAST ||
    !raw.emotions.every(isEmotion)
  ) {
    return null;
  }

  if (
    !Array.isArray(raw.couples) ||
    raw.couples.length > MAX_CAST ||
    !raw.couples.every(isCouple)
  ) {
    return null;
  }

  if (
    !Array.isArray(raw.recentScenes) ||
    raw.recentScenes.length > MAX_RECENT_SCENES ||
    !raw.recentScenes.every(isScene)
  ) {
    return null;
  }

  if (
    typeof raw.sceneType !== "string" ||
    !VALID_SCENE_TYPES.has(raw.sceneType)
  ) {
    return null;
  }

  if (!isShortString(raw.seasonTheme, MAX_THEME_LEN)) return null;
  if (typeof raw.sceneNumber !== "number" || raw.sceneNumber < 0) return null;

  // Optional fields — if present, must be valid.
  if (raw.totalScenes !== undefined && typeof raw.totalScenes !== "number")
    return null;
  if (
    raw.forcedParticipants !== undefined &&
    !isStringArray(raw.forcedParticipants)
  )
    return null;
  if (
    raw.isIntroduction !== undefined &&
    typeof raw.isIntroduction !== "boolean"
  )
    return null;
  if (raw.isFinale !== undefined && typeof raw.isFinale !== "boolean")
    return null;
  if (raw.agentMemories !== undefined && !isMemoryDict(raw.agentMemories))
    return null;
  if (raw.agentGoals !== undefined && !isStringDict(raw.agentGoals, 500))
    return null;
  if (raw.agentPolicies !== undefined && !isStringDict(raw.agentPolicies, 500))
    return null;
  if (raw.arrivingBombshell !== undefined && !isAgent(raw.arrivingBombshell))
    return null;
  if (
    raw.arrivingBombshells !== undefined &&
    (!Array.isArray(raw.arrivingBombshells) ||
      raw.arrivingBombshells.length > 5 ||
      !raw.arrivingBombshells.every(isAgent))
  ) {
    return null;
  }
  if (
    raw.interviewSubjectId !== undefined &&
    !isShortString(raw.interviewSubjectId, 64)
  )
    return null;
  if (
    raw.competingCoupleIds !== undefined &&
    (!Array.isArray(raw.competingCoupleIds) ||
      raw.competingCoupleIds.length > MAX_CAST ||
      !raw.competingCoupleIds.every(
        (pair) => isStringArray(pair, 64, 2) && (pair as string[]).length === 2,
      ))
  ) {
    return null;
  }
  if (raw.isRewardDate !== undefined && typeof raw.isRewardDate !== "boolean")
    return null;
  if (raw.rewardDateCoupleNames !== undefined) {
    if (
      !Array.isArray(raw.rewardDateCoupleNames) ||
      raw.rewardDateCoupleNames.length !== 2 ||
      !raw.rewardDateCoupleNames.every((n: unknown) => isShortString(n, 80))
    ) {
      return null;
    }
  }
  if (
    raw.eliminationNarrative !== undefined &&
    !isShortString(raw.eliminationNarrative, 500)
  )
    return null;
  if (
    raw.eliminatedNames !== undefined &&
    !isShortString(raw.eliminatedNames, 300)
  )
    return null;
  if (
    raw.challengeCategory !== undefined &&
    raw.challengeCategory !== "learn_facts" &&
    raw.challengeCategory !== "explore_attraction"
  ) {
    return null;
  }
  if (
    raw.casaAmorCast !== undefined &&
    (!Array.isArray(raw.casaAmorCast) ||
      raw.casaAmorCast.length > MAX_CAST ||
      !raw.casaAmorCast.every(isAgent))
  ) {
    return null;
  }
  if (
    raw.casaAmorCoupleArchetypes !== undefined &&
    !isShortString(raw.casaAmorCoupleArchetypes, 1000)
  ) {
    return null;
  }
  if (
    raw.grandFinaleRanking !== undefined &&
    !isShortString(raw.grandFinaleRanking, 1000)
  ) {
    return null;
  }
  if (
    raw.isFirstCoupling !== undefined &&
    typeof raw.isFirstCoupling !== "boolean"
  ) {
    return null;
  }
  // sceneContext, recoupleScript, minigameDefinition originate client-side
  // but reach the server over HTTP, so a crafted body can poison them —
  // validate the narrow shape the prompt builder actually reads.
  if (
    raw.sceneContext !== undefined &&
    !isValidSceneContext(raw.sceneContext)
  ) {
    return null;
  }
  if (
    raw.recoupleScript !== undefined &&
    !isValidRecoupleScript(raw.recoupleScript)
  ) {
    return null;
  }
  if (
    raw.minigameDefinition !== undefined &&
    !isValidMinigameDefinition(raw.minigameDefinition)
  ) {
    return null;
  }
  if (raw.outline !== undefined && !isValidSceneOutline(raw.outline)) {
    return null;
  }
  return raw as unknown as BuildArgs;
}

function isValidSceneOutline(v: unknown): boolean {
  if (!isObj(v)) return false;
  if (typeof v.sequence !== "number" || v.sequence < 0 || v.sequence > 32) {
    return false;
  }
  if (typeof v.type !== "string" || !VALID_SCENE_TYPES.has(v.type))
    return false;
  if (typeof v.location !== "string" || !VALID_SCENE_TYPES.has(v.location)) {
    return false;
  }
  if (!isStringArray(v.participants, 64, MAX_CAST)) return false;
  if (!isShortString(v.goal, 500)) return false;
  if (typeof v.tension !== "number" || v.tension < 0 || v.tension > 100) {
    return false;
  }
  if (!isShortString(v.stakes, 500)) return false;
  if (!Array.isArray(v.subtext) || v.subtext.length > 6) return false;
  if (!v.subtext.every((s: unknown) => isShortString(s, 300))) return false;
  if (
    v.dependsOnSequence !== undefined &&
    (typeof v.dependsOnSequence !== "number" ||
      v.dependsOnSequence < 0 ||
      v.dependsOnSequence > 32)
  ) {
    return false;
  }
  return true;
}

const VALID_INTENTS: ReadonlySet<string> = new Set([
  "flirt",
  "deflect",
  "reassure",
  "challenge",
  "test",
  "manipulate",
  "escalate",
  "soften",
  "confess",
  "accuse",
  "reveal",
  "deny",
  "joke",
  "retreat",
  "declare",
]);
const VALID_PATTERNS: ReadonlySet<string> = new Set([
  "push_pull",
  "question_deflection",
  "soft_accusation",
  "testing",
  "confession_cascade",
  "triangulation",
  "freeform",
]);
const VALID_POWER: ReadonlySet<string> = new Set([
  "dominant",
  "equal",
  "submissive",
  "outsider",
]);

function isValidPlannedBeat(v: unknown): boolean {
  if (!isObj(v)) return false;
  if (!isShortString(v.speakerId, 64)) return false;
  if (typeof v.intent !== "string" || !VALID_INTENTS.has(v.intent))
    return false;
  if (!isShortString(v.emotionalTone, 200)) return false;
  if (v.target !== undefined && !isShortString(v.target, 64)) return false;
  if (v.loud !== undefined && typeof v.loud !== "boolean") return false;
  return true;
}

function isValidPerAgentRole(v: unknown): boolean {
  if (!isObj(v)) return false;
  if (!isShortString(v.agentId, 64)) return false;
  if (!isShortString(v.goal, 300)) return false;
  if (v.hiddenAgenda !== undefined && !isShortString(v.hiddenAgenda, 300))
    return false;
  if (!isObj(v.stakes)) return false;
  const stakes = v.stakes as Record<string, unknown>;
  if (!isShortString(stakes.whatCanBeLost, 300)) return false;
  if (!isShortString(stakes.whatCanBeGained, 300)) return false;
  if (!isObj(v.subtext)) return false;
  const subtext = v.subtext as Record<string, unknown>;
  if (!isShortString(subtext.surface, 300)) return false;
  if (!isShortString(subtext.actual, 300)) return false;
  if (typeof v.powerPosition !== "string" || !VALID_POWER.has(v.powerPosition))
    return false;
  if (
    typeof v.openingIntent !== "string" ||
    !VALID_INTENTS.has(v.openingIntent)
  )
    return false;
  return true;
}

function isValidSceneContext(v: unknown): boolean {
  if (!isObj(v)) return false;
  if (typeof v.sceneType !== "string" || !VALID_SCENE_TYPES.has(v.sceneType))
    return false;
  if (typeof v.tension !== "number" || v.tension < 0 || v.tension > 100)
    return false;
  if (!isShortString(v.powerDynamic, 500)) return false;
  if (!isShortString(v.recentEvent, 500)) return false;
  if (typeof v.pattern !== "string" || !VALID_PATTERNS.has(v.pattern))
    return false;
  if (!Array.isArray(v.plannedBeats) || v.plannedBeats.length > 16)
    return false;
  if (!v.plannedBeats.every(isValidPlannedBeat)) return false;
  if (!Array.isArray(v.roles) || v.roles.length > MAX_CAST) return false;
  if (!v.roles.every(isValidPerAgentRole)) return false;
  if (
    !Array.isArray(v.callbackHooks) ||
    v.callbackHooks.length > 16 ||
    !v.callbackHooks.every((h: unknown) => isShortString(h, 300))
  ) {
    return false;
  }
  return true;
}

function isValidRecouplePlanStep(v: unknown): boolean {
  if (!isObj(v)) return false;
  return (
    isShortString(v.chooserId, 64) &&
    isShortString(v.chooserName, 80) &&
    isShortString(v.partnerId, 64) &&
    isShortString(v.partnerName, 80) &&
    isShortString(v.rationale, 300)
  );
}

function isValidRecoupleScript(v: unknown): boolean {
  if (!isObj(v)) return false;
  if (!Array.isArray(v.steps) || v.steps.length > MAX_CAST) return false;
  if (!v.steps.every(isValidRecouplePlanStep)) return false;
  if (v.unpairedId !== undefined && !isShortString(v.unpairedId, 64))
    return false;
  if (v.unpairedName !== undefined && !isShortString(v.unpairedName, 80))
    return false;
  return true;
}

function isValidMinigameDefinition(v: unknown): boolean {
  if (!isObj(v)) return false;
  return (
    isShortString(v.name, 120) &&
    (v.category === "learn_facts" || v.category === "explore_attraction") &&
    isShortString(v.rules, 600) &&
    isShortString(v.winCondition, 300)
  );
}

// Export the scene-type sentinel for the route handler to surface as a
// client-visible error, separate from other validation failures (useful
// because sceneType drives a lot of caller behavior).
export function isValidSceneType(s: unknown): s is SceneType {
  return typeof s === "string" && VALID_SCENE_TYPES.has(s);
}
