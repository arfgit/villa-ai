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
  | "challenge_win";

export interface SystemEvent {
  id: string;
  type: SystemEventType;
  fromId?: string;
  toId?: string;
  delta?: number;
  label: string;
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
}
