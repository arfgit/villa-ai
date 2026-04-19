import { Router } from "express";
import {
  getProvider,
  getRuntimeProvider,
  setRuntimeProvider,
  type LlmProvider,
} from "../services/llm.js";

export const devRouter = Router();

const VALID_PROVIDERS: readonly LlmProvider[] = [
  "anthropic",
  "gemini",
  "ollama",
] as const;

function isValidProvider(v: unknown): v is LlmProvider {
  return (
    typeof v === "string" && (VALID_PROVIDERS as readonly string[]).includes(v)
  );
}

devRouter.get("/provider", (_req, res) => {
  res.json({
    effective: getProvider(),
    override: getRuntimeProvider(),
    envProvider: process.env.LLM_PROVIDER ?? null,
  });
});

devRouter.post("/provider", (req, res) => {
  const { provider } = (req.body ?? {}) as { provider?: unknown };
  if (provider === null) {
    setRuntimeProvider(null);
    res.json({ effective: getProvider(), override: null });
    return;
  }
  if (!isValidProvider(provider)) {
    res.status(400).json({
      error: `Invalid provider. Expected one of: ${VALID_PROVIDERS.join(", ")} or null.`,
    });
    return;
  }
  setRuntimeProvider(provider);
  console.log(`[dev] LLM provider runtime override set to: ${provider}`);
  res.json({ effective: getProvider(), override: provider });
});
