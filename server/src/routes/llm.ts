import { Router } from "express";
import { generateScene, generateBatchScene } from "../services/llm.js";
import { buildScenePrompt } from "../lib/prompt.js";
import { coerceBuildArgs } from "../lib/buildArgsSchema.js";

export const llmRouter = Router();

function isValidAgentIdArray(raw: unknown): raw is string[] {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > 50) return false;
  return raw.every(
    (id) => typeof id === "string" && id.length > 0 && id.length <= 64,
  );
}

function sanitizeErrorMessage(msg: string): string {
  if (process.env.NODE_ENV !== "production") {
    return msg;
  }
  const lower = msg.toLowerCase();
  const isRateLimit =
    lower.includes("rate limit") ||
    lower.includes("quota") ||
    lower.includes("resource_exhausted") ||
    lower.includes("free tier") ||
    lower.includes("prepayment") ||
    msg.includes("429");
  if (isRateLimit) return msg;

  const isOllamaConnection =
    lower.includes("could not reach ollama") ||
    lower.includes("ollama model") ||
    lower.includes("connect econnrefused") ||
    lower.includes("fetch failed");
  if (isOllamaConnection) return msg;

  if (lower.includes("gemini_api_key not set")) return msg;
  return "LLM generation failed — see server logs for details";
}

llmRouter.post("/generate", async (req, res) => {
  const reqStartedAt = Date.now();
  try {
    const { buildArgs, validAgentIds, requiredSpeakerIds } = req.body ?? {};

    const args = coerceBuildArgs(buildArgs);
    if (!args) {
      res.status(400).json({ error: "Invalid buildArgs shape" });
      return;
    }
    if (!isValidAgentIdArray(validAgentIds)) {
      res.status(400).json({ error: "Invalid validAgentIds" });
      return;
    }
    const required =
      Array.isArray(requiredSpeakerIds) &&
      isValidAgentIdArray(requiredSpeakerIds)
        ? requiredSpeakerIds
        : undefined;

    const promptStartedAt = Date.now();
    const prompt = await buildScenePrompt(args);
    const promptMs = Date.now() - promptStartedAt;
    const llmStartedAt = Date.now();
    const plannedBeats = args.sceneContext?.plannedBeats;
    const result = await generateScene(
      prompt,
      validAgentIds,
      required,
      plannedBeats,
    );
    const llmMs = Date.now() - llmStartedAt;
    const totalMs = Date.now() - reqStartedAt;
    console.log(
      `[timing] /api/llm/generate sceneType=${args.sceneType} sceneNumber=${args.sceneNumber} prompt_ms=${promptMs} llm_ms=${llmMs} total_ms=${totalMs} prompt_chars=${prompt.length}`,
    );
    res.json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "LLM generation failed";
    console.error("[llm] generate error:", msg);
    res.status(502).json({ error: sanitizeErrorMessage(msg) });
  }
});

llmRouter.post("/batch", async (req, res) => {
  try {
    const { buildArgs, validAgentIds, requiredSpeakerIds } = req.body ?? {};

    const args = coerceBuildArgs(buildArgs);
    if (!args) {
      res.status(400).json({ error: "Invalid buildArgs shape" });
      return;
    }
    if (!isValidAgentIdArray(validAgentIds)) {
      res.status(400).json({ error: "Invalid validAgentIds" });
      return;
    }
    const required =
      Array.isArray(requiredSpeakerIds) &&
      isValidAgentIdArray(requiredSpeakerIds)
        ? requiredSpeakerIds
        : undefined;

    const prompt = await buildScenePrompt(args);
    const result = await generateBatchScene(prompt, validAgentIds, required);
    res.json(result);
  } catch (err) {
    const msg =
      err instanceof Error ? err.message : "LLM batch generation failed";
    console.error("[llm] batch error:", msg);
    res.status(502).json({ error: sanitizeErrorMessage(msg) });
  }
});
