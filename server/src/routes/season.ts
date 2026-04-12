import { Router } from 'express'
import { saveSeason, getSeason } from '../services/firebase.js'

export const seasonRouter = Router()

seasonRouter.post('/', async (req, res) => {
  try {
    const userId = req.headers['x-user-id'] as string
    const { episode } = req.body
    if (!userId || !episode?.id) {
      res.status(400).json({ error: 'x-user-id header and episode with id are required' })
      return
    }
    const docId = `${userId}_${episode.id}`
    await saveSeason(docId, { userId, episode, createdAt: Date.now() })
    res.json({ success: true, seasonId: docId })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    res.status(500).json({ error: msg })
  }
})

seasonRouter.get('/current', async (req, res) => {
  try {
    const userId = req.headers['x-user-id'] as string
    if (!userId) {
      res.status(400).json({ error: 'x-user-id header required' })
      return
    }
    const data = await getSeason(`${userId}_current`)
    if (!data) {
      res.status(404).json({ error: 'No current season found' })
      return
    }
    res.json(data)
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    res.status(500).json({ error: msg })
  }
})

seasonRouter.get('/:id', async (req, res) => {
  try {
    const data = await getSeason(req.params.id!)
    if (!data) {
      res.status(404).json({ error: 'Season not found' })
      return
    }
    res.json(data)
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    res.status(500).json({ error: msg })
  }
})
