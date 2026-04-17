import { getSessionId } from './sessionId'

const BASE = ''

async function request<T>(path: string, body?: unknown): Promise<T> {
  const sessionId = getSessionId()
  const headers: Record<string, string> = { 'x-session-id': sessionId }
  if (body) headers['Content-Type'] = 'application/json'

  const res = await fetch(`${BASE}${path}`, {
    method: body ? 'POST' : 'GET',
    headers,
    body: body ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }))
    throw new Error((err as { error?: string }).error ?? `HTTP ${res.status}`)
  }
  return res.json() as Promise<T>
}

export async function saveSession(episode: unknown, cast: unknown): Promise<{ success: boolean; sessionId: string }> {
  return request('/api/session', { episode, cast })
}

export async function loadCurrentSession(): Promise<{ episode: unknown; cast: unknown; sessionId: string } | null> {
  try {
    const data = await request<{ episode?: unknown; cast?: unknown; sessionId?: string }>('/api/session/current')
    if (data?.episode) return data as { episode: unknown; cast: unknown; sessionId: string }
    return null
  } catch {
    return null
  }
}

export async function saveTrainingData(data: unknown): Promise<{ success: boolean; entryId: string }> {
  return request('/api/training', { data })
}

export async function fetchTrainingArchive(limit = 50): Promise<{ entries: unknown[] }> {
  return request(`/api/training?limit=${limit}`)
}

export async function exportSeason(episode: unknown, cast: unknown): Promise<unknown> {
  return request('/api/export/season', { episode, cast })
}

export async function exportRL(episode: unknown, cast: unknown): Promise<unknown> {
  return request('/api/export/rl', { episode, cast })
}

export async function healthCheck(): Promise<{ status: string }> {
  return request('/api/health')
}
