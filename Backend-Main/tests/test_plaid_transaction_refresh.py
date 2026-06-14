from types import SimpleNamespace
from uuid import uuid4
from unittest.mock import AsyncMock

import pytest

from app.services.plaid_persist import upsert_transactions
from app.controllers.plaid import get_plaid_sync_status, sync_plaid_transaction_updates
from app.services.plaid_sync import request_plaid_transactions_refresh_for_user, sync_plaid_transactions_for_item


class _FakeScalarResult:
    def __init__(self, row):
        self._row = row

    def scalar_one_or_none(self):
        return self._row


class _FakeAccountScalars:
    def __init__(self, rows):
        self._rows = rows

    def all(self):
        return self._rows


class _FakeAccountResult:
    def __init__(self, rows):
        self._rows = rows

    def scalars(self):
        return _FakeAccountScalars(self._rows)


class _FakeDeleteResult:
    def __init__(self, rowcount):
        self.rowcount = rowcount


class _CursorResetError(Exception):
    def __init__(self):
        super().__init__("invalid cursor")
        self.body = '{"error_type":"INVALID_INPUT","error_code":"INVALID_CURSOR","error_message":"cursor reset required"}'


@pytest.mark.asyncio
async def test_sync_plaid_transactions_for_item_persists_next_cursor(monkeypatch):
    user = SimpleNamespace(id=uuid4())
    token_row = SimpleNamespace(cursor="cursor-old")
    account = SimpleNamespace(provider_account_id="acc-1", id=uuid4(), is_active=True)
    db = SimpleNamespace(
        execute=AsyncMock(side_effect=[
            _FakeScalarResult(token_row),
            _FakeAccountResult([account]),
        ]),
        commit=AsyncMock(),
    )

    adapter = SimpleNamespace(
        sync_transactions=AsyncMock(
            return_value={
                "added": [{"transaction_id": "txn-1", "account_id": "acc-1"}],
                "modified": [],
                "removed": [],
                "next_cursor": "cursor-new",
                "has_more": False,
                "loop_count": 1,
            }
        )
    )
    upsert_mock = AsyncMock(return_value={"added": 1, "modified": 0, "removed": 0, "skipped": 0})
    monkeypatch.setattr("app.services.plaid_sync.plaid_persist.upsert_transactions", upsert_mock)

    result = await sync_plaid_transactions_for_item(
        db=db,
        user=user,
        item_id="item-1",
        access_token="access-token",
        adapter=adapter,
    )

    assert result["next_cursor"] == "cursor-new"
    assert token_row.cursor == "cursor-new"
    assert adapter.sync_transactions.await_count == 1
    adapter.sync_transactions.assert_awaited_with(
        access_token="access-token",
        cursor="cursor-old",
        log_context={"user_id": str(user.id), "item_id": "item-1", "cursor_present": True},
    )
    upsert_mock.assert_awaited_once()
    db.commit.assert_awaited_once()


@pytest.mark.asyncio
async def test_sync_plaid_transactions_for_item_retries_when_cursor_is_stale(monkeypatch):
    user = SimpleNamespace(id=uuid4())
    token_row = SimpleNamespace(cursor="cursor-old")
    account = SimpleNamespace(provider_account_id="acc-1", id=uuid4(), is_active=True)
    db = SimpleNamespace(
        execute=AsyncMock(side_effect=[
            _FakeScalarResult(token_row),
            _FakeAccountResult([account]),
        ]),
        commit=AsyncMock(),
    )

    adapter = SimpleNamespace(
        sync_transactions=AsyncMock(
            side_effect=[
                _CursorResetError(),
                {
                    "added": [],
                    "modified": [],
                    "removed": [],
                    "next_cursor": "cursor-new",
                    "has_more": False,
                    "loop_count": 1,
                },
            ]
        )
    )
    monkeypatch.setattr(
        "app.services.plaid_sync.plaid_persist.upsert_transactions",
        AsyncMock(return_value={"added": 0, "modified": 0, "removed": 0, "skipped": 0}),
    )

    result = await sync_plaid_transactions_for_item(
        db=db,
        user=user,
        item_id="item-1",
        access_token="access-token",
        adapter=adapter,
    )

    assert result["next_cursor"] == "cursor-new"
    assert token_row.cursor == "cursor-new"
    assert adapter.sync_transactions.await_count == 2
    assert adapter.sync_transactions.await_args_list[0].kwargs["cursor"] == "cursor-old"
    assert adapter.sync_transactions.await_args_list[1].kwargs["cursor"] is None
    db.commit.assert_awaited_once()


