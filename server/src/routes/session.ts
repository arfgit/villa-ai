import { Router } from 'express'
import { saveSession, getSession } from '../services/firebase.js'

export const sessionRouter = Router()

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function isValidSessionId(id: unknown): id is string {
  return typeof id === 'string' && UUID_RE.test(id)
}

// POST /api/session — create or update a villa session
sessionRouter.post('/', async (req, res) => {
  try {
    const sessionId = req.headers['x-session-id'] as string
    const { episode, cast } = req.body
    if (!isValidSessionId(sessionId) || !episode?.id) {
      res.status(400).json({ error: 'valid x-session-id header and episode with id are required' })
      return
    }
    const existing = await getSession(sessionId)
    const now = Date.now()
    const payload = {
      sessionId,
      episode,
      cast,
      trainingContributions: (existing as Record<string, unknown>)?.trainingContributions ?? [],
      createdAt: (existing as Record<string, unknown>)?.createdAt ?? now,
      updatedAt: now,
    }
    await saveSession(sessionId, payload)
    res.json({ success: true, sessionId })
  } catch (err) {
    console.error('[session] save error:', err)
    res.status(500).json({ error: 'Failed to save session' })
  }
})

// GET /api/session/current — load session for the requesting client
sessionRouter.get('/current', async (req, res) => {
  try {
    const sessionId = req.headers['x-session-id'] as string
    if (!isValidSessionId(sessionId)) {
      res.status(400).json({ error: 'valid x-session-id header required' })
      return
    }
    const data = await getSession(sessionId)
    if (!data) {
      res.status(404).json({ error: 'No session found' })
      return
    }
    res.json(data)
  } catch (err) {
    console.error('[session] load error:', err)
    res.status(500).json({ error: 'Failed to load session' })
  }
})

// GET /api/session/:id — fetch any session by ID
sessionRouter.get('/:id', async (req, res) => {
  try {
    if (!isValidSessionId(req.params.id)) {
      res.status(400).json({ error: 'Invalid session ID format' })
      return
    }
    const data = await getSession(req.params.id)
    if (!data) {
      res.status(404).json({ error: 'Session not found' })
      return
    }
    res.json(data)
  } catch (err) {
    console.error('[session] fetch error:', err)
    res.status(500).json({ error: 'Failed to fetch session' })
  }
})
