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
  // sceneContext, recoupleScript, minigameDefinition: shapes are internal-
  // only (never inputs users control). We trust them by type here; if we
  // later expose them to external clients, add narrow checks.
  return raw as unknown as BuildArgs;
}

// Export the scene-type sentinel for the route handler to surface as a
// client-visible error, separate from other validation failures (useful
// because sceneType drives a lot of caller behavior).
export function isValidSceneType(s: unknown): s is SceneType {
  return typeof s === "string" && VALID_SCENE_TYPES.has(s);
}
