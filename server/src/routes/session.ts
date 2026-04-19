import { Router } from "express";
import {
  saveSession,
  getSession,
  saveSeasonArchive,
  getSeasonArchive,
  listSeasonArchives,
} from "../services/firebase.js";

export const sessionRouter = Router();

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isValidSessionId(id: unknown): id is string {
  return typeof id === "string" && UUID_RE.test(id);
}

sessionRouter.post("/", async (req, res) => {
  try {
    const sessionId = req.headers["x-session-id"] as string;
    const { episode, cast } = req.body;
    if (!isValidSessionId(sessionId) || !episode?.id) {
      res.status(400).json({
        error: "valid x-session-id header and episode with id are required",
      });
      return;
    }
    const existing = await getSession(sessionId);
    const now = Date.now();
    const payload = {
      sessionId,
      episode,
      cast,
      trainingContributions:
        (existing as Record<string, unknown>)?.trainingContributions ?? [],
      createdAt: (existing as Record<string, unknown>)?.createdAt ?? now,
      updatedAt: now,
    };
    await saveSession(sessionId, payload);
    res.json({ success: true, sessionId });
  } catch (err) {
    console.error("[session] save error:", err);
    res.status(500).json({ error: "Failed to save session" });
  }
});

sessionRouter.get("/current", async (req, res) => {
  try {
    const sessionId = req.headers["x-session-id"] as string;
    if (!isValidSessionId(sessionId)) {
      res.status(400).json({ error: "valid x-session-id header required" });
      return;
    }
    const data = await getSession(sessionId);
    res.json(data ?? { session: null });
  } catch (err) {
    console.error("[session] load error:", err);
    res.status(500).json({ error: "Failed to load session" });
  }
});

sessionRouter.head("/:id", async (req, res) => {
  try {
    if (!isValidSessionId(req.params.id)) {
      res.status(400).end();
      return;
    }
    const data = await getSession(req.params.id);
    res.status(data ? 200 : 404).end();
  } catch (err) {
    console.error("[session] head error:", err);
    res.status(500).end();
  }
});

sessionRouter.get("/:id", async (req, res) => {
  try {
    if (!isValidSessionId(req.params.id)) {
      res.status(400).json({ error: "Invalid session ID format" });
      return;
    }
    const data = await getSession(req.params.id);
    if (!data) {
      res.status(404).json({ error: "Session not found" });
      return;
    }
    res.json(data);
  } catch (err) {
    console.error("[session] fetch error:", err);
    res.status(500).json({ error: "Failed to fetch session" });
  }
});

const MAX_SEASON_NUMBER = 99;

function isValidSeasonNumber(raw: string): number | null {
  if (!/^\d{1,3}$/.test(raw)) return null;
  const n = Number.parseInt(raw, 10);
  if (!Number.isInteger(n) || n < 1 || n > MAX_SEASON_NUMBER) return null;
  return n;
}

sessionRouter.post("/:id/seasons/:number", async (req, res) => {
  try {
    if (!isValidSessionId(req.params.id)) {
      res.status(400).json({ error: "Invalid session ID format" });
      return;
    }
    const seasonNumber = isValidSeasonNumber(req.params.number);
    if (seasonNumber === null) {
      res
        .status(400)
        .json({ error: `Invalid season number (1..${MAX_SEASON_NUMBER})` });
      return;
    }
    const archive = req.body as Record<string, unknown> | undefined;
    if (!archive || typeof archive !== "object") {
      res.status(400).json({ error: "Archive body required" });
      return;
    }
    const payload = {
      ...archive,
      sessionId: req.params.id,
      seasonNumber,
    };
    await saveSeasonArchive(req.params.id, seasonNumber, payload);
    res.json({ success: true, sessionId: req.params.id, seasonNumber });
  } catch (err) {
    console.error("[session] archive season error:", err);
    res.status(500).json({ error: "Failed to archive season" });
  }
});

sessionRouter.get("/:id/seasons/:number", async (req, res) => {
  try {
    if (!isValidSessionId(req.params.id)) {
      res.status(400).json({ error: "Invalid session ID format" });
      return;
    }
    const seasonNumber = isValidSeasonNumber(req.params.number);
    if (seasonNumber === null) {
      res
        .status(400)
        .json({ error: `Invalid season number (1..${MAX_SEASON_NUMBER})` });
      return;
    }
    const data = await getSeasonArchive(req.params.id, seasonNumber);
    if (!data) {
      res.status(404).json({ error: "Season archive not found" });
      return;
    }
    res.json(data);
  } catch (err) {
    console.error("[session] fetch season error:", err);
    res.status(500).json({ error: "Failed to fetch season archive" });
  }
});

sessionRouter.get("/:id/seasons", async (req, res) => {
  try {
    if (!isValidSessionId(req.params.id)) {
      res.status(400).json({ error: "Invalid session ID format" });
      return;
    }
    const entries = await listSeasonArchives(req.params.id);
    res.json({
      sessionId: req.params.id,
      seasons: entries.map(({ seasonNumber, data }) => {
        const d = data as Record<string, unknown>;
        return {
          seasonNumber,
          episodeTitle: d.episodeTitle ?? null,
          seasonTheme: d.seasonTheme ?? null,
          winnerCouple: d.winnerCouple ?? null,
          archivedAt: d.archivedAt ?? null,
          sceneCount: Array.isArray(d.scenes) ? d.scenes.length : 0,
        };
      }),
    });
  } catch (err) {
    console.error("[session] list seasons error:", err);
    res.status(500).json({ error: "Failed to list seasons" });
  }
});
