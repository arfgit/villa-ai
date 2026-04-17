import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync } from 'fs'
import { join, resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const SERVER_ROOT = resolve(__dirname, '../..')
const LOCAL_DATA_DIR = join(process.cwd(), '.data')

let initialized = false
let useFirestore = false
let db: FirebaseFirestore.Firestore | null = null

async function ensureInit(): Promise<void> {
  if (initialized) return
  initialized = true

  try {
    const rawPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH
    const serviceAccountPath = rawPath ? resolve(SERVER_ROOT, rawPath) : undefined
    const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT

    if (serviceAccountPath && existsSync(serviceAccountPath)) {
      const { initializeApp, cert, getApps } = await import('firebase-admin/app')
      const { getFirestore: getFs } = await import('firebase-admin/firestore')
      if (getApps().length === 0) {
        const sa = JSON.parse(readFileSync(serviceAccountPath, 'utf-8'))
        initializeApp({ credential: cert(sa) })
      }
      db = getFs()
      useFirestore = true
      console.log('[firebase] connected to Firestore')
    } else if (serviceAccountJson) {
      const { initializeApp, cert, getApps } = await import('firebase-admin/app')
      const { getFirestore: getFs } = await import('firebase-admin/firestore')
      if (getApps().length === 0) {
        const sa = JSON.parse(serviceAccountJson)
        initializeApp({ credential: cert(sa) })
      }
      db = getFs()
      useFirestore = true
      console.log('[firebase] connected to Firestore')
    } else {
      console.log('[firebase] no credentials found, using local JSON file storage')
      if (!existsSync(LOCAL_DATA_DIR)) mkdirSync(LOCAL_DATA_DIR, { recursive: true })
    }
  } catch (err) {
    console.warn('[firebase] init failed, falling back to local storage:', err instanceof Error ? err.message : err)
    if (!existsSync(LOCAL_DATA_DIR)) mkdirSync(LOCAL_DATA_DIR, { recursive: true })
  }
}

/* ── local-file helpers ── */

function sanitizeDocId(docId: string): string {
  return docId.replace(/[^a-zA-Z0-9_-]/g, '_')
}

function localPath(collection: string, docId: string): string {
  const dir = join(LOCAL_DATA_DIR, collection)
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return join(dir, `${sanitizeDocId(docId)}.json`)
}

function localRead(collection: string, docId: string): unknown {
  const p = localPath(collection, docId)
  if (!existsSync(p)) return null
  return JSON.parse(readFileSync(p, 'utf-8'))
}

function localWrite(collection: string, docId: string, data: unknown): void {
  writeFileSync(localPath(collection, docId), JSON.stringify(data, null, 2))
}

function localQuery(collection: string, max: number): unknown[] {
  const dir = join(LOCAL_DATA_DIR, collection)
  if (!existsSync(dir)) return []
  return readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .slice(-max)
    .map((f) => JSON.parse(readFileSync(join(dir, f), 'utf-8')))
}

function localQueryAll(collection: string): unknown[] {
  const dir = join(LOCAL_DATA_DIR, collection)
  if (!existsSync(dir)) return []
  return readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .map((f) => JSON.parse(readFileSync(join(dir, f), 'utf-8')))
}

export function isFirebaseAvailable(): boolean {
  return useFirestore
}

/* ── Villa Sessions ── */

export async function saveSession(sessionId: string, data: unknown): Promise<void> {
  await ensureInit()
  if (useFirestore && db) {
    const { FieldValue } = await import('firebase-admin/firestore')
    await db.collection('villaSessions').doc(sessionId).set({
      ...(data as Record<string, unknown>),
      updatedAt: FieldValue.serverTimestamp(),
    })
  } else {
    localWrite('villaSessions', sessionId, { ...(data as Record<string, unknown>), updatedAt: Date.now() })
  }
}

export async function getSession(sessionId: string): Promise<unknown> {
  await ensureInit()
  if (useFirestore && db) {
    const snap = await db.collection('villaSessions').doc(sessionId).get()
    return snap.exists ? snap.data() : null
  }
  return localRead('villaSessions', sessionId)
}

/* ── Training Data (shared global collection) ── */

export async function saveTrainingEntry(sessionId: string, data: unknown): Promise<void> {
  await ensureInit()
  if (useFirestore && db) {
    const { FieldValue } = await import('firebase-admin/firestore')
    const docRef = db.collection('trainingData').doc(sessionId)
    const existing = await docRef.get()
    const payload = {
      ...(data as Record<string, unknown>),
      updatedAt: FieldValue.serverTimestamp(),
      ...(!existing.exists && { createdAt: FieldValue.serverTimestamp() }),
    }
    await docRef.set(payload, { merge: true })
  } else {
    localWrite('trainingData', sessionId, { ...(data as Record<string, unknown>), updatedAt: Date.now() })
  }
}

export async function addTrainingEntry(data: unknown): Promise<string> {
  await ensureInit()
  if (useFirestore && db) {
    const { FieldValue } = await import('firebase-admin/firestore')
    const ref = await db.collection('trainingData').add({
      ...(data as Record<string, unknown>),
      createdAt: FieldValue.serverTimestamp(),
    })
    return ref.id
  }
  const entryId = crypto.randomUUID()
  localWrite('trainingData', entryId, { ...(data as Record<string, unknown>), id: entryId, createdAt: Date.now() })
  return entryId
}

export async function getTrainingEntries(limit = 50): Promise<unknown[]> {
  await ensureInit()
  if (useFirestore && db) {
    const snap = await db.collection('trainingData').orderBy('createdAt', 'desc').limit(limit).get()
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }))
  }
  return localQuery('trainingData', limit)
}

export async function getTrainingForSession(sessionId: string): Promise<unknown[]> {
  await ensureInit()
  if (useFirestore && db) {
    const snap = await db.collection('trainingData')
      .where('sessionId', '==', sessionId)
      .get()
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }))
  }
  return localQueryAll('trainingData')
    .filter((d) => (d as Record<string, unknown>).sessionId === sessionId)
}

/* ── Wisdom Archives (unchanged) ── */

export async function saveWisdom(key: string, data: unknown): Promise<void> {
  await ensureInit()
  if (useFirestore && db) {
    const { FieldValue } = await import('firebase-admin/firestore')
    await db.collection('wisdomArchives').doc(key).set({
      ...(data as Record<string, unknown>),
      updatedAt: FieldValue.serverTimestamp(),
    })
  } else {
    localWrite('wisdomArchives', key, data)
  }
}

export async function getWisdom(key: string): Promise<unknown> {
  await ensureInit()
  if (useFirestore && db) {
    const snap = await db.collection('wisdomArchives').doc(key).get()
    return snap.exists ? snap.data() : null
  }
  return localRead('wisdomArchives', key)
}
