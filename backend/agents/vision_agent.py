"""
Vision Agent — DOM screenshot spatial reasoning via Gemini Vision API.
Uses create_agent() factory so Agent() is instantiated inside the right event loop.
"""

import asyncio
import logging

from uagents import Agent, Context

from config import settings
from models.agent_models import VisionRequest, VisionResponse, AgentError

logger = logging.getLogger(__name__)


def create_agent() -> Agent:
    agent = Agent(
        name="vision_agent",
        seed=settings.vision_agent_seed,
        port=settings.vision_agent_port,
        endpoint=[f"http://localhost:{settings.vision_agent_port}/submit"],
    )

    @agent.on_event("startup")
    async def startup(ctx: Context):
        ctx.logger.info(
            f"Vision Agent started | address: {ctx.agent.address} | "
            f"inspect: https://agentverse.ai/inspect/"
            f"?uri=http%3A//127.0.0.1%3A{settings.vision_agent_port}"
            f"&address={ctx.agent.address}"
        )

    @agent.on_message(model=VisionRequest)
    async def handle_vision_request(ctx: Context, sender: str, msg: VisionRequest):
        logger.info("VisionRequest | session=%s target=%s", msg.session_id, msg.target_description[:60])

        from services.gemini_service import locate_element
        try:
            result = await asyncio.wait_for(
                locate_element(
                    screenshot_base64=msg.screenshot_base64,
                    target_description=msg.target_description,
                    selector_hint=msg.selector_hint,
                ),
                timeout=settings.gemini_vision_timeout_seconds,
            )
        except asyncio.TimeoutError:
            logger.warning("Gemini Vision timeout | session=%s", msg.session_id)
            await ctx.send(sender, AgentError(
                session_id=msg.session_id, agent_name="vision",
                error_code="TIMEOUT", message="Gemini Vision API timed out.",
            ))
            return
        except Exception as exc:
            logger.error("Gemini Vision error | session=%s: %s", msg.session_id, exc)
            await ctx.send(sender, AgentError(
                session_id=msg.session_id, agent_name="vision",
                error_code="GEMINI_ERROR", message=str(exc),
            ))
            return

        await ctx.send(sender, VisionResponse(
            session_id=msg.session_id,
            found=result["found"],
            target_x=result["target_x"],
            target_y=result["target_y"],
            bounding_box=result.get("bounding_box"),
            detected_error_modal=result["detected_error_modal"],
            error_modal_text=result.get("error_modal_text"),
            confidence=result["confidence"],
        ))

    return agent


if __name__ == "__main__":
    asyncio.set_event_loop(asyncio.new_event_loop())
    create_agent().run()
