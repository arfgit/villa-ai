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

  const probeNumCtx = parseInt(process.env.OLLAMA_CLIENT_NUM_CTX ?? "8192", 10);

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

  const soloMs = await probe();
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
