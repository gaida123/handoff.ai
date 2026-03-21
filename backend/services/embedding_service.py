"""
Embedding service — semantic text similarity using Google text-embedding-004.

Implements the RAG retrieval layer for SOP discovery:
  - embed_text()            : compute or return cached embedding for any string
  - embed_sop_text()        : build a canonical SOP corpus string from metadata + steps
  - cosine_similarity()     : compare two embedding vectors
  - find_best_sop()         : semantic nearest-neighbour search over a set of SOPs

The model produces 768-dimensional dense embeddings. Similarity scores ≥ 0.70
are reliable matches; 0.50–0.70 are weak matches; < 0.50 are likely misses.
"""

import asyncio
import logging
import time
from typing import Optional

import numpy as np
import google.generativeai as genai

from config import settings

logger = logging.getLogger(__name__)

genai.configure(api_key=settings.gemini_api_key)

# ── In-memory cache ───────────────────────────────────────────────────────────
# Maps text → (embedding vector, unix timestamp)
# Eviction is lazy: stale entries removed on each write-through.
_cache: dict[str, tuple[list[float], float]] = {}


def _evict_stale() -> None:
    cutoff = time.time() - settings.embedding_cache_ttl
    stale = [k for k, (_, ts) in _cache.items() if ts < cutoff]
    for k in stale:
        del _cache[k]


async def embed_text(text: str) -> list[float]:
    """
    Return a 768-dim embedding for `text`.
    Result is cached in memory for `embedding_cache_ttl` seconds.
    The underlying genai.embed_content call is synchronous; we offload it to
    the default thread pool so the event loop is never blocked.
    """
    now = time.time()

    cached = _cache.get(text)
    if cached:
        embedding, ts = cached
        if now - ts < settings.embedding_cache_ttl:
            return embedding

    _evict_stale()

    result = await asyncio.get_event_loop().run_in_executor(
        None,
        lambda: genai.embed_content(
            model=settings.embedding_model,
            content=text,
            task_type="SEMANTIC_SIMILARITY",
        ),
    )
    embedding: list[float] = result["embedding"]
    _cache[text] = (embedding, now)
    return embedding


def cosine_similarity(a: list[float], b: list[float]) -> float:
    """Cosine similarity in [-1, 1]; 1.0 = identical."""
    va = np.asarray(a, dtype=np.float32)
    vb = np.asarray(b, dtype=np.float32)
    norm = float(np.linalg.norm(va) * np.linalg.norm(vb))
    if norm < 1e-10:
        return 0.0
    return float(np.dot(va, vb)) / norm


def embed_sop_text(
    name: str,
    description: Optional[str] = None,
    steps: Optional[list[dict]] = None,
) -> str:
    """
    Combine SOP metadata + first few step instructions into a single string
    that captures the intent and content of the SOP for embedding.

    We deliberately limit to 3 steps to keep the token count low and avoid
    diluting the embedding with late-workflow details.
    """
    parts: list[str] = [name]
    if description:
        parts.append(description)
    if steps:
        for step in steps[:3]:
            text = step.get("instruction_text", "")
            if text:
                parts.append(text)
    return " | ".join(parts)


async def find_best_sop(
    query: str,
    candidates: list[dict],
    min_similarity: float = 0.50,
) -> Optional[tuple[str, float]]:
    """
    Nearest-neighbour semantic search over a list of SOP candidate dicts.

    Each candidate must have at least a `sop_id` field.  If an `embedding`
    field is present it will be used directly; otherwise the SOP text is
    embedded on the fly (one API call per un-cached candidate).

    Args:
        query:           Free-text description of what the user wants to do.
        candidates:      List of dicts with keys: sop_id, name, description?,
                         embedding? (list[float]).
        min_similarity:  Minimum cosine score to accept as a valid match.

    Returns:
        (sop_id, score) of the best match, or None if nothing clears the
        threshold.
    """
    if not candidates:
        return None

    query_emb = await embed_text(query)

    best_id: Optional[str] = None
    best_score: float = min_similarity

    for cand in candidates:
        stored_emb = cand.get("embedding")
        if not stored_emb:
            sop_text = embed_sop_text(
                cand.get("name", ""),
                cand.get("description"),
            )
            stored_emb = await embed_text(sop_text)

        score = cosine_similarity(query_emb, stored_emb)
        logger.debug("SOP candidate '%s' similarity=%.3f", cand.get("name"), score)

        if score > best_score:
            best_score = score
            best_id = cand.get("sop_id")

    if best_id:
        logger.info(
            "Semantic SOP match: sop_id=%s score=%.3f query=%r",
            best_id, best_score, query[:60],
        )
    else:
        logger.info("No SOP match above threshold %.2f for query=%r", min_similarity, query[:60])

    return (best_id, best_score) if best_id else None
