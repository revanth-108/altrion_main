from types import SimpleNamespace
from uuid import uuid4
from unittest.mock import AsyncMock, MagicMock

import pytest

from app.services.plaid_persist import upsert_holdings
from app.services.plaid_sync import sync_plaid_balances_for_item
from app.services.plaid_sync import (
    get_plaid_token_rows_for_user,
    sync_plaid_refresh_for_user,
    sync_plaid_step_for_user,
)
from app.services.providers.plaid import PlaidAdapter


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


@pytest.mark.asyncio
async def test_get_plaid_token_rows_for_user_resolves_legacy_item_id(monkeypatch):
    user_id = uuid4()
    legacy_row = SimpleNamespace(
        item_id=None,
        token_data={"access_token": "token-1", "item_id": "item-legacy"},
        provider="plaid",
    )

    db = SimpleNamespace(execute=AsyncMock(return_value=_FakeResult([legacy_row])))

    rows = await get_plaid_token_rows_for_user(db, user_id, item_id="item-legacy")

    assert len(rows) == 1
    assert rows[0].item_id == "item-legacy"


@pytest.mark.asyncio
async def test_sync_plaid_step_for_user_processes_all_items_and_continues_after_failure(monkeypatch):
    user = SimpleNamespace(id=uuid4())
    rows = [
        SimpleNamespace(item_id="item-1", institution_id="inst-1", provider="plaid", token_data={"access_token": "token-1"}),
        SimpleNamespace(item_id="item-2", institution_id="inst-2", provider="plaid", token_data={"access_token": "token-2"}),
    ]
    db = SimpleNamespace(rollback=AsyncMock())
    called_item_ids = []

    async def fake_sync_fn(**kwargs):
        called_item_ids.append(kwargs["item_id"])
        if kwargs["item_id"] == "item-2":
            raise RuntimeError("boom")
        return {"synced": [{"account_id": "acc-1"}], "errors": []}

    monkeypatch.setattr(
        "app.services.plaid_sync.get_plaid_token_rows_for_user",
        AsyncMock(return_value=rows),
    )

    result = await sync_plaid_step_for_user(db=db, user=user, sync_name="balances", sync_fn=fake_sync_fn)

    assert result["item_count"] == 2
    assert len(result["items"]) == 2
    assert len(result["errors"]) == 1
    assert result["success"] is False
    assert result["items"][0]["success"] is True
    assert result["items"][1]["success"] is False
    assert result["items"][0]["step"] == "balances"
    assert result["items"][0]["added"] == 0
    assert result["items"][1]["step"] == "balances"
    assert result["items"][1]["message"] == "boom"
    assert result["errors"][0]["message"] == "boom"
    assert called_item_ids == ["item-1", "item-2"]


