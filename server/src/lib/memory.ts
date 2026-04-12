// Park et al. "Generative Agents" memory retrieval.
//
// Each memory is scored by three independent factors:
//   - recency:   exponential decay since the memory was created
//   - importance: LLM-rated 1-10 at storage time, normalized
//   - relevance: cosine similarity between memory embedding and query embedding
//
// Final score is the (weighted) sum, then we take top-K. This is the standard
// retrieval formula from the 2023 paper.

import type { AgentMemory } from '@villa-ai/shared'
import { embed, cosineSimilarity } from '../services/embeddings.js'

const RECENCY_DECAY_PER_SCENE = 0.15
const IMPORTANCE_WEIGHT = 1.0
const RELEVANCE_WEIGHT = 1.5
const RECENCY_WEIGHT = 1.0
// Temperature for softmax-over-scores sampling. Higher = more random.
// 0 would be pure argmax, large values approach uniform random.
const SAMPLING_TEMPERATURE = 0.4
// MMR penalty weight: how much to discount memories that are semantically
// similar to ones already picked in this pass. Prevents the same cluster
// of memories from dominating every retrieval.
const MMR_DIVERSITY_WEIGHT = 0.5

interface ScoredMemory {
  memory: AgentMemory
  score: number
  recency: number
  importance: number
  relevance: number
}

// Softmax sampling over scores. Returns a weighted-random index into items.
function softmaxSample<T>(items: { score: number; item: T }[], temperature: number): T | null {
  if (items.length === 0) return null
  if (items.length === 1) return items[0]!.item
  const max = Math.max(...items.map((s) => s.score))
  const expScores = items.map((s) => Math.exp((s.score - max) / temperature))
  const total = expScores.reduce((a, b) => a + b, 0)
  if (total === 0) return items[0]!.item
  let r = Math.random() * total
  for (let i = 0; i < items.length; i++) {
    r -= expScores[i]!
    if (r <= 0) return items[i]!.item
  }
  return items[items.length - 1]!.item
}

export async function retrieveMemories(
  memories: AgentMemory[],
  query: string,
  currentSceneNumber: number,
  topK: number = 5
): Promise<AgentMemory[]> {
  if (memories.length === 0) return []

  const queryEmbedding = await embed(query)

  const scored: ScoredMemory[] = memories.map((m) => {
    const scenesAgo = Math.max(0, currentSceneNumber - m.sceneNumber)
    const recency = Math.exp(-RECENCY_DECAY_PER_SCENE * scenesAgo)
    const importance = m.importance / 10
    const relevance = cosineSimilarity(queryEmbedding, m.embedding)
    const score =
      RECENCY_WEIGHT * recency +
      IMPORTANCE_WEIGHT * importance +
      RELEVANCE_WEIGHT * relevance
    return { memory: m, score, recency, importance, relevance }
  })

  // Iterative MMR-style selection with softmax sampling. Each pick is drawn
  // from a softmax distribution over the remaining candidates, with their
  // score reduced by max-similarity to already-picked memories. This gives
  // two kinds of variation vs plain argmax:
  //   1) across runs, different memories come up for the same query
  //   2) within one retrieval, diverse memories are preferred over a cluster
  const picked: AgentMemory[] = []
  let remaining = [...scored]

  while (picked.length < topK && remaining.length > 0) {
    // Penalize candidates similar to already-picked memories (MMR)
    const candidates = remaining.map((cand) => {
      let maxSim = 0
      for (const p of picked) {
        const sim = cosineSimilarity(cand.memory.embedding, p.embedding)
        if (sim > maxSim) maxSim = sim
      }
      return {
        item: cand.memory,
        score: cand.score - MMR_DIVERSITY_WEIGHT * maxSim,
      }
    })
    const chosen = softmaxSample(candidates, SAMPLING_TEMPERATURE)
    if (!chosen) break
    picked.push(chosen)
    remaining = remaining.filter((s) => s.memory.id !== chosen.id)
  }

  return picked
}

// Build a query string for retrieving "what does this agent remember that's
// relevant to the upcoming scene". We don't know the dialogue yet, so we use
// the participants + scene type + season theme as the retrieval cue.
export function buildRetrievalQuery(args: {
  agentName: string
  otherParticipantNames: string[]
  sceneType: string
  seasonTheme: string
}): string {
  return `${args.agentName} is at the ${args.sceneType} with ${args.otherParticipantNames.join(', ')}. Season angle: ${args.seasonTheme}`
}
