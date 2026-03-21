"""
Session state models — live session data written to Firebase Realtime DB
and WebSocket message schemas exchanged between frontend and API.
"""

from datetime import datetime
from enum import Enum
from typing import Optional
from pydantic import BaseModel, Field


class SessionStatus(str, Enum):
    INITIALISING = "initialising"
    ACTIVE = "active"
    PAUSED = "paused"
    COMPLETED = "completed"
    ERROR = "error"


class CursorState(BaseModel):
    """Snapshot written to Firebase Realtime DB at /sessions/{id}/cursor."""
    x: float
    y: float
    step_index: int
    instruction_text: str
    is_destructive: bool = False
    updated_at: str = Field(default_factory=lambda: datetime.utcnow().isoformat())


class SessionState(BaseModel):
    """Full session document in Firebase Realtime DB at /sessions/{session_id}."""
    session_id: str
    user_id: str
    product_id: str
    sop_id: str
    status: SessionStatus = SessionStatus.INITIALISING
    current_step_index: int = 0
    total_steps: int = 0
    cursor: Optional[CursorState] = None
    started_at: str = Field(default_factory=lambda: datetime.utcnow().isoformat())
    completed_at: Optional[str] = None
    # Audit trail — every autofill action is logged
    autofill_log: list[dict] = Field(default_factory=list)


# ── WebSocket message envelopes ───────────────────────────────────────────────

class WsMessageType(str, Enum):
    # Frontend → API
    START_SESSION = "START_SESSION"
    VOICE_COMMAND = "VOICE_COMMAND"
    SCREENSHOT = "SCREENSHOT"          # combined with command
    AUTOFILL_CONFIRM = "AUTOFILL_CONFIRM"
    PAUSE_SESSION = "PAUSE_SESSION"
    END_SESSION = "END_SESSION"

    # API → Frontend
    STEP_UPDATE = "STEP_UPDATE"
    CURSOR_MOVE = "CURSOR_MOVE"
    AUTOFILL_REQUEST = "AUTOFILL_REQUEST"    # server asks user to confirm autofill
    GUARDRAIL_WARNING = "GUARDRAIL_WARNING"
    SESSION_COMPLETE = "SESSION_COMPLETE"
    ERROR = "ERROR"


class WsInbound(BaseModel):
    """Any message received from the frontend over WebSocket."""
    type: WsMessageType
    session_id: Optional[str] = None
    payload: dict = Field(default_factory=dict)


class WsOutbound(BaseModel):
    """Any message sent to the frontend over WebSocket."""
    type: WsMessageType
    session_id: str
    payload: dict = Field(default_factory=dict)


# ── REST session management ───────────────────────────────────────────────────

class CreateSessionRequest(BaseModel):
    user_id: str
    product_id: str
    sop_id: str


class CreateSessionResponse(BaseModel):
    session_id: str
    ws_url: str              # WebSocket URL the frontend should connect to
    firebase_path: str       # Realtime DB path for direct cursor sync


class SessionSummary(BaseModel):
    session_id: str
    user_id: str
    sop_id: str
    status: SessionStatus
    current_step_index: int
    total_steps: int
    started_at: str
    completed_at: Optional[str] = None