@pytest.mark.asyncio
async def test_sync_plaid_refresh_for_user_syncs_all_active_items_and_reports_transaction_counts(monkeypatch):
    user = SimpleNamespace(id=uuid4())
    db = SimpleNamespace()

    active_rows = [
        SimpleNamespace(
            item_id="item-1",
            institution_id="inst-1",
            cursor="cursor-1",
            available_products=["transactions", "investments"],
            billed_products=["transactions"],
            provider_token=SimpleNamespace(token_data={"access_token": "token-1"}),
        ),
        SimpleNamespace(
            item_id="item-2",
            institution_id="inst-2",
            cursor=None,
            available_products=["transactions"],
            billed_products=["transactions"],
            provider_token=SimpleNamespace(token_data={"access_token": "token-2"}),
        ),
    ]

    transactions_mock = AsyncMock(side_effect=[
        {
            "summary": {"added": 2, "modified": 1, "removed": 0},
            "next_cursor": "cursor-1-new",
            "added": [],
            "modified": [],
            "removed": [],
            "has_more": False,
            "loop_count": 1,
        },
        {
            "summary": {"added": 0, "modified": 0, "removed": 1},
            "next_cursor": "cursor-2-new",
            "added": [],
            "modified": [],
            "removed": [],
            "has_more": False,
            "loop_count": 1,
        },
    ])
    balances_mock = AsyncMock(return_value={"persisted": {"total": 1}})
    recurring_mock = AsyncMock(return_value={"persisted": {"total": 0}})
    liabilities_mock = AsyncMock(return_value={"persisted": {"total": 0}})
    investments_mock = AsyncMock(return_value={"success": True, "items": [], "errors": []})

    monkeypatch.setattr("app.services.plaid_sync.get_active_plaid_refresh_rows_for_user", AsyncMock(return_value=active_rows))
    monkeypatch.setattr("app.services.plaid_sync.sync_plaid_transactions_for_item", transactions_mock)
    monkeypatch.setattr("app.services.plaid_sync.sync_plaid_balances_for_item", balances_mock)
    monkeypatch.setattr("app.services.plaid_sync.sync_plaid_recurring_for_item", recurring_mock)
    monkeypatch.setattr("app.services.plaid_sync.sync_plaid_liabilities_for_item", liabilities_mock)
    monkeypatch.setattr("app.services.plaid_sync.sync_plaid_investments_for_user", investments_mock)

    result = await sync_plaid_refresh_for_user(db=db, user=user)

    assert result["success"] is True
    assert result["item_count"] == 2
    assert len(result["items"]) == 2
    assert transactions_mock.await_count == 2
    assert transactions_mock.await_args_list[0].kwargs["item_id"] == "item-1"
    assert transactions_mock.await_args_list[1].kwargs["item_id"] == "item-2"
    assert result["items"][0]["transactions"] == {
        "added": 2,
        "modified": 1,
        "removed": 0,
        "cursor_saved": True,
        "skipped_reason": None,
    }
    assert result["items"][1]["transactions"]["removed"] == 1
    assert any(step["sync_step"] == "transactions" for step in result["steps"])
    assert any(step["sync_step"] == "investments" for step in result["steps"])
    assert result["items"][0]["step_results"][0]["step"] == "transactions"
    assert result["items"][0]["step_results"][0]["success"] is True
    assert result["items"][0]["step_results"][1]["step"] == "balances"
    assert result["items"][0]["step_results"][1]["success"] is True


@pytest.mark.asyncio
async def test_sync_plaid_refresh_for_user_skips_legacy_item_id_rows(monkeypatch):
    user = SimpleNamespace(id=uuid4())
    db = SimpleNamespace()

    token_rows = [
        SimpleNamespace(
            item_id=None,
            institution_id="inst-legacy",
            cursor=None,
            available_products=["transactions"],
            billed_products=["transactions"],
            provider_token=SimpleNamespace(token_data={"access_token": "legacy-token"}),
        ),
        SimpleNamespace(
            item_id="item-1",
            institution_id="inst-1",
            cursor=None,
            available_products=["transactions"],
            billed_products=["transactions"],
            provider_token=SimpleNamespace(token_data={"access_token": "token-1"}),
        ),
    ]

    transactions_mock = AsyncMock(return_value={
        "summary": {"added": 1, "modified": 0, "removed": 0},
        "next_cursor": "cursor-new",
        "added": [],
        "modified": [],
        "removed": [],
        "has_more": False,
        "loop_count": 1,
    })
    balances_mock = AsyncMock(return_value={"persisted": {"total": 1}})
    recurring_mock = AsyncMock(return_value={"persisted": {"total": 0}})
    liabilities_mock = AsyncMock(return_value={"persisted": {"total": 0}})
    investments_mock = AsyncMock(return_value={"success": True, "items": [], "errors": []})

    monkeypatch.setattr("app.services.plaid_sync.get_active_plaid_refresh_rows_for_user", AsyncMock(return_value=token_rows))
    monkeypatch.setattr("app.services.plaid_sync.sync_plaid_transactions_for_item", transactions_mock)
    monkeypatch.setattr("app.services.plaid_sync.sync_plaid_balances_for_item", balances_mock)
    monkeypatch.setattr("app.services.plaid_sync.sync_plaid_recurring_for_item", recurring_mock)
    monkeypatch.setattr("app.services.plaid_sync.sync_plaid_liabilities_for_item", liabilities_mock)
    monkeypatch.setattr("app.services.plaid_sync.sync_plaid_investments_for_user", investments_mock)

    result = await sync_plaid_refresh_for_user(db=db, user=user)

    assert result["success"] is True
    assert result["item_count"] == 2
    assert len(result["items"]) == 2
    assert transactions_mock.await_count == 1
    assert transactions_mock.await_args_list[0].kwargs["item_id"] == "item-1"
    assert result["items"][0]["transactions"]["skipped_reason"] == "legacy_item_id_missing"
    assert result["items"][1]["transactions"]["cursor_saved"] is True


