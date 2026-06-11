from types import SimpleNamespace
from uuid import uuid4
from unittest.mock import AsyncMock

import pytest
from fastapi import HTTPException

from app.controllers.plaid import exchange_token, ExchangeTokenRequest


class _FakeUserResult:
    def __init__(self, user):
        self._user = user

    def scalar_one_or_none(self):
        return self._user


class _FakeTokenResult:
    def scalar_one_or_none(self):
        return None


class _FakeRowCountResult:
    def __init__(self, rowcount: int):
        self.rowcount = rowcount


class _CommitSensitiveUser:
    def __init__(self, supabase_user_id: str):
        self.supabase_user_id = supabase_user_id
        self._id = uuid4()
        self.expired = False

    @property
    def id(self):
        if self.expired:
            raise RuntimeError("expired ORM state accessed after commit")
        return self._id


@pytest.mark.asyncio
async def test_exchange_token_replaces_old_item_and_activates_new_item(monkeypatch):
    user = SimpleNamespace(id=uuid4(), supabase_user_id="supabase-user-1")
    old_account = SimpleNamespace(id=uuid4(), item_id="item-old", is_active=True, error_message=None)
    old_token = SimpleNamespace(item_id="item-old", is_active=True)
    new_account_payload = {
        "id": "new-account",
        "name": "New Checking",
        "type": "depository",
        "subtype": "checking",
        "mask": "1234",
    }
    added_objects = []

    class _FakeDB:
        def __init__(self):
            self.execute = AsyncMock(side_effect=[
                _FakeUserResult(user),
                _FakeTokenResult(),
            ])
            self.commit = AsyncMock()
            self.rollback = AsyncMock()

        def add(self, obj):
            added_objects.append(obj)

    fake_adapter = SimpleNamespace(
        exchange_public_token=AsyncMock(return_value={"access_token": "new-access", "item_id": "item-new"}),
        get_item_status=AsyncMock(return_value={"institution_id": "inst-1"}),
        fetch_accounts=AsyncMock(return_value=[new_account_payload]),
    )

    def _fake_should_persist_user_data(_user):
        return True

    async def _fake_get_active_plaid_item_ids_for_institution(**_kwargs):
        return ["item-old"]

    async def _fake_deactivate_accounts(**_kwargs):
        old_account.is_active = False
        old_account.error_message = "Replaced by a newer Plaid connection for the same institution"
        return 1

    async def _fake_deactivate_tokens(**_kwargs):
        old_token.is_active = False
        return 1

    async def _fake_find_existing_plaid_account(**_kwargs):
        return None

    async def _fake_upsert_item_status(**_kwargs):
        return None

    async def _fake_sync_after_connection(**_kwargs):
        return {"success": True}

    monkeypatch.setattr("app.controllers.plaid.PlaidAdapter", lambda: fake_adapter)
    monkeypatch.setattr("app.controllers.plaid.should_persist_user_data", _fake_should_persist_user_data)
    monkeypatch.setattr("app.controllers.plaid.get_active_plaid_item_ids_for_institution", _fake_get_active_plaid_item_ids_for_institution)
    monkeypatch.setattr("app.controllers.plaid.deactivate_plaid_accounts_for_item_ids", _fake_deactivate_accounts)
    monkeypatch.setattr("app.controllers.plaid.deactivate_plaid_provider_tokens_for_item_ids", _fake_deactivate_tokens)
    monkeypatch.setattr("app.controllers.plaid.plaid_persist.find_existing_plaid_account", _fake_find_existing_plaid_account)
    monkeypatch.setattr("app.controllers.plaid.plaid_persist.upsert_item_status", _fake_upsert_item_status)
    monkeypatch.setattr("app.controllers.plaid.sync_plaid_item_after_connection", _fake_sync_after_connection)

    db = _FakeDB()
    result = await exchange_token(
        request=ExchangeTokenRequest(public_token="public-token"),
        current_user={"user_id": "supabase-user-1"},
        db=db,
    )

    assert result["success"] is True
    assert result["status"] == "synced"
    assert result["message"] == "Plaid item connected."
    assert result["item_id"] == "item-new"
    assert result["duplicate_institution_detected"] is True
    assert result["replaced_item_ids"] == ["item-old"]
    assert result["counts"]["accounts"] == 1
    assert result["items"][0]["step"] == "exchange-token"
    assert old_account.is_active is False
    assert old_token.is_active is False
    assert len(added_objects) == 2
    added_token = next(obj for obj in added_objects if hasattr(obj, "token_data"))
    added_account = next(obj for obj in added_objects if hasattr(obj, "provider_account_id"))
    assert added_token.item_id == "item-new"
    assert added_token.is_active is True
    assert added_account.item_id == "item-new"
    assert added_account.is_active is True


