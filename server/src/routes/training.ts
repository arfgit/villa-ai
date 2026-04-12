import { Router } from 'express'
import { getTrainingArchive, saveTrainingData } from '../services/firebase.js'

export const trainingRouter = Router()

// GET /api/training — fetch training data archive
trainingRouter.get('/', async (_req, res) => {
  try {
    const archive = await getTrainingArchive()
    res.json({ seasons: archive })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    res.status(500).json({ error: msg })
  }
})

// POST /api/training — save training data for a season
trainingRouter.post('/', async (req, res) => {
  try {
    const { seasonId, data } = req.body
    if (!seasonId || !data) {
      res.status(400).json({ error: 'seasonId and data are required' })
      return
    }
    await saveTrainingData(seasonId, { ...data, exportedAt: Date.now() })
    res.json({ success: true })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    res.status(500).json({ error: msg })
  }
})
