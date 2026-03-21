"""
uAgents inter-agent message schemas.
All classes inherit from uagents.Model (which is Pydantic BaseModel under the hood)
so they are automatically serialisable over the Fetch.ai agent mesh.
"""

from typing import Optional
from uagents import Model


# ── Context Agent → Knowledge Agent ──────────────────────────────────────────

class KnowledgeRequest(Model):
    """Ask the Knowledge Agent for the SOP and a specific step."""
    session_id: str
    user_id: str
    product_id: str
    sop_id: str
    current_step_index: int
    voice_command: Optional[str] = None    # raw transcript: "next", "go back", "fill it in"
    user_query: Optional[str] = None       # natural-language SOP search fallback


class KnowledgeResponse(Model):
    """Ordered step data returned by the Knowledge Agent."""
    sop_id: str
    step_index: int
    total_steps: int
    instruction_text: str
    selector_hint: Optional[str] = None
    requires_autofill: bool = False
    autofill_value: Optional[str] = None
    is_destructive: bool = False
    is_final_step: bool = False
    intent: Optional[str] = None          # classified voice intent (e.g. "navigate_next")
    matched_sop_name: Optional[str] = None  # populated when semantic search was used


# ── Context Agent → Vision Agent ─────────────────────────────────────────────

class VisionRequest(Model):
    """Send a DOM screenshot and the target element description to the Vision Agent."""
    session_id: str
    screenshot_base64: str                 # PNG encoded as base64
    target_description: str               # human-readable element label
    selector_hint: Optional[str] = None   # CSS selector from Knowledge Agent


class VisionResponse(Model):
    """Resolved screen coordinates returned by the Vision Agent."""
    session_id: str
    found: bool
    target_x: float = 0.0
    target_y: float = 0.0
    bounding_box: Optional[dict] = None   # {"x": 0, "y": 0, "w": 0, "h": 0}
    detected_error_modal: bool = False
    error_modal_text: Optional[str] = None
    confidence: float = 0.0


# ── Full step payload assembled by the Context Agent ─────────────────────────

class StepRequest(Model):
    """Complete request handed off from the frontend to the Context Agent."""
    session_id: str
    user_id: str
    product_id: str
    sop_id: str
    current_step_index: int
    screenshot_base64: str
    voice_command: Optional[str] = None
    user_query: Optional[str] = None      # natural-language SOP search query


class StepResponse(Model):
    """Merged step + coordinates written to Firebase and streamed to the frontend."""
    session_id: str
    step_index: int
    total_steps: int
    instruction_text: str
    target_x: float
    target_y: float
    requires_autofill: bool
    autofill_value: Optional[str]
    is_destructive: bool
    is_final_step: bool
    detected_error_modal: bool = False
    error_modal_text: Optional[str] = None
    vision_confidence: float = 0.0
    intent: Optional[str] = None          # classified voice intent
    matched_sop_name: Optional[str] = None  # populated when semantic SOP switch occurred


# ── Error / fault-tolerance ───────────────────────────────────────────────────

class AgentError(Model):
    """Propagated back to Context Agent when a downstream agent fails."""
    session_id: str
    agent_name: str        # "knowledge" | "vision"
    error_code: str        # "TIMEOUT" | "NOT_FOUND" | "GEMINI_ERROR" | ...
    message: str
