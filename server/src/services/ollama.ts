import { parseAndValidate, parseAndValidateBatch } from "../lib/schema.js";
import type {
  LlmSceneResponse,
  LlmBatchSceneResponse,
  PlannedBeat,
} from "@villa-ai/shared";

const DEFAULT_HOST = "http://localhost:11434";
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
  const host = process.env.OLLAMA_HOST ?? DEFAULT_HOST;
  const model = process.env.OLLAMA_MODEL ?? DEFAULT_MODEL;

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
            // Temperature alone on small models leads to repetitive phrasing.
            // Adding nucleus sampling + top_k + repetition penalty materially
            // increases output variety, which is critical on 3B-class models.
            temperature: attempt === 0 ? 0.95 : 0.75,
            top_p: 0.95,
            top_k: 80,
            repeat_penalty: 1.15,
            presence_penalty: 0.3,
            num_predict: 4096,
          },
        }),
      });
    } catch {
      throw new Error(
        `Could not reach Ollama at ${host}. Make sure Ollama is running and CORS is allowed for the dev server. ` +
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
      // retry once at lower temp
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
            num_predict: 8192, // larger for batch
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
