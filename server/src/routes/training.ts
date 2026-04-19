import { Router } from "express";
import {
  saveTrainingEntry,
  getTrainingEntries,
  getTrainingForSession,
} from "../services/firebase.js";

export const trainingRouter = Router();

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_LIMIT = 200;

trainingRouter.get("/", async (req, res) => {
  try {
    const parsed = parseInt(req.query.limit as string);
    const limit =
      Number.isFinite(parsed) && parsed > 0 ? Math.min(parsed, MAX_LIMIT) : 50;
    const entries = await getTrainingEntries(limit);
    res.json({ entries });
  } catch (err) {
    console.error("[training] fetch error:", err);
    res.status(500).json({ error: "Failed to fetch training data" });
  }
});

trainingRouter.get("/session/:sessionId", async (req, res) => {
  try {
    if (!UUID_RE.test(req.params.sessionId!)) {
      res.status(400).json({ error: "Invalid session ID format" });
      return;
    }
    const entries = await getTrainingForSession(req.params.sessionId!);
    res.json({ entries });
  } catch (err) {
    console.error("[training] session fetch error:", err);
    res.status(500).json({ error: "Failed to fetch training data" });
  }
});

trainingRouter.post("/", async (req, res) => {
  try {
    const sessionId = req.headers["x-session-id"] as string;
    if (!UUID_RE.test(sessionId)) {
      res.status(400).json({ error: "valid x-session-id header required" });
      return;
    }
    const { data } = req.body;
    if (!data || typeof data !== "object") {
      res.status(400).json({ error: "data object is required" });
      return;
    }
    const {
      seasonNumber,
      seasonTheme,
      seasonPhase,
      totalScenes,
      castNames,
      scenes,
      relationships,
      couples,
      eliminatedIds,
      winnerCouple,
      dramaScores,
      viewerSentiment,
      casaAmorState,
      summary,
      seasonExport,
      rlExport,
    } = data as Record<string, unknown>;
    await saveTrainingEntry(sessionId, {
      sessionId,
      ...(seasonNumber != null && { seasonNumber }),
      ...(seasonTheme != null && { seasonTheme }),
      ...(seasonPhase != null && { seasonPhase }),
      ...(totalScenes != null && { totalScenes }),
      ...(castNames != null && { castNames }),
      ...(scenes != null && { scenes }),
      ...(relationships != null && { relationships }),
      ...(couples != null && { couples }),
      ...(eliminatedIds != null && { eliminatedIds }),
      ...(winnerCouple !== undefined && { winnerCouple }),
      ...(dramaScores != null && { dramaScores }),
      ...(viewerSentiment != null && { viewerSentiment }),
      ...(casaAmorState !== undefined && { casaAmorState }),
      ...(summary != null && { summary }),
      ...(seasonExport != null && { seasonExport }),
      ...(rlExport != null && { rlExport }),
    });
    res.json({ success: true });
  } catch (err) {
    console.error("[training] save error:", err);
    res.status(500).json({ error: "Failed to save training data" });
  }
});
