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

// POST /api/session — create or update a villa session
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

// GET /api/session/current — load session for the requesting client.
// "No session yet" is a normal first-visit state, not an error — we
// return 200 + `{session: null}` so the dev console doesn't log a noisy
// 404 on every fresh page load.
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

// HEAD /api/session/:id — cheap existence probe for the client's UUID
// collision check on new-session generation. Returns 200 (exists) or
// 404 (does not). No body in either direction — this is called from
// ensureSessionId() / rotateSessionId() in a small retry loop, so we
// want it as lightweight as possible.
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

// GET /api/session/:id — fetch any session by ID.
// INTENTIONAL share-by-URL access model: knowing the UUID grants read access,
// same as a Google Docs unlisted share. There is no user login, so the UUID
// is effectively the auth token — treat it like a password and don't post it
// in public places. If a private-session model is needed later, add an
// owner-check using an x-session-id header of the requester.
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

// Bound the season number we accept on the wire. 99 seasons is already
// way past any realistic playthrough; a crafted payload with 10_000
// wouldn't break anything critical but would let someone clutter the
// subcollection with junk entries.
const MAX_SEASON_NUMBER = 99;

function isValidSeasonNumber(raw: string): number | null {
  if (!/^\d{1,3}$/.test(raw)) return null;
  const n = Number.parseInt(raw, 10);
  if (!Number.isInteger(n) || n < 1 || n > MAX_SEASON_NUMBER) return null;
  return n;
}

// POST /api/session/:id/seasons/:number — archive a completed season.
// Called by the client when the player clicks "New Season" — the current
// villa's scenes + final state snapshot into
// `villaSessions/{id}/seasons/{number}` so the live session doc only
// carries the IN-PROGRESS season. Past seasons stay accessible via GET
// for UI replay without inflating every session read.
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
    // Stamp the canonical session+season so the persisted doc isn't
    // tied to whatever the client sent in its payload. This also lets
    // listSeasonArchives's local-fallback filter match reliably.
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

// GET /api/session/:id/seasons/:number — fetch a single past season.
// Reuses the share-by-URL model: anyone with the session UUID can read
// its seasons. Used for replay / summary UI.
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

// GET /api/session/:id/seasons — list all archived seasons for a session.
// Returns lightweight metadata (season number + minimal stats) not full
// scene lists, so the UI can render a "Past Seasons" picker cheaply.
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
