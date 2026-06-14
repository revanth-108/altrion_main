"""
Claude-backed insight generation for Portfolio X-Ray.

The deterministic X-Ray report renders first. This service receives that
precomputed report shape and asks Claude for short, data-grounded findings
without exposing API keys to the browser.
"""
from __future__ import annotations

import json
import re
from typing import Any

import httpx

from app.core.config import settings

_MAX_TOKENS = 800
_DEFAULT_MODEL = "claude-haiku-4-5-20251001"
_SYSTEM_PROMPT = (
    "You are a wealth-management portfolio analyst reviewing a deterministic Portfolio X-Ray report. "
    "Surface exactly 4-5 findings that a financial advisor would flag to a client. "
    "Use only numbers present in the data — never calculate, estimate, or infer new metrics.\n\n"
    "Severity calibration (apply these thresholds exactly):\n"
    "- high: single position true exposure >20%, ETF overlap KPI >25%, or concentration score >7\n"
    "- medium: sector tilt >15% vs benchmark, any single stock's hidden ETF exposure >5%, "
    "or international equity allocation <5%\n"
    "- low: data quality gaps, partial ETF look-through coverage, or minor diversification notes\n\n"
    "Priority order — rank findings from most to least actionable:\n"
    "1. Concentration or true-exposure surprises (hidden ETF positions inflating a stated weight)\n"
    "2. ETF duplication (same stock held directly and inside an ETF)\n"
    "3. Sector or geographic imbalance vs S&P 500 benchmark\n"
    "4. Portfolio health context (beta, estimated volatility)\n"
    "5. Data quality or ETF look-through confidence limitations\n\n"
    "Rules:\n"
    "- Each finding is exactly one sentence and cites exactly one number from the data\n"
    "- Never recommend buying, selling, or holding any position\n"
    "- If ETF look-through confidence is 'partial' or 'unavailable', include it as a finding\n"
    "- If fewer than 4 meaningful findings exist, return only what is genuinely notable\n\n"
    'Return strict JSON only — no explanation, no markdown: '
    '[{"severity":"high|medium|low","message":"..."}]'
)
_ALLOWED_SEVERITIES = {"high", "medium", "low"}


def _trim_rows(rows: list[dict[str, Any]], limit: int) -> list[dict[str, Any]]:
    return rows[:limit] if isinstance(rows, list) else []


def _extract_json_array(text: str) -> list[Any]:
    try:
        parsed = json.loads(text)
        return parsed if isinstance(parsed, list) else []
    except json.JSONDecodeError:
        match = re.search(r"\[.*\]", text, flags=re.DOTALL)
        if not match:
            return []
        try:
            parsed = json.loads(match.group(0))
            return parsed if isinstance(parsed, list) else []
        except json.JSONDecodeError:
            return []


def _normalize_findings(items: list[Any]) -> list[dict[str, str]]:
    findings: list[dict[str, str]] = []
    for item in items:
        if not isinstance(item, dict):
            continue
        severity = str(item.get("severity") or "low").strip().lower()
        if severity not in _ALLOWED_SEVERITIES:
            severity = "low"
        message = str(item.get("message") or item.get("text") or "").strip()
        if not message:
            continue
        findings.append({"severity": severity, "message": message})
    return findings[:5]


async def generate_portfolio_xray_insights(payload: dict[str, Any]) -> dict[str, Any]:
    api_key = settings.ANTHROPIC_API_KEY or settings.CLAUDE_API_KEY
    if not api_key:
        raise RuntimeError("Anthropic API key not configured")

    context = {
        "holdings": _trim_rows(payload.get("holdings") or [], 25),
        "sector_totals": _trim_rows(payload.get("sector_totals") or [], 12),
        "geographic_totals": _trim_rows(payload.get("geographic_totals") or [], 8),
        "top_overlaps": _trim_rows(payload.get("top_overlaps") or [], 12),
        "xray_summary": _trim_rows(payload.get("xray_summary") or [], 6),
        "action_items": _trim_rows(payload.get("action_items") or [], 6),
        "data_quality": payload.get("data_quality") or {},
    }

    async with httpx.AsyncClient(timeout=20) as client:
        response = await client.post(
            settings.CLAUDE_API_URL,
            headers={
                "x-api-key": api_key,
                "anthropic-version": "2023-06-01",
                "anthropic-beta": "prompt-caching-2024-07-31",
                "content-type": "application/json",
            },
            json={
                "model": settings.CLAUDE_MODEL or _DEFAULT_MODEL,
                "max_tokens": _MAX_TOKENS,
                "temperature": 0.1,
                # Structured system block enables prompt caching — the static system prompt
                # is written to cache on first call and read at ~10% cost on subsequent calls.
                "system": [
                    {
                        "type": "text",
                        "text": _SYSTEM_PROMPT,
                        "cache_control": {"type": "ephemeral"},
                    }
                ],
                "messages": [
                    {
                        "role": "user",
                        "content": "Portfolio X-Ray data:\n" + json.dumps(context, default=str),
                    }
                ],
            },
        )
        response.raise_for_status()
        data = response.json()

    text = "".join(
        block.get("text", "")
        for block in (data.get("content") or [])
        if block.get("type") == "text"
    ).strip()
    findings = _normalize_findings(_extract_json_array(text))
    if not findings:
        raise RuntimeError("Claude returned no valid Portfolio X-Ray insights")

    return {"findings": findings, "source": "claude"}
