import dotenv from "dotenv";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, "../.env") });

import { createApp } from "./app.js";
import { getProvider } from "./services/llm.js";

const app = createApp();
const PORT = parseInt(process.env.PORT ?? "3001", 10);

app.listen(PORT, () => {
  const provider = getProvider();
  let providerDetail: string;
  if (provider === "ollama") {
    providerDetail = `${process.env.OLLAMA_HOST ?? "http://localhost:11434"} / ${process.env.OLLAMA_MODEL ?? "llama3.2"}`;
  } else if (provider === "anthropic") {
    const model = process.env.ANTHROPIC_MODEL ?? "claude-haiku-4-5";
    const hasKey = Boolean(process.env.ANTHROPIC_API_KEY);
    const fallback = process.env.GEMINI_API_KEY ? " + gemini fallback" : "";
    providerDetail = hasKey
      ? `${model}${fallback}`
      : "NO ANTHROPIC_API_KEY SET";
  } else {
    providerDetail = process.env.GEMINI_API_KEY
      ? "key configured"
      : "NO GEMINI_API_KEY SET";
  }
  console.log(`[villa-ai server] listening on http://localhost:${PORT}`);
  console.log(
    `[villa-ai server] LLM provider: ${provider} (${providerDetail})`,
  );

  // Ollama parallelism diagnostic. Ollama's OLLAMA_NUM_PARALLEL env var
  // is read by `ollama serve`, not by this process — we can't verify
  // the value directly from here. But we CAN probe it: fire two small
  // concurrent prompts at Ollama and time them. If they take ~2× a
  // single request, parallelism is 1 and the client-side prefetch
  // batching is silently serializing on Ollama's side. Log a loud
  // warning with the fix command if detected.
  //
  // Runs async, 6s after startup, so it doesn't delay the dev loop.
  // Harmless if Ollama is down (fetch fails silently, no warning).
  if (provider === "ollama") {
    setTimeout(() => {
      probeOllamaParallelism().catch(() => {
        /* Ollama not reachable at probe time — ignore. */
      });
    }, 6_000);
  }
});

async function probeOllamaParallelism(): Promise<void> {
  const host = process.env.OLLAMA_HOST ?? "http://localhost:11434";
  const model = process.env.OLLAMA_MODEL ?? "llama3.2";

  // Match the scene-gen runner's num_ctx so the probe doesn't spawn a
  // separate runner with Ollama's VRAM-based default context (262144),
  // which would end up with most layers on CPU and pollute the concurrency
  // measurement. Keep in sync with services/ollama.ts NUM_CTX.
  const probeNumCtx = parseInt(process.env.OLLAMA_CLIENT_NUM_CTX ?? "8192", 10);

  // Pre-warm the model so the concurrency probe isn't measuring model
  // load time. Tiny prompt, ignore result.
  await fetch(`${host}/api/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      prompt: "hi",
      stream: false,
      options: { num_predict: 1, num_ctx: probeNumCtx },
    }),
  }).catch(() => null);

  const probe = (): Promise<number> => {
    const start = Date.now();
    return fetch(`${host}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        prompt: "say ok",
        stream: false,
        options: { num_predict: 4, num_ctx: probeNumCtx },
      }),
    })
      .then((r) => r.text())
      .then(() => Date.now() - start);
  };

  // Solo baseline.
  const soloMs = await probe();
  // Two concurrent probes. On num_parallel>=2 they should both finish
  // in ~soloMs (clock runs concurrently). On num_parallel=1 the second
  // waits for the first, so the SECOND probe's wallclock is ~2×soloMs.
  const concurrentStart = Date.now();
  const [a, b] = await Promise.all([probe(), probe()]);
  const concurrentTotal = Date.now() - concurrentStart;
  const avg = (a + b) / 2;
  const ratio = concurrentTotal / soloMs;

  console.log(
    `[ollama-probe] solo=${soloMs}ms, concurrent_total=${concurrentTotal}ms, concurrent_avg=${Math.round(avg)}ms, ratio=${ratio.toFixed(2)}x`,
  );
  if (ratio > 1.6) {
    console.warn(
      "\n⚠️  [ollama-probe] Ollama appears to be serializing requests (ratio > 1.6x).\n" +
        "   Scene prefetch will queue behind live-gen and feel slow.\n" +
        "   Fix: set OLLAMA_NUM_PARALLEL=4 on the ollama server process.\n" +
        "   macOS desktop app: `launchctl setenv OLLAMA_NUM_PARALLEL 4` then quit + relaunch Ollama.\n" +
        "   CLI: `OLLAMA_NUM_PARALLEL=4 ollama serve` (also baked into `npm run dev:local`)\n",
    );
  } else {
    console.log(
      `[ollama-probe] parallelism OK — concurrent requests run in ~${ratio.toFixed(2)}× a single-request wallclock.`,
    );
  }
}
