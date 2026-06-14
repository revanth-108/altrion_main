"""
Shared Plaid utility functions.

Kept in a separate module to avoid circular imports between
plaid_sync.py and plaid_investments_sync.py.
"""
from __future__ import annotations

import json
from typing import Any

from app.services.plaid_safe import normalize_plaid_value


def plaid_error_context(exc: Exception) -> dict[str, Any]:
    """Extract safe Plaid/httpx error metadata without logging secrets."""
    context: dict[str, Any] = {
        "error": str(exc),
        "plaid_error_type": None,
        "plaid_error_code": None,
        "plaid_display_message": None,
        "request_id": None,
    }

    body = getattr(exc, "body", None)
    if body:
        try:
            payload = json.loads(body) if isinstance(body, str) else body
            payload = normalize_plaid_value(payload)
            context.update(
                plaid_error_type=payload.get("error_type"),
                plaid_error_code=payload.get("error_code"),
                plaid_display_message=payload.get("display_message") or payload.get("error_message"),
                request_id=payload.get("request_id"),
            )
            return context
        except Exception:
            pass

    response = getattr(exc, "response", None)
    if response is not None:
        try:
            payload = normalize_plaid_value(response.json())
            context.update(
                plaid_error_type=payload.get("error_type"),
                plaid_error_code=payload.get("error_code"),
                plaid_display_message=payload.get("display_message") or payload.get("error_message"),
                request_id=payload.get("request_id"),
            )
        except Exception:
            pass

    return context
