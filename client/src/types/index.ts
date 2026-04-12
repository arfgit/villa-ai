export type SceneType =
  | 'firepit'
  | 'pool'
  | 'kitchen'
  | 'bedroom'
  | 'recouple'
  | 'date'
  | 'challenge'
  | 'interview'   // confessional — 1 islander talking to camera
  | 'bombshell'   // new contestant enters and steals a partner
  | 'minigame'    // couples compete for a reward + bond boost

export type Emotion =
  | 'happy' | 'flirty' | 'jealous' | 'angry'
  | 'sad'   | 'smug'   | 'anxious' | 'bored'
  | 'shocked' | 'neutral'

export type Pose = 'idle' | 'waving' | 'arms_crossed' | 'pointing' | 'hugging' | 'crying'

export type RelationshipMetric = 'trust' | 'attraction' | 'jealousy'

export interface Agent {
  id: string
  name: string
  age: number
  archetype: string
  emojiFace: string
  hairAscii: string
  personality: string
  voice: string
  bio: string
  colorClass: string
}

// The host is a narrator / emcee figure. Not a contestant — never couples,
// never eliminated, never scored. They appear in intros, recouples, bombshells.
// Rendering fields match Agent so they can be drawn by AgentAscii.
export interface Host {
  id: 'host'
  name: string
  colorClass: string
  voice: string
  emojiFace: string
  hairAscii: string
}

export interface EmotionState {
  agentId: string
  primary: Emotion
  intensity: number
}

export interface Relationship {
  fromId: string
  toId: string
  trust: number
  attraction: number
  jealousy: number
}

export interface DialogueLine {
  id: string
  agentId: string
  text: string
  emotion: Emotion
  action?: string
  targetAgentId?: string
}

export type SystemEventType =
  | 'trust_change'
  | 'attraction_change'
  | 'jealousy_spike'
  | 'couple_formed'
  | 'couple_broken'
  | 'minigame_win'      // fromId = winning couple member; toId = their partner
  | 'challenge_win'     // fromId = winning couple member; toId = their partner (big reward)

export interface SystemEvent {
  id: string
  type: SystemEventType
  fromId?: string
  toId?: string
  delta?: number
  label: string
}

export interface Scene {
  id: string
  type: SceneType
  title: string
  participantIds: string[]
  dialogue: DialogueLine[]
  systemEvents: SystemEvent[]
  outcome: string
  createdAt: number
}

export interface Couple {
  a: string
  b: string
}

// Reward events for the RL-style learning loop. Computed automatically after
// every scene based on observable state transitions (couples formed/broken,
// eliminations, minigame wins, etc.). Each agent accumulates a trajectory
// they can reflect on to update their policy.
export interface RewardEvent {
  id: string
  sceneId: string
  sceneNumber: number
  amount: number     // can be negative
  reason: string     // human-readable reason string
  timestamp: number
}

export type MemoryType = 'observation' | 'reflection'

export interface AgentMemory {
  id: string
  agentId: string
  sceneId: string
  sceneNumber: number
  timestamp: number
  type: MemoryType
  content: string
  importance: number  // 1-10 (LLM-rated)
  embedding: number[]
  relatedAgentIds: string[]
}

export interface AgentBrain {
  agentId: string
  memories: AgentMemory[]
  goal: string                // current self-stated goal, updated by reflection
  policy: string              // current strategy label (e.g. "loyal pursuer", "opportunistic flirt")
  personalityShift: string    // accumulating drift from cast.ts baseline
  rewards: RewardEvent[]      // reward trajectory for RL-style policy learning
  cumulativeReward: number    // sum of all rewards so far
  lastReflectionScene: number
}

export type SeasonPhase = 'intro' | 'early' | 'midgame' | 'lategame' | 'finale_ceremony'

export interface Episode {
  id: string
  number: number                      // season number within this browser session
  title: string
  seasonTheme: string
  scenes: Scene[]
  relationships: Relationship[]
  emotions: EmotionState[]
  couples: Couple[]
  eliminatedIds: string[]
  unpairedStreak: Record<string, number>  // deprecated, kept for type compat
  winnerCouple: Couple | null
  locations: Record<string, SceneType>
  brains: Record<string, AgentBrain>
  activeCastIds: string[]             // who's actually in the villa right now (main cast + any bombshells that arrived)
  bombshellsIntroduced: string[]      // bombshell ids that have arrived so far
  soloSinceBombshell: Record<string, number>  // maps agentId → scene number when stolen (for per-scene penalty)
  // Grace period tracking: when a bombshell steals someone's partner, the
  // victim gets protected from elimination for the next 2 recouples. Maps
  // agentId → the recouple ordinal at which their protection expires.
  graceExpiresAt: Record<string, number>
  // This season's randomly-selected cast + bombshell pool. Sampled from the
  // larger CAST_POOL / BOMBSHELL_POOL_ALL at episode creation time so each
  // season runs with different contestants.
  castPool: Agent[]
  bombshellPool: Agent[]
  sceneRotation: SceneType[]          // legacy — kept for fallback but no longer generated
  // Dynamic season state
  seasonPhase: SeasonPhase
  dramaScores: Record<string, number> // per-agent drama scores for pacing
  /** Scene index when last bombshell arrived */
  lastBombshellScene: number | null
  /** If set, a bombshell is in their dating window until this scene index */
  bombshellDatingUntilScene: number | null
  createdAt: number
  updatedAt: number
}

export interface LlmDialogueLine {
  agentId: string
  text: string
  emotion: Emotion
  action?: string
  targetAgentId?: string
}

export interface LlmSystemEvent {
  type: SystemEventType
  fromId?: string
  toId?: string
  delta?: number
  label: string
}

export interface LlmEmotionUpdate {
  agentId: string
  primary: Emotion
  intensity: number
}

export interface LlmSceneResponse {
  dialogue: LlmDialogueLine[]
  systemEvents: LlmSystemEvent[]
  emotionUpdates: LlmEmotionUpdate[]
  outcome: string
}

export interface LlmBatchSceneResponse {
  scenes: LlmSceneResponse[]
}

// Fine-tuning / RL data export types

export interface SeasonExport {
  version: 1
  exportedAt: number
  season: {
    id: string
    number: number
    theme: string
    castPool: Agent[]
    bombshellPool: Agent[]
    winnerCouple: Couple | null
    eliminationOrder: Array<{ agentId: string; sceneNumber: number }>
    coupleHistory: Array<{ couple: Couple; formedAt: number; brokenAt: number | null }>
    keyMoments: Array<{ sceneNumber: number; description: string; type: string }>
  }
  scenes: Array<{
    sceneNumber: number
    type: SceneType
    title: string
    participantIds: string[]
    dialogueSummary: string
    systemEvents: SystemEvent[]
    outcome: string
  }>
  relationships: {
    final: Relationship[]
    snapshots: Array<{ afterScene: number; relationships: Relationship[] }>
  }
}

export interface RLExport {
  version: 1
  exportedAt: number
  seasonId: string
  agents: Array<{
    agentId: string
    name: string
    archetype: string
    goal: string
    policy: string
    cumulativeReward: number
    rewards: RewardEvent[]
    memories: Array<Omit<AgentMemory, 'embedding'>>
  }>
}
