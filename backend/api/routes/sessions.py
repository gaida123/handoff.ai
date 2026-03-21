"""
Session management routes — create, inspect, and terminate HandOff.AI sessions.
"""

import logging
from datetime import datetime
from uuid import uuid4

from fastapi import APIRouter, HTTPException, status

from models import (
    CreateSessionRequest, CreateSessionResponse,
    SessionSummary, SessionStatus, SessionState,
)
from services import (
    write_session_state, get_session_state,
    update_session_status, delete_session_state,
    get_sop, increment_sop_play,
)
from config import settings

router = APIRouter(prefix="/sessions", tags=["Sessions"])
logger = logging.getLogger(__name__)


@router.post("", response_model=CreateSessionResponse, status_code=status.HTTP_201_CREATED)
async def create_session(body: CreateSessionRequest):
    """
    Initialise a new guidance session.  The frontend should:
    1. Store the returned session_id.
    2. Connect to the WebSocket at ws_url.
    3. Subscribe to Firebase Realtime DB at firebase_path for cursor sync.
    """
    sop = await get_sop(body.sop_id)
    if not sop:
        raise HTTPException(status_code=404, detail=f"SOP '{body.sop_id}' not found")
    if not sop.published:
        raise HTTPException(status_code=403, detail="SOP is not published")

    session_id = str(uuid4())

    session = SessionState(
        session_id=session_id,
        user_id=body.user_id,
        product_id=body.product_id,
        sop_id=body.sop_id,
        status=SessionStatus.INITIALISING,
        current_step_index=0,
        total_steps=len(sop.steps),
    )
    write_session_state(session)
    await increment_sop_play(body.sop_id)

    ws_url = f"ws://localhost:{settings.api_port}/ws/{session_id}"
    firebase_path = f"sessions/{session_id}"

    logger.info("Session created", extra={"session_id": session_id, "sop_id": body.sop_id})

    return CreateSessionResponse(
        session_id=session_id,
        ws_url=ws_url,
        firebase_path=firebase_path,
    )


@router.get("/{session_id}", response_model=SessionSummary)
async def get_session(session_id: str):
    data = get_session_state(session_id)
    if not data:
        raise HTTPException(status_code=404, detail="Session not found")
    return SessionSummary(
        session_id=data["session_id"],
        user_id=data["user_id"],
        sop_id=data["sop_id"],
        status=SessionStatus(data["status"]),
        current_step_index=data.get("current_step_index", 0),
        total_steps=data.get("total_steps", 0),
        started_at=data["started_at"],
        completed_at=data.get("completed_at"),
    )


@router.delete("/{session_id}", status_code=status.HTTP_204_NO_CONTENT)
async def end_session(session_id: str):
    data = get_session_state(session_id)
    if not data:
        raise HTTPException(status_code=404, detail="Session not found")
    update_session_status(
        session_id,
        status=SessionStatus.COMPLETED,
        completed_at=datetime.utcnow().isoformat(),
    )
    # Keep session data for audit; hard-delete only after TTL in a cleanup job
    logger.info("Session ended", extra={"session_id": session_id})
