import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Circle, Square, Loader2, CheckCircle2, ArrowLeft } from 'lucide-react'
import { useRecordMode } from '../../hooks/useRecordMode'

const DEMO_PRODUCT_ID = 'demo-product'

export default function RecordModePage() {
  const navigate = useNavigate()
  const { isRecording, eventCount, isProcessing, start, stop } = useRecordMode(DEMO_PRODUCT_ID)
  const [sopName, setSopName] = useState('')
  const [showNameInput, setShowNameInput] = useState(false)
  const [done, setDone] = useState(false)

  const handleStart = async () => {
    await start()
  }

  const handleStop = () => {
    if (!sopName.trim()) { setShowNameInput(true); return }
    finalize()
  }

  const finalize = async () => {
    setShowNameInput(false)
    await stop(sopName || 'Untitled SOP')
    setDone(true)
  }

  return (
    <div className="min-h-screen bg-surface-900 text-white flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-md">
        <button onClick={() => navigate('/admin')}
          className="flex items-center gap-2 text-sm text-slate-400 hover:text-white mb-8 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" /> Back to Dashboard
        </button>

        <div className="rounded-2xl border border-surface-600 bg-surface-800 p-8">
          <h1 className="text-xl font-bold mb-1">Record Mode</h1>
          <p className="text-sm text-slate-400 mb-8">
            Click through your product naturally. HandOff.AI captures every step and generates an SOP automatically.
          </p>

          <AnimatePresence mode="wait">
            {done ? (
              <motion.div key="done" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                className="text-center py-6"
              >
                <CheckCircle2 className="w-12 h-12 text-green-400 mx-auto mb-3" />
                <p className="font-semibold text-green-300">SOP Generated!</p>
                <p className="text-sm text-slate-400 mt-1 mb-6">
                  "{sopName}" is ready in your dashboard.
                </p>
                <button onClick={() => navigate('/admin')}
                  className="px-4 py-2 rounded-xl bg-brand-600 hover:bg-brand-500 text-white text-sm transition-colors"
                >
                  View Dashboard
                </button>
              </motion.div>
            ) : isProcessing ? (
              <motion.div key="processing" initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                className="text-center py-8"
              >
                <Loader2 className="w-10 h-10 animate-spin text-brand-400 mx-auto mb-3" />
                <p className="text-slate-300 font-medium">Generating SOP with AI...</p>
                <p className="text-xs text-slate-500 mt-1">Gemini is analysing your recorded steps</p>
              </motion.div>
            ) : (
              <motion.div key="controls" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                {/* Status indicator */}
                <div className={`flex items-center gap-3 p-4 rounded-xl mb-6 ${isRecording ? 'bg-red-500/10 border border-red-500/30' : 'bg-surface-700 border border-surface-600'}`}>
                  <motion.div
                    className={`w-3 h-3 rounded-full flex-shrink-0 ${isRecording ? 'bg-red-500' : 'bg-slate-500'}`}
                    animate={isRecording ? { scale: [1, 1.3, 1] } : {}}
                    transition={{ repeat: Infinity, duration: 1 }}
                  />
                  <div>
                    <p className={`text-sm font-medium ${isRecording ? 'text-red-300' : 'text-slate-400'}`}>
                      {isRecording ? 'Recording in progress' : 'Ready to record'}
                    </p>
                    {isRecording && (
                      <p className="text-xs text-red-400/70 mt-0.5">{eventCount} events captured</p>
                    )}
                  </div>
                </div>

                {/* Name input (shown when stopping) */}
                <AnimatePresence>
                  {showNameInput && (
                    <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }} className="mb-4 overflow-hidden"
                    >
                      <label className="block text-xs text-slate-400 mb-1.5">Name this SOP</label>
                      <input
                        autoFocus
                        value={sopName}
                        onChange={(e) => setSopName(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && finalize()}
                        placeholder="e.g. Process First Shipment"
                        className="w-full px-3 py-2.5 rounded-xl bg-surface-700 border border-surface-500 text-white text-sm placeholder-slate-500 focus:outline-none focus:border-brand-500"
                      />
                      <button onClick={finalize}
                        className="w-full mt-2 py-2 rounded-xl bg-brand-600 hover:bg-brand-500 text-white text-sm font-medium transition-colors"
                      >
                        Generate SOP
                      </button>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Start / Stop button */}
                {!showNameInput && (
                  <button
                    onClick={isRecording ? handleStop : handleStart}
                    className={`w-full flex items-center justify-center gap-3 py-3.5 rounded-xl font-medium text-sm transition-all ${
                      isRecording
                        ? 'bg-red-600 hover:bg-red-500 text-white'
                        : 'bg-brand-600 hover:bg-brand-500 text-white'
                    }`}
                  >
                    {isRecording
                      ? <><Square className="w-4 h-4" /> Stop Recording</>
                      : <><Circle className="w-4 h-4 text-red-300" /> Start Recording</>
                    }
                  </button>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  )
}
