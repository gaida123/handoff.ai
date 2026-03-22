import { useState, useEffect, useRef, useCallback, type MutableRefObject } from 'react'
import type { VoiceState } from '../types'

interface UseVoiceOptions {
  onTranscript: (text: string, isFinal: boolean) => void
  lang?: string
}

// ── ElevenLabs TTS ────────────────────────────────────────────────────────────
// Free tier works with premade voices (not library voices).
// Sarah (EXAVITQu4vr4xnSDxMaL) — mature, reassuring, confident.

const EL_KEY   = import.meta.env.VITE_ELEVENLABS_API_KEY as string | undefined
const EL_VOICE = 'EXAVITQu4vr4xnSDxMaL'  // Sarah — works on free tier
const EL_MODEL = 'eleven_turbo_v2_5'

async function speakElevenLabs(
  text: string,
  onStart: () => void,
  onEnd:   () => void,
  onError: () => void,
  audioRef: MutableRefObject<HTMLAudioElement | null>,
): Promise<boolean> {
  if (!EL_KEY) return false
  try {
    const res = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${EL_VOICE}`,
      {
        method:  'POST',
        headers: {
          'xi-api-key':   EL_KEY,
          'Content-Type': 'application/json',
          'Accept':       'audio/mpeg',
        },
        body: JSON.stringify({
          text,
          model_id: EL_MODEL,
          voice_settings: { stability: 0.45, similarity_boost: 0.80, style: 0.30, use_speaker_boost: true },
        }),
      },
    )
    if (!res.ok) { console.warn('[ElevenLabs] HTTP', res.status); return false }
    const blob  = await res.blob()
    const url   = URL.createObjectURL(blob)
    const audio = new Audio(url)
    audioRef.current = audio
    audio.onplay  = onStart
    audio.onended = () => { URL.revokeObjectURL(url); onEnd() }
    audio.onerror = () => { URL.revokeObjectURL(url); onError() }
    await audio.play()
    return true
  } catch (err) {
    console.warn('[ElevenLabs] failed, falling back:', err)
    return false
  }
}

// ── Voice picker ─────────────────────────────────────────────────────────────
// Aggressively prefer Enhanced/Premium quality voices — they sound dramatically
// more human than the standard versions.

const ENHANCED_NAMES = [
  // Best neural voices available in the user's system
  'Flo (English (United States))',   // warm, natural American female
  'Sandy (English (United States))', // friendly American female
  'Shelley (English (United States))',
  'Reed (English (United States))',
  'Moira',   // Irish English
  'Isha',    // Indian English
  'Nicky',
  'Samantha (Enhanced)',
  'Ava (Enhanced)',
  'Samantha (Premium)',
]

const GOOD_NAMES = [
  'Nicky', 'Samantha', 'Karen', 'Tessa', 'Daniel',
  'Google US English', 'Google UK English Female',
]

function scorevoice(v: SpeechSynthesisVoice): number {
  const n = v.name
  // Tier 1: exact preferred name match (user's downloaded voices first)
  const enhIdx = ENHANCED_NAMES.findIndex(e => n === e || n.startsWith(e))
  if (enhIdx !== -1) return 200 - enhIdx
  // Tier 2: any voice with enhanced/premium/neural in the name
  if (/enhanced|premium|neural/i.test(n)) return 150
  // Tier 3: named good voices
  const goodIdx = GOOD_NAMES.findIndex(p => n.toLowerCase().includes(p.toLowerCase()))
  if (goodIdx !== -1) return (v.localService ? 90 : 70) - goodIdx
  // Tier 4: any local English voice
  if (v.localService && v.lang.startsWith('en')) return 30
  // Tier 5: any English voice
  if (v.lang.startsWith('en')) return 10
  return 0
}

function pickBestVoice(): SpeechSynthesisVoice | null {
  const voices = window.speechSynthesis.getVoices()
  if (!voices.length) return null
  const enVoices = voices.filter(v => v.lang.startsWith('en'))
  if (!enVoices.length) return voices[0]
  return enVoices.reduce((b, v) => scorevoice(v) > scorevoice(b) ? v : b, enVoices[0])
}

// ── Text preprocessing for the most natural delivery ─────────────────────────

// Rotate through varied openers so it doesn't sound repetitive
let _openerIndex = 0
const OPENERS: Record<string, string[]> = {
  'Click':       ['Click', 'Go ahead and click', 'Now click', 'Tap on'],
  'Tap':         ['Tap', 'Go ahead and tap', 'Now tap'],
  'Press':       ['Press', 'Go ahead and press', 'Hit'],
  'Select':      ['Select', 'Choose', 'Pick'],
  'Type':        ['Type in', 'Enter', 'Write in'],
  'Enter':       ['Enter', 'Type in', 'Put in'],
  'Go to':       ['Head over to', 'Navigate to', 'Open up', 'Go to'],
  'Navigate to': ['Head over to', 'Go to', 'Open'],
  'Open':        ['Open up', 'Launch', 'Open'],
  'Scroll':      ['Scroll', 'Scroll down to', 'Find and scroll to'],
}

function varyOpener(text: string): string {
  for (const [trigger, alternatives] of Object.entries(OPENERS)) {
    if (text.startsWith(trigger)) {
      const pick = alternatives[_openerIndex % alternatives.length]
      _openerIndex++
      return pick + text.slice(trigger.length)
    }
  }
  return text
}

function humaniseText(text: string): string {
  let t = text
    // Strip markdown
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/__(.*?)__/g, '$1')
    .replace(/`(.*?)`/g, '$1')
    // Expand abbreviations
    .replace(/\be\.g\./gi, 'for example,')
    .replace(/\bi\.e\./gi, 'that is,')
    .replace(/\betc\./gi, 'and so on')
    // Arrow → natural pause
    .replace(/\s*→\s*/g, ', then ')
    // URLs — strip https:// so they read more naturally
    .replace(/https?:\/\/(www\.)?/gi, '')
    // Slash in URLs → " dot "
    .replace(/(\w)\/(\w)/g, '$1 dot $2')
    // Add a natural pause before "then" and "and then"
    .replace(/\band then\b/gi, ', and then')
    .replace(/\bthen\b/gi, ', then')
    // Add pause after step references
    .replace(/\bStep (\d+)\b/gi, 'Step $1,')
    // Trim extra whitespace
    .replace(/\s{2,}/g, ' ')
    .trim()

  // Vary the opening verb
  t = varyOpener(t)

  // If sentence doesn't end with punctuation, add a period for a natural stop
  if (!/[.!?,]$/.test(t)) t += '.'

  return t
}


export function useVoice({ onTranscript, lang = 'en-US' }: UseVoiceOptions) {
  const [state, setState]           = useState<VoiceState>('idle')
  const [transcript, setTranscript] = useState('')
  const recognitionRef              = useRef<SpeechRecognition | null>(null)
  const synthRef                    = useRef<SpeechSynthesis | null>(null)
  const voiceRef                    = useRef<SpeechSynthesisVoice | null>(null)
  const audioRef                    = useRef<HTMLAudioElement | null>(null)

  useEffect(() => {
    synthRef.current = window.speechSynthesis

    // Voices may load asynchronously — pick the best once they're ready
    const loadVoice = () => { voiceRef.current = pickBestVoice() }
    loadVoice()
    window.speechSynthesis.addEventListener('voiceschanged', loadVoice)

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
    return () => {
      rec.abort()
      window.speechSynthesis.removeEventListener('voiceschanged', loadVoice)
    }
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
    // Cancel any in-progress audio
    audioRef.current?.pause()
    audioRef.current = null
    synthRef.current?.cancel()

    const cleaned = humaniseText(text)
    setState('speaking')

    speakElevenLabs(
      cleaned,
      () => setState('speaking'),
      () => { setState('idle'); onEnd?.() },
      () => setState('idle'),
      audioRef,
    ).then(used => {
      if (used) return
      // Web Speech fallback
      const synth = synthRef.current
      if (!synth) return
      const utt = new SpeechSynthesisUtterance(cleaned)
      utt.lang   = lang
      if (voiceRef.current) utt.voice = voiceRef.current
      const isPremium = /enhanced|premium|neural/i.test(voiceRef.current?.name ?? '')
      utt.rate   = isPremium ? 0.90 : 0.88
      utt.pitch  = isPremium ? 1.0  : 1.05
      utt.volume = 1.0
      utt.onend   = () => { setState('idle'); onEnd?.() }
      utt.onerror = () => setState('idle')
      synth.speak(utt)
    })
  }, [lang])

  const cancelSpeech = useCallback(() => {
    audioRef.current?.pause()
    audioRef.current = null
    synthRef.current?.cancel()
    setState('idle')
  }, [])

  const isSupported = Boolean(
    (window.SpeechRecognition ?? window.webkitSpeechRecognition) &&
    window.speechSynthesis,
  )

  return { state, transcript, startListening, stopListening, speak, cancelSpeech, isSupported }
}
