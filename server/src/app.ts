import express, { type Express } from "express";
import cors from "cors";
import { isFirebaseAvailable } from "./services/firebase.js";
import { sceneRouter } from "./routes/scene.js";
import { sessionRouter } from "./routes/session.js";
import { trainingRouter } from "./routes/training.js";
import { exportRouter } from "./routes/export.js";
import { llmRouter } from "./routes/llm.js";
import { wisdomRouter } from "./routes/wisdom.js";

// Build the Express app. Separated from the process entry point (index.ts /
// functions.ts) so the same app can run as a local http.Server (app.listen)
// and as a Cloud Functions v2 onRequest handler.
export function createApp(): Express {
  const app = express();

  app.use(
    cors({
      // Default is `true` (allow all) — fine for local dev, but production
      // must set CORS_ORIGIN to the deployed client origin.
      origin: process.env.CORS_ORIGIN ?? true,
    }),
  );
  app.use(express.json({ limit: "10mb" }));

  app.use("/api/scene", sceneRouter);
  app.use("/api/session", sessionRouter);
  app.use("/api/training", trainingRouter);
  app.use("/api/export", exportRouter);
  app.use("/api/llm", llmRouter);
  app.use("/api/wisdom", wisdomRouter);

  app.get("/api/health", async (_req, res) => {
    res.json({
      status: "ok",
      firebase: isFirebaseAvailable(),
      timestamp: Date.now(),
    });
  });

  return app;
}
