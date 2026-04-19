import express, { type Express } from "express";
import cors from "cors";
import { isFirebaseAvailable } from "./services/firebase.js";
import { sessionRouter } from "./routes/session.js";
import { trainingRouter } from "./routes/training.js";
import { llmRouter } from "./routes/llm.js";
import { wisdomRouter } from "./routes/wisdom.js";
import { embeddingsRouter } from "./routes/embeddings.js";
import { devRouter } from "./routes/dev.js";

export function createApp(): Express {
  const app = express();

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

  app.use("/api/session", sessionRouter);
  app.use("/api/training", trainingRouter);
  app.use("/api/llm", llmRouter);
  app.use("/api/wisdom", wisdomRouter);
  app.use("/api/embeddings", embeddingsRouter);

  if (process.env.NODE_ENV !== "production") {
    app.use("/api/dev", devRouter);
  }

  app.get("/api/health", async (_req, res) => {
    res.json({
      status: "ok",
      firebase: isFirebaseAvailable(),
      timestamp: Date.now(),
    });
  });

  return app;
}
