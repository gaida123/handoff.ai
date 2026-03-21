"""
Gemini service — wraps all Google Gemini API calls made by HandOff.AI.

Key design decisions vs the naive approach:
  1. Structured output  — response_mime_type="application/json" eliminates
     markdown-fence regex stripping.  Gemini is contractually bound to emit
     valid JSON, so _parse_* helpers do clean Pydantic validation only.
  2. Retry with backoff — transient 429 / 503 errors auto-recover via tenacity
     without leaking exceptions to the caller.
  3. Coordinate clamping — raw model output is clamped to [0, 1] so a
     hallucinated value of 1.03 never moves the Ghost Cursor off-screen.
  4. Intent classification — classify_voice_intent() replaces the brittle
     keyword list in knowledge_agent.py with a single fast LLM call.
"""

import asyncio
import json
import logging
import re
from typing import Optional

import google.generativeai as genai
import google.api_core.exceptions as gapi_exc
from google.generativeai.types import HarmCategory, HarmBlockThreshold
from tenacity import (
    retry,
    stop_after_attempt,
    wait_exponential,
    retry_if_exception_type,
    before_sleep_log,
)

from config import settings

logger = logging.getLogger(__name__)

genai.configure(api_key=settings.gemini_api_key)

_model = genai.GenerativeModel(settings.gemini_model)

# Safety config shared by all calls — vision analysis of SaaS UIs is benign
_SAFETY_OFF = {
    HarmCategory.HARM_CATEGORY_HARASSMENT: HarmBlockThreshold.BLOCK_NONE,
    HarmCategory.HARM_CATEGORY_HATE_SPEECH: HarmBlockThreshold.BLOCK_NONE,
    HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT: HarmBlockThreshold.BLOCK_NONE,
    HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT: HarmBlockThreshold.BLOCK_NONE,
}

# Retry decorator — retries on rate-limit (429) and transient server errors
_RETRYABLE = retry_if_exception_type((
    gapi_exc.ResourceExhausted,
    gapi_exc.ServiceUnavailable,
    gapi_exc.DeadlineExceeded,
))

_retry = retry(
    stop=stop_after_attempt(3),
    wait=wait_exponential(multiplier=1, min=2, max=10),
    retry=_RETRYABLE,
    before_sleep=before_sleep_log(logger, logging.WARNING),
    reraise=True,
)


# ── Coordinate extraction ─────────────────────────────────────────────────────

_COORDINATE_PROMPT = """\
You are a UI element locator for a web application co-pilot.

I will give you a screenshot of a web application and ask you to locate a specific UI element.

Target element: "{target_description}"
CSS selector hint (may be stale — treat as a clue only): "{selector_hint}"

Instructions:
1. Find the element described above in the screenshot.
2. Return its centre as fractional coordinates (0.0 = left/top, 1.0 = right/bottom).
3. Return a fractional bounding box {x, y, w, h}.
4. Report any error modal, blocking dialog, or unexpected overlay if visible.
5. Set confidence between 0.0 and 1.0.

Respond with a JSON object matching this exact schema (no markdown, no explanation):
{{
  "found": <bool>,
  "target_x": <float 0.0-1.0>,
  "target_y": <float 0.0-1.0>,
  "bounding_box": {{"x": <float>, "y": <float>, "w": <float>, "h": <float>}} or null,
  "detected_error_modal": <bool>,
  "error_modal_text": <string or null>,
  "confidence": <float 0.0-1.0>
}}
"""


async def locate_element(
    screenshot_base64: str,
    target_description: str,
    selector_hint: Optional[str] = None,
) -> dict:
    """
    Send a base64-encoded PNG screenshot to Gemini Vision.
    Returns a validated dict matching VisionResponse payload fields.
    """
    prompt = _COORDINATE_PROMPT.format(
        target_description=target_description,
        selector_hint=selector_hint or "none provided",
    )
    image_data = {"mime_type": "image/png", "data": screenshot_base64}

    try:
        raw = await _call_vision_with_retry(prompt, image_data)
        return _parse_vision_response(raw)
    except Exception as exc:
        logger.error("Gemini Vision failed after retries: %s", exc)
        return _vision_fallback(str(exc))


