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

export type SessionExistenceResult = "free" | "taken" | "unknown";

export async function checkSessionExists(
  sessionId: string,
): Promise<SessionExistenceResult> {
  try {
    const res = await fetch(`${BASE}/api/session/${sessionId}`, {
      method: "HEAD",
    });
    if (res.status === 200) return "taken";
    if (res.status === 404) return "free";
    return "unknown";
  } catch {
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
