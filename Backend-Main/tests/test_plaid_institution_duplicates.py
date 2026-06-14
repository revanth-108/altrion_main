from datetime import datetime, timezone
from types import SimpleNamespace
from uuid import uuid4
from unittest.mock import AsyncMock

import pytest

from app.services.plaid_sync import (
    deactivate_plaid_accounts_for_item_ids,
    get_active_plaid_item_ids_for_institution,
    get_plaid_token_rows_for_user,
)


class _FakeScalars:
    def __init__(self, rows):
        self._rows = rows

    def all(self):
        return self._rows


class _FakeResult:
    def __init__(self, rows):
        self._rows = rows

    def scalars(self):
        return _FakeScalars(self._rows)

    def scalar_one_or_none(self):
        return self._rows[0] if self._rows else None


@pytest.mark.asyncio
async def test_duplicate_institution_helpers_keep_newest_item_active():
    user_id = uuid4()
    old_account = SimpleNamespace(id=uuid4(), item_id="item-a", is_active=True)
    new_account = SimpleNamespace(id=uuid4(), item_id="item-b", is_active=True)
    old_token = SimpleNamespace(
        item_id="item-a",
        institution_id="inst-robinhood",
        provider="plaid",
        created_at=datetime(2026, 1, 1, tzinfo=timezone.utc),
        updated_at=datetime(2026, 1, 1, tzinfo=timezone.utc),
        token_data={"access_token": "token-a", "item_id": "item-a"},
    )
    new_token = SimpleNamespace(
        item_id="item-b",
        institution_id="inst-robinhood",
        provider="plaid",
        created_at=datetime(2026, 1, 2, tzinfo=timezone.utc),
        updated_at=datetime(2026, 1, 2, tzinfo=timezone.utc),
        token_data={"access_token": "token-b", "item_id": "item-b"},
    )

    db = SimpleNamespace(
        execute=AsyncMock(
            side_effect=[
                _FakeResult([new_token, old_token]),  # provider_tokens query
                _FakeResult([new_account]),  # active account lookup for item-b
                _FakeResult([old_account]),  # active account lookup for item-a
                _FakeResult([]),  # fallback account query
            ]
        )
    )

    active_item_ids = await get_active_plaid_item_ids_for_institution(
        db=db,
        user_id=user_id,
        institution_id="inst-robinhood",
    )

    assert active_item_ids == ["item-b", "item-a"]
    assert db.execute.await_count == 4

    cleanup_db = SimpleNamespace(execute=AsyncMock(side_effect=[_FakeResult([old_account])]))

    deactivated = await deactivate_plaid_accounts_for_item_ids(
        db=cleanup_db,
        user_id=user_id,
        item_ids=["item-a"],
        reason="Replaced by a newer Plaid connection for the same institution",
    )

    assert deactivated == 1
    assert old_account.is_active is False

    read_db = SimpleNamespace(
        execute=AsyncMock(
            side_effect=[
                _FakeResult([new_token, old_token]),
                _FakeResult([new_account]),
                _FakeResult([]),
            ]
        )
    )

    rows = await get_plaid_token_rows_for_user(read_db, user_id)

    assert [row.item_id for row in rows] == ["item-b"]