@pytest.mark.asyncio
async def test_upsert_holdings_logs_warning_when_account_mapping_missing(monkeypatch):
    db = SimpleNamespace(flush=AsyncMock())
    holdings = [
        {
            "account_id": "plaid-account-1",
            "security_id": "sec-1",
            "quantity": 1,
            "institution_price": 10,
            "institution_value": 10,
        }
    ]

    warning_mock = MagicMock()
    monkeypatch.setattr("app.services.plaid_persist.logger.warning", warning_mock)

    count = await upsert_holdings(
        db=db,
        user_id=uuid4(),
        account_map={},
        holdings=holdings,
        security_map={},
        securities_data_map={},
        item_id="item-1",
    )

    assert count == 0
    warning_mock.assert_called_once()
    assert warning_mock.call_args.kwargs["item_id"] == "item-1"
    assert warning_mock.call_args.kwargs["plaid_account_id"] == "plaid-account-1"


@pytest.mark.asyncio
async def test_sync_plaid_step_for_user_keeps_previous_item_work_on_later_failure(monkeypatch):
    user = SimpleNamespace(id=uuid4())
    rows = [
        SimpleNamespace(item_id="item-1", institution_id="inst-1", provider="plaid", token_data={"access_token": "token-1"}),
        SimpleNamespace(item_id="item-2", institution_id="inst-2", provider="plaid", token_data={"access_token": "token-2"}),
    ]
    db = SimpleNamespace(rollback=AsyncMock(), persisted_item_ids=[])

    async def fake_sync_fn(**kwargs):
        item_id = kwargs["item_id"]
        if item_id == "item-1":
            db.persisted_item_ids.append(item_id)
            return {"summary": {"added": 1, "modified": 0, "removed": 0}}
        raise RuntimeError("later item failed")

    monkeypatch.setattr(
        "app.services.plaid_sync.get_plaid_token_rows_for_user",
        AsyncMock(return_value=rows),
    )

    result = await sync_plaid_step_for_user(db=db, user=user, sync_name="balances", sync_fn=fake_sync_fn)

    assert result["success"] is False
    assert db.rollback.await_count == 1
    assert db.persisted_item_ids == ["item-1"]
    assert result["items"][0]["success"] is True
    assert result["items"][1]["success"] is False


@pytest.mark.asyncio
async def test_plaid_link_token_requests_expected_products(monkeypatch):
    adapter = PlaidAdapter()
    captured = {}

    def fake_link_token_create(request):
        captured["request"] = request
        return SimpleNamespace(link_token="link-sandbox-token")

    monkeypatch.setattr(adapter.plaid_client, "link_token_create", fake_link_token_create)

    token = await adapter.create_link_token(user_id="user-1")

    assert token == "link-sandbox-token"
    request = captured["request"]
    products = {getattr(product, "value", str(product)) for product in request.products}
    assert {"transactions", "investments"}.issubset(products)
    assert getattr(request, "account_filters", None) is None