@pytest.mark.asyncio
async def test_exchange_token_uses_primitive_ids_after_commit_boundaries(monkeypatch):
    user = _CommitSensitiveUser("supabase-user-1")
    new_account_payload = {
        "id": "new-account",
        "name": "New Checking",
        "type": "depository",
        "subtype": "checking",
        "mask": "1234",
    }

    class _CommitAwareDB:
        def __init__(self):
            self.execute = AsyncMock(side_effect=[
                _FakeUserResult(user),
                _FakeTokenResult(),
            ])
            self.commit = AsyncMock(side_effect=self._commit)
            self.rollback = AsyncMock()
            self.added_objects = []

        async def _commit(self):
            user.expired = True

        def add(self, obj):
            self.added_objects.append(obj)

    fake_adapter = SimpleNamespace(
        exchange_public_token=AsyncMock(return_value={"access_token": "new-access", "item_id": "item-new"}),
        get_item_status=AsyncMock(return_value={"institution_id": "inst-1"}),
        fetch_accounts=AsyncMock(return_value=[new_account_payload]),
    )

    async def _fake_get_active_plaid_item_ids_for_institution(**_kwargs):
        return []

    async def _fake_find_existing_plaid_account(**_kwargs):
        return None

    async def _fake_upsert_item_status(**_kwargs):
        return None

    async def _fake_sync_after_connection(**_kwargs):
        return {"success": True}

    monkeypatch.setattr("app.controllers.plaid.PlaidAdapter", lambda: fake_adapter)
    monkeypatch.setattr("app.controllers.plaid.should_persist_user_data", lambda _user: True)
    monkeypatch.setattr("app.controllers.plaid.get_active_plaid_item_ids_for_institution", _fake_get_active_plaid_item_ids_for_institution)
    monkeypatch.setattr("app.controllers.plaid.plaid_persist.find_existing_plaid_account", _fake_find_existing_plaid_account)
    monkeypatch.setattr("app.controllers.plaid.plaid_persist.upsert_item_status", _fake_upsert_item_status)
    monkeypatch.setattr("app.controllers.plaid.sync_plaid_item_after_connection", _fake_sync_after_connection)

    result = await exchange_token(
        request=ExchangeTokenRequest(public_token="public-token"),
        current_user={"user_id": "supabase-user-1"},
        db=_CommitAwareDB(),
    )

    assert result["success"] is True
    assert result["item_id"] == "item-new"
    assert len(fake_adapter.fetch_accounts.await_args_list) == 1


@pytest.mark.asyncio
async def test_exchange_token_binds_consent_expiration_as_datetime(monkeypatch):
    user = SimpleNamespace(id=uuid4(), supabase_user_id="supabase-user-1")
    db = SimpleNamespace(
        execute=AsyncMock(side_effect=[
            _FakeUserResult(user),
            _FakeTokenResult(),
            _FakeRowCountResult(1),
        ]),
        commit=AsyncMock(),
        rollback=AsyncMock(),
        add=lambda _obj: None,
    )
    fake_adapter = SimpleNamespace(
        exchange_public_token=AsyncMock(
            return_value={"access_token": "new-access", "item_id": "item-new"}
        ),
        get_item_status=AsyncMock(
            return_value={
                "institution_id": "inst-1",
                "consent_expiration_time": "2026-01-01T00:00:00Z",
            }
        ),
    )

    monkeypatch.setattr("app.controllers.plaid.PlaidAdapter", lambda: fake_adapter)
    monkeypatch.setattr("app.controllers.plaid.should_persist_user_data", lambda _user: False)

    with pytest.raises(HTTPException) as exc_info:
        await exchange_token(
            request=ExchangeTokenRequest(public_token="public-token"),
            current_user={"user_id": "supabase-user-1"},
            db=db,
        )

    assert exc_info.value.status_code == 403
    params = db.execute.await_args_list[2].args[1]
    assert params["consent_expiration_time"].isoformat() == "2026-01-01T00:00:00+00:00"
