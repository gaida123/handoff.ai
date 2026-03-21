"""
SOP (Standard Operating Procedure) data models — Firestore document shapes
and API request/response schemas.
"""

from datetime import datetime
from enum import Enum
from typing import Optional
from pydantic import BaseModel, Field


class StepType(str, Enum):
    CLICK = "click"
    INPUT = "input"
    SELECT = "select"
    NAVIGATE = "navigate"
    WAIT = "wait"
    CONFIRM = "confirm"      # explicit user confirmation required


class SopStep(BaseModel):
    """A single recorded step inside an SOP."""
    step_index: int
    step_type: StepType
    instruction_text: str                  # human-readable guidance (TTS-friendly)
    selector_hint: Optional[str] = None   # CSS selector captured during Record Mode
    input_value: Optional[str] = None     # pre-filled value for autofill
    is_destructive: bool = False           # triggers guardrail overlay
    requires_autofill: bool = False
    # Autofill is silently skipped for these field types even if requires_autofill=True
    sensitive_field: bool = False


class SopDocument(BaseModel):
    """Top-level SOP stored in Firestore at /sops/{sop_id}."""
    sop_id: str
    product_id: str
    name: str
    description: Optional[str] = None
    created_by: str                         # Admin user UID
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    published: bool = False
    steps: list[SopStep] = Field(default_factory=list)
    language: str = "en"
    # Usage stats (denormalised for fast read on admin dashboard)
    total_plays: int = 0
    completion_count: int = 0
    avg_completion_time_seconds: Optional[float] = None


# ── API request/response bodies ───────────────────────────────────────────────

class CreateSopRequest(BaseModel):
    product_id: str
    name: str
    description: Optional[str] = None


class AddStepRequest(BaseModel):
    step_type: StepType
    instruction_text: str
    selector_hint: Optional[str] = None
    input_value: Optional[str] = None
    is_destructive: bool = False
    requires_autofill: bool = False
    sensitive_field: bool = False


class UpdateSopRequest(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    published: Optional[bool] = None


class SopSummary(BaseModel):
    """Lightweight SOP list item for admin dashboard."""
    sop_id: str
    name: str
    product_id: str
    published: bool
    total_steps: int
    total_plays: int
    completion_count: int
    created_at: datetime
    updated_at: datetime


# ── Record Mode event capture ─────────────────────────────────────────────────

class RecordedEvent(BaseModel):
    """Raw DOM event captured by the frontend during Record Mode."""
    event_type: str                         # "click" | "input" | "change" | "navigate"
    timestamp: datetime
    selector: Optional[str] = None
    element_tag: Optional[str] = None
    element_label: Optional[str] = None
    input_value: Optional[str] = None
    is_password_field: bool = False         # triggers server-side redaction
    page_url: str


class RecordingSession(BaseModel):
    """Active Record Mode session before SOP is finalised."""
    recording_id: str
    product_id: str
    admin_user_id: str
    started_at: datetime
    events: list[RecordedEvent] = Field(default_factory=list)
