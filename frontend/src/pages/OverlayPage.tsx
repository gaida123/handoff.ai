import { useState, useRef, useCallback, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Sparkles, ChevronDown, ChevronUp, Mic, MicOff,
  Volume2, Loader2, X, GripVertical, CheckCircle2,
  AlertTriangle, ArrowRight, Eye, Zap, RefreshCw,
} from 'lucide-react'
import { useSession } from '../hooks/useSession'
import { useVoice } from '../hooks/useVoice'

// ── Types ─────────────────────────────────────────────────────────────────────
interface IdleHint {
  on_correct_screen: boolean
  hint:              string
  element_description: string | null
  confidence: number
}

// ── Detect Electron ───────────────────────────────────────────────────────────
const inElectron = typeof window !== 'undefined' && !!(window as any).handoff
const electronAPI = inElectron ? (window as any).handoff : null

// ── Hardcoded demo SOP: "Set up your Google Workspace account" ────────────────
// This runs without the backend so the demo is self-contained.
const DEMO_STEPS = [
  {
    title:       'Open Gmail',
    instruction: 'Go to gmail.com in your browser and click "Sign in" in the top-right corner.',
    expected:    'Gmail sign-in page',
  },
  {
    title:       'Enter your email',
    instruction: 'Type your new Google Workspace email address (e.g. you@yourcompany.com) and click "Next".',
    expected:    'Google account email field',
  },
  {
    title:       'Enter your password',
    instruction: 'Type your temporary password provided by your IT admin, then click "Next".',
    expected:    'Google password field',
  },
  {
    title:       'Accept terms',
    instruction: 'Review the Google Workspace Terms of Service. Click "I agree" to continue.',
    expected:    'Google Terms of Service page',
  },
  {
    title:       'Set a new password',
    instruction: 'Create a strong password — at least 12 characters with a mix of letters, numbers and symbols. Confirm it and click "Change password".',
    expected:    'Change password screen',
  },
  {
    title:       'Enable 2-Step Verification',
    instruction: 'Go to myaccount.google.com → Security → 2-Step Verification. Click "Get started" and follow the prompts.',
    expected:    'Google Account Security page',
  },
  {
    title:       'Add a recovery email',
    instruction: 'Still in Security, click "Recovery email" and add a personal email address for account recovery.',
    expected:    'Recovery email field',
  },
  {
    title:       'Explore Google Drive',
    instruction: 'Navigate to drive.google.com. Click "+ New" and create a test document to confirm your account is working.',
    expected:    'Google Drive homepage',
  },
]

// ── API helper for vision analysis ────────────────────────────────────────────
// In Electron: proxied through main process IPC (avoids renderer network crashes)
// In browser: direct fetch fallback
async function analyzeScreen(
  screenshotBase64: string,
  stepIndex: number,
  instructionText: string,
): Promise<IdleHint | null> {
  if (electronAPI?.analyzeScreen) {
    try {
      const result = await electronAPI.analyzeScreen({
        screenshotBase64,
        stepIndex,
        instructionText,
      })
      if (result?.ok) return result.data as IdleHint
      return null
    } catch {
      return null
    }
  }
  // Browser fallback
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 6000)
  try {
    const res = await fetch('http://localhost:8080/vision/analyze-screen', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        screenshot_base64: screenshotBase64,
        step_index:        stepIndex,
        instruction_text:  instructionText,
      }),
      signal: controller.signal,
    })
    if (!res.ok) return null
    return await res.json() as IdleHint
  } catch {
    return null
  } finally {
    clearTimeout(timeout)
  }
}

