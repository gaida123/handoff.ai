"""
Knowledge Agent — SOP retrieval, semantic search, and step sequencing.

Improvements over the original:
  - Voice command intent is now classified by the Gemini LLM (classify_voice_intent),
    not by brittle keyword matching. The fallback keyword list is still present in
    gemini_service for resilience, but the LLM path handles ambiguous utterances.
  - When the given sop_id resolves to nothing (NOT_FOUND), the agent attempts
    semantic search via the embedding layer to find the best matching SOP by name.
    This powers the "natural language SOP discovery" flow where the frontend can
    send a user_query like "how do I add a new shipment?" and get the right SOP.
  - Uses create_agent() factory so Agent() is instantiated inside the right event loop.
"""

import asyncio
import logging
from typing import Optional

from uagents import Agent, Context

from config import settings
from models.agent_models import KnowledgeRequest, KnowledgeResponse, AgentError

logger = logging.getLogger(__name__)


def create_agent() -> Agent:
    agent = Agent(
        name="knowledge_agent",
        seed=settings.knowledge_agent_seed,
        port=settings.knowledge_agent_port,
        endpoint=[f"http://localhost:{settings.knowledge_agent_port}/submit"],
    )

    @agent.on_event("startup")
    async def startup(ctx: Context):
        ctx.logger.info(
            f"Knowledge Agent started | address: {ctx.agent.address} | "
            f"inspect: https://agentverse.ai/inspect/"
            f"?uri=http%3A//127.0.0.1%3A{settings.knowledge_agent_port}"
            f"&address={ctx.agent.address}"
        )

    @agent.on_message(model=KnowledgeRequest)
    async def handle_knowledge_request(ctx: Context, sender: str, msg: KnowledgeRequest):
        logger.info(
            "KnowledgeRequest | session=%s sop=%s step=%d cmd=%r query=%r",
            msg.session_id, msg.sop_id, msg.current_step_index,
            msg.voice_command, msg.user_query,
        )

        from services.firebase_service import get_sop, get_sops_with_embeddings
        from services.gemini_service import classify_voice_intent
        from services.embedding_service import find_best_sop

        # ── Step 1: Classify voice intent with LLM ───────────────────────────
        intent: Optional[str] = None
        if msg.voice_command:
            try:
                intent = await classify_voice_intent(
                    msg.voice_command,
                    current_step_index=msg.current_step_index,
                )
                logger.info("Intent classified: %s | cmd=%r", intent, msg.voice_command)
            except Exception as exc:
                logger.warning("Intent classification error: %s", exc)
                intent = "navigate_next"

        # ── Step 2: Try primary SOP lookup ───────────────────────────────────
        sop = await get_sop(msg.sop_id)
        matched_sop_name: Optional[str] = None

        # ── Step 3: Semantic search fallback when SOP not found ──────────────
        if sop is None:
            query = msg.user_query or msg.voice_command or ""
            if query:
                logger.info("SOP '%s' not found — attempting semantic search with: %r",
                            msg.sop_id, query)
                try:
                    candidates = await get_sops_with_embeddings(msg.product_id)
                    published = [c for c in candidates if c.get("published", True)]
                    match = await find_best_sop(query, published or candidates)
                    if match:
                        best_id, score = match
                        sop = await get_sop(best_id)
                        if sop:
                            matched_sop_name = sop.name
                            logger.info(
                                "Semantic match: %s (%s) score=%.3f",
                                best_id, sop.name, score,
                            )
                except Exception as exc:
                    logger.warning("Semantic search failed: %s", exc)

        if sop is None:
            await ctx.send(sender, AgentError(
                session_id=msg.session_id, agent_name="knowledge",
                error_code="NOT_FOUND",
                message=f"SOP '{msg.sop_id}' not found and semantic search found no match.",
            ))
            return

        # ── Step 4: Resolve step index from intent ────────────────────────────
        target_index = _resolve_step_from_intent(
            intent=intent,
            current=msg.current_step_index,
            total=len(sop.steps),
        )

        if target_index is None or target_index >= len(sop.steps):
            await ctx.send(sender, AgentError(
                session_id=msg.session_id, agent_name="knowledge",
                error_code="OUT_OF_RANGE",
                message=f"Resolved step index {target_index} is out of range (total={len(sop.steps)}).",
            ))
            return

        step = sop.steps[target_index]
        await ctx.send(sender, KnowledgeResponse(
            sop_id=sop.sop_id,
            step_index=target_index,
            total_steps=len(sop.steps),
            instruction_text=step.instruction_text,
            selector_hint=step.selector_hint,
            requires_autofill=step.requires_autofill and not step.sensitive_field,
            autofill_value=step.input_value if (step.requires_autofill and not step.sensitive_field) else None,
            is_destructive=step.is_destructive,
            is_final_step=(target_index == len(sop.steps) - 1),
            intent=intent,
            matched_sop_name=matched_sop_name,
        ))

    return agent


def _resolve_step_from_intent(
    intent: Optional[str],
    current: int,
    total: int,
) -> Optional[int]:
    """
    Map a classified intent to a concrete step index.
    `sop_switch` and `question` don't change the current position.
    """
    if intent is None or intent in ("navigate_next", "confirm", "fill", "unknown"):
        return min(current + 1, total - 1)
    if intent == "navigate_back":
        return max(current - 1, 0)
    if intent in ("navigate_repeat", "question", "sop_switch"):
        return current
    if intent == "navigate_skip":
        return min(current + 1, total - 1)
    return min(current + 1, total - 1)


if __name__ == "__main__":
    asyncio.set_event_loop(asyncio.new_event_loop())
    create_agent().run()
