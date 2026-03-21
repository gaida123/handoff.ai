// ── Session & WebSocket types ─────────────────────────────────────────────────

export type SessionStatus = 'initialising' | 'active' | 'paused' | 'completed' | 'error'

export interface CursorState {
  x: number          // 0–1 fractional viewport width
  y: number          // 0–1 fractional viewport height
  step_index: number
  instruction_text: string
  is_destructive: boolean
  updated_at: string
}

export interface SessionState {
  session_id: string
  user_id: string
  product_id: string
  sop_id: string
  status: SessionStatus
  current_step_index: number
  total_steps: number
  cursor: CursorState | null
  started_at: string
  completed_at?: string
}

// ── WebSocket message types ───────────────────────────────────────────────────

export type WsMessageType =
  | 'START_SESSION' | 'VOICE_COMMAND' | 'SCREENSHOT' | 'AUTOFILL_CONFIRM'
  | 'PAUSE_SESSION' | 'END_SESSION'
  | 'STEP_UPDATE' | 'CURSOR_MOVE' | 'AUTOFILL_REQUEST' | 'GUARDRAIL_WARNING'
  | 'SESSION_COMPLETE' | 'ERROR'

export interface WsMessage {
  type: WsMessageType
  session_id: string
  payload: Record<string, unknown>
}

export interface StepPayload {
  session_id: string
  step_index: number
  total_steps: number
  instruction_text: string
  target_x: number
  target_y: number
  requires_autofill: boolean
  autofill_value?: string
  is_destructive: boolean
  is_final_step: boolean
  detected_error_modal?: boolean
  error_modal_text?: string
  vision_confidence?: number
}

// ── SOP types ─────────────────────────────────────────────────────────────────

export type StepType = 'click' | 'input' | 'select' | 'navigate' | 'wait' | 'confirm'

export interface SopStep {
  step_index: number
  step_type: StepType
  instruction_text: string
  selector_hint?: string
  input_value?: string
  is_destructive: boolean
  requires_autofill: boolean
  sensitive_field: boolean
}

export interface SopDocument {
  sop_id: string
  product_id: string
  name: string
  description?: string
  created_by: string
  created_at: string
  updated_at: string
  published: boolean
  steps: SopStep[]
  language: string
  total_plays: number
  completion_count: number
  avg_completion_time_seconds?: number
}

export interface SopSummary {
  sop_id: string
  name: string
  product_id: string
  published: boolean
  total_steps: number
  total_plays: number
  completion_count: number
  created_at: string
  updated_at: string
}

// ── Record Mode ───────────────────────────────────────────────────────────────

export interface RecordedEvent {
  event_type: string
  timestamp: string
  selector?: string
  element_tag?: string
  element_label?: string
  input_value?: string
  is_password_field: boolean
  page_url: string
}

// ── Voice ─────────────────────────────────────────────────────────────────────

export type VoiceState = 'idle' | 'listening' | 'processing' | 'speaking'
