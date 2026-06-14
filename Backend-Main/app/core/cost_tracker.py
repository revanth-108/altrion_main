"""
Per-user Claude API cost tracking.

Usage in a controller (fire-and-forget via FastAPI BackgroundTasks):
    usage = result.pop("_usage", None)
    if usage:
        background_tasks.add_task(log_ai_usage, current_user["user_id"], "research_lab", **usage)
"""
from __future__ import annotations

from decimal import Decimal

from app.core.logging import get_logger

logger = get_logger()

# ── Pricing table (USD per 1,000,000 tokens) ─────────────────────────────────
# Sources: Anthropic pricing page, June 2026.
_MODEL_COSTS: dict[str, dict[str, float]] = {
    "claude-sonnet-4-6": {
        "input": 3.00,
        "output": 15.00,
        "cache_write": 3.75,
        "cache_read": 0.30,
    },
    "claude-opus-4-8": {
        "input": 15.00,
        "output": 75.00,
        "cache_write": 18.75,
        "cache_read": 1.50,
    },
    "claude-haiku-4-5": {
        "input": 0.80,
        "output": 4.00,
        "cache_write": 1.00,
        "cache_read": 0.08,
    },
    # Versioned aliases
    "claude-haiku-4-5-20251001": {
        "input": 0.80,
        "output": 4.00,
        "cache_write": 1.00,
        "cache_read": 0.08,
    },
}

# Fall back to Sonnet pricing for unrecognised model IDs
_DEFAULT_COSTS = _MODEL_COSTS["claude-sonnet-4-6"]


def _get_costs(model: str) -> dict[str, float]:
    if model in _MODEL_COSTS:
        return _MODEL_COSTS[model]
    for key in _MODEL_COSTS:
        if model.startswith(key) or key.startswith(model):
            return _MODEL_COSTS[key]
    return _DEFAULT_COSTS


def calculate_cost(
    model: str,
    input_tokens: int,
    output_tokens: int,
    cache_write_tokens: int = 0,
    cache_read_tokens: int = 0,
) -> Decimal:
    costs = _get_costs(model)
    M = 1_000_000
    total = (
        input_tokens * costs["input"] / M
        + output_tokens * costs["output"] / M
        + cache_write_tokens * costs["cache_write"] / M
        + cache_read_tokens * costs["cache_read"] / M
    )
    return Decimal(str(round(total, 8)))


async def log_ai_usage(
    supabase_user_id: str,
    feature: str,
    model: str,
    input_tokens: int,
    output_tokens: int,
    cache_write_tokens: int = 0,
    cache_read_tokens: int = 0,
) -> None:
    """Write one AI usage row to the DB. Creates its own session so it is safe
    to run as a FastAPI BackgroundTask after the request session has closed."""
    from app.core.database import AsyncSessionLocal
    from app.models.ai_usage_log import AiUsageLog

    cost = calculate_cost(
        model, input_tokens, output_tokens, cache_write_tokens, cache_read_tokens
    )
    try:
        async with AsyncSessionLocal() as session:
            session.add(
                AiUsageLog(
                    supabase_user_id=supabase_user_id,
                    feature=feature,
                    model=model,
                    input_tokens=input_tokens,
                    output_tokens=output_tokens,
                    cache_write_tokens=cache_write_tokens,
                    cache_read_tokens=cache_read_tokens,
                    cost_usd=cost,
                )
            )
            await session.commit()
        logger.info(
            "ai_usage_logged",
            feature=feature,
            model=model,
            input_tokens=input_tokens,
            output_tokens=output_tokens,
            cost_usd=str(cost),
        )
    except Exception as exc:
        # Never let logging failures surface to the user
        logger.warning("ai_usage_log_failed", feature=feature, error=str(exc))
