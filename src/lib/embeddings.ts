const DEFAULT_HOST = 'http://localhost:11434'
const DEFAULT_EMBED_MODEL = 'nomic-embed-text'

interface OllamaEmbedResponse {
  embedding?: number[]
  error?: string
}

let cachedHost: string | null = null
let cachedModel: string | null = null

function getHost(): string {
  if (!cachedHost) {
    cachedHost = (import.meta.env.VITE_OLLAMA_HOST as string | undefined) ?? DEFAULT_HOST
  }
  return cachedHost
}

function getModel(): string {
  if (!cachedModel) {
    cachedModel = (import.meta.env.VITE_OLLAMA_EMBED_MODEL as string | undefined) ?? DEFAULT_EMBED_MODEL
  }
  return cachedModel
}

export async function embed(text: string): Promise<number[]> {
  const res = await fetch(`${getHost()}/api/embeddings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: getModel(), prompt: text }),
  })

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    if (res.status === 404 && body.includes('model')) {
      throw new Error(`Embedding model "${getModel()}" not pulled. Run: ollama pull ${getModel()}`)
    }
    throw new Error(`Ollama embeddings ${res.status}: ${body || res.statusText}`)
  }

  const data = (await res.json()) as OllamaEmbedResponse
  if (data.error) throw new Error(`Ollama embed error: ${data.error}`)
  if (!Array.isArray(data.embedding)) throw new Error('Ollama embeddings response missing "embedding" field')
  return data.embedding
}

export async function embedBatch(texts: string[]): Promise<number[][]> {
  const out: number[][] = []
  for (const t of texts) {
    out.push(await embed(t))
  }
  return out
}

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0
  let dot = 0
  let na = 0
  let nb = 0
  for (let i = 0; i < a.length; i++) {
    const av = a[i]!
    const bv = b[i]!
    dot += av * bv
    na += av * av
    nb += bv * bv
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb)
  if (denom === 0) return 0
  return dot / denom
}
