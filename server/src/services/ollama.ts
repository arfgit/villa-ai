import { parseAndValidate, parseAndValidateBatch } from "../lib/schema.js";
import type {
  LlmSceneResponse,
  LlmBatchSceneResponse,
  PlannedBeat,
} from "@villa-ai/shared";

const DEFAULT_HOST = "http://localhost:11434";
const DEFAULT_MODEL = "qwen3:32b";

const NUM_CTX = parseInt(process.env.OLLAMA_CLIENT_NUM_CTX ?? "8192", 10);

const CONNECT_RETRY_ATTEMPTS = 4;
const CONNECT_RETRY_DELAYS_MS = [500, 1500, 3000, 3000];

interface OllamaResponse {
  response?: string;
  error?: string;
  done?: boolean;
}

function isConnectionError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const msg = err.message.toLowerCase();

  if (
    msg.includes("fetch failed") ||
    msg.includes("econnrefused") ||
    msg.includes("econnreset") ||
    msg.includes("socket hang up") ||
    msg.includes("network error")
  ) {
    return true;
  }

  const cause = (err as Error & { cause?: unknown }).cause;
  if (cause instanceof Error) {
    const causeMsg = cause.message.toLowerCase();
    return (
      causeMsg.includes("econnrefused") ||
      causeMsg.includes("econnreset") ||
      causeMsg.includes("socket hang up")
    );
  }
  return false;
}

async function fetchWithConnectRetry(
  url: string,
  init: RequestInit,
): Promise<Response> {
  let lastErr: unknown = null;
  for (let attempt = 0; attempt < CONNECT_RETRY_ATTEMPTS; attempt++) {
    try {
      return await fetch(url, init);
    } catch (err) {
      lastErr = err;
      if (!isConnectionError(err)) {
        throw err;
      }
      const delay = CONNECT_RETRY_DELAYS_MS[attempt] ?? 3000;
      if (attempt === 0) {
        console.log(
          `[ollama] connection failed (${(err as Error).message}), retrying in ${delay}ms — model may still be loading`,
        );
      }
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
  throw lastErr instanceof Error
    ? lastErr
    : new Error("Ollama connection failed after retries");
}

export async function generateSceneFromOllama(
  prompt: string,
  validAgentIds: string[],
  requiredSpeakerIds?: string[],
  plannedBeats?: PlannedBeat[],
): Promise<LlmSceneResponse> {
  const host = process.env.OLLAMA_HOST ?? DEFAULT_HOST;
  const model = process.env.OLLAMA_MODEL ?? DEFAULT_MODEL;

  let lastError: unknown = null;

  for (let attempt = 0; attempt < 2; attempt++) {
    let res: Response;
    try {
      res = await fetchWithConnectRetry(`${host}/api/generate`, {
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
            num_predict: 4096,
            num_ctx: NUM_CTX,
          },
        }),
      });
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      throw new Error(
        `Could not reach Ollama at ${host}: ${detail}. Make sure Ollama is running and CORS is allowed for the dev server. ` +
          `On macOS: \`launchctl setenv OLLAMA_ORIGINS "*"\` then restart the Ollama app. ` +
          `Or run from terminal: \`OLLAMA_ORIGINS="*" ollama serve\`.`,
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
  const host = process.env.OLLAMA_HOST ?? DEFAULT_HOST;
  const model = process.env.OLLAMA_MODEL ?? DEFAULT_MODEL;
  let lastError: unknown = null;

  for (let attempt = 0; attempt < 2; attempt++) {
    let res: Response;
    try {
      res = await fetchWithConnectRetry(`${host}/api/generate`, {
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
            num_predict: 8192, // larger for batch
            num_ctx: NUM_CTX,
          },
        }),
      });
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      throw new Error(
        `Could not reach Ollama at ${host}: ${detail}. Make sure Ollama is running and CORS is allowed.`,
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
