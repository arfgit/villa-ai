import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import { sceneRouter } from './routes/scene.js'
import { seasonRouter } from './routes/season.js'
import { trainingRouter } from './routes/training.js'
import { exportRouter } from './routes/export.js'

const app = express()
const PORT = parseInt(process.env.PORT ?? '3001', 10)

app.use(cors())
app.use(express.json({ limit: '10mb' })) // episodes can be large

// ── API Routes ──
app.use('/api/scene', sceneRouter)
app.use('/api/season', seasonRouter)
app.use('/api/training', trainingRouter)
app.use('/api/export', exportRouter)

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: Date.now() })
})

app.listen(PORT, () => {
  console.log(`[villa-ai server] listening on http://localhost:${PORT}`)
})
