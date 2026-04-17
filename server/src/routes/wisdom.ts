import { Router } from 'express'
import { saveWisdom, getWisdom, getTrainingEntries } from '../services/firebase.js'

export const wisdomRouter = Router()

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Per-session wisdom blob. Shape:
//   { archive: { [agentId]: AgentMemory[] }, meta: AgentMemory[], updatedAt: number }
// Stored at wisdomArchives/session:{sessionId}.
function sessionKey(sessionId: string): string {
  return `session:${sessionId}`
}

// GET /api/wisdom — fetch this session's wisdom (archive + meta). Requires
// an x-session-id header so the client can't accidentally cross streams.
wisdomRouter.get('/', async (req, res) => {
  try {
    const sessionId = req.headers['x-session-id'] as string
    if (!UUID_RE.test(sessionId)) {
      res.status(400).json({ error: 'valid x-session-id header required' })
      return
    }
    const data = await getWisdom(sessionKey(sessionId))
    if (!data) {
      res.json({ archive: {}, meta: [] })
      return
    }
    res.json(data)
  } catch (err) {
    console.error('[wisdom] fetch error:', err)
    res.status(500).json({ error: 'Failed to fetch wisdom' })
  }
})

// POST /api/wisdom — replace this session's wisdom blob.
wisdomRouter.post('/', async (req, res) => {
  try {
    const sessionId = req.headers['x-session-id'] as string
    if (!UUID_RE.test(sessionId)) {
      res.status(400).json({ error: 'valid x-session-id header required' })
      return
    }
    const { archive, meta } = req.body as { archive?: unknown; meta?: unknown }
    if (archive !== undefined && (archive === null || typeof archive !== 'object')) {
      res.status(400).json({ error: 'archive must be an object' })
      return
    }
    if (meta !== undefined && !Array.isArray(meta)) {
      res.status(400).json({ error: 'meta must be an array' })
      return
    }
    await saveWisdom(sessionKey(sessionId), {
      archive: archive ?? {},
      meta: meta ?? [],
    })
    res.json({ success: true })
  } catch (err) {
    console.error('[wisdom] save error:', err)
    res.status(500).json({ error: 'Failed to save wisdom' })
  }
})

// GET /api/wisdom/aggregate — cross-session meta-wisdom for RL seeding.
// Pulls the top-N high-importance reflections across recent training entries
// so new agents on a fresh machine (or after cache wipe) still benefit from
// patterns learned by every past season, not just this user's.
wisdomRouter.get('/aggregate', async (req, res) => {
  try {
    const parsed = parseInt(req.query.limit as string)
    const limit = Number.isFinite(parsed) && parsed > 0 ? Math.min(parsed, 50) : 15

    const entries = (await getTrainingEntries(100)) as Array<Record<string, unknown>>

    type Memory = { id: string; agentId: string; content: string; importance: number; type?: string }
    const pool: Memory[] = []
    for (const entry of entries) {
      const rl = entry.rlExport as { agents?: Array<{ memories?: Memory[] }> } | undefined
      const agents = rl?.agents ?? []
      for (const ag of agents) {
        for (const m of ag.memories ?? []) {
          if (m.type === 'reflection' && m.importance >= 7) pool.push(m)
        }
      }
    }
    pool.sort((a, b) => b.importance - a.importance)
    const top = pool.slice(0, limit)
    res.json({ meta: top })
  } catch (err) {
    console.error('[wisdom] aggregate error:', err)
    res.status(500).json({ error: 'Failed to aggregate wisdom' })
  }
})
