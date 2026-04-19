import type { SeasonSummary } from "@villa-ai/shared";
import { getTrainingEntries } from "../services/firebase.js";

const MAX_SEASONS = 50;

async function loadTrainingArchive(): Promise<SeasonSummary[]> {
  try {
    const docs = await getTrainingEntries(MAX_SEASONS);
    return docs
      .map((d) => (d as { summary?: SeasonSummary }).summary)
      .filter((s): s is SeasonSummary => !!s);
  } catch {
    return [];
  }
}

// The past-seasons block is the same for every scene in the same session
// (seasons only change when a new one completes, which is rare compared to
// scene-generation frequency). Cache it so every prompt build isn't paying
// a Firestore round-trip for identical data.
const PAST_SEASONS_TTL_MS = 60_000;
let pastSeasonsCache: { block: string; expiry: number } | null = null;
// In-flight fetch shared by concurrent callers. Without this, five parallel
// prefetch scenes arriving at a cold cache would each fire their own
// Firestore query. With it, the first call wins the race and the other
// four await the same promise.
let pastSeasonsInFlight: Promise<string> | null = null;

export async function buildPastSeasonsPromptBlock(): Promise<string> {
  const now = Date.now();
  if (pastSeasonsCache && pastSeasonsCache.expiry > now) {
    return pastSeasonsCache.block;
  }
  if (pastSeasonsInFlight) {
    return pastSeasonsInFlight;
  }

  pastSeasonsInFlight = (async () => {
    try {
      const seasons = await loadTrainingArchive();
      const block =
        seasons.length === 0
          ? ""
          : `\n## PAST SEASONS (reference for continuity)\n${seasons
              .map((s) => {
                const winner = s.winnerNames
                  ? `${s.winnerNames[0]} & ${s.winnerNames[1]}`
                  : "no winner";
                const hl =
                  s.highlights.length > 0
                    ? s.highlights.map((h) => `  - ${h}`).join("\n")
                    : "  - (no notable moments recorded)";
                return `Season ${s.seasonNumber} (${s.totalScenes} scenes, ${s.eliminationCount} eliminations, winner: ${winner})
  Theme: ${s.theme}
  Key moments:\n${hl}`;
              })
              .join("\n")}\n`;
      pastSeasonsCache = { block, expiry: Date.now() + PAST_SEASONS_TTL_MS };
      return block;
    } finally {
      pastSeasonsInFlight = null;
    }
  })();
  return pastSeasonsInFlight;
}
