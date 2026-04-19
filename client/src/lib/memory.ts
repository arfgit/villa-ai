import type { AgentMemory } from "@villa-ai/shared";
import { embed, cosineSimilarity } from "./embeddings";

const RECENCY_DECAY_PER_SCENE = 0.15;
const IMPORTANCE_WEIGHT = 1.0;
const RELEVANCE_WEIGHT = 1.5;
const RECENCY_WEIGHT = 1.0;
const SAMPLING_TEMPERATURE = 0.4;
const MMR_DIVERSITY_WEIGHT = 0.5;

interface ScoredMemory {
  memory: AgentMemory;
  score: number;
  recency: number;
  importance: number;
  relevance: number;
}

function softmaxSample<T>(
  items: { score: number; item: T }[],
  temperature: number,
): T | null {
  if (items.length === 0) return null;
  if (items.length === 1) return items[0]!.item;
  const max = Math.max(...items.map((s) => s.score));
  const expScores = items.map((s) => Math.exp((s.score - max) / temperature));
  const total = expScores.reduce((a, b) => a + b, 0);
  if (total === 0) return items[0]!.item;
  let r = Math.random() * total;
  for (let i = 0; i < items.length; i++) {
    r -= expScores[i]!;
    if (r <= 0) return items[i]!.item;
  }
  return items[items.length - 1]!.item;
}

export async function retrieveMemories(
  memories: AgentMemory[],
  query: string,
  currentSceneNumber: number,
  topK: number = 5,
): Promise<AgentMemory[]> {
  if (memories.length === 0) return [];

  // If the embeddings server is unreachable (local-only setups, or the
  // server can't reach its embedding backend), fall back to
  // recency+importance only. Memory retrieval degrades gracefully rather
  // than blowing up the scene generation path.
  let queryEmbedding: number[] | null = null;
  try {
    queryEmbedding = await embed(query);
  } catch (err) {
    console.warn(
      "[memory] embed failed, falling back to recency-only retrieval:",
      err instanceof Error ? err.message : err,
    );
  }

  const scored: ScoredMemory[] = memories.map((m) => {
    const scenesAgo = Math.max(0, currentSceneNumber - m.sceneNumber);
    const recency = Math.exp(-RECENCY_DECAY_PER_SCENE * scenesAgo);
    const importance = m.importance / 10;
    const relevance =
      queryEmbedding && m.embedding.length === queryEmbedding.length
        ? cosineSimilarity(queryEmbedding, m.embedding)
        : 0;
    const score =
      RECENCY_WEIGHT * recency +
      IMPORTANCE_WEIGHT * importance +
      RELEVANCE_WEIGHT * relevance;
    return { memory: m, score, recency, importance, relevance };
  });

  const picked: AgentMemory[] = [];
  let remaining = [...scored];

  while (picked.length < topK && remaining.length > 0) {
    const candidates = remaining.map((cand) => {
      let maxSim = 0;
      for (const p of picked) {
        const sim = cosineSimilarity(cand.memory.embedding, p.embedding);
        if (sim > maxSim) maxSim = sim;
      }
      return {
        item: cand.memory,
        score: cand.score - MMR_DIVERSITY_WEIGHT * maxSim,
      };
    });
    const chosen = softmaxSample(candidates, SAMPLING_TEMPERATURE);
    if (!chosen) break;
    picked.push(chosen);
    remaining = remaining.filter((s) => s.memory.id !== chosen.id);
  }

  return picked;
}

export function buildRetrievalQuery(args: {
  agentName: string;
  otherParticipantNames: string[];
  sceneType: string;
  seasonTheme: string;
}): string {
  return `${args.agentName} is at the ${args.sceneType} with ${args.otherParticipantNames.join(", ")}. Season angle: ${args.seasonTheme}`;
}