@pytest.mark.asyncio
async def test_sync_plaid_transactions_for_item_saves_cursor_on_empty_first_sync(monkeypatch):
    user = SimpleNamespace(id=uuid4())
    token_row = SimpleNamespace(cursor=None, available_products=["transactions"], billed_products=["transactions"])
    account = SimpleNamespace(provider_account_id="acc-1", id=uuid4(), is_active=True)
    db = SimpleNamespace(
        execute=AsyncMock(side_effect=[
            _FakeScalarResult(token_row),
            _FakeAccountResult([account]),
        ]),
        commit=AsyncMock(),
    )

    adapter = SimpleNamespace(
        sync_transactions=AsyncMock(
            return_value={
                "added": [],
                "modified": [],
                "removed": [],
                "next_cursor": "cursor-new",
                "has_more": False,
                "loop_count": 1,
            }
        )
    )
    monkeypatch.setattr(
        "app.services.plaid_sync.plaid_persist.upsert_transactions",
        AsyncMock(return_value={"added": 0, "modified": 0, "removed": 0, "skipped": 0}),
    )

    result = await sync_plaid_transactions_for_item(
        db=db,
        user=user,
        item_id="item-1",
        access_token="access-token",
        adapter=adapter,
    )

    assert result["summary"]["added"] == 0
    assert result["next_cursor"] == "cursor-new"
    assert token_row.cursor == "cursor-new"
    db.commit.assert_awaited_once()


@pytest.mark.asyncio
async def test_sync_plaid_transactions_for_item_skips_investment_only_item(monkeypatch):
    user = SimpleNamespace(id=uuid4())
    token_row = SimpleNamespace(cursor=None, available_products=["investments"], billed_products=["investments"])
    db = SimpleNamespace(
        execute=AsyncMock(return_value=_FakeScalarResult(token_row)),
        commit=AsyncMock(),
    )

    adapter = SimpleNamespace(sync_transactions=AsyncMock())

    result = await sync_plaid_transactions_for_item(
        db=db,
        user=user,
        item_id="item-invest",
        access_token="access-token",
        adapter=adapter,
    )

    assert result["skipped_reason"] == "investment_only"
    assert result["summary"]["skipped"] == 1
    adapter.sync_transactions.assert_not_awaited()
    db.commit.assert_not_awaited()


@pytest.mark.asyncio
async def test_sync_plaid_transactions_for_item_clears_update_flag_on_success(monkeypatch):
    user = SimpleNamespace(id=uuid4())
    token_row = SimpleNamespace(
        cursor=None,
        available_products=["transactions"],
        billed_products=["transactions"],
        transactions_update_available=True,
        transactions_update_available_at="2026-01-01T00:00:00Z",
        last_transactions_synced_at=None,
        last_transactions_sync_status=None,
    )
    account = SimpleNamespace(provider_account_id="acc-1", id=uuid4(), is_active=True)
    db = SimpleNamespace(
        execute=AsyncMock(side_effect=[
            _FakeScalarResult(token_row),
            _FakeAccountResult([account]),
        ]),
        commit=AsyncMock(),
    )

    adapter = SimpleNamespace(
        sync_transactions=AsyncMock(
            return_value={
                "added": [],
                "modified": [],
                "removed": [],
                "next_cursor": "cursor-new",
                "has_more": False,
                "loop_count": 1,
            }
        )
    )
    monkeypatch.setattr(
        "app.services.plaid_sync.plaid_persist.upsert_transactions",
        AsyncMock(return_value={"added": 0, "modified": 0, "removed": 0, "skipped": 0}),
    )

    await sync_plaid_transactions_for_item(
        db=db,
        user=user,
        item_id="item-1",
        access_token="access-token",
        adapter=adapter,
    )

    assert token_row.transactions_update_available is False
    assert token_row.transactions_update_available_at is None
    assert token_row.last_transactions_sync_status == "success"
    assert token_row.last_transactions_synced_at is not None


