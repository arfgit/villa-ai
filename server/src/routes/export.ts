import { Router } from 'express'

export const exportRouter = Router()

// POST /api/export/season — build and return season export JSON
exportRouter.post('/season', async (req, res) => {
  try {
    const { episode, cast } = req.body
    if (!episode || !cast) {
      res.status(400).json({ error: 'episode and cast are required' })
      return
    }

    // TODO: Import buildSeasonExport from server lib once imports are updated
    // For now the client can still build exports locally
    res.status(501).json({ error: 'Export not yet migrated to server.' })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    res.status(500).json({ error: msg })
  }
})

// POST /api/export/rl — build and return RL export JSON
exportRouter.post('/rl', async (req, res) => {
  try {
    const { episode, cast } = req.body
    if (!episode || !cast) {
      res.status(400).json({ error: 'episode and cast are required' })
      return
    }

    // TODO: Import buildRLExport from server lib once imports are updated
    res.status(501).json({ error: 'RL export not yet migrated to server.' })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    res.status(500).json({ error: msg })
  }
})
