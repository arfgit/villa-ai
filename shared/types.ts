export type SceneType =
  | "introductions"
  | "firepit"
  | "pool"
  | "kitchen"
  | "bedroom"
  | "recouple"
  | "date"
  | "challenge"
  | "interview"
  | "bombshell"
  | "minigame"
  | "public_vote"
  | "islander_vote"
  | "producer_twist"
  | "casa_amor_arrival"
  | "casa_amor_date"
  | "casa_amor_challenge"
  | "casa_amor_stickswitch"
  | "grand_finale";

export type Emotion =
  | "happy"
  | "flirty"
  | "jealous"
  | "angry"
  | "sad"
  | "smug"
  | "anxious"
  | "bored"
  | "shocked"
  | "neutral";

export type Pose =
  | "idle"
  | "waving"
  | "arms_crossed"
  | "pointing"
  | "hugging"
  | "crying";

export type RelationshipMetric =
  | "trust"
  | "attraction"
  | "jealousy"
  | "compatibility";

export interface Agent {
  id: string;
  name: string;
  age: number;
  archetype: string;
  emojiFace: string;
  hairAscii: string;
  personality: string;
  voice: string;
  bio: string;
  colorClass: string;
}

export interface Host {
  id: "host";
  name: string;
  colorClass: string;
  voice: string;
  emojiFace: string;
  hairAscii: string;
}

export interface EmotionState {
  agentId: string;
  primary: Emotion;
  intensity: number;
}

export interface Relationship {
  fromId: string;
  toId: string;
  trust: number;
  attraction: number;
  jealousy: number;
  compatibility: number;
}

export interface DialogueLine {
  id: string;
  agentId: string;
  text: string;
  emotion: Emotion;
  action?: string;
  targetAgentId?: string;
  intent?: TurnIntent;
  beatIndex?: number;
  quotable?: boolean;
}

export type TurnIntent =
  | "flirt"
  | "deflect"
  | "reassure"
  | "challenge"
  | "test"
  | "manipulate"
  | "escalate"
  | "soften"
  | "confess"
  | "accuse"
  | "reveal"
  | "deny"
  | "joke"
  | "retreat"
  | "declare";

export interface PlannedBeat {
  speakerId: string;
  intent: TurnIntent;
  emotionalTone: string;
  target?: string;
  loud?: boolean;
}

export type SystemEventType =
  | "trust_change"
  | "attraction_change"
  | "jealousy_spike"
  | "compatibility_change"
  | "couple_formed"
  | "couple_broken"
  | "minigame_win"
  | "challenge_win"
  | "gravity_shift"
  | "gravity_threshold";

export interface SystemEvent {
  id: string;
  type: SystemEventType;
  fromId?: string;
  toId?: string;
  delta?: number;
  label: string;
  // Required only for gravity_shift / gravity_threshold events so the reducer
  // knows which relationship axis to move. Kept narrow (trust | attraction)
  // because popularity should not touch compatibility (archetype baseline)
  // or jealousy (peer-specific, not crowd-driven).
  metric?: Extract<RelationshipMetric, "trust" | "attraction">;
}

export interface Scene {
  id: string;
  type: SceneType;
  title: string;
  participantIds: string[];
  dialogue: DialogueLine[];
  systemEvents: SystemEvent[];
  outcome: string;
  createdAt: number;
  challengeCategory?: ChallengeCategory;
  sceneContext?: SceneContext;
}

export type DialoguePattern =
  | "push_pull"
  | "question_deflection"
  | "soft_accusation"
  | "testing"
  | "confession_cascade"
  | "triangulation"
  | "freeform";

export interface Stakes {
  whatCanBeLost: string;
  whatCanBeGained: string;
}

export interface Subtext {
  surface: string;
  actual: string;
}

