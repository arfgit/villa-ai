import { Router } from "express";
import { embed } from "../services/embeddings.js";

export const embeddingsRouter = Router();

embeddingsRouter.post("/", async (req, res) => {
  try {
    const { text } = req.body ?? {};
    if (typeof text !== "string" || text.length === 0 || text.length > 4000) {
      res
        .status(400)
        .json({ error: "text must be a non-empty string ≤ 4000 chars" });
      return;
    }
    const embedding = await embed(text);
    res.json({ embedding });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Embedding failed";
    console.error("[embeddings] error:", msg);
    res.status(502).json({ error: "Embedding service unavailable" });
  }
});
