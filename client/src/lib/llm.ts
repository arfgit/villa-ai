import type {
  LlmSceneResponse,
  LlmBatchSceneResponse,
  PlannedBeat,
} from "@/types";

// Client never talks to Gemini/Ollama directly — the server is the single
// LLM gateway. Provider (gemini | ollama) is chosen server-side from
// LLM_PROVIDER env. Ollama calls from the browser were a dev-only hack
// that caused CORS pain and bypassed server-side validation.

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(
      (err as { error?: string }).error ?? `LLM server error ${res.status}`,
    );
  }
  return res.json() as Promise<T>;
}

export async function generateScene(
  prompt: string,
  validAgentIds: string[],
  requiredSpeakerIds?: string[],
  plannedBeats?: PlannedBeat[],
): Promise<LlmSceneResponse> {
  return postJson<LlmSceneResponse>("/api/llm/generate", {
    prompt,
    validAgentIds,
    requiredSpeakerIds,
    plannedBeats,
  });
}

export async function generateBatchScene(
  prompt: string,
  validAgentIds: string[],
  requiredSpeakerIds?: string[],
): Promise<LlmBatchSceneResponse> {
  return postJson<LlmBatchSceneResponse>("/api/llm/batch", {
    prompt,
    validAgentIds,
    requiredSpeakerIds,
  });
}
