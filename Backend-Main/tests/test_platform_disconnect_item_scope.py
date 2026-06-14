from types import SimpleNamespace
from uuid import uuid4
from unittest.mock import AsyncMock

import pytest

from app.controllers.platforms import disconnect_platform


class _FakeUserResult:
    def __init__(self, user):
        self._user = user

    def scalar_one_or_none(self):
        return self._user


class _FakeAccountScalars:
    def __init__(self, accounts):
        self._accounts = accounts

    def all(self):
        return self._accounts


class _FakeAccountResult:
    def __init__(self, accounts):
        self._accounts = accounts

    def scalars(self):
        return _FakeAccountScalars(self._accounts)


@pytest.mark.asyncio
async def test_disconnect_platform_scopes_to_item_id(monkeypatch):
    user = SimpleNamespace(id=uuid4(), supabase_user_id="supabase-user-1")
    token_row = SimpleNamespace(
        item_id="item-b",
        token_data={"access_token": "access-token"},
        is_active=True,
    )
    account_a = SimpleNamespace(id=uuid4(), item_id="item-a", is_active=True, error_message=None)
    account_b = SimpleNamespace(id=uuid4(), item_id="item-b", is_active=True, error_message=None)

    class _FakeDB:
        def __init__(self):
            self.execute = AsyncMock(side_effect=[
                _FakeUserResult(user),
                _FakeUserResult(token_row),
                _FakeAccountResult([account_b]),
            ])
            self.commit = AsyncMock()

    db = _FakeDB()
    result = await disconnect_platform(
        platform_id="plaid",
        item_id="item-b",
        current_user={"user_id": "supabase-user-1"},
        db=db,
    )

    assert result["success"] is True
    assert account_a.is_active is True
    assert account_b.is_active is False
    db.commit.assert_awaited_once()
