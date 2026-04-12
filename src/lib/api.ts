import { getUserId } from './userId'

const BASE = ''

async function request<T>(path: string, body?: unknown): Promise<T> {
  const userId = getUserId()
  const headers: Record<string, string> = { 'x-user-id': userId }
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

export async function saveSeason(episode: unknown, cast: unknown): Promise<void> {
  await request('/api/season', { episode, cast })
}

export async function loadCurrentSeason(): Promise<{ episode: unknown; cast: unknown; userId: string } | null> {
  try {
    const data = await request<{ episode?: unknown; cast?: unknown; userId?: string }>(`/api/season/current`)
    if (data?.episode) return data as { episode: unknown; cast: unknown; userId: string }
    return null
  } catch {
    return null
  }
}

export async function saveTrainingData(seasonId: string, data: unknown): Promise<void> {
  await request('/api/training', { seasonId, data })
}

export async function fetchTrainingArchive(): Promise<{ seasons: unknown[] }> {
  return request('/api/training')
}

export async function serverHealthCheck(): Promise<{ status: string; firebase: boolean }> {
  try {
    return await request('/api/health')
  } catch {
    return { status: 'unreachable', firebase: false }
  }
}
