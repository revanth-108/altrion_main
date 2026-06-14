from types import SimpleNamespace
from uuid import uuid4
from unittest.mock import AsyncMock

import pytest

from app.controllers.plaid import remove_item_by_id


class _FakeScalarResult:
    def __init__(self, row):
        self._row = row

    def scalar_one_or_none(self):
        return self._row


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
async def test_disconnect_item_soft_deletes_item_and_accounts(monkeypatch):
    user = SimpleNamespace(id=uuid4(), supabase_user_id="supabase-user-1")
    token_row = SimpleNamespace(
        item_id="item-a",
        is_active=True,
        token_data={"access_token": "access-a", "item_id": "item-a"},
    )
    account_a = SimpleNamespace(id=uuid4(), item_id="item-a", is_active=True, error_message=None)
    account_b = SimpleNamespace(id=uuid4(), item_id="item-b", is_active=True, error_message=None)
    remove_item_mock = AsyncMock(return_value=True)

    class _FakeDB:
        def __init__(self):
            self.execute = AsyncMock(side_effect=[
                _FakeUserResult(user),
                _FakeScalarResult(token_row),
                _FakeAccountResult([account_a]),
            ])
            self.commit = AsyncMock()

    monkeypatch.setattr("app.controllers.plaid.PlaidAdapter", lambda: SimpleNamespace(remove_item=remove_item_mock))

    db = _FakeDB()
    result = await remove_item_by_id(
        item_id="item-a",
        current_user={"user_id": "supabase-user-1"},
        db=db,
    )

    assert result["success"] is True
    assert result["item_id"] == "item-a"
    assert result["accounts_deactivated"] == 1
    assert token_row.is_active is False
    assert account_a.is_active is False
    assert account_b.is_active is True
    remove_item_mock.assert_awaited_once_with("access-a")
    db.commit.assert_awaited_once()
