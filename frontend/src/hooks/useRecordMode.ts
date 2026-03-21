import { useState, useRef, useCallback, useEffect } from 'react'
import { startRecording, appendEvents, finaliseRecording } from '../services/api'
import type { RecordedEvent } from '../types'

function getCssSelector(el: Element): string {
  if (el.id) return `#${el.id}`
  const parts: string[] = []
  let cur: Element | null = el
  while (cur && cur !== document.body) {
    let seg = cur.tagName.toLowerCase()
    if (cur.className) seg += '.' + [...cur.classList].slice(0, 2).join('.')
    parts.unshift(seg)
    cur = cur.parentElement
  }
  return parts.join(' > ').slice(-100) // cap length
}

function getLabel(el: Element): string {
  return (
    (el as HTMLElement).getAttribute('aria-label') ??
    (el as HTMLInputElement).placeholder ??
    (el as HTMLElement).innerText?.slice(0, 40) ??
    el.tagName
  )
}

export function useRecordMode(productId: string) {
  const [isRecording, setIsRecording]     = useState(false)
  const [recordingId, setRecordingId]     = useState<string | null>(null)
  const [eventCount, setEventCount]       = useState(0)
  const [isProcessing, setIsProcessing]   = useState(false)
  const eventsRef = useRef<RecordedEvent[]>([])
  const flushTimer = useRef<ReturnType<typeof setInterval> | null>(null)

  const flushEvents = useCallback(async (id: string) => {
    const batch = eventsRef.current.splice(0)
    if (batch.length === 0 || !id) return
    await appendEvents(id, batch).catch(() => {})
    setEventCount((c) => c + batch.length)
  }, [])

  const handleClick = useCallback((ev: MouseEvent) => {
    const el = ev.target as Element
    eventsRef.current.push({
      event_type:     'click',
      timestamp:      new Date().toISOString(),
      selector:       getCssSelector(el),
      element_tag:    el.tagName.toLowerCase(),
      element_label:  getLabel(el),
      is_password_field: false,
      page_url:       window.location.href,
    })
  }, [])

  const handleInput = useCallback((ev: Event) => {
    const el  = ev.target as HTMLInputElement
    const isPwd = el.type === 'password'
    eventsRef.current.push({
      event_type:     'input',
      timestamp:      new Date().toISOString(),
      selector:       getCssSelector(el),
      element_tag:    el.tagName.toLowerCase(),
      element_label:  getLabel(el),
      input_value:    isPwd ? undefined : el.value,
      is_password_field: isPwd,
      page_url:       window.location.href,
    })
  }, [])

  const start = useCallback(async () => {
    const { recording_id } = await startRecording(productId)
    setRecordingId(recording_id)
    setEventCount(0)
    eventsRef.current = []
    document.addEventListener('click',  handleClick,  true)
    document.addEventListener('change', handleInput, true)
    flushTimer.current = setInterval(() => flushEvents(recording_id), 5000)
    setIsRecording(true)
    return recording_id
  }, [productId, handleClick, handleInput, flushEvents])

  const stop = useCallback(async (sopName: string): Promise<void> => {
    document.removeEventListener('click',  handleClick,  true)
    document.removeEventListener('change', handleInput, true)
    if (flushTimer.current) clearInterval(flushTimer.current)
    setIsRecording(false)

    if (!recordingId) return
    await flushEvents(recordingId)
    setIsProcessing(true)
    await finaliseRecording(recordingId, sopName)
    setIsProcessing(false)
    setRecordingId(null)
  }, [recordingId, handleClick, handleInput, flushEvents])

  useEffect(() => () => {
    document.removeEventListener('click',  handleClick,  true)
    document.removeEventListener('change', handleInput, true)
    if (flushTimer.current) clearInterval(flushTimer.current)
  }, [handleClick, handleInput])

  return { isRecording, recordingId, eventCount, isProcessing, start, stop }
}
