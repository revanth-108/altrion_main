from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from app.services.plaid_persist import upsert_item_status
from app.services.plaid_safe import parse_plaid_timestamp


class _FakeRowCountResult:
    def __init__(self, rowcount: int):
        self.rowcount = rowcount


@pytest.mark.parametrize(
    "value,expected",
    [
        ("2026-01-01T00:00:00Z", datetime(2026, 1, 1, 0, 0, tzinfo=timezone.utc)),
        (datetime(2026, 1, 1, 12, 30, tzinfo=timezone.utc), datetime(2026, 1, 1, 12, 30, tzinfo=timezone.utc)),
        (None, None),
    ],
)
def test_parse_plaid_timestamp_handles_string_datetime_and_null(value, expected):
    parsed = parse_plaid_timestamp(value)

    assert parsed == expected
    if parsed is not None:
        assert parsed.tzinfo is not None


@pytest.mark.asyncio
async def test_upsert_item_status_binds_timezone_aware_datetime(monkeypatch):
    db = SimpleNamespace(execute=AsyncMock(return_value=_FakeRowCountResult(1)))
    item_status = {
        "institution_id": "ins_123",
        "available_products": ["transactions"],
        "billed_products": ["transactions"],
        "consent_expiration_time": "2026-01-01T00:00:00Z",
        "update_type": "automated",
        "webhook": "https://example.com/webhook",
        "error": None,
    }

    updated = await upsert_item_status(db=db, item_id="item-123", item_status=item_status)

    assert updated is True
    params = db.execute.await_args.args[1]
    consent_expiration_time = params["consent_expiration_time"]
    assert isinstance(consent_expiration_time, datetime)
    assert consent_expiration_time.tzinfo is not None
    assert consent_expiration_time == datetime(2026, 1, 1, 0, 0, tzinfo=timezone.utc)
