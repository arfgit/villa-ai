import { create } from 'zustand'
import type { Episode, Scene, SceneType, RelationshipMetric, LlmSceneResponse, Relationship, EmotionState } from '@/types'
import { CAST } from '@/data/cast'
import { SCENE_LABELS } from '@/data/environments'
import { buildSeedRelationships, buildSeedEmotions } from '@/data/seedRelationships'
import { buildScenePrompt } from '@/lib/prompt'
import { generateSceneFromGemini } from '@/lib/gemini'
import { newId } from '@/lib/ids'

interface UiState {
  isCastOpen: boolean
  isRelationshipsOpen: boolean
  isScenarioPickerOpen: boolean
  activeRelationshipMetric: RelationshipMetric
  autoPlay: boolean
  lineDelayMs: number
  tooltipsEnabled: boolean
  musicEnabled: boolean
}

interface VillaState {
  cast: typeof CAST
  episode: Episode
  currentSceneId: string | null
  currentLineIndex: number
  isGenerating: boolean
  lastError: string | null
  ui: UiState

  startNewEpisode: () => void
  generateScene: (type?: SceneType) => Promise<void>
  advanceLine: () => void
  resetLineIndex: () => void
  setAutoPlay: (v: boolean) => void
  toggleCast: () => void
  toggleRelationships: () => void
  setRelationshipMetric: (m: RelationshipMetric) => void
  selectScene: (sceneId: string) => void
  toggleTooltips: () => void
  toggleMusic: () => void
}

function createEpisode(): Episode {
  return {
    id: newId('ep'),
    number: 1,
    title: 'Season 1',
    scenes: [],
    relationships: buildSeedRelationships(),
    emotions: buildSeedEmotions(),
    couples: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  }
}

function applyRelDelta(rels: Relationship[], a: string, b: string, type: 'trust_change' | 'attraction_change' | 'jealousy_spike', delta: number) {
  const forward = rels.find((r) => r.fromId === a && r.toId === b)
  const backward = rels.find((r) => r.fromId === b && r.toId === a)
  for (const r of [forward, backward]) {
    if (!r) continue
    if (type === 'trust_change') r.trust = clamp(r.trust + delta)
    if (type === 'attraction_change') r.attraction = clamp(r.attraction + delta)
    if (type === 'jealousy_spike') r.jealousy = clamp(r.jealousy + Math.abs(delta))
  }
}

function applyDeltas(
  rels: Relationship[],
  emotions: EmotionState[],
  couples: { a: string; b: string }[],
  llm: LlmSceneResponse
): { rels: Relationship[]; emotions: EmotionState[]; couples: { a: string; b: string }[] } {
  const newRels = rels.map((r) => ({ ...r }))
  let newCouples = couples.map((c) => ({ ...c }))

  for (const event of llm.systemEvents) {
    if (event.type === 'couple_formed' && event.fromId && event.toId) {
      newCouples = newCouples.filter((c) => c.a !== event.fromId && c.b !== event.fromId && c.a !== event.toId && c.b !== event.toId)
      newCouples.push({ a: event.fromId, b: event.toId })
      continue
    }
    if (event.type === 'couple_broken' && event.fromId && event.toId) {
      newCouples = newCouples.filter((c) =>
        !((c.a === event.fromId && c.b === event.toId) || (c.a === event.toId && c.b === event.fromId))
      )
      continue
    }

    if (!event.fromId || !event.toId || event.delta === undefined) continue
    if (event.type === 'trust_change' || event.type === 'attraction_change' || event.type === 'jealousy_spike') {
      applyRelDelta(newRels, event.fromId, event.toId, event.type, event.delta)
    }
  }

  const newEmotions = emotions.map((e) => ({ ...e }))
  for (const update of llm.emotionUpdates) {
    const idx = newEmotions.findIndex((e) => e.agentId === update.agentId)
    if (idx >= 0) {
      newEmotions[idx] = { agentId: update.agentId, primary: update.primary, intensity: update.intensity }
    }
  }

  return { rels: newRels, emotions: newEmotions, couples: newCouples }
}

function clamp(n: number): number {
  return Math.max(0, Math.min(100, n))
}

const SCENE_ROTATION: SceneType[] = ['firepit', 'pool', 'kitchen', 'bedroom', 'date', 'challenge', 'recouple']