// ── Main overlay component ────────────────────────────────────────────────────
export default function OverlayPage() {
  const [collapsed, setCollapsed] = useState(false)
  const [query,     setQuery]     = useState('')

  // Demo mode state
  const [demoMode,    setDemoMode]      = useState(false)
  const [demoStep,    setDemoStep]      = useState(0)
  const [demoChecked, setDemoChecked]   = useState<boolean[]>(DEMO_STEPS.map(() => false))

  // Idle + vision hint state
  const [isAnalysing, setIsAnalysing] = useState(false)
  const [idleHint,    setIdleHint]    = useState<IdleHint | null>(null)
  const idleCleanupRef = useRef<(() => void) | null>(null)

  // Step verification state (fires on "Next" click)
  const [isVerifying, setIsVerifying] = useState(false)
  const [verifyHint,  setVerifyHint]  = useState<IdleHint | null>(null)

  // Full backend session (kept for non-demo queries)
  const session = useSession()
  const [backendStarted, setBackendStarted] = useState(false)

  // ── Transparent body ────────────────────────────────────────────────────────
  useEffect(() => {
    document.body.classList.add('overlay-mode')
    return () => document.body.classList.remove('overlay-mode')
  }, [])

  // ── Dragging (web fallback) ──────────────────────────────────────────────
  const posRef = useRef({ startX: 0, startY: 0 })
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null)

  const onDragStart = useCallback((e: React.MouseEvent) => {
    if (inElectron) return
    posRef.current.startX = e.clientX - (pos?.x ?? 0)
    posRef.current.startY = e.clientY - (pos?.y ?? 0)
    const onMove = (ev: MouseEvent) =>
      setPos({ x: ev.clientX - posRef.current.startX, y: ev.clientY - posRef.current.startY })
    const onUp = () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }, [pos])

  // ── Collapse toggle ──────────────────────────────────────────────────────
  const toggleCollapse = async () => {
    const next = !collapsed
    setCollapsed(next)
    if (electronAPI) await electronAPI.toggleCollapse()
  }

  // ── Voice ────────────────────────────────────────────────────────────────
  const { state: voiceState, startListening, stopListening, speak } = useVoice({
    onTranscript: (text, isFinal) => {
      if (!isFinal || !text.trim()) return
      const lower = text.toLowerCase()
      if (demoMode) {
        if (lower.includes('next') || lower.includes('done')) advanceDemoStep()
        else if (lower.includes('back') || lower.includes('previous')) prevDemoStep()
        else if (lower.includes('stop') || lower.includes('exit')) stopDemo()
      } else {
        setQuery(text.trim())
      }
    },
  })

  // Speak the current demo step
  useEffect(() => {
    if (demoMode && DEMO_STEPS[demoStep]) {
      speak(DEMO_STEPS[demoStep].instruction)
    }
  }, [demoMode, demoStep]) // eslint-disable-line

  // ── Demo mode lifecycle ──────────────────────────────────────────────────
  const startDemo = () => {
    setDemoMode(true)
    setDemoStep(0)
    setDemoChecked(DEMO_STEPS.map(() => false))
    setIdleHint(null)
    if (electronAPI) electronAPI.stepStarted(0)
  }

  const stopDemo = async () => {
    setDemoMode(false)
    setQuery('')
    setIdleHint(null)
    if (electronAPI) electronAPI.sessionEnded()
    // Clean up idle listener
    if (electronAPI) electronAPI.offIdleAlert()
    idleCleanupRef.current?.()
  }

  const doAdvanceStep = () => {
    setVerifyHint(null)
    setIdleHint(null)
    setDemoChecked(prev => {
      const next = [...prev]
      next[demoStep] = true
      return next
    })
    setDemoStep(prev => {
      const next = Math.min(prev + 1, DEMO_STEPS.length - 1)
      if (electronAPI) electronAPI.stepStarted(next)
      return next
    })
  }

  const advanceDemoStep = async () => {
    setVerifyHint(null)
    setIdleHint(null)

    // Screenshot + verify the user completed this step before advancing
    if (electronAPI?.captureScreen) {
      setIsVerifying(true)
      try {
        const result = await electronAPI.captureScreen()
        if (result?.ok) {
          const hint = await analyzeScreen(result.data, demoStep, DEMO_STEPS[demoStep].instruction)
          if (hint === null || hint.confidence === 0) {
            setVerifyHint({
              on_correct_screen: false,
              hint: 'Could not check your screen — backend or AI may be down. Advance anyway or wait and retry.',
              element_description: null,
              confidence: 0,
            })
            setIsVerifying(false)
            return
          }
          if (!hint.on_correct_screen) {
            setVerifyHint(hint)
            setIsVerifying(false)
            return // hold the user on this step until they fix it
          }
        } else {
          // Screen capture failed (e.g. no permission)
          setVerifyHint({
            on_correct_screen: false,
            hint: 'Screen capture failed. Grant Screen Recording permission to Electron in System Settings → Privacy & Security.',
            element_description: null,
            confidence: 0,
          })
          setIsVerifying(false)
          return
        }
      } catch {
        // unexpected error — proceed anyway
      }
      setIsVerifying(false)
    }

    doAdvanceStep()
  }

  const prevDemoStep = () => {
    setIdleHint(null)
    setVerifyHint(null)
    setDemoStep(prev => {
      const next = Math.max(prev - 1, 0)
      if (electronAPI) electronAPI.stepStarted(next)
      return next
    })
  }

  const isComplete = demoMode && demoStep === DEMO_STEPS.length - 1 && demoChecked[DEMO_STEPS.length - 1]

  // ── Idle alert from Electron (or internal 20s timer in web mode) ─────────
  useEffect(() => {
    if (!demoMode) return

    // Wire up Electron's push event
    if (electronAPI?.onIdleAlert) {
      electronAPI.onIdleAlert(async (payload: { stepIndex: number; screenshotData: string | null }) => {
        if (payload.stepIndex !== demoStep) return
        setIsAnalysing(true)
        setIdleHint(null)
        if (payload.screenshotData) {
          const hint = await analyzeScreen(
            payload.screenshotData,
            demoStep,
            DEMO_STEPS[demoStep].instruction,
          )
          setIdleHint(hint)
        }
        setIsAnalysing(false)
      })
      return () => { electronAPI.offIdleAlert?.() }
    }

    // Web fallback: 20s idle timer triggers capture → analyse
    const WEB_IDLE_MS = 20_000
    const timer = setTimeout(async () => {
      if (!electronAPI?.captureScreen) return
      setIsAnalysing(true)
      setIdleHint(null)
      const result = await electronAPI.captureScreen()
      if (result?.ok) {
        const hint = await analyzeScreen(result.data, demoStep, DEMO_STEPS[demoStep].instruction)
        setIdleHint(hint)
      }
      setIsAnalysing(false)
    }, WEB_IDLE_MS)

    idleCleanupRef.current = () => clearTimeout(timer)
    return () => clearTimeout(timer)
  }, [demoMode, demoStep]) // eslint-disable-line

  // ── Backend session (non-demo custom queries) ────────────────────────────
  const handleBackendStart = async () => {
    if (!query.trim()) return
    setBackendStarted(true)
    try {
      await session.start('demo-user', 'freightos', query)
    } catch {
      setBackendStarted(false)
    }
  }

  const handleBackendStop = async () => {
    await session.stop()
    setBackendStarted(false)
    setQuery('')
  }

  // Speak backend step
  useEffect(() => {
    if (session.currentStep?.instruction_text) speak(session.currentStep.instruction_text)
  }, [session.currentStep?.step_index]) // eslint-disable-line

  const backendStep  = session.currentStep
  const total        = session.totalSteps
  const progress     = backendStep ? ((backendStep.step_index + 1) / Math.max(total, 1)) * 100 : 0

  // ── Positioning ──────────────────────────────────────────────────────────
  const style = !inElectron && pos
    ? { position: 'fixed' as const, left: pos.x, top: pos.y, bottom: 'auto', right: 'auto' }
    : { position: 'fixed' as const, bottom: 24, right: 24 }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div style={style} className="z-[9999] select-none">
      <motion.div
        layout
        initial={{ opacity: 0, scale: 0.9, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 300, damping: 28 }}
        className="w-[370px] overflow-hidden rounded-2xl
                   shadow-[0_8px_48px_rgba(0,0,0,0.7),0_2px_8px_rgba(139,92,246,0.15)]
                   border border-white/10 bg-[#0c0c1e]/90 backdrop-blur-2xl"
        style={{ WebkitAppRegion: inElectron ? 'no-drag' : undefined } as any}
      >
        {/* ── Header / drag handle ──────────────────────────────────────── */}
        <div
          onMouseDown={onDragStart}
          className="flex items-center gap-2 px-3 py-2.5 cursor-grab active:cursor-grabbing"
          style={{ WebkitAppRegion: inElectron ? 'drag' : undefined } as any}
        >
          <div className="flex items-center gap-2 flex-1 min-w-0">
            {/* Logo */}
            <div className="flex items-center gap-1.5 bg-violet-600/20 border border-violet-500/30
                            rounded-full px-2.5 py-0.5">
              <Sparkles className="w-3 h-3 text-violet-400" />
              <span className="text-[10px] font-bold text-violet-300 tracking-widest uppercase">HandOff</span>
            </div>

            {/* Step count badge */}
            <AnimatePresence mode="wait">
              {demoMode && (
                <motion.span
                  key="demo-badge"
                  initial={{ opacity: 0, x: -4 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -4 }}
                  className="text-[10px] text-slate-400 bg-white/5 rounded-full px-2 py-0.5"
                >
                  Step {demoStep + 1}/{DEMO_STEPS.length}
                </motion.span>
              )}
              {backendStarted && backendStep && (
                <motion.span
                  key="backend-badge"
                  initial={{ opacity: 0, x: -4 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -4 }}
                  className="text-[10px] text-slate-400 bg-white/5 rounded-full px-2 py-0.5"
                >
                  Step {backendStep.step_index + 1}/{total}
                </motion.span>
              )}
            </AnimatePresence>
          </div>

          <div className="flex items-center gap-1" style={{ WebkitAppRegion: 'no-drag' } as any}>
            <GripVertical className="w-3.5 h-3.5 text-white/15" />
            <button
              onClick={toggleCollapse}
              className="w-6 h-6 rounded-full flex items-center justify-center
                         text-white/40 hover:text-white/80 hover:bg-white/10 transition-all"
            >
              {collapsed
                ? <ChevronUp className="w-3.5 h-3.5" />
                : <ChevronDown className="w-3.5 h-3.5" />}
            </button>
            {(demoMode || backendStarted) && (
              <button
                onClick={demoMode ? stopDemo : handleBackendStop}
                className="w-6 h-6 rounded-full flex items-center justify-center
                           text-white/40 hover:text-red-400 hover:bg-red-500/10 transition-all"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* ── Progress bar ─────────────────────────────────────────────── */}
        {(demoMode || backendStarted) && (
          <div className="h-[2px] bg-white/5 mx-3 rounded-full overflow-hidden">
            <motion.div
              className="h-full bg-gradient-to-r from-violet-500 to-indigo-400 rounded-full"
              animate={{
                width: demoMode
                  ? `${((demoStep + 1) / DEMO_STEPS.length) * 100}%`
                  : `${progress}%`,
              }}
              transition={{ duration: 0.5, ease: 'easeOut' }}
            />
          </div>
        )}

        {/* ── Body ─────────────────────────────────────────────────────── */}
        <AnimatePresence initial={false}>
          {!collapsed && (
            <motion.div
              key="body"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 340, damping: 30 }}
              className="overflow-hidden"
            >
              <div className="px-4 pb-4 pt-2 space-y-3">

                {/* ── IDLE: no session started ────────────────────────── */}
                {!demoMode && !backendStarted && (
                  <div className="space-y-3">
                    <p className="text-xs text-slate-400 leading-relaxed">
                      Follow a guided onboarding tour or ask anything.
                    </p>

                    {/* Quick start demo button */}
                    <button
                      onClick={startDemo}
                      className="w-full flex items-center justify-center gap-2
                                 bg-gradient-to-r from-violet-600 to-indigo-600
                                 hover:from-violet-500 hover:to-indigo-500
                                 text-white text-sm font-medium rounded-xl py-2.5
                                 transition-all active:scale-[0.98] shadow-lg shadow-violet-900/30"
                    >
                      <Zap className="w-4 h-4" />
                      Start Google Account Setup Tour
                    </button>

                    <div className="relative flex items-center gap-2">
                      <div className="h-px flex-1 bg-white/8" />
                      <span className="text-[10px] text-slate-500">or ask freely</span>
                      <div className="h-px flex-1 bg-white/8" />
                    </div>

                    <div className="relative">
                      <input
                        type="text"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleBackendStart()}
                        placeholder="e.g. how do I create a shipment…"
                        className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5
                                   text-sm text-white placeholder-slate-500 outline-none
                                   focus:border-violet-500/60 focus:bg-white/8 transition-all"
                      />
                    </div>
                    <button
                      onClick={handleBackendStart}
                      disabled={!query.trim()}
                      className="w-full flex items-center justify-center gap-2
                                 bg-white/5 hover:bg-white/10 border border-white/10
                                 disabled:opacity-40 disabled:pointer-events-none
                                 text-white text-sm rounded-xl py-2 transition-all"
                    >
                      <Sparkles className="w-4 h-4 text-violet-400" />
                      AI-Guided Tour
                    </button>
                  </div>
                )}

                {/* ── DEMO MODE: step cards ───────────────────────────── */}
                {demoMode && !isComplete && (
                  <AnimatePresence mode="wait">
                    <motion.div
                      key={demoStep}
                      initial={{ opacity: 0, x: 14 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -14 }}
                      transition={{ duration: 0.2 }}
                      className="space-y-3"
                    >
                      {/* Step title */}
                      <p className="text-[11px] font-semibold text-violet-400 uppercase tracking-widest">
                        {DEMO_STEPS[demoStep].expected}
                      </p>

                      {/* Instruction card */}
                      <div className="flex items-start gap-3 bg-white/5 rounded-xl p-3 border border-white/8">
                        <div className="flex-shrink-0 w-7 h-7 rounded-lg bg-violet-500/20
                                        flex items-center justify-center mt-0.5">
                          <ArrowRight className="w-3.5 h-3.5 text-violet-400" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs text-white leading-relaxed">
                            {DEMO_STEPS[demoStep].instruction}
                          </p>
                        </div>
                      </div>

                      {/* Mini step checklist */}
                      <div className="flex flex-wrap gap-1.5">
                        {DEMO_STEPS.map((s, i) => (
                          <div
                            key={i}
                            className={`h-1.5 rounded-full transition-all duration-300 ${
                              demoChecked[i]
                                ? 'bg-emerald-400'
                                : i === demoStep
                                ? 'bg-violet-500'
                                : 'bg-white/10'
                            }`}
                            style={{ width: `${88 / DEMO_STEPS.length}%` }}
                            title={s.title}
                          />
                        ))}
                      </div>

                      {/* Step verification panel (fires on Next click) */}
                      <AnimatePresence>
                        {isVerifying && (
                          <motion.div
                            initial={{ opacity: 0, y: 4 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: 4 }}
                            className="flex items-center gap-2 bg-violet-500/10 border border-violet-500/20
                                       rounded-xl p-3"
                          >
                            <Loader2 className="w-3.5 h-3.5 text-violet-400 animate-spin flex-shrink-0" />
                            <p className="text-xs text-violet-300">Checking your screen…</p>
                          </motion.div>
                        )}
                        {verifyHint && !isVerifying && (
                          <motion.div
                            initial={{ opacity: 0, y: 4 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: 4 }}
                            className="rounded-xl p-3 border border-amber-500/25 bg-amber-500/8 space-y-1.5"
                          >
                            <div className="flex items-center gap-2">
                              <AlertTriangle className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />
                              <span className="text-[10px] font-semibold uppercase tracking-widest text-amber-400">
                                Step not complete yet
                              </span>
                              {verifyHint.confidence > 0 && (
                                <span className="ml-auto text-[9px] text-slate-500">
                                  {Math.round(verifyHint.confidence * 100)}% sure
                                </span>
                              )}
                            </div>
                            {verifyHint.hint && (
                              <p className="text-xs text-slate-200 leading-relaxed">{verifyHint.hint}</p>
                            )}
                            {verifyHint.element_description && (
                              <p className="text-[10px] text-slate-500 leading-relaxed">
                                {verifyHint.element_description}
                              </p>
                            )}
                            <button
                              onClick={doAdvanceStep}
                              className="text-[10px] text-slate-500 hover:text-slate-300 transition-all flex items-center gap-1 mt-1"
                            >
                              <ArrowRight className="w-2.5 h-2.5" /> Advance anyway
                            </button>
                          </motion.div>
                        )}
                      </AnimatePresence>

                      {/* Idle hint / vision analysis panel */}
                      <AnimatePresence>
                        {isAnalysing && (
                          <motion.div
                            initial={{ opacity: 0, y: 4 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: 4 }}
                            className="flex items-center gap-2 bg-indigo-500/10 border border-indigo-500/20
                                       rounded-xl p-3"
                          >
                            <Loader2 className="w-3.5 h-3.5 text-indigo-400 animate-spin flex-shrink-0" />
                            <p className="text-xs text-indigo-300">Analysing your screen…</p>
                          </motion.div>
                        )}
                        {idleHint && !isAnalysing && (
                          <motion.div
                            initial={{ opacity: 0, y: 4 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: 4 }}
                            className={`rounded-xl p-3 border space-y-1.5 ${
                              idleHint.on_correct_screen
                                ? 'bg-emerald-500/8 border-emerald-500/20'
                                : 'bg-amber-500/8 border-amber-500/20'
                            }`}
                          >
                            <div className="flex items-center gap-2">
                              <Eye className={`w-3.5 h-3.5 flex-shrink-0 ${
                                idleHint.on_correct_screen ? 'text-emerald-400' : 'text-amber-400'
                              }`} />
                              <span className={`text-[10px] font-semibold uppercase tracking-widest ${
                                idleHint.on_correct_screen ? 'text-emerald-400' : 'text-amber-400'
                              }`}>
                                {idleHint.on_correct_screen ? 'You\'re on track' : 'Need to navigate'}
                              </span>
                              {idleHint.confidence > 0 && (
                                <span className="ml-auto text-[9px] text-slate-500">
                                  {Math.round(idleHint.confidence * 100)}% sure
                                </span>
                              )}
                            </div>
                            {idleHint.hint && (
                              <p className="text-xs text-slate-200 leading-relaxed">{idleHint.hint}</p>
                            )}
                            {idleHint.element_description && (
                              <p className="text-[10px] text-slate-500 leading-relaxed">
                                {idleHint.element_description}
                              </p>
                            )}
                            <button
                              onClick={() => setIdleHint(null)}
                              className="text-[10px] text-slate-500 hover:text-slate-300 transition-all flex items-center gap-1"
                            >
                              <RefreshCw className="w-2.5 h-2.5" /> Dismiss
                            </button>
                          </motion.div>
                        )}
                      </AnimatePresence>

                      {/* Nav buttons */}
                      <div className="flex gap-2">
                        <button
                          onClick={prevDemoStep}
                          disabled={demoStep === 0 || isVerifying}
                          className="flex-1 py-2 rounded-xl bg-white/5 border border-white/8
                                     text-xs text-slate-300 hover:bg-white/10 transition-all
                                     disabled:opacity-30 disabled:pointer-events-none"
                        >
                          ← Back
                        </button>
                        <button
                          onClick={advanceDemoStep}
                          disabled={isVerifying}
                          className="flex-1 py-2 rounded-xl bg-violet-600 hover:bg-violet-500
                                     text-xs text-white font-medium transition-all active:scale-[0.98]
                                     disabled:opacity-60 disabled:pointer-events-none
                                     flex items-center justify-center gap-1.5"
                        >
                          {isVerifying ? (
                            <>
                              <Loader2 className="w-3 h-3 animate-spin" />
                              Checking…
                            </>
                          ) : demoStep < DEMO_STEPS.length - 1 ? 'Done → Next' : 'Complete ✓'}
                        </button>
                      </div>
                    </motion.div>
                  </AnimatePresence>
                )}

                {/* ── DEMO COMPLETE ──────────────────────────────────── */}
                {isComplete && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="text-center space-y-3 py-3"
                  >
                    <div className="w-14 h-14 rounded-full bg-emerald-500/15 border border-emerald-500/30
                                    flex items-center justify-center mx-auto">
                      <CheckCircle2 className="w-8 h-8 text-emerald-400" />
                    </div>
                    <div>
                      <p className="text-sm text-white font-semibold">Account setup complete! 🎉</p>
                      <p className="text-xs text-slate-400 mt-1">
                        Your Google Workspace account is fully configured.
                      </p>
                    </div>
                    <button
                      onClick={stopDemo}
                      className="text-xs text-slate-400 hover:text-white transition-all underline"
                    >
                      Start over
                    </button>
                  </motion.div>
                )}

                {/* ── BACKEND SESSION: step card ──────────────────────── */}
                {backendStarted && backendStep && (
                  <AnimatePresence mode="wait">
                    <motion.div
                      key={backendStep.step_index}
                      initial={{ opacity: 0, x: 12 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -12 }}
                      transition={{ duration: 0.2 }}
                      className="space-y-3"
                    >
                      <div className="flex items-start gap-3 bg-white/5 rounded-xl p-3 border border-white/8">
                        <div className="flex-shrink-0 w-7 h-7 rounded-lg bg-violet-500/20
                                        flex items-center justify-center mt-0.5">
                          <ArrowRight className="w-3.5 h-3.5 text-violet-400" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-white font-medium leading-snug">
                            {backendStep.instruction_text}
                          </p>
                          {backendStep.vision_confidence !== undefined && backendStep.vision_confidence > 0 && (
                            <p className="text-[10px] text-slate-500 mt-1">
                              Vision {Math.round(backendStep.vision_confidence * 100)}% confident
                            </p>
                          )}
                        </div>
                      </div>

                      {/* Guardrail warning */}
                      {session.showGuardrail && (
                        <motion.div
                          initial={{ opacity: 0, y: 6 }}
                          animate={{ opacity: 1, y: 0 }}
                          className="bg-red-500/10 border border-red-500/25 rounded-xl p-3"
                        >
                          <div className="flex items-center gap-2 mb-2">
                            <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0" />
                            <span className="text-xs text-red-300 font-medium">Destructive action</span>
                          </div>
                          <p className="text-xs text-red-300/70 mb-3">
                            This step cannot be undone. Proceed?
                          </p>
                          <div className="flex gap-2">
                            <button
                              onClick={session.dismissGuardrail}
                              className="flex-1 py-1.5 rounded-lg bg-white/5 text-xs text-slate-300
                                         hover:bg-white/10 transition-all"
                            >Cancel</button>
                            <button
                              onClick={session.confirmGuardrail}
                              className="flex-1 py-1.5 rounded-lg bg-red-500/80 text-xs text-white
                                         hover:bg-red-500 transition-all"
                            >Proceed</button>
                          </div>
                        </motion.div>
                      )}

                      {/* Autofill banner */}
                      {session.showAutofill && (
                        <motion.div
                          initial={{ opacity: 0, y: 6 }}
                          animate={{ opacity: 1, y: 0 }}
                          className="bg-violet-500/10 border border-violet-500/25 rounded-xl p-3"
                        >
                          <p className="text-xs text-violet-300 mb-2 font-medium">
                            Autofill: <span className="text-white">{session.autofillValue}</span>
                          </p>
                          <button
                            onClick={session.confirmAutofill}
                            className="w-full py-1.5 rounded-lg bg-violet-600/80 text-xs text-white
                                       hover:bg-violet-600 transition-all flex items-center justify-center gap-1.5"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            Apply Autofill
                          </button>
                        </motion.div>
                      )}
                    </motion.div>
                  </AnimatePresence>
                )}

                {/* Backend complete */}
                {session.status === 'completed' && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="text-center space-y-2 py-2"
                  >
                    <CheckCircle2 className="w-10 h-10 text-emerald-400 mx-auto" />
                    <p className="text-sm text-white font-medium">All done!</p>
                    <button
                      onClick={handleBackendStop}
                      className="text-xs text-slate-400 hover:text-white transition-all underline"
                    >
                      Start over
                    </button>
                  </motion.div>
                )}

                {/* ── Voice mic row ──────────────────────────────────── */}
                {(demoMode || backendStarted) && !isComplete && session.status !== 'completed' && (
                  <div className="flex items-center gap-3 pt-1">
                    <button
                      onClick={voiceState === 'listening' ? stopListening : startListening}
                      disabled={voiceState === 'processing' || voiceState === 'speaking'}
                      className={`relative w-8 h-8 rounded-full flex items-center justify-center
                                  transition-all flex-shrink-0
                                  ${voiceState === 'listening'
                                    ? 'bg-violet-600 ring-4 ring-violet-500/30 text-white'
                                    : 'bg-white/8 hover:bg-white/12 text-slate-400 hover:text-white'
                                  }`}
                    >
                      {voiceState === 'processing' ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : voiceState === 'speaking' ? (
                        <Volume2 className="w-3.5 h-3.5" />
                      ) : voiceState === 'listening' ? (
                        <MicOff className="w-3.5 h-3.5" />
                      ) : (
                        <Mic className="w-3.5 h-3.5" />
                      )}
                      {voiceState === 'listening' && (
                        <motion.span
                          className="absolute inset-0 rounded-full border-2 border-violet-400"
                          animate={{ scale: [1, 1.7], opacity: [0.5, 0] }}
                          transition={{ repeat: Infinity, duration: 1.1 }}
                        />
                      )}
                    </button>
                    <p className="text-[10px] text-slate-500 leading-relaxed">
                      {voiceState === 'listening'  ? 'Say "next", "back" or "stop"…'
                       : voiceState === 'processing'? 'Processing…'
                       : voiceState === 'speaking'  ? 'Speaking…'
                       :                              'Tap mic or say a command'}
                    </p>
                  </div>
                )}

                {/* Error */}
                {session.error && (
                  <p className="text-xs text-red-400 bg-red-500/10 rounded-lg px-3 py-2">
                    {session.error}
                  </p>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  )
}
