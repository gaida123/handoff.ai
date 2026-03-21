import { useState, useEffect, useRef } from 'react'
import { subscribeToCursor } from '../services/firebase'
import type { CursorState } from '../types'

interface GhostCursorPosition {
  /** Pixel X — derived from fractional cursor.x * window.innerWidth */
  x: number
  /** Pixel Y — derived from fractional cursor.y * window.innerHeight */
  y: number
  isVisible: boolean
  isDestructive: boolean
  instructionText: string
  stepIndex: number
}

const DEFAULT_POS: GhostCursorPosition = {
  x: 0, y: 0, isVisible: false, isDestructive: false, instructionText: '', stepIndex: 0,
}

/**
 * Subscribes to Firebase Realtime DB cursor updates for a session.
 * Converts fractional coordinates (0–1) to pixel coordinates.
 * Returns the latest cursor position for the Ghost Cursor overlay.
 */
export function useGhostCursor(sessionId: string | null): GhostCursorPosition {
  const [pos, setPos] = useState<GhostCursorPosition>(DEFAULT_POS)
  const prevRef       = useRef<GhostCursorPosition>(DEFAULT_POS)

  useEffect(() => {
    if (!sessionId) {
      setPos(DEFAULT_POS)
      return
    }

    const unsubscribe = subscribeToCursor(sessionId, (cursor: CursorState) => {
      const next: GhostCursorPosition = {
        x:               cursor.x * window.innerWidth,
        y:               cursor.y * window.innerHeight,
        isVisible:       true,
        isDestructive:   cursor.is_destructive,
        instructionText: cursor.instruction_text,
        stepIndex:       cursor.step_index,
      }
      prevRef.current = next
      setPos(next)
    })

    return unsubscribe
  }, [sessionId])

  return pos
}