@pytest.mark.asyncio
async def test_sync_plaid_transactions_for_item_keeps_update_flag_on_failure(monkeypatch):
    user = SimpleNamespace(id=uuid4())
    token_row = SimpleNamespace(
        cursor=None,
        available_products=["transactions"],
        billed_products=["transactions"],
        transactions_update_available=True,
        transactions_update_available_at="2026-01-01T00:00:00Z",
        last_transactions_synced_at=None,
        last_transactions_sync_status=None,
    )
    account = SimpleNamespace(provider_account_id="acc-1", id=uuid4(), is_active=True)
    db = SimpleNamespace(
        execute=AsyncMock(side_effect=[
            _FakeScalarResult(token_row),
            _FakeAccountResult([account]),
        ]),
        commit=AsyncMock(),
    )

    adapter = SimpleNamespace(
        sync_transactions=AsyncMock(side_effect=RuntimeError("boom"))
    )

    with pytest.raises(RuntimeError):
        await sync_plaid_transactions_for_item(
            db=db,
            user=user,
            item_id="item-1",
            access_token="access-token",
            adapter=adapter,
        )

    assert token_row.transactions_update_available is True
    assert token_row.transactions_update_available_at == "2026-01-01T00:00:00Z"
    assert token_row.last_transactions_sync_status == "failed"
    db.commit.assert_not_awaited()


@pytest.mark.asyncio
async def test_request_plaid_transactions_refresh_marks_pending_and_webhook_expected(monkeypatch):
    user = SimpleNamespace(id=uuid4())
    db = SimpleNamespace()

    token_rows = [
        SimpleNamespace(
            item_id="item-1",
            institution_id="inst-1",
            cursor="cursor-1",
            available_products=["transactions"],
            billed_products=["transactions"],
            provider_token=SimpleNamespace(token_data={"access_token": "token-1"}),
        )
    ]

    refresh_mock = AsyncMock(return_value={"requested": True, "response": {"status": "queued"}})
    monkeypatch.setattr("app.services.plaid_sync.get_active_plaid_refresh_rows_for_user", AsyncMock(return_value=token_rows))
    monkeypatch.setattr("app.services.plaid_sync.PlaidAdapter.refresh_transactions", refresh_mock)

    result = await request_plaid_transactions_refresh_for_user(db=db, user=user)

    assert result["success"] is True
    assert result["item_count"] == 1
    assert result["items"][0]["refresh_requested"] is True
    assert result["items"][0]["webhook_expected"] is True
    assert result["items"][0]["transactions"]["skipped_reason"] == "pending_webhook"
    refresh_mock.assert_awaited_once_with("token-1")


@pytest.mark.asyncio
async def test_get_plaid_sync_status_returns_has_transaction_updates(monkeypatch):
    user = SimpleNamespace(id=uuid4())
    expected = {
        "hasTransactionUpdates": True,
        "items": [
            {
                "item_id": "item-1",
                "institution_name": "Test Bank",
                "transactions_update_available": True,
                "updated_at": "2026-01-01T00:00:00Z",
            }
        ],
    }
    monkeypatch.setattr(
        "app.controllers.plaid.should_persist_user_data",
        lambda _user: True,
    )
    monkeypatch.setattr(
        "app.controllers.plaid.get_plaid_transaction_sync_status_for_user",
        AsyncMock(return_value=expected),
    )
    db = SimpleNamespace(execute=AsyncMock(return_value=_FakeScalarResult(user)))

    result = await get_plaid_sync_status(
        current_user={"user_id": "supabase-user-1"},
        db=db,
    )

    assert result["success"] is True
    assert result["status"] == "updates_available"
    assert result["message"] == "Transaction updates are available."
    assert result["hasTransactionUpdates"] is True
    assert result["counts"] == {"items": 1, "items_with_updates": 1}
    assert result["items"] == expected["items"]


