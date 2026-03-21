import { motion, AnimatePresence } from 'framer-motion'
import { AlertTriangle, X, Check } from 'lucide-react'

interface GuardrailOverlayProps {
  visible: boolean
  instructionText: string
  onConfirm: () => void
  onDismiss: () => void
}

export function GuardrailOverlay({
  visible, instructionText, onConfirm, onDismiss,
}: GuardrailOverlayProps) {
  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          className="fixed inset-0 z-[9998] flex items-center justify-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          {/* Dim backdrop */}
          <motion.div
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            onClick={onDismiss}
          />

          {/* Warning card */}
          <motion.div
            className="relative z-10 max-w-md w-full mx-4 rounded-2xl border border-red-500/40 bg-[#1a0a0a] p-6 shadow-2xl"
            initial={{ scale: 0.85, y: 20 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.85, y: 20 }}
            transition={{ type: 'spring', stiffness: 260, damping: 22 }}
          >
            <div className="flex items-center gap-3 mb-4">
              <div className="flex-shrink-0 w-10 h-10 rounded-full bg-red-500/20 flex items-center justify-center">
                <AlertTriangle className="w-5 h-5 text-red-400" />
              </div>
              <div>
                <h3 className="font-semibold text-red-300 text-lg">Destructive Action</h3>
                <p className="text-xs text-red-400/70">This action cannot be undone</p>
              </div>
            </div>

            <p className="text-sm text-slate-300 mb-6 leading-relaxed">
              You are about to: <span className="font-medium text-white">{instructionText}</span>
              <br />
              <span className="text-red-400">This action is permanent. Are you sure you want to proceed?</span>
            </p>

            <div className="flex gap-3">
              <button
                onClick={onDismiss}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl border border-slate-600 text-slate-300 hover:bg-slate-800 transition-colors text-sm font-medium"
              >
                <X className="w-4 h-4" /> Cancel
              </button>
              <button
                onClick={onConfirm}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-red-600 hover:bg-red-500 text-white transition-colors text-sm font-medium"
              >
                <Check className="w-4 h-4" /> Yes, proceed
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
