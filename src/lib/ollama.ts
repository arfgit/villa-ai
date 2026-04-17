import { parseAndValidate, parseAndValidateBatch } from "./schema";
import type {
  LlmSceneResponse,
  LlmBatchSceneResponse,
  PlannedBeat,
} from "@/types";

// Same-origin by default — Vite dev proxies /ollama → localhost:11434.
// Set VITE_OLLAMA_HOST to override (e.g. a remote Ollama host in prod).
const DEFAULT_HOST = "/ollama";
const DEFAULT_MODEL = "llama3.2";

interface OllamaResponse {
  response?: string;
  error?: string;
  done?: boolean;
}

export async function generateSceneFromOllama(
  prompt: string,
  validAgentIds: string[],
  requiredSpeakerIds?: string[],
  plannedBeats?: PlannedBeat[],
): Promise<LlmSceneResponse> {
  const host =
    (import.meta.env.VITE_OLLAMA_HOST as string | undefined) ?? DEFAULT_HOST;
  const model =
    (import.meta.env.VITE_OLLAMA_MODEL as string | undefined) ?? DEFAULT_MODEL;

  let lastError: unknown = null;

  for (let attempt = 0; attempt < 2; attempt++) {
    let res: Response;
    try {
      res = await fetch(`${host}/api/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model,
          prompt,
          format: "json",
          stream: false,
          options: {
            temperature: attempt === 0 ? 0.95 : 0.75,
            top_p: 0.95,
            top_k: 80,
            repeat_penalty: 1.15,
            presence_penalty: 0.3,
            // Raised from 4096 — ensemble scenes with scene-engine beats need
            // headroom so the JSON doesn't truncate mid-dialogue and leave the
            // parser salvaging just the first speaker.
            num_predict: 8192,
          },
        }),
      });
    } catch {
      throw new Error(
        `Could not reach Ollama at ${host}. Is Ollama running? ` +
          `If you see CORS errors, restart the Vite dev server so the /ollama proxy picks up. ` +
          `Pointing to a remote Ollama instead? Set VITE_OLLAMA_HOST.`,
      );
    }

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      if (res.status === 404 && body.includes("model")) {
        throw new Error(
          `Ollama model "${model}" not pulled. Run: \`ollama pull ${model}\``,
        );
      }
      throw new Error(
        `Ollama returned ${res.status}: ${body || res.statusText}`,
      );
    }

    let data: OllamaResponse;
    try {
      data = (await res.json()) as OllamaResponse;
    } catch (err) {
      lastError = err;
      continue;
    }

    if (data.error) {
      throw new Error(`Ollama error: ${data.error}`);
    }
    if (!data.response) {
      lastError = new Error('Ollama response missing "response" field');
      continue;
    }

    try {
      return parseAndValidate(
        data.response,
        validAgentIds,
        requiredSpeakerIds,
        undefined,
        plannedBeats,
      );
    } catch (err) {
      lastError = err;
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("Ollama generation failed");
}

export async function generateBatchFromOllama(
  prompt: string,
  validAgentIds: string[],
  requiredSpeakerIds?: string[],
): Promise<LlmBatchSceneResponse> {
  const host =
    (import.meta.env.VITE_OLLAMA_HOST as string | undefined) ?? DEFAULT_HOST;
  const model =
    (import.meta.env.VITE_OLLAMA_MODEL as string | undefined) ?? DEFAULT_MODEL;
  let lastError: unknown = null;

  for (let attempt = 0; attempt < 2; attempt++) {
    let res: Response;
    try {
      res = await fetch(`${host}/api/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model,
          prompt,
          format: "json",
          stream: false,
          options: {
            temperature: attempt === 0 ? 0.95 : 0.75,
            top_p: 0.95,
            top_k: 80,
            repeat_penalty: 1.15,
            presence_penalty: 0.3,
            num_predict: 8192,
          },
        }),
      });
    } catch {
      throw new Error(
        `Could not reach Ollama at ${host}. Make sure Ollama is running and CORS is allowed.`,
      );
    }

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(
        `Ollama returned ${res.status}: ${body || res.statusText}`,
      );
    }

    let data: OllamaResponse;
    try {
      data = (await res.json()) as OllamaResponse;
    } catch (err) {
      lastError = err;
      continue;
    }

    if (data.error) throw new Error(`Ollama error: ${data.error}`);
    if (!data.response) {
      lastError = new Error('Ollama response missing "response" field');
      continue;
    }

    try {
      return parseAndValidateBatch(
        data.response,
        validAgentIds,
        requiredSpeakerIds,
      );
    } catch (err) {
      lastError = err;
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("Ollama batch generation failed");
}
