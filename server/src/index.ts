import dotenv from "dotenv";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, "../.env") });

import { createApp } from "./app.js";

const app = createApp();
const PORT = parseInt(process.env.PORT ?? "3001", 10);

app.listen(PORT, () => {
  console.log(`[villa-ai server] listening on http://localhost:${PORT}`);
});
