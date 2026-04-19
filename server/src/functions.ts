import { onRequest } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import { setGlobalOptions } from "firebase-functions/v2";
import { createApp } from "./app.js";

// Cloud Functions v2 entry point. The app is built once per cold start,
// then the same Express handler services every HTTP request in that
// instance.
//
// Secrets must be declared here to be injected as env vars at runtime —
// without a `secrets:` binding, `firebase functions:secrets:set X` does
// nothing for this function.
const GEMINI_API_KEY = defineSecret("GEMINI_API_KEY");
const ANTHROPIC_API_KEY = defineSecret("ANTHROPIC_API_KEY");
const FIREBASE_SERVICE_ACCOUNT = defineSecret("FIREBASE_SERVICE_ACCOUNT");

setGlobalOptions({
  region: "us-central1",
  // 512MB is enough for the Express app + Anthropic/Gemini clients +
  // Firestore SDK. Bump to 1GB if prompt assembly on large casts starts
  // OOMing.
  memory: "512MiB",
  // LLM calls are the slowest thing we do — a full scene gen can take
  // 10-30s on Anthropic or Gemini. Default is 60s; raise to 120 to give
  // headroom.
  timeoutSeconds: 120,
  // No warm instances by default — cold-start latency on the first request
  // is acceptable for this app. Set to 1+ if you want to pay to keep the
  // function warm during working hours.
  minInstances: 0,
  maxInstances: 10,
});

// ANTHROPIC_API_KEY is bound alongside GEMINI because getProvider() now
// prefers anthropic in prod when its key is present and falls back to
// gemini when only that key is set. Without this binding the process
// would enter the anthropic path with an empty key and 502 on every
// scene-gen request. Set with:
//   firebase functions:secrets:set ANTHROPIC_API_KEY
export const api = onRequest(
  { secrets: [ANTHROPIC_API_KEY, GEMINI_API_KEY, FIREBASE_SERVICE_ACCOUNT] },
  createApp(),
);