@_retry
async def _call_vision_with_retry(prompt: str, image_data: dict) -> str:
    response = await _model.generate_content_async(
        [prompt, image_data],
        generation_config=genai.GenerationConfig(
            temperature=0.05,
            max_output_tokens=512,
            response_mime_type="application/json",
        ),
        safety_settings=_SAFETY_OFF,
        request_options={"timeout": settings.gemini_vision_timeout_seconds},
    )
    return response.text.strip()


def _parse_vision_response(raw: str) -> dict:
    """
    Parse and validate Gemini's JSON vision response.
    With response_mime_type="application/json" the output is guaranteed JSON,
    but we still clamp coordinates to [0, 1] in case of hallucinated values.
    """
    try:
        data = json.loads(raw)
    except json.JSONDecodeError as exc:
        # Fallback: strip accidental markdown fences (should never happen with
        # response_mime_type="application/json", but belt-and-suspenders)
        cleaned = re.sub(r"```(?:json)?\s*", "", raw).strip().rstrip("`")
        try:
            data = json.loads(cleaned)
        except json.JSONDecodeError:
            logger.warning("Unparseable Gemini vision response: %s | raw=%s", exc, raw[:200])
            return _vision_fallback(f"parse_error: {exc}")

    bbox = data.get("bounding_box")
    if isinstance(bbox, dict):
        bbox = {k: _clamp(float(bbox.get(k, 0.0))) for k in ("x", "y", "w", "h")}

    return {
        "found": bool(data.get("found", False)),
        "target_x": _clamp(float(data.get("target_x", 0.0))),
        "target_y": _clamp(float(data.get("target_y", 0.0))),
        "bounding_box": bbox,
        "detected_error_modal": bool(data.get("detected_error_modal", False)),
        "error_modal_text": data.get("error_modal_text") or None,
        "confidence": _clamp(float(data.get("confidence", 0.0))),
    }


def _vision_fallback(reason: str) -> dict:
    return {
        "found": False,
        "target_x": 0.5,
        "target_y": 0.5,
        "bounding_box": None,
        "detected_error_modal": False,
        "error_modal_text": None,
        "confidence": 0.0,
        "_error": reason,
    }


def _clamp(value: float, lo: float = 0.0, hi: float = 1.0) -> float:
    return max(lo, min(hi, value))


# ── Voice intent classification ───────────────────────────────────────────────
#
# Replaces the brittle keyword-list in knowledge_agent.py with a single fast
# LLM call.  The result drives step navigation and autofill decisions.

_VALID_INTENTS = frozenset({
    "navigate_next",
    "navigate_back",
    "navigate_repeat",
    "navigate_skip",
    "confirm",
    "fill",
    "question",
    "sop_switch",
    "unknown",
})

_INTENT_PROMPT = """\
Classify the user's voice command for a guided SaaS onboarding co-pilot.

Current step index: {step_index}
User said: "{command}"

Choose exactly one intent from this list:
  navigate_next   — user wants to proceed to the next step
  navigate_back   — user wants to revisit the previous step
  navigate_repeat — user wants the current instruction repeated
  navigate_skip   — user wants to skip the current step
  confirm         — user is confirming or approving an action
  fill            — user wants a form field filled in automatically
  question        — user is asking a question about the current step
  sop_switch      — user wants to switch to a completely different workflow
  unknown         — none of the above apply

Respond with a JSON object only — no explanation:
{{"intent": "<one of the above>"}}
"""


