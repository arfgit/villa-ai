import { Router } from "express";
import { generateScene, generateBatchScene } from "../services/llm.js";
import type { PlannedBeat, TurnIntent } from "@villa-ai/shared";

export const llmRouter = Router();

const VALID_INTENTS: TurnIntent[] = [
  "flirt",
  "deflect",
  "reassure",
  "challenge",
  "test",
  "manipulate",
  "escalate",
  "soften",
  "confess",
  "accuse",
  "reveal",
  "deny",
  "joke",
  "retreat",
  "declare",
];

// Shape-validate plannedBeats at the trust boundary. Coercion inside schema.ts
// assumes beats[i].intent is a valid TurnIntent — so reject any malformed beat
// up front rather than letting undefined slip through into the fallback chain.
function validatePlannedBeats(raw: unknown): PlannedBeat[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  if (raw.length === 0 || raw.length > 16) return undefined;
  const out: PlannedBeat[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") return undefined;
    const b = item as Record<string, unknown>;
    if (typeof b.speakerId !== "string" || typeof b.emotionalTone !== "string")
      return undefined;
    if (
      typeof b.intent !== "string" ||
      !(VALID_INTENTS as string[]).includes(b.intent)
    )
      return undefined;
    out.push({
      speakerId: b.speakerId.slice(0, 64),
      intent: b.intent as TurnIntent,
      emotionalTone: b.emotionalTone.slice(0, 200),
      target: typeof b.target === "string" ? b.target.slice(0, 64) : undefined,
      loud: typeof b.loud === "boolean" ? b.loud : undefined,
    });
  }
  return out;
}

// Reject arrays that aren't just short strings — agentIds get forwarded into
// Set.has() comparisons + interpolated into log lines, so we don't want
// objects, numbers, or multi-KB strings sneaking through the trust boundary.
function isValidAgentIdArray(raw: unknown): raw is string[] {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > 50) return false;
  return raw.every(
    (id) => typeof id === "string" && id.length > 0 && id.length <= 64,
  );
}

// POST /api/llm/generate — one scene. Provider (gemini/ollama) is resolved
// server-side from LLM_PROVIDER, so clients don't need to know or care.
llmRouter.post("/generate", async (req, res) => {
  try {
    const { prompt, validAgentIds, requiredSpeakerIds, plannedBeats } =
      req.body;
    if (
      typeof prompt !== "string" ||
      prompt.length > 50000 ||
      !isValidAgentIdArray(validAgentIds)
    ) {
      res.status(400).json({ error: "Invalid prompt or validAgentIds" });
      return;
    }
    const required =
      Array.isArray(requiredSpeakerIds) &&
      isValidAgentIdArray(requiredSpeakerIds)
        ? requiredSpeakerIds
        : undefined;
    const beats = validatePlannedBeats(plannedBeats);
    const result = await generateScene(prompt, validAgentIds, required, beats);
    res.json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "LLM generation failed";
    console.error("[llm] generate error:", msg);
    res.status(502).json({ error: msg });
  }
});

// POST /api/llm/batch — batch-generate the next N scenes in one LLM call.
llmRouter.post("/batch", async (req, res) => {
  try {
    const { prompt, validAgentIds, requiredSpeakerIds } = req.body;
    if (
      typeof prompt !== "string" ||
      prompt.length > 50000 ||
      !isValidAgentIdArray(validAgentIds)
    ) {
      res.status(400).json({ error: "Invalid prompt or validAgentIds" });
      return;
    }
    const required =
      Array.isArray(requiredSpeakerIds) &&
      isValidAgentIdArray(requiredSpeakerIds)
        ? requiredSpeakerIds
        : undefined;
    const result = await generateBatchScene(prompt, validAgentIds, required);
    res.json(result);
  } catch (err) {
    const msg =
      err instanceof Error ? err.message : "LLM batch generation failed";
    console.error("[llm] batch error:", msg);
    res.status(502).json({ error: msg });
  }
});
