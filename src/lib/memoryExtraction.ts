import type { Agent, DialogueLine, AgentMemory, RewardEvent } from '@/types'
import { formatRewardTrajectory, sumRewards } from './rewards'

// Same-origin by default — Vite dev proxies /ollama → localhost:11434.
const DEFAULT_HOST = '/ollama'
const DEFAULT_MODEL = 'qwen2.5:14b'

function getHost(): string {
  return (import.meta.env.VITE_OLLAMA_HOST as string | undefined) ?? DEFAULT_HOST
}

function getModel(): string {
  return (import.meta.env.VITE_OLLAMA_MODEL as string | undefined) ?? DEFAULT_MODEL
}

async function ollamaJsonCall(prompt: string, temperature = 0.85): Promise<unknown> {
  const res = await fetch(`${getHost()}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: getModel(),
      prompt,
      format: 'json',
      stream: false,
      options: {
        temperature,
        top_p: 0.95,
        top_k: 80,
        repeat_penalty: 1.15,
        presence_penalty: 0.3,
        num_predict: 2048,
      },
    }),
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`Ollama ${res.status}: ${body || res.statusText}`)
  }
  const data = (await res.json()) as { response?: string; error?: string }
  if (data.error) throw new Error(`Ollama error: ${data.error}`)
  if (!data.response) throw new Error('Ollama response missing "response" field')
  return JSON.parse(data.response)
}

interface RawObservation {
  agentId: string
  content: string
  importance: number
  relatedAgentIds: string[]
}

export interface ExtractedObservation {
  agentId: string
  content: string
  importance: number
  relatedAgentIds: string[]
}

export async function extractObservationsForScene(args: {
  participants: Agent[]
  dialogue: DialogueLine[]
  outcome: string
  prevMemoriesByAgent?: Record<string, AgentMemory[]>
  policiesByAgent?: Record<string, string>
}): Promise<ExtractedObservation[]> {
  const { participants, dialogue, outcome, prevMemoriesByAgent, policiesByAgent } = args
  const validIds = new Set(participants.map((p) => p.id))

  const dialogueBlock = dialogue
    .map((d) => {
      const speaker = participants.find((p) => p.id === d.agentId)?.name ?? d.agentId
      const target = d.targetAgentId
        ? ` (to ${participants.find((p) => p.id === d.targetAgentId)?.name ?? d.targetAgentId})`
        : ''
      return `${speaker}${target}: "${d.text}"`
    })
    .join('\n')

  const perAgentBlocks = participants.map((p) => {
    const recent = (prevMemoriesByAgent?.[p.id] ?? []).slice(-4)
    const priorList = recent.length > 0
      ? recent.map((m) => `    • ${m.content}`).join('\n')
      : '    • (no prior observations yet)'
    const policy = policiesByAgent?.[p.id]?.trim()
    const policyLine = policy ? `\n  Current strategy: ${policy}` : ''
    return `### ${p.name} (${p.id})
  Archetype: ${p.archetype}
  Personality: ${p.personality}${policyLine}
  Their prior observations (DO NOT REPEAT these, generate something new):
${priorList}`
  }).join('\n\n')

  const FRAMINGS = [
    'What did each participant LEARN about someone else this scene?',
    'What did each participant FEEL most strongly when watching the others this scene?',
    'What SPECIFIC moment in the dialogue stuck with each participant, and why does it matter to them?',
    'What did each participant realize about THEMSELVES from how they reacted this scene?',
    'What suspicion, affection, or concern did each participant pick up on this scene?',
  ]
  const framing = FRAMINGS[Math.floor(Math.random() * FRAMINGS.length)]!

  const prompt = `You are extracting PERSONAL observations from a parody Love Island scene. Each contestant has their own character filter — they will notice different things from the same scene based on who they are and what strategy they're currently running.

FRAMING QUESTION FOR THIS PASS: ${framing}

HARD RULES:
- Each observation must be in first person from that specific contestant's POV.
- Each observation must feel like that CHARACTER speaking — a jealous brooder doesn't sound like a strategic planner.
- Reference SPECIFIC dialogue or reactions from the scene below. No generic statements.
- Each participant must notice something DIFFERENT — do not have multiple people "notice the same tension" in similar words.
- Do NOT repeat or paraphrase a contestant's prior observations.
- If a contestant doesn't have anything noteworthy to observe about this scene, give them a smaller importance (1-3) rather than inventing generic filler.

Contestants (each one has their own character + strategy — filter their observations through these):
${perAgentBlocks}

This scene's dialogue:
${dialogueBlock}

Scene outcome: ${outcome}

Importance scale: 1 = trivial small talk, 5 = interesting but not life-changing, 10 = this changes how they see someone forever.

Respond ONLY with valid JSON in this exact shape:
{
  "observations": [
    {
      "agentId": "<one of the participant ids above>",
      "content": "<first person observation filtered through their character, references something specific from the scene>",
      "importance": <integer 1-10>,
      "relatedAgentIds": ["<agentIds the observation is about>"]
    }
  ]
}

Generate 1-2 observations per participant. Every participant must appear at least once. Do not invent participants who aren't in the list above.`

  const data = (await ollamaJsonCall(prompt, 0.95)) as { observations?: RawObservation[] }
  const raw = Array.isArray(data.observations) ? data.observations : []

  return raw
    .filter((o) => typeof o.agentId === 'string' && validIds.has(o.agentId))
    .filter((o) => typeof o.content === 'string' && o.content.length > 0)
    .map((o) => ({
      agentId: o.agentId,
      content: String(o.content).slice(0, 280),
      importance: typeof o.importance === 'number' ? Math.max(1, Math.min(10, Math.round(o.importance))) : 5,
      relatedAgentIds: Array.isArray(o.relatedAgentIds)
        ? o.relatedAgentIds.filter((id: unknown): id is string => typeof id === 'string' && validIds.has(id))
        : [],
    }))
}

interface RawReflection {
  agentId: string
  insight: string
  importance: number
  newGoal?: string
  newPolicy?: string
}

export interface ExtractedReflection {
  agentId: string
  insight: string
  importance: number
  newGoal: string
  newPolicy: string
}

export async function reflectAcrossAgents(args: {
  cast: Agent[]
  memoriesByAgent: Record<string, AgentMemory[]>
  currentGoals: Record<string, string>
  currentPolicies: Record<string, string>
  rewardTrajectories: Record<string, RewardEvent[]>
}): Promise<ExtractedReflection[]> {
  const { cast, memoriesByAgent, currentGoals, currentPolicies, rewardTrajectories } = args
  const validIds = new Set(cast.map((c) => c.id))

  const blocks = cast.map((agent) => {
    const mems = memoriesByAgent[agent.id] ?? []
    const memList =
      mems.length > 0
        ? mems.map((m, i) => `  ${i + 1}. [${m.type}, importance ${m.importance}] ${m.content}`).join('\n')
        : '  (no memories yet)'
    const goal = currentGoals[agent.id] ?? '(no goal yet)'
    const policy = currentPolicies[agent.id] ?? '(no strategy yet)'
    const rewards = rewardTrajectories[agent.id] ?? []
    const cumulative = sumRewards(rewards)
    const trajectory = formatRewardTrajectory(rewards)
    return `### ${agent.name} (id: ${agent.id})
Personality: ${agent.personality}
Current goal: ${goal}
Current strategy: ${policy}
Cumulative reward so far: ${cumulative >= 0 ? '+' : ''}${cumulative}
Reward trajectory (what has worked and what hasn't):
${trajectory}
Recent memories:
${memList}`
  })

  const prompt = `You are running POLICY REFLECTION for a cast of parody Love Island contestants.

Each contestant has been collecting observations AND accumulating rewards from their actions. Positive rewards come from forming bonds, winning mini games, and surviving bombshells. Negative rewards come from being dumped, having partners stolen, and staying unpaired.

This is a reinforcement learning style update: each contestant looks at what produced positive rewards versus negative rewards for them, and adjusts their STRATEGY accordingly. Their updated strategy will drive how they behave in future scenes.

${blocks.join('\n\n')}

For each contestant, generate:
1. An insight — a specific pattern they've noticed about what worked and what didn't (first person, reference their actual reward trajectory)
2. A refined goal — what they're now trying to achieve (1 short sentence, first person)
3. A new policy — a 2-4 word strategy label that captures how they will behave going forward. Examples: "loyal committed partner", "opportunistic flirt", "cautious strategist", "chaos instigator", "defensive loyal", "aggressive pursuer". Pick something that reflects what their rewards suggest will work for THEM.

Respond ONLY with valid JSON in this exact shape:
{
  "reflections": [
    {
      "agentId": "<one of the ids above>",
      "insight": "<first person, references reward trajectory, 1-2 sentences>",
      "importance": <integer 1-10>,
      "newGoal": "<short first-person goal sentence>",
      "newPolicy": "<2-4 word strategy label>"
    }
  ]
}

Generate exactly ONE reflection per contestant above. Do not skip anyone.`

  const data = (await ollamaJsonCall(prompt)) as { reflections?: RawReflection[] }
  const raw = Array.isArray(data.reflections) ? data.reflections : []

  return raw
    .filter((r) => typeof r.agentId === 'string' && validIds.has(r.agentId))
    .filter((r) => typeof r.insight === 'string' && r.insight.length > 0)
    .map((r) => ({
      agentId: r.agentId,
      insight: String(r.insight).slice(0, 280),
      importance: typeof r.importance === 'number' ? Math.max(1, Math.min(10, Math.round(r.importance))) : 7,
      newGoal: typeof r.newGoal === 'string' ? r.newGoal.slice(0, 160) : currentGoals[r.agentId] ?? '',
      newPolicy: typeof r.newPolicy === 'string' ? r.newPolicy.slice(0, 80) : currentPolicies[r.agentId] ?? '',
    }))
}
