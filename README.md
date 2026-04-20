# villa-ai

An AI-driven Love Island-style reality dating show simulator. Procedurally generated contestants flirt, scheme, couple up, and get dumped from the villa. An LLM writers room generates each scene as structured JSON, a live chat reacts to what it sees, and viewer popularity feeds back into how the cast behaves. Rendered in a retro ASCII / CRT aesthetic.

![Villa AI demo](docs/va-fv1.gif)

Built as a TypeScript monorepo (`client` + `server` + `shared`) with Vite + React 19 + Tailwind v4 on the front, Express + Firebase on the back. Local dev runs against [Ollama](https://ollama.com) for free offline generation; production uses Anthropic's Claude Haiku 4.5 with Gemini as a fallback.

---

## Quick start

```bash
# Local-only (Ollama) — no API keys needed
brew install ollama
ollama pull qwen3:32b                 # ~19 GB, best quality-per-GB for this task
OLLAMA_ORIGINS="*" ollama serve       # keep this running
npm install
cp .env.example .env                  # then edit if you want prod providers
npm run dev                           # client + server together
```

On 16 GB Macs pull `qwen3:14b` instead (smaller, lower quality). On 64 GB+ bump to `llama3.3:70b` for the closest-to-frontier local quality. See [LLM providers](#llm-providers) below.

Open <http://localhost:5173> and click **start show**.

If you're using the Ollama desktop app instead of `ollama serve`, allow CORS once with:

```bash
launchctl setenv OLLAMA_ORIGINS "*"
# then quit and re-open the Ollama app
```

---

## The core loop

```
scenes  ──►  live chat  ──►  popularity  ──►  relationships  ──►  scenes ...
```

Every scene commits dialogue, emotion updates, and relationship deltas to the episode state. The chat generator produces `ViewerMessage[]` for what just happened. The social gravity engine aggregates those chat messages into per-agent popularity, then emits gravity events that nudge the relationship matrix toward viewer favorites and away from viewer targets. The next scene's prompt carries a `VIEWER VIBES` block so the cast subconsciously reacts to viewer heat. That's the cycle.

Drip events are small (±0.3–0.5 per scene) and saturate past ±10 cumulative per pair, so popularity never out-muscles the LLM's scene-driven drama but shapes the season over time. When sentiment crosses 80 or drops below 20 the first time in a season, a named `gravity_threshold` event fires ("the group starts orbiting Sarah", "Zion gets iced out") once per direction per agent.

---

## Features

### Dynamic seasons
- No fixed episode count. The season planner adapts pacing to drama levels: dramatic seasons run longer, quiet ones converge. The season ends when the last couple stands.
- **Drama scoring** per agent influences pacing, interview selection, and scene variety. High-drama characters get more screen time.

### Procedural cast
- Every new season samples from pools of 56 names, 16 archetypes, 12 personality templates, and 10 voice styles. No two seasons share a cast.
- **Bombshells** arrive mid-season (up to 5 per season, 1–2 at a time) with a dating period before they must couple at the next recoupling.
- **Casa Amor** — the original cast splits, a new group of singles arrives at the other villa, and everyone chooses to stick or switch at the reunion. Couples that survive Casa Amor are worth more at the finale.

### Social gravity loop
- Chat reads as the audience's live reaction; every message's sentiment, target mention, and emotional cluster moves one or more agents' popularity.
- Popularity above 70 pulls other cast toward the favorite; below 30 pushes them away. Jealousy and compatibility stay LLM-driven.
- Threshold crossings fire a named dramatic beat in the scene feed.
- Visible in the relationship matrix: cells nudged by gravity in the last three scenes get a yellow/red border accent, and the tooltip explains the pull.

### In-session seasons
- **New Season** keeps your session URL stable, bumps `Episode.number`, archives the finished season to `villaSessions/{id}/seasons/{n}` so past seasons stay browsable, and refreshes the villa with a new cast and theme.
- **New Villa** rotates the session UUID — your old villa stays preserved at its old URL for sharing, you land on a fresh Season 1.

### RL-style learning
- Each agent has a brain: memories, goals, and policies that evolve via reflection every 3 scenes. Rewards signal coupling / challenge wins; penalties hit for elimination or being stolen from.
- **Cross-season wisdom** — returning agents inherit their strongest reflections. Generated casts get "meta-wisdom" from past seasons so they "heard stories."
- Memory retrieval uses the Generative Agents architecture (Park et al., 2023): recency + importance + relevance scoring with softmax sampling and MMR diversity.
- Training data flows into a shared `trainingData/` collection on the server — every session contributes to the pool without needing auth.

### Authentic Love Island format
- Host runs the ceremonies, reads texts, builds suspense, announces eliminations. Now a mandatory speaker on every ensemble scene.
- Recouples eliminate one couple at a time, no mass dumps. Grace protection for partners abandoned by defections or bombshell steals.
- Smart stat inference — relationship deltas are derived from dialogue emotion and action when the LLM forgets to emit them. Contestants never mention stat numbers on screen.

### Performance
- **Batch prefetch** — after each scene commits, the planner speculates 1–5 scenes ahead, realizes them via parallel LLM calls, and queues them so playback never waits on generation.
- **Working-state simulator** — the prefetcher maintains an advisory copy of the episode so mid-batch scenes see relationships as they would be after prior batch scenes commit. Keeps batched arcs coherent.
- **Parallel embeddings**, warm-on-mount for Ollama, retry + fallback between providers.

### Visual + UX
- ASCII characters with emoji faces, floating emotion bubbles, emotion-specific body poses (8 frames per emotion set).
- Competition-specific animations for mini-games and challenges.
- Scene nav auto-scrolls when following along, stays put if you're re-reading.
- State persists to server-side Firestore via share-by-URL sessions (no login). Same URL on any device loads the same villa.
- Per-scene procedural 8-bit chiptune (Web Audio API).

---

## How scene generation works

1. The Zustand store tracks episode state: cast, relationships (trust / attraction / jealousy / compatibility 0–100), emotions, couples, drama scores, viewer sentiment, and cumulative gravity.
2. The **season planner** (`client/src/lib/seasonPlanner.ts`) picks the next scene type from phase, drama levels, bombshell availability, Casa Amor timing, and recouple cadence.
3. The client sends `BuildArgs` to the server. `server/src/lib/prompt.ts` assembles the prompt: cast block, relationships, recent scenes (trimmed), per-agent memories / goals / policies, ceremony script for recouples, host intel, and the `VIEWER VIBES` block when any agent is outside the 30–70 dead band.
4. The server routes to the chosen LLM (Anthropic / Gemini / Ollama), repairs the JSON, validates against the schema, and returns.
5. The client's commit path applies LLM deltas, runs chat generation, folds chat into popularity, runs the social gravity pass, appends gravity events to the scene, persists to server, and triggers the next prefetch.

### Season phases

| Phase | Triggers | Behavior |
|---|---|---|
| `intro` | Scene 0 | Firepit welcome, all cast meet |
| `early` | Before first recouple | Mingling, flirting, grace recouple (no eliminations) |
| `midgame` | After first recouple, 4+ active | Bombshells, eliminations, challenges, dates, Casa Amor |
| `lategame` | 4 or fewer active | Higher stakes, late bombshells possible |
| `finale_ceremony` | 2 active (1 couple) | Crown the winners |

---

## LLM providers

Configured in `.env` (see `.env.example`). The server reads `LLM_PROVIDER` and routes to the matching service.

### Anthropic (default in prod)

```env
LLM_PROVIDER=anthropic
ANTHROPIC_API_KEY=sk-ant-...
ANTHROPIC_MODEL=claude-haiku-4-5    # default; claude-sonnet-4-6 for higher quality
```

Get a key at <https://console.anthropic.com/>. This is separate from any Claude subscription — the API is billed per-token on your org.

### Gemini (fallback + alt)

```env
LLM_PROVIDER=gemini
GEMINI_API_KEY=...
```

Get a key at <https://aistudio.google.com/app/apikey>. When `ANTHROPIC_API_KEY` AND `GEMINI_API_KEY` are both set, Gemini auto-falls-in whenever Anthropic returns rate-limit / overloaded / out-of-credit. Gemini cascades through `gemini-2.0-flash-lite → gemini-2.5-flash-lite → gemini-2.5-flash`.

### Ollama (dev default — free + offline)

```env
LLM_PROVIDER=ollama
OLLAMA_HOST=http://localhost:11434
OLLAMA_MODEL=qwen3:32b
```

Recommended models (ordered by quality, pull with `ollama pull <name>`):

| Model | Weights | RAM needed | Notes |
|---|---|---|---|
| `llama3.3:70b-instruct` | ~40 GB | 64 GB+ | Closest to Claude / GPT-5 quality. Slower (~45 s / scene). |
| `qwen3:72b` | ~42 GB | 64 GB+ | Same tier as Llama 70B, slightly better at playful prose. |
| **`qwen3:32b`** *(default)* | ~19 GB | 32 GB+ | Best quality-per-GB on Ollama. JSON rock-solid, real dialogue voice. Scene gen ~20 s. |
| `mistral-small-3.1:24b` | ~14 GB | 24 GB+ | Strong alternative if Qwen prose doesn't fit the vibe. |
| `qwen3:14b` | ~9 GB | 16 GB | Compact. Meaningful step up from smaller models. |

Why not `llama3.2`? It's a **3 B parameter** model (the default tag pulls the 3B variant). It can't reliably hold 8-agent dialogue + a JSON schema in context. Scenes come out with broken structure or flat voices. The 32B tier above is where quality becomes worth it.

Ollama throughput — set BEFORE `ollama serve`:

```bash
launchctl setenv OLLAMA_NUM_PARALLEL 4   # otherwise prefetch queues serialize
launchctl setenv OLLAMA_KEEP_ALIVE -1    # stops 5s re-warm between scenes
```

---

## Project structure

```
shared/                      # TypeScript types used by both client and server
├── types.ts                 # Agent, Episode, Scene, Relationship, SeasonArchive, ...
└── data/                    # cross-workspace seed data

server/                      # Express API (port 3001 in dev, Firebase Function in prod)
└── src/
    ├── app.ts               # Express app + CORS + route wiring
    ├── index.ts             # Local dev entry (node server)
    ├── functions.ts         # Firebase Functions entry (prod)
    ├── routes/
    │   ├── session.ts       # GET/POST session + season-archive subcollection
    │   ├── training.ts      # shared training-data pipeline
    │   ├── wisdom.ts        # per-session + aggregate wisdom
    │   ├── embeddings.ts    # vector embeddings for memory retrieval
    │   ├── llm.ts           # scene-generation endpoint
    │   └── dev.ts           # dev-only provider override
    ├── services/
    │   ├── anthropic.ts     # Anthropic provider (default prod)
    │   ├── gemini.ts        # Gemini provider
    │   ├── ollama.ts        # Ollama provider (default dev)
    │   ├── llm.ts           # router + fallback logic
    │   └── firebase.ts      # Firestore + local-JSON fallback
    └── lib/
        ├── prompt.ts        # prompt assembly (cast, rels, VIEWER VIBES, ...)
        ├── schema.ts        # JSON repair + LLM-response validator
        ├── environments.ts  # scene type metadata
        ├── castGenerator.ts # cast-pool generation used on new villas
        ├── buildArgsSchema.ts # request shape validation
        ├── trainingData.ts  # past-season archive helpers
        └── exportData.ts    # Season + RL export formats

client/                      # Vite + React 19 + Tailwind v4 workspace
└── src/
    ├── components/ui/       # Tooltip, Drawer, SessionModal, ...
    ├── data/                # host definition, seed relationships, environments
    ├── features/
    │   ├── agents/          # AgentAscii, HostAscii, CastList
    │   ├── dialogue/        # ChatBubble, ChatBubbleFeed, SystemChip
    │   ├── episode/         # BottomActionBar (New Season / New Villa)
    │   ├── relationships/   # RelationshipMatrix (+ gravity accents)
    │   ├── scene/           # AsciiStage, SceneView, useScenePlayback
    │   └── viewer/          # ViewerChat
    ├── lib/
    │   ├── api.ts           # client wrapper over the server API
    │   ├── sessionId.ts     # share-by-URL session handling
    │   ├── social-gravity.ts# chat→popularity→relationships engine
    │   ├── viewerChat.ts    # chat message generation
    │   ├── seasonPlanner.ts # next-scene picker
    │   ├── sceneEngine.ts   # scene-context builder
    │   ├── scenePrefetch.ts # batch prefetch runner
    │   ├── workingState.ts  # batch-simulator mirror of commit path
    │   ├── eliminationEngine.ts # public / islander / producer votes
    │   ├── casaAmor.ts      # casa amor split + stick/switch resolution
    │   ├── dramaScore.ts    # per-agent drama tracking
    │   ├── memory.ts        # Park et al. retrieval
    │   ├── memoryExtraction.ts # observation + reflection extraction
    │   ├── statInference.ts # dialogue→relationship delta fallback
    │   ├── rewards.ts       # RL reward computation
    │   ├── embeddings.ts    # embedding generation
    │   ├── trainingData.ts  # per-session wisdom + aggregate pool
    │   ├── minigames.ts     # minigame/challenge definitions
    │   ├── scenePayload.ts  # recent-scenes payload trimmer
    │   ├── dialogueIntensity.ts # line-level post-processing
    │   ├── music.ts         # Web Audio 8-bit chiptune
    │   ├── download.ts      # JSON export helper
    │   └── ids.ts
    └── store/
        └── useVillaStore.ts # Zustand state + commit path + startNextSeason / startNewVilla
```

---

## Commands

```bash
npm run dev           # client on :5173, server on :3001
npm run dev:local     # same but boots Ollama with tuned throughput flags
npm run build         # all three workspaces
npm run typecheck     # all three workspaces
npm run emulators     # firebase emulators for offline prod-like testing
npm run deploy        # build + firebase deploy
```

---

## Data model

Villa AI uses a share-by-URL auth model. There's no login — the session UUID stored in `sessionStorage` is both your identity and your share token. Anyone who has the URL can watch. Training data, wisdom, and past-season archives all live server-side.

| Collection | Shape | Notes |
|---|---|---|
| `villaSessions/{id}` | `{ sessionId, episode, cast, trainingContributions[] }` | One per playthrough. `episode.number` is the current season. |
| `villaSessions/{id}/seasons/{n}` | `SeasonArchive` | Past seasons from this session. Written when "New Season" fires. |
| `trainingData/{autoId}` | Gameplay training entries | Global shared pool across all sessions. RL training input. |
| `wisdomArchives/{key}` | Cross-season reflections | Feeds returning agents' seed memories. |

---

## Troubleshooting

**`Could not reach Ollama`** — Ollama isn't running or CORS is blocking. Run `OLLAMA_ORIGINS="*" ollama serve` in a terminal, or `launchctl setenv OLLAMA_ORIGINS "*"` and restart the Ollama app.

**`Ollama model not pulled`** — `ollama pull qwen3:32b` (or whichever model you've set in `.env`).

**`FREE TIER quota` / `429` on Gemini** — your API key's project isn't billed. Generate a new key under a billed project at <https://aistudio.google.com/app/apikey>.

**`insufficient_quota` / `overloaded_error` on Anthropic** — if `GEMINI_API_KEY` is set, the server auto-falls-through. If not, add one.

**Scene returns broken JSON** — transient; retries automatically at a lower temperature. If persistent, use a stronger model (`qwen2.5:7b`+ on Ollama, or switch to Anthropic / Gemini).

**"Could not archive the finished season"** — the server couldn't write the past-season archive before starting the next season. Fixes usually: check `npm run dev:server` is up, or check Firebase credentials in `.env`. The new season is blocked intentionally so nothing is silently lost.

**State lost on refresh** — sessions live on the server; same URL on any device reloads the same villa. If state really is missing, click "New Villa" to start fresh at a new URL.

---

## Further reading

- [Generative Agents: Interactive Simulacra of Human Behavior (Park et al., 2023)](https://arxiv.org/abs/2304.03442) — the memory retrieval architecture
- [Ollama](https://ollama.com) — local LLM runtime
- [Anthropic API](https://docs.anthropic.com) — default cloud provider
