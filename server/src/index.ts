import dotenv from 'dotenv'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: resolve(__dirname, '../.env') })

import express from 'express'
import cors from 'cors'
import { isFirebaseAvailable } from './services/firebase.js'
import { sceneRouter } from './routes/scene.js'
import { seasonRouter } from './routes/season.js'
import { trainingRouter } from './routes/training.js'
import { exportRouter } from './routes/export.js'

const app = express()
const PORT = parseInt(process.env.PORT ?? '3001', 10)

app.use(cors())
app.use(express.json({ limit: '10mb' }))

app.use('/api/scene', sceneRouter)
app.use('/api/season', seasonRouter)
app.use('/api/training', trainingRouter)
app.use('/api/export', exportRouter)

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
