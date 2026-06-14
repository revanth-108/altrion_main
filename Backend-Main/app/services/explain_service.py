"""
Plain-language explanation service.

Takes precomputed analysis results (Monte Carlo retirement simulation or the
Financial Analysis tools) and asks Claude to describe them in everyday language
a non-expert can understand. Supports a user-supplied API key (bring-your-own-key)
and falls back to the server-configured key when available.
"""
from __future__ import annotations

import json
from typing import Any

import httpx

from app.core.config import settings
from app.core.logging import get_logger

logger = get_logger()

# Standard Anthropic Messages endpoint. We resolve the configured base URL but
# always target /v1/messages so a bare host in config still works.
_DEFAULT_MODEL = "claude-haiku-4-5-20251001"
_MAX_TOKENS = 900

_KIND_INTROS: dict[str, str] = {
    "monte_carlo": (
        "The data below powers a Monte Carlo retirement chart — thousands of randomized market paths "
        "plotting the balance projection (p10–p90 band) across the user's lifetime, plus life-event "
        "milestones (retirement age and one-off events) marked on the timeline."
    ),
    "financial_analysis": (
        "The data below powers a financial-planning chart — either a what-if scenario projection "
        "(several growth scenarios vs a target over time) or a goal-fit score (probability of hitting "
        "a goal under different allocations)."
    ),
}

_SYSTEM_PROMPT = (
    "You are a warm, clear financial educator. The user is looking at a chart and wants to understand "
    "what it is telling them. Summarize the chart in plain, everyday English for someone with no "
    "finance background, in a neat, well-structured presentation.\n\n"
    "Use only the numbers and facts in the data — never invent or recompute figures. Define any "
    "unavoidable jargon briefly in parentheses. Be friendly and neutral: this is education, not "
    "financial advice.\n\n"
    "Structure the response in Markdown using exactly these three '###' sections:\n"
    "### What the chart shows\n"
    "One or two sentences describing the overall trajectory and the headline outcome, with the key "
    "dollar figures (e.g. the median result and the realistic range).\n"
    "### Why it looks this way\n"
    "Bullet points connecting the outcome to its drivers — the life events / milestones, savings, "
    "returns, inflation, or scenario assumptions — explaining how each one pushes the result up or "
    "down. Reference the specific event or input and its effect.\n"
    "### How much you end up with\n"
    "Bullet points stating the concrete amounts the user can expect (best / typical / worst cases, "
    "or per-scenario projected values), and the one thing that matters most.\n\n"
    "Keep the whole summary under ~220 words. Use '- ' for bullets and **bold** for the key numbers."
)


def _resolve_messages_url() -> str:
    base = (settings.CLAUDE_API_URL or "https://api.anthropic.com").rstrip("/")
    if base.endswith("/v1/messages"):
        return base
    return f"{base}/v1/messages"


async def explain_analysis(
    *,
    kind: str,
    context: Any,
    title: str | None = None,
    api_key: str | None = None,
) -> dict[str, Any]:
    """Generate a plain-language explanation of an analysis result via Claude."""
    user_key = (api_key or "").strip()
    key = user_key or settings.ANTHROPIC_API_KEY or settings.CLAUDE_API_KEY
    if not key:
        raise RuntimeError(
            "No Claude API key available. Enter your Claude API key to generate an explanation."
        )

    model = settings.CLAUDE_MODEL or _DEFAULT_MODEL
    intro = _KIND_INTROS.get(kind, "The data below is the result of a financial calculation.")

    try:
        context_json = json.dumps(context, default=str)[:8000]
    except (TypeError, ValueError):
        context_json = str(context)[:8000]

    user_prompt = (
        f"{intro}\n\n"
        + (f"Title: {title}\n\n" if title else "")
        + f"Results (JSON):\n{context_json}\n\n"
        "Explain these results in plain English for a non-expert."
    )

    async with httpx.AsyncClient(timeout=settings.CLAUDE_TIMEOUT_SECONDS or 30) as client:
        resp = await client.post(
            _resolve_messages_url(),
            headers={
                "x-api-key": key,
                "anthropic-version": "2023-06-01",
                "content-type": "application/json",
            },
            json={
                "model": model,
                "max_tokens": _MAX_TOKENS,
                "temperature": 0.3,
                "system": _SYSTEM_PROMPT,
                "messages": [{"role": "user", "content": user_prompt}],
            },
        )

    if resp.status_code == 401:
        raise PermissionError("The Claude API key was rejected. Check the key and try again.")
    resp.raise_for_status()
    data = resp.json()

    explanation = "".join(
        block.get("text", "")
        for block in (data.get("content") or [])
        if block.get("type") == "text"
    ).strip()

    if not explanation:
        raise RuntimeError("Claude returned an empty explanation.")

    logger.info("explain_analysis_completed", kind=kind, used_user_key=bool(user_key))
    return {"explanation": explanation, "model": model, "used_user_key": bool(user_key)}
