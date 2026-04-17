// Embeddings go through the server (/api/embeddings). The browser never
// talks to Ollama directly anymore — in Firebase Hosting there's no
// /ollama rewrite, and routing through the server also gives us one
// validated + logged choke point.

interface EmbedResponse {
  embedding?: number[];
  error?: string;
}

export async function embed(text: string): Promise<number[]> {
  const res = await fetch("/api/embeddings", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });

  if (!res.ok) {
    const body = (await res
      .json()
      .catch(() => ({ error: res.statusText }))) as EmbedResponse;
    throw new Error(body.error ?? `Embeddings server error ${res.status}`);
  }

  const data = (await res.json()) as EmbedResponse;
  if (!Array.isArray(data.embedding)) {
    throw new Error('Embeddings response missing "embedding" field');
  }
  return data.embedding;
}

// Sequential — the server embedding provider (Ollama) serializes per model,
// so parallel fetches give no real speedup. Keeping it sequential makes
// failures easier to attribute to a specific input.
export async function embedBatch(texts: string[]): Promise<number[][]> {
  const out: number[][] = [];
  for (const t of texts) {
    out.push(await embed(t));
  }
  return out;
}

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    const av = a[i]!;
    const bv = b[i]!;
    dot += av * bv;
    na += av * av;
    nb += bv * bv;
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  if (denom === 0) return 0;
  return dot / denom;
}
