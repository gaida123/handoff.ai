import type { CursorState } from '../types'

// Firebase is optional — only initialised when all env vars are present.
// Without them the app runs in local-only mode (SQLite backend, no realtime sync).

const _databaseURL = import.meta.env.VITE_FIREBASE_DATABASE_URL as string | undefined

let _db: import('firebase/database').Database | null = null

function getDb() {
  if (_db) return _db
  if (!_databaseURL) return null
  try {
    const { initializeApp }  = require('firebase/app')
    const { getDatabase }    = require('firebase/database')
    const app = initializeApp({
      apiKey:            import.meta.env.VITE_FIREBASE_API_KEY,
      authDomain:        import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
      databaseURL:       _databaseURL,
      projectId:         import.meta.env.VITE_FIREBASE_PROJECT_ID,
      storageBucket:     import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
      messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
      appId:             import.meta.env.VITE_FIREBASE_APP_ID,
    })
    _db = getDatabase(app)
    return _db
  } catch (e) {
    console.warn('[Firebase] init failed — running in local mode:', e)
    return null
  }
}

export function subscribeToCursor(
  sessionId: string,
  onUpdate: (cursor: CursorState) => void,
): () => void {
  const db = getDb()
  if (!db) return () => {}
  try {
    const { ref, onValue, off } = require('firebase/database')
    const cursorRef = ref(db, `sessions/${sessionId}/cursor`)
    onValue(cursorRef, (snapshot: any) => {
      const data = snapshot.val()
      if (data) onUpdate(data as CursorState)
    })
    return () => off(cursorRef)
  } catch { return () => {} }
}

export function subscribeToSession(
  sessionId: string,
  onUpdate: (data: Record<string, unknown>) => void,
): () => void {
  const db = getDb()
  if (!db) return () => {}
  try {
    const { ref, onValue, off } = require('firebase/database')
    const sessionRef = ref(db, `sessions/${sessionId}`)
    onValue(sessionRef, (snapshot: any) => {
      if (snapshot.val()) onUpdate(snapshot.val())
    })
    return () => off(sessionRef)
  } catch { return () => {} }
}

export { _db as db }
