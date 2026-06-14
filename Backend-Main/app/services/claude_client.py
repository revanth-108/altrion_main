"""
Lightweight Claude client for allocation insight narration.
"""
from __future__ import annotations

import json
import re
from typing import Any

import httpx

from app.core.config import settings
from app.core.logging import get_logger

logger = get_logger()

ALLOWED_STANCES = {"Cash-Heavy", "Balanced", "Growth", "Speculative", "Concentrated"}
ASSET_STANCES = {"Core", "Speculative", "Cash", "Stablecoin", "Unknown"}
SUMMARY_TOOL_NAME = "return_allocation_summary"


def _safe_confidence(value: Any) -> float:
    try:
        confidence = float(value)
    except (TypeError, ValueError):
        return 0.5
    if confidence < 0.0:
        return 0.0
    if confidence > 1.0:
        return 1.0
    return confidence


def _safe_string(value: Any, fallback: str = "") -> str:
    if value is None:
        return fallback
    if isinstance(value, str):
        return value.strip() or fallback
    return str(value).strip() or fallback


def _normalize_summary(parsed: dict[str, Any], allowed_stances: set[str] | None = None) -> dict[str, Any]:
    allowed_stances = allowed_stances or ALLOWED_STANCES
    stance = _safe_string(parsed.get("stance"), "Balanced")
    if stance not in allowed_stances:
        stance = "Balanced" if "Balanced" in allowed_stances else "Unknown"

    return {
        "stance": stance,
        "confidence": _safe_confidence(parsed.get("confidence", 0.5)),
        "text": _safe_string(parsed.get("text"), "Portfolio allocation insight is available."),
        "caution": _safe_string(parsed.get("caution")) or None,
        "used_llm": True,
    }


def _extract_json_object(text: str) -> dict[str, Any]:
    try:
        parsed = json.loads(text)
        return parsed if isinstance(parsed, dict) else {}
    except json.JSONDecodeError:
        match = re.search(r"\{.*\}", text, flags=re.DOTALL)
        if not match:
            return {}
        try:
            parsed = json.loads(match.group(0))
            return parsed if isinstance(parsed, dict) else {}
        except json.JSONDecodeError:
            return {}


def _extract_tool_input(data: dict[str, Any]) -> dict[str, Any]:
    for block in data.get("content") or []:
        if block.get("type") == "tool_use" and block.get("name") == SUMMARY_TOOL_NAME:
            tool_input = block.get("input")
            return tool_input if isinstance(tool_input, dict) else {}
    return {}


def _extract_text_json(data: dict[str, Any]) -> dict[str, Any]:
    blocks = data.get("content") or []
    text = "".join(block.get("text", "") for block in blocks if block.get("type") == "text").strip()
    return _extract_json_object(text) if text else {}


class ClaudeClient:
    async def summarize(self, payload: dict[str, Any], allowed_stances: set[str] | None = None) -> dict[str, Any]:
        api_key = settings.CLAUDE_API_KEY or settings.ANTHROPIC_API_KEY
        if not api_key or not settings.USE_CLAUDE_ALLOCATION_SUMMARY:
            raise RuntimeError("Claude allocation summary disabled")
        allowed_stances = allowed_stances or ALLOWED_STANCES

        system_prompt = (
            "You are a portfolio analyst. Use only the provided metrics and warnings. "
            "Do not calculate new percentages. Reply with strict JSON keys: "
            "stance, confidence, text, caution."
        )
        user_prompt = json.dumps(payload)
        tools = [
            {
                "name": SUMMARY_TOOL_NAME,
                "description": "Return a short portfolio allocation narrative from precomputed metrics only.",
                "input_schema": {
                    "type": "object",
                    "properties": {
                        "stance": {
                            "type": "string",
                            "enum": sorted(allowed_stances),
                        },
                        "confidence": {
                            "type": "number",
                            "minimum": 0,
                            "maximum": 1,
                        },
                        "text": {
                            "type": "string",
                            "description": "One to two concise sentences based only on the provided metrics.",
                        },
                        "caution": {
                            "type": "string",
                            "description": "Optional caution from the provided warnings. Omit this field if no caution is needed.",
                        },
                    },
                    "required": ["stance", "confidence", "text"],
                    "additionalProperties": False,
                },
            }
        ]

        async with httpx.AsyncClient(timeout=settings.CLAUDE_TIMEOUT_SECONDS) as client:
            response = await client.post(
                settings.CLAUDE_API_URL,
                headers={
                    "x-api-key": api_key,
                    "anthropic-version": "2023-06-01",
                    "content-type": "application/json",
                },
                json={
                    "model": settings.CLAUDE_MODEL,
                    "max_tokens": 300,
                    "temperature": 0.1,
                    "system": system_prompt,
                    "tools": tools,
                    "tool_choice": {"type": "tool", "name": SUMMARY_TOOL_NAME},
                    "messages": [{"role": "user", "content": user_prompt}],
                },
            )
            response.raise_for_status()
            data = response.json()

        parsed = _extract_tool_input(data) or _extract_text_json(data)
        if not parsed:
            raise RuntimeError("Claude returned no valid allocation summary")

        return _normalize_summary(parsed, allowed_stances=allowed_stances)