export interface PerAgentSceneRole {
  agentId: string;
  goal: string;
  hiddenAgenda?: string;
  stakes: Stakes;
  subtext: Subtext;
  powerPosition: "dominant" | "equal" | "submissive" | "outsider";
  openingIntent: TurnIntent;
}

export interface SceneContext {
  sceneType: SceneType;
  tension: number;
  powerDynamic: string;
  recentEvent: string;
  pattern: DialoguePattern;
  plannedBeats: PlannedBeat[];
  roles: PerAgentSceneRole[];
  callbackHooks: string[];
}

export interface Couple {
  a: string;
  b: string;
}

export interface RewardEvent {
  id: string;
  sceneId: string;
  sceneNumber: number;
  amount: number;
  reason: string;
  timestamp: number;
}

export type MemoryType = "observation" | "reflection";

export interface AgentMemory {
  id: string;
  agentId: string;
  sceneId: string;
  sceneNumber: number;
  timestamp: number;
  type: MemoryType;
  content: string;
  importance: number;
  embedding: number[];
  relatedAgentIds: string[];
}

export interface AgentBrain {
  agentId: string;
  memories: AgentMemory[];
  goal: string;
  policy: string;
  personalityShift: string;
  rewards: RewardEvent[];
  cumulativeReward: number;
  lastReflectionScene: number;
}

export type SeasonPhase =
  | "intro"
  | "early"
  | "midgame"
  | "lategame"
  | "finale_ceremony";

export interface Episode {
  id: string;
  number: number;
  title: string;
  seasonTheme: string;
  scenes: Scene[];
  relationships: Relationship[];
  emotions: EmotionState[];
  couples: Couple[];
  eliminatedIds: string[];
  unpairedStreak: Record<string, number>;
  winnerCouple: Couple | null;
  locations: Record<string, SceneType>;
  brains: Record<string, AgentBrain>;
  activeCastIds: string[];
  bombshellsIntroduced: string[];
  soloSinceBombshell: Record<string, number>;
  graceExpiresAt: Record<string, number>;
  castPool: Agent[];
  bombshellPool: Agent[];
  sceneRotation: SceneType[];
  seasonPhase: SeasonPhase;
  dramaScores: Record<string, number>;
  lastBombshellScene: number | null;
  bombshellDatingUntilScene: number | null;
  casaAmorState: CasaAmorState | null;
  viewerSentiment: Record<string, number>;
  // Tracks which agents have already crossed a popularity threshold in a given
  // direction this season. Entries look like "sarah:up" or "zion:down" — once
  // present, the corresponding gravity_threshold event does not refire for
  // that agent/direction pair, so the big dramatic beat lands exactly once.
  crossedThresholds: string[];
  // Running sum of absolute gravity deltas applied per (from→to|metric) key.
  // Drives the saturation decay in applySocialGravity: once |cumulative| >= 10,
  // further drips halve. Keys look like "sarah->zion|trust". Empty on fresh
  // sessions; hydration defaults to {}.
  gravityCumulative: Record<string, number>;
  createdAt: number;
  updatedAt: number;
}

/* ── Casa Amor ── */

export type CasaAmorPhase = "active" | "stickswitch" | "post";

export interface CasaAmorState {
  phase: CasaAmorPhase;
  originalCouples: Couple[];
  casaAmorCast: Agent[];
  villaGroupIds: string[];
  casaAmorGroupIds: string[];
  scenesCompleted: number;
  stickOrSwitchResults: StickOrSwitchChoice[];
}

export interface StickOrSwitchChoice {
  ogIslanderId: string;
  choice: "stick" | "switch";
  newPartnerId?: string;
}

export type CoupleArchetype =
  | "mom_and_dad"
  | "friend_couple"
  | "friend_couple_incognito"
  | "star_crossed"
  | "singleton";

export type ChallengeCategory = "learn_facts" | "explore_attraction";

/* ── Viewer Chat ── */

export interface ViewerMessage {
  id: string;
  username: string;
  text: string;
  timestamp: number;
  sentiment: "positive" | "negative" | "neutral" | "chaotic";
}

