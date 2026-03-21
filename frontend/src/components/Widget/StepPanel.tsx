import { motion, AnimatePresence } from 'framer-motion'
import { ChevronRight, Sparkles } from 'lucide-react'
import type { StepPayload } from '../../types'

interface StepPanelProps {
  step: StepPayload | null
  totalSteps: number
  visible: boolean
}

export function StepPanel({ step, totalSteps, visible }: StepPanelProps) {
  const progress = step ? ((step.step_index + 1) / Math.max(totalSteps, 1)) * 100 : 0

  return (
    <AnimatePresence>
      {visible && step && (
        <motion.div
          className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[9990] w-full max-w-xl px-4"
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 24 }}
          transition={{ type: 'spring', stiffness: 200, damping: 24 }}
        >
          <div className="rounded-2xl border border-brand-500/30 bg-[#0f0f1a]/90 backdrop-blur-md shadow-2xl overflow-hidden">
            {/* Progress bar */}
            <div className="h-1 bg-surface-700">
              <motion.div
                className="h-full bg-gradient-to-r from-brand-500 to-brand-400"
                animate={{ width: `${progress}%` }}
                transition={{ duration: 0.5, ease: 'easeOut' }}
              />
            </div>

            <div className="p-4 flex items-start gap-3">
              <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-brand-500/20 flex items-center justify-center mt-0.5">
                <Sparkles className="w-4 h-4 text-brand-400" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs text-brand-400 font-medium">
                    Step {step.step_index + 1} of {totalSteps}
                  </span>
                  {step.is_destructive && (
                    <span className="text-xs text-red-400 bg-red-500/10 px-2 py-0.5 rounded-full border border-red-500/20">
                      ⚠ Destructive
                    </span>
                  )}
                </div>
                <p className="text-sm text-white font-medium leading-snug">
                  {step.instruction_text}
                </p>
                {step.vision_confidence !== undefined && step.vision_confidence > 0 && (
                  <p className="text-xs text-slate-500 mt-1">
                    Vision confidence: {Math.round(step.vision_confidence * 100)}%
                  </p>
                )}
              </div>
              <ChevronRight className="flex-shrink-0 w-4 h-4 text-slate-500 mt-1" />
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
