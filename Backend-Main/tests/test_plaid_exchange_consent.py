from types import SimpleNamespace
from uuid import uuid4

import pytest
from fastapi import HTTPException
from unittest.mock import AsyncMock

from app.controllers.plaid import ExchangeTokenRequest, exchange_token


class _FakeResult:
    def __init__(self, row=None):
        self._row = row

    def scalar_one_or_none(self):
        return self._row


class _FakeDb:
    def __init__(self, rows):
        self._rows = list(rows)
        self.added = []
        self.commits = 0
        self.rollbacks = 0

    async def execute(self, _stmt):
        return _FakeResult(self._rows.pop(0) if self._rows else None)

    def add(self, obj):
        self.added.append(obj)

    async def commit(self):
        self.commits += 1

    async def rollback(self):
        self.rollbacks += 1


class _FakePlaidAdapter:
    async def exchange_public_token(self, public_token: str) -> dict:
        return {"access_token": "access-123", "item_id": "item-123"}

    async def get_item_status(self, access_token: str) -> dict:
        return {"institution_id": "inst-123"}


@pytest.mark.asyncio
async def test_exchange_token_returns_403_when_storage_consent_missing(monkeypatch):
    user = SimpleNamespace(
        id=uuid4(),
        supabase_user_id="supabase-user-id",
        data_storage_consent=False,
    )
    db = _FakeDb([user, None])

    monkeypatch.setattr("app.controllers.plaid.PlaidAdapter", _FakePlaidAdapter)
    monkeypatch.setattr("app.controllers.plaid.should_persist_user_data", lambda _user: False)
    monkeypatch.setattr("app.controllers.plaid.plaid_persist.upsert_item_status", AsyncMock(return_value=True))

    with pytest.raises(HTTPException) as exc_info:
        await exchange_token(
            request=ExchangeTokenRequest(public_token="public-123"),
            current_user={"user_id": "supabase-user-id"},
            db=db,
        )

    assert exc_info.value.status_code == 403
    assert exc_info.value.detail == "Data storage consent is required before connecting financial accounts."
    assert db.commits >= 1
    assert db.rollbacks == 0
