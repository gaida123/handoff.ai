import { motion, AnimatePresence } from 'framer-motion'
import { useGhostCursor } from '../../hooks/useGhostCursor'

interface GhostCursorProps {
  sessionId: string | null
}

export function GhostCursor({ sessionId }: GhostCursorProps) {
  const cursor = useGhostCursor(sessionId)

  return (
    <AnimatePresence>
      {cursor.isVisible && (
        <motion.div
          className="fixed top-0 left-0 pointer-events-none z-[9999]"
          initial={{ opacity: 0, scale: 0.5 }}
          animate={{ opacity: 1, scale: 1, x: cursor.x - 12, y: cursor.y - 4 }}
          exit={{ opacity: 0, scale: 0.5 }}
          transition={{ type: 'spring', stiffness: 180, damping: 22 }}
        >
          <svg
            className="ghost-cursor-svg"
            width="28" height="34" viewBox="0 0 28 34"
            fill="none" xmlns="http://www.w3.org/2000/svg"
          >
            {/* Outer glow circle */}
            <circle cx="6" cy="4" r="10" fill="#6366f122" />
            {/* Arrow pointer */}
            <path
              d="M4 2L4 22L8.5 17.5L12 24L14.5 22.8L11 16L17 16L4 2Z"
              fill="#6366f1"
              stroke="#a5b4fc"
              strokeWidth="1.2"
              strokeLinejoin="round"
            />
            {/* Destructive state — red tint */}
            {cursor.isDestructive && (
              <path
                d="M4 2L4 22L8.5 17.5L12 24L14.5 22.8L11 16L17 16L4 2Z"
                fill="#ef4444cc"
                stroke="#fca5a5"
                strokeWidth="1.2"
                strokeLinejoin="round"
              />
            )}
          </svg>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
