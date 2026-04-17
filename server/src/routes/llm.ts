import { Router } from "express";
import { generateScene, generateBatchScene } from "../services/llm.js";
import { buildScenePrompt } from "../lib/prompt.js";
import { coerceBuildArgs } from "../lib/buildArgsSchema.js";

export const llmRouter = Router();

// Reject arrays that aren't just short strings — agentIds get forwarded into
// Set.has() comparisons + interpolated into log lines, so we don't want
// objects, numbers, or multi-KB strings sneaking through the trust boundary.
function isValidAgentIdArray(raw: unknown): raw is string[] {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > 50) return false;
  return raw.every(
    (id) => typeof id === "string" && id.length > 0 && id.length <= 64,
  );
}

// Whitelist LLM errors that are safe to forward to the client verbatim —
// rate-limit messages are actionable (tells the user to top up / wait) and
// don't leak internals. Everything else gets a generic message; the full
// error is still logged server-side for debugging.
function sanitizeErrorMessage(msg: string): string {
  const lower = msg.toLowerCase();
  const isRateLimit =
    lower.includes("rate limit") ||
    lower.includes("quota") ||
    lower.includes("resource_exhausted") ||
    lower.includes("free tier") ||
    lower.includes("prepayment") ||
    msg.includes("429");
  if (isRateLimit) return msg;
  return "LLM generation failed — see server logs for details";
}

// POST /api/llm/generate — build the prompt server-side from structured
// BuildArgs and call the LLM. Clients send game state + scene intent,
// NOT a pre-assembled prompt string — that's the injection surface we
// closed by moving assembly here.
llmRouter.post("/generate", async (req, res) => {
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
    const plannedBeats = args.sceneContext?.plannedBeats;
    const result = await generateScene(
      prompt,
      validAgentIds,
      required,
      plannedBeats,
    );
    res.json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "LLM generation failed";
    console.error("[llm] generate error:", msg);
    res.status(502).json({ error: sanitizeErrorMessage(msg) });
  }
});

// POST /api/llm/batch — batch-generate multiple scenes. Same BuildArgs
// contract as /generate; batch-mode instructions are baked into the
// prompt builder when isBatch is set.
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
