import { onRequest } from "firebase-functions/v2/https";
import { setGlobalOptions } from "firebase-functions/v2";
import { createApp } from "./app.js";

// Cloud Functions v2 entry point. The app is built once per cold start,
// then the same Express handler services every HTTP request in that
// instance. Secrets (GEMINI_API_KEY, CORS_ORIGIN, etc.) are configured via
// `firebase functions:secrets:set` and exposed as env vars at runtime.
setGlobalOptions({
  region: "us-central1",
  // 512MB is enough for the Express app + Gemini client + Firestore SDK.
  // Bump to 1GB if prompt assembly on large casts starts OOMing.
  memory: "512MiB",
  // LLM calls are the slowest thing we do — Gemini can take 10-30s on a
  // batch scene. Default is 60s; raise to 120 to give headroom.
  timeoutSeconds: 120,
  // Keep one instance warm during working hours to dodge cold starts on
  // the first request. Remove if cost becomes a concern.
  minInstances: 0,
  maxInstances: 10,
});

export const api = onRequest(createApp());
