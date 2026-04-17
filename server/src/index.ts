import dotenv from 'dotenv'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: resolve(__dirname, '../.env') })

import express from 'express'
import cors from 'cors'
import { isFirebaseAvailable } from './services/firebase.js'
import { sceneRouter } from './routes/scene.js'
import { sessionRouter } from './routes/session.js'
import { trainingRouter } from './routes/training.js'
import { exportRouter } from './routes/export.js'
import { llmRouter } from './routes/llm.js'
import { wisdomRouter } from './routes/wisdom.js'

const app = express()
const PORT = parseInt(process.env.PORT ?? '3001', 10)

app.use(cors({
  origin: process.env.CORS_ORIGIN ?? true,
}))
app.use(express.json({ limit: '10mb' }))

app.use('/api/scene', sceneRouter)
app.use('/api/session', sessionRouter)
app.use('/api/training', trainingRouter)
app.use('/api/export', exportRouter)
app.use('/api/llm', llmRouter)
app.use('/api/wisdom', wisdomRouter)

app.get('/api/health', async (_req, res) => {
  res.json({
    status: 'ok',
    firebase: isFirebaseAvailable(),
    timestamp: Date.now(),
  })
})

app.listen(PORT, () => {
  console.log(`[villa-ai server] listening on http://localhost:${PORT}`)
})