export interface LlmDialogueLine {
  agentId: string;
  text: string;
  emotion: Emotion;
  action?: string;
  targetAgentId?: string;
  intent?: TurnIntent;
  beatIndex?: number;
  // LLM-emitted flag: line is high-drama enough for viewer-chat reactions.
  quotable?: boolean;
}

export interface LlmSystemEvent {
  type: SystemEventType;
  fromId?: string;
  toId?: string;
  delta?: number;
  label: string;
}

export interface LlmEmotionUpdate {
  agentId: string;
  primary: Emotion;
  intensity: number;
}

export interface LlmSceneResponse {
  dialogue: LlmDialogueLine[];
  systemEvents: LlmSystemEvent[];
  emotionUpdates: LlmEmotionUpdate[];
  outcome: string;
}

export interface LlmBatchSceneResponse {
  scenes: LlmSceneResponse[];
}

// Snapshot of a completed season persisted to the
// `villaSessions/{id}/seasons/{number}` subcollection when the player
// starts the next season in the same session. Preserves everything the
// UI would need to replay or summarize a past season — scenes, final
// relationships, winners, elimination order — so future seasons can
// reference "Season 3 winners" without the session doc growing
// unboundedly. Separate from SeasonExport, which is the JSON a user
// downloads for offline training data.
export interface SeasonArchive {
  sessionId: string;
  seasonNumber: number;
  archivedAt: number;
  episodeId: string;
  episodeTitle: string;
  seasonTheme: string;
  castPool: Agent[];
  bombshellPool: Agent[];
  winnerCouple: Couple | null;
  eliminatedIds: string[];
  scenes: Scene[];
  finalRelationships: Relationship[];
  finalViewerSentiment: Record<string, number>;
  dramaScores: Record<string, number>;
}

export interface SeasonExport {
  version: 1 | 2;
  exportedAt: number;
  season: {
    id: string;
    number: number;
    theme: string;
    castPool: Agent[];
    bombshellPool: Agent[];
    winnerCouple: Couple | null;
    eliminationOrder: Array<{ agentId: string; sceneNumber: number }>;
    coupleHistory: Array<{
      couple: Couple;
      formedAt: number;
      brokenAt: number | null;
    }>;
    keyMoments: Array<{
      sceneNumber: number;
      description: string;
      type: string;
    }>;
  };
  scenes: Array<{
    sceneNumber: number;
    type: SceneType;
    title: string;
    participantIds: string[];
    dialogueSummary: string;
    systemEvents: SystemEvent[];
    outcome: string;
    sceneContext?: SceneContext;
  }>;
  relationships: {
    final: Relationship[];
    snapshots: Array<{ afterScene: number; relationships: Relationship[] }>;
  };
}

export interface RLExport {
  version: 1 | 2;
  exportedAt: number;
  seasonId: string;
  agents: Array<{
    agentId: string;
    name: string;
    archetype: string;
    goal: string;
    policy: string;
    cumulativeReward: number;
    rewards: RewardEvent[];
    memories: Array<Omit<AgentMemory, "embedding">>;
  }>;
}

/* ── Villa Session & Training ── */

export interface SeasonSummary {
  seasonNumber: number;
  theme: string;
  winnerNames: [string, string] | null;
  totalScenes: number;
  eliminationCount: number;
  highlights: string[];
  lessons: string[];
}

export interface VillaSession {
  sessionId: string;
  createdAt: number;
  updatedAt: number;
  cast: Agent[];
  episode: Episode;
  trainingContributions: string[];
}

export interface TrainingEntry {
  id: string;
  sessionId: string;
  seasonNumber: number;
  summary: SeasonSummary;
  seasonExport: SeasonExport;
  rlExport: RLExport;
  exportedAt: number;
  createdAt: number;
}

