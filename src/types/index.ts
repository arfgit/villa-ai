export type SceneType =
  | 'firepit'
  | 'pool'
  | 'kitchen'
  | 'bedroom'
  | 'recouple'
  | 'date'
  | 'challenge'

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

export interface Episode {
  id: string
  number: number
  title: string
  scenes: Scene[]
  relationships: Relationship[]
  emotions: EmotionState[]
  couples: Couple[]
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
