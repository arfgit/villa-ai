import { initializeApp } from 'firebase/app'
import { getFirestore, collection, doc, setDoc, getDoc, getDocs, query, orderBy, limit } from 'firebase/firestore'

const firebaseConfig = {
  apiKey: 'AIzaSyBMrZ-2AYo4hQfKvJClAopriF2oYGXBuAE',
  authDomain: 'villa-ai-9ff17.firebaseapp.com',
  projectId: 'villa-ai-9ff17',
  storageBucket: 'villa-ai-9ff17.firebasestorage.app',
  messagingSenderId: '1082681190161',
  appId: '1:1082681190161:web:a8ac9674a548fbce54ceb0',
  measurementId: 'G-KR0W7MRWXE',
}

const app = initializeApp(firebaseConfig)
export const db = getFirestore(app)

// ── Collection references ──
export const seasonsCol = () => collection(db, 'seasons')
export const trainingCol = () => collection(db, 'trainingData')
export const wisdomCol = () => collection(db, 'wisdomArchives')

// ── Helpers ──
export async function saveSeason(seasonId: string, data: unknown): Promise<void> {
  await setDoc(doc(db, 'seasons', seasonId), data as Record<string, unknown>)
}

export async function getSeason(seasonId: string): Promise<unknown> {
  const snap = await getDoc(doc(db, 'seasons', seasonId))
  return snap.exists() ? snap.data() : null
}

export async function saveTrainingData(seasonId: string, data: unknown): Promise<void> {
  await setDoc(doc(db, 'trainingData', seasonId), data as Record<string, unknown>)
}

export async function getTrainingArchive(maxSeasons = 5): Promise<unknown[]> {
  const q = query(trainingCol(), orderBy('exportedAt', 'desc'), limit(maxSeasons))
  const snap = await getDocs(q)
  return snap.docs.map((d) => d.data())
}

export async function saveWisdom(key: string, data: unknown): Promise<void> {
  await setDoc(doc(db, 'wisdomArchives', key), data as Record<string, unknown>)
}

export async function getWisdom(key: string): Promise<unknown> {
  const snap = await getDoc(doc(db, 'wisdomArchives', key))
  return snap.exists() ? snap.data() : null
}
