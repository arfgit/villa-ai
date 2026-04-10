import type { Agent, Relationship, EmotionState, Couple, Scene, SceneType } from '@/types'
import { SCENE_LABELS } from '@/data/environments'

interface BuildArgs {
  cast: Agent[]
  relationships: Relationship[]
  emotions: EmotionState[]
  couples: Couple[]
  recentScenes: Scene[]
  sceneType: SceneType
  forcedParticipants?: string[]
}

export function buildScenePrompt(args: BuildArgs): string {
  const { cast, relationships, emotions, couples, recentScenes, sceneType, forcedParticipants } = args
  const sceneInfo = SCENE_LABELS[sceneType]

  const castBlock = cast
    .map((a) => `- ${a.id} (${a.name}, ${a.age}) [${a.archetype}]\n  voice: ${a.voice}\n  bio: ${a.bio}\n  traits: ${a.personality}`)
    .join('\n')

  const relsBlock = relationships
    .map((r) => `${r.fromId}->${r.toId}: trust ${r.trust}, attraction ${r.attraction}, jealousy ${r.jealousy}`)
    .join('\n')

  const emotionsBlock = emotions
    .map((e) => `${e.agentId}: ${e.primary} (${e.intensity})`)
    .join('\n')

  const couplesBlock = couples.length > 0
    ? couples.map((c) => `- ${c.a} & ${c.b}`).join('\n')
    : 'No couples yet (early days)'

  const recentBlock = recentScenes.length > 0
    ? recentScenes.map((s, i) => `Scene ${i + 1} (${s.type}): ${s.outcome}`).join('\n')
    : 'No prior scenes (this is the season opener)'

  const participants = forcedParticipants
    ? `MUST include exactly: ${forcedParticipants.join(', ')}`
    : 'Choose 3-5 dramatically relevant participants from the cast'

  return `You are the writers room for "Villa AI", a reality TV dating show simulation in the style of Love Island. Generate ONE scene as strict JSON.

## CAST (fixed, 6 contestants)
${castBlock}

## CURRENT RELATIONSHIPS (0-100)
${relsBlock}

## CURRENT EMOTIONS
${emotionsBlock}

## CURRENT COUPLES
${couplesBlock}

## RECENT SCENES
${recentBlock}

## THIS SCENE
Type: ${sceneType}
Title: ${sceneInfo.title}
Participants: ${participants}

## RULES
- Output ONLY a single JSON object. No prose, no markdown fences, no commentary.
- 6 to 10 dialogue lines total.
- Reality TV pacing: short, punchy, quotable. Keep most lines under 18 words.
- Each line must include emotion. Optionally include action (physical action like "leans in").
- Include 2 to 5 systemEvents with deltas in the range -15 to +15.
- Every delta must be justified by what was said in the dialogue.
- Stay in character voices. No narration. No fourth wall.
- Outcome: one sentence that hooks the next scene.
- Use ONLY these agentIds: ${cast.map((a) => a.id).join(', ')}.
- Use ONLY these emotions: happy, flirty, jealous, angry, sad, smug, anxious, bored, shocked, neutral.
- Use ONLY these systemEvent types: trust_change, attraction_change, jealousy_spike, couple_formed, couple_broken.

## JSON SCHEMA
{
  "dialogue": [
    {"agentId": string, "text": string, "emotion": string, "action": string?, "targetAgentId": string?}
  ],
  "systemEvents": [
    {"type": string, "fromId": string?, "toId": string?, "delta": number?, "label": string}
  ],
  "emotionUpdates": [
    {"agentId": string, "primary": string, "intensity": number}
  ],
  "outcome": string
}`
}
