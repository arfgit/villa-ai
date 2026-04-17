import express, { type Express } from "express";
import cors from "cors";
import { isFirebaseAvailable } from "./services/firebase.js";
import { sceneRouter } from "./routes/scene.js";
import { sessionRouter } from "./routes/session.js";
import { trainingRouter } from "./routes/training.js";
import { exportRouter } from "./routes/export.js";
import { llmRouter } from "./routes/llm.js";
import { wisdomRouter } from "./routes/wisdom.js";
import { embeddingsRouter } from "./routes/embeddings.js";

// Build the Express app. Separated from the process entry point (index.ts /
// functions.ts) so the same app can run as a local http.Server (app.listen)
// and as a Cloud Functions v2 onRequest handler.
export function createApp(): Express {
  const app = express();

  // CORS: allow all in dev, but require an explicit CORS_ORIGIN in prod so
  // we never ship a wide-open API by accident. Firebase Hosting rewrites
  // /api/** to the function on the same origin anyway, so the prod value
  // is typically the Hosting domain (e.g. https://villa-ai-9ff17.web.app).
  const corsOriginEnv = process.env.CORS_ORIGIN;
  if (process.env.NODE_ENV === "production" && !corsOriginEnv) {
    throw new Error(
      "CORS_ORIGIN must be set in production (set via `firebase functions:config:set` or the function's env)",
    );
  }
  app.use(
    cors({
      origin: corsOriginEnv ?? true,
    }),
  );
  app.use(express.json({ limit: "10mb" }));

  app.use("/api/scene", sceneRouter);
  app.use("/api/session", sessionRouter);
  app.use("/api/training", trainingRouter);
  app.use("/api/export", exportRouter);
  app.use("/api/llm", llmRouter);
  app.use("/api/wisdom", wisdomRouter);
  app.use("/api/embeddings", embeddingsRouter);

  app.get("/api/health", async (_req, res) => {
    res.json({
      status: "ok",
      firebase: isFirebaseAvailable(),
      timestamp: Date.now(),
    });
  });

  return app;
}