@pytest.mark.asyncio
async def test_get_balances_falls_back_to_accounts_get_when_balance_product_is_unavailable(monkeypatch):
    adapter = PlaidAdapter()

    class _PlaidBalanceError(Exception):
        def __init__(self):
            super().__init__("balance product unavailable")
            self.body = (
                '{"error_type":"INVALID_INPUT","error_code":"INVALID_PRODUCT",'
                '"error_message":"client is not authorized to access the following products: [\\"balance\\"]"}'
            )

    class _FakeBalances:
        available = 25.5
        current = 100.0
        limit = None
        iso_currency_code = "USD"

    class _FakeAccount:
        account_id = "acc-1"
        name = "Checking"
        type = "depository"
        subtype = "checking"
        mask = "1234"
        balances = _FakeBalances()

    class _FakeResponse:
        accounts = [_FakeAccount()]

    def fake_balance_get(request):
        raise _PlaidBalanceError()

    def fake_accounts_get(request):
        return _FakeResponse()

    monkeypatch.setattr(adapter.plaid_client, "accounts_balance_get", fake_balance_get)
    monkeypatch.setattr(adapter.plaid_client, "accounts_get", fake_accounts_get)

    balances = await adapter.get_balances("access-token")

    assert len(balances) == 1
    assert balances[0]["account_id"] == "acc-1"
    assert balances[0]["current"] == 100.0
    assert balances[0]["available"] == 25.5
    assert balances[0]["currency"] == "USD"


@pytest.mark.asyncio
async def test_sync_plaid_balances_for_item_persists_balance_columns(monkeypatch):
    user = SimpleNamespace(id=uuid4())
    account_row = SimpleNamespace(
        id=uuid4(),
        user_id=user.id,
        provider="plaid",
        provider_account_id="acc-1",
        name=None,
        account_type="depository",
        subtype="checking",
        mask=None,
        item_id=None,
        balance_available=None,
        balance_current=None,
        balance_limit=None,
        balance_currency=None,
        last_synced_at=None,
        error_message=None,
    )

    class _FakeResult:
        def scalar_one_or_none(self):
            return account_row

    class _FakeDB:
        def __init__(self):
            self.commit = AsyncMock()
            self.flush = AsyncMock()
            self.execute = AsyncMock(return_value=_FakeResult())

    class _FakeAdapter:
        async def get_balances(self, access_token, account_ids=None):
            return [
                {
                    "account_id": "acc-1",
                    "name": "Checking",
                    "type": "depository",
                    "subtype": "checking",
                    "mask": "1234",
                    "balances": {"available": 25.5, "current": 100.0, "limit": None, "iso_currency_code": "USD"},
                    "available": 25.5,
                    "current": 100.0,
                    "limit": None,
                    "currency": "USD",
                }
            ]

    class _FakeNormService:
        def __init__(self, db):
            self.db = db

        async def normalize_provider_data(self, **kwargs):
            return [], []

    monkeypatch.setattr("app.services.plaid_sync.NormalizationService", _FakeNormService)
    monkeypatch.setattr("app.services.plaid_sync.upsert_plaid_cash_holding", AsyncMock(return_value=False))

    db = _FakeDB()
    result = await sync_plaid_balances_for_item(
        db=db,
        user=user,
        item_id="item-1",
        access_token="access-token",
        adapter=_FakeAdapter(),
    )

    assert result["errors"] == []
    assert result["synced"][0]["balance_current"] == 100.0
    assert result["synced"][0]["balance_available"] == 25.5
    assert account_row.balance_current == 100.0
    assert account_row.balance_available == 25.5
    assert account_row.balance_currency == "USD"
    assert account_row.item_id == "item-1"
    assert account_row.last_synced_at is not None
    assert account_row.error_message is None
    db.commit.assert_awaited_once()
