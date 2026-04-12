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

export async function createSeason(episode: unknown): Promise<{ success: boolean; seasonId: string }> {
  return request('/api/season', { episode })
}

export async function fetchSeason(seasonId: string): Promise<unknown> {
  return request(`/api/season/${seasonId}`)
}

export async function fetchTrainingArchive(): Promise<{ seasons: unknown[] }> {
  return request('/api/training')
}

export async function saveTrainingData(seasonId: string, data: unknown): Promise<void> {
  await request('/api/training', { seasonId, data })
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
