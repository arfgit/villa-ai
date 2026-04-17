import { Router } from "express";
import { embed } from "../services/embeddings.js";

export const embeddingsRouter = Router();

// POST /api/embeddings — proxy to the server's embeddings provider.
// Kept server-side because the client would otherwise have to reach an
// Ollama host directly, which doesn't work in Firebase Hosting (no
// /ollama rewrite) and bypasses CORS configuration.
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
