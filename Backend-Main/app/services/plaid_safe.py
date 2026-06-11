"""Safe coercion helpers for Plaid/provider-token payloads."""
from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Any

from dateutil.parser import isoparse


def value_type(value: Any) -> str:
    return type(value).__name__


def normalize_plaid_value(value: Any) -> dict[str, Any]:
    """Return a dict for JSON/dict/Plaid SDK model values, or {}."""
    if value is None:
        return {}
    if isinstance(value, dict):
        return value
    if hasattr(value, "to_dict"):
        parsed = value.to_dict()
        return parsed if isinstance(parsed, dict) else {}
    if isinstance(value, str):
        try:
            parsed = json.loads(value)
        except json.JSONDecodeError:
            return {}
        return parsed if isinstance(parsed, dict) else {}
    return {}


def parse_token_data(value: Any) -> dict[str, Any]:
    """Parse provider_tokens.token_data stored as dict, JSON text, or legacy raw token."""
    if isinstance(value, dict):
        return value

    if isinstance(value, str):
        stripped = value.strip()
        if not stripped:
            return {}

        try:
            parsed = json.loads(stripped)
            return parsed if isinstance(parsed, dict) else {}
        except json.JSONDecodeError:
            if stripped.startswith("access-"):
                return {"access_token": stripped}
            return {}

    return {}


def parse_plaid_timestamp(value: Any) -> datetime | None:
    """Parse Plaid timestamp values into timezone-aware datetimes.

    Plaid may return ISO-8601 / RFC3339 strings or SDK datetime objects.
    Legacy null/empty values remain None.
    """
    if value is None or value == "" or value == "None":
        return None
    if isinstance(value, datetime):
        if value.tzinfo is None or value.tzinfo.utcoffset(value) is None:
            return value.replace(tzinfo=timezone.utc)
        return value
    if isinstance(value, str):
        try:
            parsed = isoparse(value)
        except (ValueError, TypeError):
            return None
        if parsed.tzinfo is None or parsed.tzinfo.utcoffset(parsed) is None:
            parsed = parsed.replace(tzinfo=timezone.utc)
        return parsed
    return None


def normalize_plaid_list(value: Any) -> list[dict[str, Any]]:
    """Return a list of dicts for JSON/list/Plaid SDK values, or []."""
    if value is None:
        return []
    if hasattr(value, "to_dict"):
        value = value.to_dict()
    if isinstance(value, str):
        try:
            value = json.loads(value)
        except json.JSONDecodeError:
            return []
    if isinstance(value, dict):
        for key in ("accounts", "transactions", "holdings", "securities"):
            nested = value.get(key)
            if isinstance(nested, list):
                return [normalize_plaid_value(item) for item in nested]
        return [value]
    if isinstance(value, list):
        return [normalize_plaid_value(item) for item in value]
    return []


def ensure_dict(value: Any) -> dict[str, Any]:
    """Alias used for provider_tokens.token_data semantics."""
    return normalize_plaid_value(value)
