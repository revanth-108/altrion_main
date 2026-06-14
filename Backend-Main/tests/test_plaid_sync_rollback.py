from types import SimpleNamespace
from uuid import uuid4

import pytest

from app.services.plaid_sync import sync_plaid_item_after_connection


class _RollbackAwareUser:
    def __init__(self):
        self._id = uuid4()
        self.expired = False

    @property
    def id(self):
        if self.expired:
            raise RuntimeError("expired ORM state accessed after rollback")
        return self._id


class _FakeDB:
    def __init__(self, user):
        self.user = user
        self.commit_count = 0
        self.rollback_count = 0

    async def rollback(self):
        self.rollback_count += 1
        self.user.expired = True

    async def commit(self):
        self.commit_count += 1


@pytest.mark.asyncio
async def test_sync_plaid_item_after_connection_uses_primitive_ids_after_rollback(monkeypatch):
    user = _RollbackAwareUser()
    db = _FakeDB(user)

    async def fail_balances(*args, **kwargs):
        raise RuntimeError("boom")

    async def noop_step(*args, **kwargs):
        return {"synced": [], "errors": []}

    monkeypatch.setattr("app.services.plaid_sync.sync_plaid_balances_for_item", fail_balances)
    monkeypatch.setattr("app.services.plaid_sync.sync_plaid_transactions_for_item", noop_step)
    monkeypatch.setattr("app.services.plaid_sync.sync_plaid_recurring_for_item", noop_step)
    monkeypatch.setattr("app.services.plaid_sync.sync_plaid_liabilities_for_item", noop_step)
    monkeypatch.setattr("app.services.plaid_sync.mark_plaid_item_failed", noop_step)
    monkeypatch.setattr("app.services.plaid_investments_sync.sync_plaid_investments_for_user", noop_step)

    result = await sync_plaid_item_after_connection(
        db=db,
        user=user,
        item_id="item-b",
        access_token="access-token",
    )

    assert db.rollback_count == 1
    assert result["balances"] is None
    assert result["errors"]
