import { initializeApp } from 'firebase/app'
import { getDatabase, ref, onValue, off, type DatabaseReference } from 'firebase/database'
import type { CursorState } from '../types'

// Firebase config — values come from the environment variables set in .env
const firebaseConfig = {
  apiKey:            import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain:        import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  databaseURL:       import.meta.env.VITE_FIREBASE_DATABASE_URL,
  projectId:         import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket:     import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId:             import.meta.env.VITE_FIREBASE_APP_ID,
}

const app = initializeApp(firebaseConfig)
const db  = getDatabase(app)

/**
 * Subscribe to Ghost Cursor updates for a session.
 * The backend writes cursor X/Y to /sessions/{id}/cursor on every step.
 * Returns an unsubscribe function.
 */
export function subscribeToCursor(
  sessionId: string,
  onUpdate: (cursor: CursorState) => void,
): () => void {
  const cursorRef: DatabaseReference = ref(db, `sessions/${sessionId}/cursor`)
  onValue(cursorRef, (snapshot) => {
    const data = snapshot.val()
    if (data) onUpdate(data as CursorState)
  })
  return () => off(cursorRef)
}

/**
 * Subscribe to the full session state node.
 */
export function subscribeToSession(
  sessionId: string,
  onUpdate: (data: Record<string, unknown>) => void,
): () => void {
  const sessionRef = ref(db, `sessions/${sessionId}`)
  onValue(sessionRef, (snapshot) => {
    if (snapshot.val()) onUpdate(snapshot.val())
  })
  return () => off(sessionRef)
}

export { db }
