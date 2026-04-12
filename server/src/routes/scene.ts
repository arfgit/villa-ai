import { Router } from 'express'

export const sceneRouter = Router()

// POST /api/scene/generate — generate next scene (full pipeline server-side)
sceneRouter.post('/generate', async (req, res) => {
  try {
    const { episode, cast, sceneType } = req.body
    if (!episode || !cast) {
      res.status(400).json({ error: 'episode and cast are required' })
      return
    }

    // TODO: Extract scene generation pipeline from client store into
    // server/src/services/sceneGenerator.ts and call it here.
    // For now, return a placeholder that signals the client to fall back
    // to client-side generation.
    res.status(501).json({ error: 'Scene generation not yet migrated to server. Client should generate locally.' })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    res.status(500).json({ error: msg })
  }
})

// POST /api/scene/batch — generate batch of scenes for queue
sceneRouter.post('/batch', async (req, res) => {
  try {
    const { episode, cast, count } = req.body
    if (!episode || !cast) {
      res.status(400).json({ error: 'episode and cast are required' })
      return
    }

    // TODO: Batch scene generation
    res.status(501).json({ error: 'Batch generation not yet migrated to server.' })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    res.status(500).json({ error: msg })
  }
})