/* ── Prompt builder inputs (shared so the server can assemble a prompt from ── */
/* ── what the client sends over the wire, rather than accepting a raw       ── */
/* ── client-built prompt string that bypasses server validation).           ── */

export interface RecouplePlanStep {
  chooserId: string;
  chooserName: string;
  partnerId: string;
  partnerName: string;
  rationale: string;
}

export interface RecoupleScript {
  steps: RecouplePlanStep[];
  unpairedId?: string;
  unpairedName?: string;
}

export interface MinigameDefinition {
  name: string;
  category: "learn_facts" | "explore_attraction";
  rules: string;
  winCondition: string;
}

export interface BuildArgs {
  cast: Agent[];
  host?: Host;
  relationships: Relationship[];
  emotions: EmotionState[];
  couples: Couple[];
  recentScenes: Scene[];
  sceneType: SceneType;
  seasonTheme: string;
  sceneNumber: number;
  totalScenes?: number;
  forcedParticipants?: string[];
  isIntroduction?: boolean;
  isFirstCoupling?: boolean;
  isFinale?: boolean;
  agentMemories?: Record<string, AgentMemory[]>;
  agentGoals?: Record<string, string>;
  agentPolicies?: Record<string, string>;
  arrivingBombshell?: Agent;
  arrivingBombshells?: Agent[];
  interviewSubjectId?: string;
  competingCoupleIds?: string[][];
  isRewardDate?: boolean;
  rewardDateCoupleNames?: [string, string];
  eliminationNarrative?: string;
  eliminatedNames?: string;
  challengeCategory?: ChallengeCategory;
  casaAmorCast?: Agent[];
  casaAmorCoupleArchetypes?: string;
  grandFinaleRanking?: string;
  sceneContext?: SceneContext;
  recoupleScript?: RecoupleScript;
  minigameDefinition?: MinigameDefinition;
  // When prefetched, the outline the batch planner sketched for this scene.
  // The prompt injects goal / tension / stakes / subtext as director notes
  // so the LLM realizes an intentional beat instead of drifting.
  outline?: SceneOutline;
  // Per-agent live-chat sentiment (0-100). Drives the "VIEWER VIBES" block
  // the prompt injects so the LLM can reference viewer favorites/targets in
  // dialogue. Optional — when undefined or all neutral, no block is emitted.
  viewerSentiment?: Record<string, number>;
}

/* ── Scene outlines (batch planner) ────────────────────────────────────── */

// A scene outline is the pre-realization sketch produced by planBatch.
// The batch generator takes a list of these and realizes each into a full
// scene (dialogue + events). Outlines carry narrative intent — goal,
// stakes, tension — so the batch reads as a planned arc rather than N
// independent scenes glued together.
export interface SceneOutline {
  sequence: number; // 0-indexed position within the batch
  type: SceneType;
  participants: string[]; // agent ids expected to speak
  location: SceneType; // scene location / environment (same enum as type)
  goal: string; // what this scene accomplishes for the arc
  tension: number; // 0-100 — how heated this beat should read
  stakes: string; // what's at risk by scene end
  subtext: string[]; // 0-3 things the dialogue implies but doesn't say outright
  // If set, the sequence index this outline depends on. The realizer must
  // generate the dependency first so the working state reflects its
  // outcome before this outline's prompt is built. Simple linear deps for
  // MVP (Scene[i] may depend on Scene[i-1]); full dep graph deferred.
  dependsOnSequence?: number;
}

// Lifecycle wrapper used by the queue / metrics. The scene field is
// populated once realization completes; it stays undefined while the
// outline is still in flight.
export type ReadySceneStatus =
  | "planned"
  | "generating"
  | "ready"
  | "playing"
  | "played"
  | "failed";

export interface ReadyScene {
  outline: SceneOutline;
  scene?: LlmSceneResponse;
  status: ReadySceneStatus;
  // How many realization attempts have been made (for retry accounting).
  attempts: number;
}
