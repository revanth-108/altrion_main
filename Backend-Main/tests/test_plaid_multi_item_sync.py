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

    async def fake_sync_fn(**kwargs):
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


@pytest.mark.asyncio
async def test_sync_plaid_refresh_for_user_aggregates_steps(monkeypatch):
    user = SimpleNamespace(id=uuid4())
    db = SimpleNamespace()

    async def fake_sync_step_for_user(*, sync_name, **kwargs):
        if sync_name == "balances":
            return {
                "success": True,
                "item_count": 2,
                "items": [{"item_id": "item-1", "success": True, "result": {"synced": [1, 2]}}],
                "errors": [],
            }
        if sync_name == "transactions":
            return {
                "success": False,
                "item_count": 2,
                "items": [{"item_id": "item-2", "success": False, "error": "boom"}],
                "errors": [{"item_id": "item-2", "sync_step": "transactions", "error": "boom"}],
            }
        return {
            "success": True,
            "item_count": 2,
            "items": [],
            "errors": [],
        }

    async def fake_investments(**kwargs):
        return {
            "success": True,
            "items": [{"item_id": "item-1", "success": True}],
            "errors": [],
        }

    monkeypatch.setattr("app.services.plaid_sync.sync_plaid_step_for_user", fake_sync_step_for_user)
    monkeypatch.setattr("app.services.plaid_sync.sync_plaid_investments_for_user", fake_investments)

    result = await sync_plaid_refresh_for_user(db=db, user=user)

    assert result["success"] is False
    assert len(result["steps"]) == 5
    assert result["item_count"] == 2
    assert any(step["sync_step"] == "transactions" for step in result["steps"])
    assert any(error["sync_step"] == "transactions" for error in result["errors"])


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
