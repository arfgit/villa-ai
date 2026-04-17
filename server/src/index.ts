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
  const providerDetail =
    provider === "ollama"
      ? `${process.env.OLLAMA_HOST ?? "http://localhost:11434"} / ${process.env.OLLAMA_MODEL ?? "llama3.2"}`
      : process.env.GEMINI_API_KEY
        ? "key configured"
        : "NO GEMINI_API_KEY SET";
  console.log(`[villa-ai server] listening on http://localhost:${PORT}`);
  console.log(
    `[villa-ai server] LLM provider: ${provider} (${providerDetail})`,
  );
});
