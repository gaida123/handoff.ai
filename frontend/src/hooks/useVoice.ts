import { useState, useEffect, useRef, useCallback } from 'react'
import type { VoiceState } from '../types'

interface UseVoiceOptions {
  onTranscript: (text: string, isFinal: boolean) => void
  lang?: string
}

export function useVoice({ onTranscript, lang = 'en-US' }: UseVoiceOptions) {
  const [state, setState]           = useState<VoiceState>('idle')
  const [transcript, setTranscript] = useState('')
  const recognitionRef              = useRef<SpeechRecognition | null>(null)
  const synthRef                    = useRef<SpeechSynthesis | null>(null)

  useEffect(() => {
    synthRef.current = window.speechSynthesis
    const SR = window.SpeechRecognition ?? window.webkitSpeechRecognition
    if (!SR) return

    const rec = new SR()
    rec.continuous      = false
    rec.interimResults  = true
    rec.lang            = lang
    rec.maxAlternatives = 1

    rec.onresult = (ev) => {
      let interim = ''
      let final   = ''
      for (let i = ev.resultIndex; i < ev.results.length; i++) {
        const t = ev.results[i][0].transcript
        ev.results[i].isFinal ? (final += t) : (interim += t)
      }
      const text = final || interim
      setTranscript(text)
      onTranscript(text, Boolean(final))
    }

    rec.onstart  = () => setState('listening')
    rec.onend    = () => setState('idle')
    rec.onerror  = () => setState('idle')

    recognitionRef.current = rec
    return () => rec.abort()
  }, [lang]) // eslint-disable-line react-hooks/exhaustive-deps

  const startListening = useCallback(() => {
    if (state !== 'idle') return
    setTranscript('')
    recognitionRef.current?.start()
  }, [state])

  const stopListening = useCallback(() => {
    recognitionRef.current?.stop()
  }, [])

  const speak = useCallback((text: string, onEnd?: () => void) => {
    const synth = synthRef.current
    if (!synth) return
    synth.cancel()
    const utt     = new SpeechSynthesisUtterance(text)
    utt.lang      = lang
    utt.rate      = 0.95
    utt.pitch     = 1
    utt.onstart   = () => setState('speaking')
    utt.onend     = () => { setState('idle'); onEnd?.() }
    utt.onerror   = () => setState('idle')
    setState('speaking')
    synth.speak(utt)
  }, [lang])

  const cancelSpeech = useCallback(() => {
    synthRef.current?.cancel()
    setState('idle')
  }, [])

  const isSupported = Boolean(
    (window.SpeechRecognition ?? window.webkitSpeechRecognition) &&
    window.speechSynthesis,
  )

  return { state, transcript, startListening, stopListening, speak, cancelSpeech, isSupported }
}
