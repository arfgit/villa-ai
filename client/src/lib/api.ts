import { getSessionId } from "./sessionId";

const BASE = "";

async function request<T>(path: string, body?: unknown): Promise<T> {
  const sessionId = getSessionId();
  const headers: Record<string, string> = { "x-session-id": sessionId };
  if (body) headers["Content-Type"] = "application/json";

  const res = await fetch(`${BASE}${path}`, {
    method: body ? "POST" : "GET",
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error((err as { error?: string }).error ?? `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export async function saveSession(
  episode: unknown,
  cast: unknown,
): Promise<{ success: boolean; sessionId: string }> {
  return request("/api/session", { episode, cast });
}

export async function loadCurrentSession(): Promise<{
  episode: unknown;
  cast: unknown;
  sessionId: string;
} | null> {
  try {
    // Server returns {session: null} when no session exists (200, not 404,
    // to avoid dev-console noise). Treat either the sentinel or a missing
    // episode field as "no session".
    const data = await request<{
      episode?: unknown;
      cast?: unknown;
      sessionId?: string;
      session?: null;
    }>("/api/session/current");
    if (data && "session" in data && data.session === null) return null;
    if (data?.episode)
      return data as { episode: unknown; cast: unknown; sessionId: string };
    return null;
  } catch {
    return null;
  }
}

// Tri-state result from the existence probe. We distinguish these three
// cases because mintUniqueSessionId needs different behavior for each:
//   - "free": confirmed 404 on the HEAD probe — safe to claim the UUID
//   - "taken": confirmed 200 — a session already exists on the server
//   - "unknown": network error or non-404/200 HTTP status (e.g. 500, 503)
//     — we can't tell; caller decides whether to retry or fall through
export type SessionExistenceResult = "free" | "taken" | "unknown";

// Lightweight existence probe used by ensureSessionId / rotateSessionId
// to avoid handing out a UUID that's already bound to another session
// on the server. Intentionally bypasses request() because HEAD has no
// response body to parse.
export async function checkSessionExists(
  sessionId: string,
): Promise<SessionExistenceResult> {
  try {
    const res = await fetch(`${BASE}/api/session/${sessionId}`, {
      method: "HEAD",
    });
    if (res.status === 200) return "taken";
    if (res.status === 404) return "free";
    // Anything else (500, 503, proxy error, etc.) — the server is in a
    // state we can't reason about. Returning "unknown" lets the caller
    // retry or surface the issue instead of silently assuming the UUID
    // is available and landing on top of an existing session.
    return "unknown";
  } catch {
    // Network error — same "don't assume" answer. The caller decides.
    return "unknown";
  }
}

export async function loadSessionById(
  sessionId: string,
): Promise<{ episode: unknown; cast: unknown; sessionId: string } | null> {
  try {
    const data = await request<{
      episode?: unknown;
      cast?: unknown;
      sessionId?: string;
    }>(`/api/session/${sessionId}`);
    if (data?.episode)
      return data as { episode: unknown; cast: unknown; sessionId: string };
    return null;
  } catch {
    return null;
  }
}

export async function saveTrainingData(
  data: unknown,
): Promise<{ success: boolean }> {
  return request("/api/training", { data });
}

// Archive a finished season into the session's `seasons` subcollection on
// the server. Called by startNextSeason before resetting the live episode
// so past scenes + final relationships + winners stay accessible for
// replay / summary UI without inflating every session-doc read.
export async function archiveSeason(
  sessionId: string,
  seasonNumber: number,
  archive: unknown,
): Promise<{ success: boolean; seasonNumber: number }> {
  return request(`/api/session/${sessionId}/seasons/${seasonNumber}`, archive);
}

export async function listPastSeasons(sessionId: string): Promise<{
  sessionId: string;
  seasons: Array<{
    seasonNumber: number;
    episodeTitle: string | null;
    seasonTheme: string | null;
    winnerCouple: unknown;
    archivedAt: unknown;
    sceneCount: number;
  }>;
}> {
  return request(`/api/session/${sessionId}/seasons`);
}

export async function fetchTrainingArchive(
  limit = 50,
): Promise<{ entries: unknown[] }> {
  return request(`/api/training?limit=${limit}`);
}

// Per-session wisdom (archive + meta). Replaces the former localStorage
// villa-ai-wisdom / villa-ai-meta-wisdom keys.
export async function fetchWisdom(): Promise<{
  archive: Record<string, unknown[]>;
  meta: unknown[];
}> {
  try {
    return await request("/api/wisdom");
  } catch {
    return { archive: {}, meta: [] };
  }
}

export async function saveWisdom(
  archive: Record<string, unknown[]>,
  meta: unknown[],
): Promise<{ success: boolean }> {
  return request("/api/wisdom", { archive, meta });
}

// Cross-session RL meta pool — used when this session has no meta-wisdom yet
// (fresh machine, cache wipe, brand-new user).
export async function fetchAggregateWisdom(
  limit = 15,
): Promise<{ meta: unknown[] }> {
  try {
    return await request(`/api/wisdom/aggregate?limit=${limit}`);
  } catch {
    return { meta: [] };
  }
}

export async function serverHealthCheck(): Promise<{
  status: string;
  firebase: boolean;
}> {
  try {
    return await request("/api/health");
  } catch {
    return { status: "unreachable", firebase: false };
  }
}

// Dev-only provider toggle. The server gates these behind NODE_ENV so
// in prod they 404 — catch that here and the UI will hide the toggle.
export type ProviderState = {
  effective: "anthropic" | "gemini" | "ollama";
  override: "anthropic" | "gemini" | "ollama" | null;
};

export async function fetchProviderState(): Promise<ProviderState | null> {
  try {
    return await request<ProviderState>("/api/dev/provider");
  } catch {
    return null;
  }
}

export async function setProviderOverride(
  provider: "anthropic" | "gemini" | "ollama" | null,
): Promise<ProviderState | null> {
  try {
    return await request<ProviderState>("/api/dev/provider", { provider });
  } catch {
    return null;
  }
}