export const useVillaStore = create<VillaState>((set, get) => ({
  cast: CAST,
  episode: createEpisode(),
  currentSceneId: null,
  currentLineIndex: 0,
  isGenerating: false,
  lastError: null,
  ui: {
    isCastOpen: false,
    isRelationshipsOpen: false,
    isScenarioPickerOpen: false,
    activeRelationshipMetric: 'attraction',
    autoPlay: false,
    lineDelayMs: 2200,
    tooltipsEnabled: true,
    musicEnabled: false,
  },

  startNewEpisode: () => {
    set({
      episode: createEpisode(),
      currentSceneId: null,
      currentLineIndex: 0,
      lastError: null,
    })
  },

  generateScene: async (type) => {
    const initial = get()
    if (initial.isGenerating) return

    const sceneType = type ?? SCENE_ROTATION[initial.episode.scenes.length % SCENE_ROTATION.length]!
    const sceneInfo = SCENE_LABELS[sceneType]
    const generationEpisodeId = initial.episode.id

    set({ isGenerating: true, lastError: null })

    try {
      const prompt = buildScenePrompt({
        cast: initial.cast,
        relationships: initial.episode.relationships,
        emotions: initial.episode.emotions,
        couples: initial.episode.couples,
        recentScenes: initial.episode.scenes.slice(-3),
        sceneType,
      })

      const llm = await generateSceneFromGemini(prompt, initial.cast.map((a) => a.id))

      const fresh = get()
      if (fresh.episode.id !== generationEpisodeId) {
        set({ isGenerating: false })
        return
      }

      const participantIds = Array.from(new Set(llm.dialogue.map((d) => d.agentId)))

      const scene: Scene = {
        id: newId('scene'),
        type: sceneType,
        title: sceneInfo.title,
        participantIds,
        dialogue: llm.dialogue.map((d) => ({
          id: newId('line'),
          agentId: d.agentId,
          text: d.text,
          emotion: d.emotion,
          action: d.action,
          targetAgentId: d.targetAgentId,
        })),
        systemEvents: llm.systemEvents.map((e) => ({
          id: newId('evt'),
          type: e.type,
          fromId: e.fromId,
          toId: e.toId,
          delta: e.delta,
          label: e.label,
        })),
        outcome: llm.outcome,
        createdAt: Date.now(),
      }

      const { rels, emotions, couples } = applyDeltas(
        fresh.episode.relationships,
        fresh.episode.emotions,
        fresh.episode.couples,
        llm
      )

      set({
        episode: {
          ...fresh.episode,
          scenes: [...fresh.episode.scenes, scene],
          relationships: rels,
          emotions,
          couples,
          updatedAt: Date.now(),
        },
        currentSceneId: scene.id,
        currentLineIndex: 0,
        isGenerating: false,
      })
    } catch (err) {
      set({
        isGenerating: false,
        lastError: err instanceof Error ? err.message : 'Unknown error',
      })
    }
  },

  advanceLine: () => {
    const state = get()
    const scene = state.episode.scenes.find((s) => s.id === state.currentSceneId)
    if (!scene) return
    if (state.currentLineIndex < scene.dialogue.length - 1) {
      set({ currentLineIndex: state.currentLineIndex + 1 })
    }
  },

  resetLineIndex: () => set({ currentLineIndex: 0 }),

  setAutoPlay: (v) => set((s) => ({ ui: { ...s.ui, autoPlay: v } })),

  toggleCast: () => set((s) => ({ ui: { ...s.ui, isCastOpen: !s.ui.isCastOpen } })),

  toggleRelationships: () => set((s) => ({ ui: { ...s.ui, isRelationshipsOpen: !s.ui.isRelationshipsOpen } })),

  setRelationshipMetric: (m) => set((s) => ({ ui: { ...s.ui, activeRelationshipMetric: m } })),

  selectScene: (sceneId) => {
    const state = get()
    const scene = state.episode.scenes.find((s) => s.id === sceneId)
    const lineIdx = scene ? Math.max(0, scene.dialogue.length - 1) : 0
    set({ currentSceneId: sceneId, currentLineIndex: lineIdx })
  },

  toggleTooltips: () => set((s) => ({ ui: { ...s.ui, tooltipsEnabled: !s.ui.tooltipsEnabled } })),

  toggleMusic: () => set((s) => ({ ui: { ...s.ui, musicEnabled: !s.ui.musicEnabled } })),
}))
