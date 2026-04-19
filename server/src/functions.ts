import { onRequest } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import { setGlobalOptions } from "firebase-functions/v2";
import { createApp } from "./app.js";

const GEMINI_API_KEY = defineSecret("GEMINI_API_KEY");
const ANTHROPIC_API_KEY = defineSecret("ANTHROPIC_API_KEY");
const FIREBASE_SERVICE_ACCOUNT = defineSecret("FIREBASE_SERVICE_ACCOUNT");

setGlobalOptions({
  region: "us-central1",

  memory: "512MiB",

  timeoutSeconds: 120,

  minInstances: 0,
  maxInstances: 10,
});

export const api = onRequest(
  { secrets: [ANTHROPIC_API_KEY, GEMINI_API_KEY, FIREBASE_SERVICE_ACCOUNT] },
  createApp(),
);
