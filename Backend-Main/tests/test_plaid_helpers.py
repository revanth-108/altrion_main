from types import SimpleNamespace

import pytest
from unittest.mock import AsyncMock
from fastapi import HTTPException

from app.services.plaid_helpers import get_plaid_token_row_for_user, get_user_by_supabase_id


class _FakeResult:
    def __init__(self, row):
        self._row = row

    def scalar_one_or_none(self):
        return self._row


@pytest.mark.asyncio
async def test_get_user_by_supabase_id_returns_404_when_missing():
    db = SimpleNamespace(execute=AsyncMock(return_value=_FakeResult(None)))

    with pytest.raises(HTTPException) as exc_info:
        await get_user_by_supabase_id(db, "supabase-user-id")

    assert exc_info.value.status_code == 404
    assert exc_info.value.detail == "User not found"


@pytest.mark.asyncio
async def test_get_plaid_token_row_for_user_filters_by_item_id():
    row = SimpleNamespace(item_id="item-123", is_active=True)
    db = SimpleNamespace(execute=AsyncMock(return_value=_FakeResult(row)))

    result = await get_plaid_token_row_for_user(db, "user-1", item_id="item-123")

    assert result is row
