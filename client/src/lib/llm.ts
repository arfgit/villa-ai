import type {
  BuildArgs,
  LlmSceneResponse,
  LlmBatchSceneResponse,
} from "@villa-ai/shared";

interface GenerateRequest {
  buildArgs: BuildArgs;
  validAgentIds: string[];
  requiredSpeakerIds?: string[];
}

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({ error: res.statusText }))) as {
      error?: string;
    };
    throw new Error(err.error ?? `LLM server error ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export async function generateScene(
  buildArgs: BuildArgs,
  validAgentIds: string[],
  requiredSpeakerIds?: string[],
): Promise<LlmSceneResponse> {
  return postJson<LlmSceneResponse>("/api/llm/generate", {
    buildArgs,
    validAgentIds,
    requiredSpeakerIds,
  } satisfies GenerateRequest);
}

export async function generateBatchScene(
  buildArgs: BuildArgs,
  validAgentIds: string[],
  requiredSpeakerIds?: string[],
): Promise<LlmBatchSceneResponse> {
  return postJson<LlmBatchSceneResponse>("/api/llm/batch", {
    buildArgs,
    validAgentIds,
    requiredSpeakerIds,
  } satisfies GenerateRequest);
}
