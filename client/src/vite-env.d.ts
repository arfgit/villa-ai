/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_LLM_PROVIDER?: string
  readonly VITE_OLLAMA_HOST?: string
  readonly VITE_OLLAMA_MODEL?: string
  readonly VITE_OLLAMA_EMBED_MODEL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
