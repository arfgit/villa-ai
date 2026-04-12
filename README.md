# villa-ai

An AI-driven Love Island-style reality dating show simulator. Procedurally generated
contestants flirt, scheme, couple up, and get dumped from the villa -- driven by an
LLM "writers room" that generates each scene as structured JSON, rendered in a retro
ASCII/CRT aesthetic.

Built with Vite + React 19 + TypeScript + Tailwind v4 + Zustand. Local development
runs against [Ollama](https://ollama.com) (free and offline); production builds use
the Gemini API.

---

## Quick start (dev)

```bash
# 1. Install Ollama and pull a model
brew install ollama
ollama pull llama3.2

# 2. Start Ollama with CORS enabled for the dev server
OLLAMA_ORIGINS="*" ollama serve

# 3. In another terminal, install deps and run
npm install
npm run dev
```

Open http://localhost:5173 and click **start show**.

If Ollama is running as a background service (desktop app or `brew services`), allow
CORS once with:

```bash
launchctl setenv OLLAMA_ORIGINS "*"
# then quit and re-open the Ollama app
```

---

## Features

### Dynamic seasons
- **No fixed episode count** -- the season planner state machine adapts to drama levels.
  More dramatic seasons run longer; quiet ones converge faster. The season ends naturally
  when the last couple stands.
- **Drama scoring** -- per-agent drama scores influence pacing, participant selection for
  interviews, and scene variety. High-drama characters get more screen time.

### Procedural cast generation
- Every new season generates a unique cast from pools of 56 names, 16 archetypes, 12
  personality templates, and 10 voice styles. No two seasons have the same characters.
- **Bombshells** arrive mid-season (up to 5 per season, 1-2 at a time) with a dating
  period before they must couple at the next recoupling -- just like the real show.

### RL-style learning
- Each agent has a brain with memories, goals, and policies that evolve via reflection
  every 3 scenes. Rewards signal what worked (coupling, winning challenges) and what
  didn't (elimination, being stolen from).
- **Cross-season wisdom** -- returning agents inherit their strongest reflections.
  Generated cast get "meta-wisdom" from past seasons, so they "heard stories."
- Memory retrieval uses the Generative Agents architecture (Park et al.): recency +
  importance + relevance scoring with softmax sampling and MMR diversity.

### Authentic Love Island format
- **Host drives the show** -- introduces games, reads texts, builds suspense at
  recouplings, announces eliminations. Not just background decoration.
- **Recouplings** eliminate one couple at a time. No mass dumps. Grace protection for
  partners abandoned by defections or bombshell steals.
- **Smart stat inference** -- relationship changes are derived from dialogue emotion and
  actions, not just explicit LLM events. Contestants never mention stat numbers.

### Visual & UX
- ASCII characters with emoji faces and floating emotion bubbles (mood indicators).
- Emotion-specific body language poses (8 frames per emotion set).
- Competition-specific animations for mini-games and challenges.
- Scene nav auto-scrolls when following along but doesn't interrupt if re-reading.
- State persists to localStorage -- refresh doesn't lose your season.
- Per-scene procedural 8-bit chiptune music (Web Audio API).

---

## How it works

### Scene generation loop

1. The Zustand store tracks the episode state: cast, relationships (trust/attraction/
   jealousy 0-100), emotions, couples, drama scores, and a compositional season theme.
2. The **season planner** (`src/lib/seasonPlanner.ts`) determines the next scene type
   based on current phase, drama levels, bombshell availability, and recouple timing.
3. A prompt is built (`src/lib/prompt.ts`) including cast, relationships, recent scenes,
   per-agent memories/goals/policies, and host intel (current drama tensions).
4. The prompt goes to the LLM (Ollama or Gemini) via `src/lib/llm.ts`.
5. The response is repaired, validated, and applied to state. Missing relationship
   deltas are inferred from dialogue. Drama scores update. Memories are extracted and
   embedded. Every 3 scenes, agents reflect and update their goals/policies.

### Season phases

| Phase | Triggers | Behavior |
|-------|----------|----------|
| `intro` | Scene 0 | Firepit welcome, all cast meet |
| `early` | Before first recouple | Minigame + grace recouple (no eliminations) |
| `midgame` | After first recouple, 4+ active | Bombshells, eliminations, challenges, dates |
| `lategame` | 4 or fewer active | Higher stakes, possible late bombshells |
| `finale_ceremony` | 2 active (1 couple) | Crown the winners |

---

## LLM providers

Set `VITE_LLM_PROVIDER` in `.env`. Defaults: `ollama` in dev, `gemini` in prod.

### Ollama (dev)

Free, offline, no rate limits.

```env
VITE_LLM_PROVIDER=ollama
VITE_OLLAMA_HOST=http://localhost:11434
VITE_OLLAMA_MODEL=llama3.2
```

Recommended models:

| Model | Size | Notes |
|-------|------|-------|
| `llama3.2` | 2 GB | Default. Fast. Occasionally weak at structure. |
| `qwen2.5:7b` | 4 GB | Best small-model JSON adherence. |
| `qwen2.5:14b` | 9 GB | Closest to Gemini quality. |

### Gemini (prod)

```env
VITE_LLM_PROVIDER=gemini
VITE_GEMINI_API_KEY=your_key_here
```

Get a key at https://aistudio.google.com/app/apikey. Falls back through
`gemini-2.0-flash-lite` -> `gemini-2.5-flash-lite` -> `gemini-2.5-flash` on
rate limits.

---

## Project structure

```
src/
├── components/ui/         # Tooltip, Drawer
├── data/
│   ├── castPool.ts        # Season cast sampling (uses generator)
│   ├── environments.ts    # ASCII art per scene type + labels
│   ├── host.ts            # Host character definition
│   └── seedRelationships.ts
├── features/
│   ├── agents/            # AgentAscii, HostAscii, CastList
│   ├── dialogue/          # ChatBubble, ChatBubbleFeed, SystemChip
│   ├── episode/           # EpisodeHeader, BottomActionBar
│   ├── relationships/     # RelationshipMatrix
│   └── scene/             # AsciiStage, SceneView, useScenePlayback
├── lib/
│   ├── castGenerator.ts   # Procedural cast generation
│   ├── dramaScore.ts      # Per-agent drama tracking
│   ├── seasonPlanner.ts   # Dynamic season state machine
│   ├── gemini.ts          # Gemini provider
│   ├── ollama.ts          # Ollama provider
│   ├── llm.ts             # Provider router
│   ├── prompt.ts          # Prompt builder (with host intel)
│   ├── schema.ts          # JSON repair + validator
│   ├── rewards.ts         # RL reward computation
│   ├── memory.ts          # Memory retrieval (Park et al.)
│   ├── memoryExtraction.ts# Observation + reflection extraction
│   ├── statInference.ts   # Dialogue-to-stat inference
│   ├── embeddings.ts      # Embedding generation
│   ├── music.ts           # Procedural 8-bit chiptune
│   └── ids.ts
├── store/
│   └── useVillaStore.ts   # Zustand state + scene generation + localStorage persist
└── types/
    └── index.ts
```

---

## Commands

```bash
npm run dev       # Vite dev server at http://localhost:5173
npm run build     # Type-check + production build -> dist/
npm run preview   # Serve the built bundle locally
npx tsc --noEmit  # Type check without building
```

---

## Troubleshooting

**`Could not reach Ollama`** -- Ollama isn't running or CORS is blocking. Run
`OLLAMA_ORIGINS="*" ollama serve` in a terminal.

**`Ollama model not pulled`** -- `ollama pull llama3.2` (or your preferred model).

**`FREE TIER quota`** -- Your Gemini API key's project needs billing linked. Generate
a new key under a billed project.

**Scene returns broken JSON** -- Transient; retries automatically at lower temperature.
If persistent, use a stronger model (`qwen2.5:7b`+).

**State lost on refresh** -- State now persists to localStorage automatically. If you
see stale state, click "NEW SEASON" to start fresh.