async def classify_voice_intent(
    command: str,
    current_step_index: int = 0,
) -> str:
    """
    Classify a raw voice command into one of the intent categories.
    Falls back to keyword matching if the LLM call fails.
    """
    if not command or not command.strip():
        return "navigate_next"

    prompt = _INTENT_PROMPT.format(
        step_index=current_step_index,
        command=command.replace('"', "'"),  # guard against prompt injection
    )

    try:
        raw = await _call_intent_with_retry(prompt)
        data = json.loads(raw)
        intent = data.get("intent", "unknown")
        return intent if intent in _VALID_INTENTS else "unknown"
    except Exception as exc:
        logger.warning("Intent classification failed: %s — falling back to keywords", exc)
        return _keyword_intent_fallback(command)


@_retry
async def _call_intent_with_retry(prompt: str) -> str:
    response = await _model.generate_content_async(
        prompt,
        generation_config=genai.GenerationConfig(
            temperature=0.0,
            max_output_tokens=32,
            response_mime_type="application/json",
        ),
    )
    return response.text.strip()


def _keyword_intent_fallback(command: str) -> str:
    """Hard-coded fallback used only when the LLM call itself fails."""
    cmd = command.lower()
    if any(k in cmd for k in ("next", "continue", "proceed", "go ahead", "done")):
        return "navigate_next"
    if any(k in cmd for k in ("back", "previous", "go back")):
        return "navigate_back"
    if any(k in cmd for k in ("repeat", "again", "say that", "what was")):
        return "navigate_repeat"
    if any(k in cmd for k in ("skip",)):
        return "navigate_skip"
    if any(k in cmd for k in ("yes", "confirm", "ok", "okay", "sure", "do it")):
        return "confirm"
    if any(k in cmd for k in ("fill", "autofill", "auto fill", "enter it")):
        return "fill"
    return "unknown"


# ── SOP generation from Record Mode events ───────────────────────────────────

_SOP_GENERATION_PROMPT = """\
You are an expert technical writer. Convert the following list of raw DOM interaction events (captured during an admin walkthrough of a SaaS application) into a clear, friendly, numbered SOP that a new user can follow.

DOM Events (JSON array):
{events_json}

Rules:
- Write each instruction in plain English, second person ("Click the…", "Type your…", "Select…").
- Keep each instruction under 20 words so it sounds natural when read aloud via text-to-speech.
- Mark any step that involves submitting, deleting, or publishing as is_destructive: true.
- Mark form-field steps with requires_autofill: true only if a non-sensitive value was captured.
- Mark password or secret fields with sensitive_field: true.
- Use step_type: one of click, input, select, navigate, confirm.

Return a JSON array only — no markdown, no explanation:
[
  {{
    "step_index": 0,
    "step_type": "click|input|select|navigate|confirm",
    "instruction_text": "...",
    "selector_hint": "...",
    "input_value": null,
    "is_destructive": false,
    "requires_autofill": false,
    "sensitive_field": false
  }}
]
"""


async def generate_sop_steps(events: list[dict]) -> list[dict]:
    """
    Use Gemini to convert raw Record Mode DOM events into structured SOP steps.
    Called by the Admin API when a recording session is finalised.
    """
    prompt = _SOP_GENERATION_PROMPT.format(
        events_json=json.dumps(events, indent=2, default=str)
    )

    try:
        raw = await _call_sop_gen_with_retry(prompt)
        # With response_mime_type="application/json", raw is guaranteed valid JSON
        # But Gemini may return an object with a key rather than a bare array
        parsed = json.loads(raw)
        if isinstance(parsed, dict):
            # Extract the array from whichever key contains it
            for v in parsed.values():
                if isinstance(v, list):
                    parsed = v
                    break
        return parsed if isinstance(parsed, list) else []
    except Exception as exc:
        logger.error("SOP generation failed after retries: %s", exc)
        return []


@_retry
async def _call_sop_gen_with_retry(prompt: str) -> str:
    response = await _model.generate_content_async(
        prompt,
        generation_config=genai.GenerationConfig(
            temperature=0.2,
            max_output_tokens=2048,
            response_mime_type="application/json",
        ),
    )
    return response.text.strip()