@pytest.mark.asyncio
async def test_sync_plaid_transaction_updates_calls_helper_for_flagged_items(monkeypatch):
    user = SimpleNamespace(id=uuid4(), supabase_user_id="supabase-user-1")
    flagged_token = SimpleNamespace(
        item_id="item-1",
        institution_id="inst-1",
        transactions_update_available=True,
        available_products=["transactions"],
        billed_products=["transactions"],
        token_data={"access_token": "access-token"},
    )
    inactive_token = SimpleNamespace(
        item_id="item-2",
        institution_id="inst-2",
        transactions_update_available=False,
        available_products=["transactions"],
        billed_products=["transactions"],
        token_data={"access_token": "access-token-2"},
    )
    db = SimpleNamespace(
        execute=AsyncMock(return_value=_FakeScalarResult(user)),
    )
    monkeypatch.setattr("app.controllers.plaid.should_persist_user_data", lambda _user: True)
    monkeypatch.setattr(
        "app.controllers.plaid.get_plaid_token_rows_for_user",
        AsyncMock(return_value=[flagged_token, inactive_token]),
    )
    sync_mock = AsyncMock(return_value={"summary": {"added": 2, "modified": 1, "removed": 0}, "next_cursor": "cursor-new"})
    monkeypatch.setattr("app.controllers.plaid.sync_plaid_transactions_for_item", sync_mock)

    result = await sync_plaid_transaction_updates(
        current_user={"user_id": "supabase-user-1"},
        db=db,
    )

    assert result["requested"] is True
    assert result["status"] == "synced"
    assert result["message"] == "Transaction updates synced."
    assert result["item_count"] == 1
    assert result["items"][0]["item_id"] == "item-1"
    assert result["items"][0]["transactions_added"] == 2
    assert result["skipped_items"][0]["transactions"]["skipped_reason"] == "no_updates"
    sync_mock.assert_awaited_once()


@pytest.mark.asyncio
async def test_sync_plaid_transaction_updates_returns_no_updates_status_when_nothing_is_flagged(monkeypatch):
    user = SimpleNamespace(id=uuid4(), supabase_user_id="supabase-user-1")
    inactive_token = SimpleNamespace(
        item_id="item-1",
        institution_id="inst-1",
        transactions_update_available=False,
        available_products=["transactions"],
        billed_products=["transactions"],
        token_data={"access_token": "access-token"},
    )
    db = SimpleNamespace(
        execute=AsyncMock(return_value=_FakeScalarResult(user)),
    )
    monkeypatch.setattr("app.controllers.plaid.should_persist_user_data", lambda _user: True)
    monkeypatch.setattr(
        "app.controllers.plaid.get_plaid_token_rows_for_user",
        AsyncMock(return_value=[inactive_token]),
    )

    result = await sync_plaid_transaction_updates(
        current_user={"user_id": "supabase-user-1"},
        db=db,
    )

    assert result["success"] is True
    assert result["requested"] is False
    assert result["status"] == "no_updates"
    assert result["message"] == "No transaction updates available."
    assert result["items"] == []
    assert result["skipped_items"][0]["transactions"]["skipped_reason"] == "no_updates"


@pytest.mark.asyncio
async def test_upsert_transactions_deletes_removed_transactions_from_db_state():
    removed_store = {"txn-1": SimpleNamespace(transaction_id="txn-1")}

    class _FakeDB:
        def __init__(self):
            self.execute = AsyncMock(side_effect=self._execute)
            self.flush = AsyncMock()

        async def _execute(self, stmt):
            sql = str(stmt).lower()
            if "delete" in sql:
                removed_store.pop("txn-1", None)
                return _FakeDeleteResult(1)
            return _FakeScalarResult(None)

    result = await upsert_transactions(
        db=_FakeDB(),
        user_id=uuid4(),
        account_map={},
        added=[],
        modified=[],
        removed=["txn-1"],
        item_id="item-1",
    )

    assert result["removed"] == 1
    assert "txn-1" not in removed_store
