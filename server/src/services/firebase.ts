import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync } from 'fs'
import { join } from 'path'

let useFirestore = false
let db: FirebaseFirestore.Firestore | null = null

const LOCAL_DATA_DIR = join(process.cwd(), '.data')

try {
  const serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH
  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT

  if (serviceAccountPath || serviceAccountJson) {
    const { initializeApp, cert, getApps } = await import('firebase-admin/app')
    const { getFirestore: getFs } = await import('firebase-admin/firestore')

    if (getApps().length === 0) {
      if (serviceAccountPath) {
        const sa = JSON.parse(readFileSync(serviceAccountPath, 'utf-8'))
        initializeApp({ credential: cert(sa), projectId: 'villa-ai-9ff17' })
      } else if (serviceAccountJson) {
        const sa = JSON.parse(serviceAccountJson)
        initializeApp({ credential: cert(sa), projectId: 'villa-ai-9ff17' })
      }
    }
    db = getFs()
    useFirestore = true
    console.log('[firebase] connected to Firestore')
  } else {
    console.log('[firebase] no credentials found, using local JSON file storage')
    console.log('[firebase] to use Firestore, set FIREBASE_SERVICE_ACCOUNT_PATH in server/.env')
    if (!existsSync(LOCAL_DATA_DIR)) mkdirSync(LOCAL_DATA_DIR, { recursive: true })
  }
} catch (err) {
  console.warn('[firebase] init failed, falling back to local storage:', err instanceof Error ? err.message : err)
  if (!existsSync(LOCAL_DATA_DIR)) mkdirSync(LOCAL_DATA_DIR, { recursive: true })
}

function localPath(collection: string, docId: string): string {
  const dir = join(LOCAL_DATA_DIR, collection)
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return join(dir, `${docId}.json`)
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

export function isFirebaseAvailable(): boolean {
  return useFirestore
}

export async function saveSeason(seasonId: string, data: unknown): Promise<void> {
  if (useFirestore && db) {
    const { FieldValue } = await import('firebase-admin/firestore')
    await db.collection('seasons').doc(seasonId).set({
      ...(data as Record<string, unknown>),
      updatedAt: FieldValue.serverTimestamp(),
    })
  } else {
    localWrite('seasons', seasonId, { ...(data as Record<string, unknown>), updatedAt: Date.now() })
  }
}

export async function getSeason(seasonId: string): Promise<unknown> {
  if (useFirestore && db) {
    const snap = await db.collection('seasons').doc(seasonId).get()
    return snap.exists ? snap.data() : null
  }
  return localRead('seasons', seasonId)
}

export async function saveTrainingData(seasonId: string, data: unknown): Promise<void> {
  if (useFirestore && db) {
    const { FieldValue } = await import('firebase-admin/firestore')
    await db.collection('trainingData').doc(seasonId).set({
      ...(data as Record<string, unknown>),
      updatedAt: FieldValue.serverTimestamp(),
    })
  } else {
    localWrite('trainingData', seasonId, { ...(data as Record<string, unknown>), exportedAt: Date.now() })
  }
}

export async function getTrainingArchive(maxSeasons = 5): Promise<unknown[]> {
  if (useFirestore && db) {
    const snap = await db.collection('trainingData').orderBy('exportedAt', 'desc').limit(maxSeasons).get()
    return snap.docs.map((d) => d.data())
  }
  return localQuery('trainingData', maxSeasons)
}

export async function saveWisdom(key: string, data: unknown): Promise<void> {
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
  if (useFirestore && db) {
    const snap = await db.collection('wisdomArchives').doc(key).get()
    return snap.exists ? snap.data() : null
  }
  return localRead('wisdomArchives', key)
}
