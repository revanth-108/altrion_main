from datetime import datetime, timezone
from decimal import Decimal
from types import SimpleNamespace
from uuid import uuid4
from unittest.mock import AsyncMock

import pytest

from app.services.aggregation import AggregationService, _filter_holdings_for_aggregation


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
async def test_filter_holdings_for_aggregation_excludes_inactive_plaid_items():
    old_account = SimpleNamespace(
        id=uuid4(),
        provider="plaid",
        item_id="item-a",
        institution_id="inst-robinhood",
        is_active=False,
        updated_at=datetime(2026, 1, 1, tzinfo=timezone.utc),
        created_at=datetime(2026, 1, 1, tzinfo=timezone.utc),
    )
    new_account = SimpleNamespace(
        id=uuid4(),
        provider="plaid",
        item_id="item-b",
        institution_id="inst-robinhood",
        is_active=True,
        updated_at=datetime(2026, 1, 2, tzinfo=timezone.utc),
        created_at=datetime(2026, 1, 2, tzinfo=timezone.utc),
    )
    holdings = [
        SimpleNamespace(account_id=old_account.id, canonical_symbol="USD", asset_class="cash_equivalent", quantity=Decimal("982.98"), source="plaid"),
        SimpleNamespace(account_id=new_account.id, canonical_symbol="USD", asset_class="cash_equivalent", quantity=Decimal("982.98"), source="plaid"),
    ]
    filtered = _filter_holdings_for_aggregation(holdings, {old_account.id: old_account, new_account.id: new_account})

    assert [holding.account_id for holding in filtered] == [new_account.id]


@pytest.mark.asyncio
async def test_aggregate_portfolio_ignores_holdings_from_inactive_accounts(monkeypatch):
    user_id = uuid4()
    old_account = SimpleNamespace(
        id=uuid4(),
        provider="plaid",
        item_id="item-a",
        institution_id="inst-robinhood",
        is_active=False,
        updated_at=datetime(2026, 1, 1, tzinfo=timezone.utc),
        created_at=datetime(2026, 1, 1, tzinfo=timezone.utc),
        name="Robinhood Brokerage",
        account_type="investment",
        subtype="brokerage",
    )
    new_account = SimpleNamespace(
        id=uuid4(),
        provider="plaid",
        item_id="item-b",
        institution_id="inst-robinhood",
        is_active=True,
        updated_at=datetime(2026, 1, 2, tzinfo=timezone.utc),
        created_at=datetime(2026, 1, 2, tzinfo=timezone.utc),
        name="Robinhood Brokerage",
        account_type="investment",
        subtype="brokerage",
    )
    old_holding = SimpleNamespace(
        account_id=old_account.id,
        canonical_symbol="USD",
        asset_class="cash_equivalent",
        quantity=Decimal("982.98"),
        security_id=None,
        source="plaid",
        institution_value=None,
    )
    new_holding = SimpleNamespace(
        account_id=new_account.id,
        canonical_symbol="USD",
        asset_class="cash_equivalent",
        quantity=Decimal("982.98"),
        security_id=None,
        source="plaid",
        institution_value=None,
    )

    db = SimpleNamespace(
        execute=AsyncMock(
            side_effect=[
                _FakeResult([old_holding, new_holding]),  # holdings query
                _FakeResult([old_account, new_account]),  # accounts query
                _FakeResult([]),  # securities
                _FakeResult([]),  # asset metadata
            ]
        )
    )

    service = AggregationService(db)
    monkeypatch.setattr(service.pricing_service, "get_prices_batch", AsyncMock(return_value={"USD": Decimal("1")}))

    result = await service.aggregate_portfolio([str(user_id)])

    assert result["total_value"] == Decimal("982.98")
    assert len(result["assets"]) == 1
    assert result["assets"][0].value_usd == Decimal("982.98")
    assert len(result["assets"][0].sources) == 1
    assert result["assets"][0].sources[0].account_id == str(new_account.id)


@pytest.mark.asyncio
async def test_aggregate_portfolio_dedupes_plaid_depository_cash_rows(monkeypatch):
    user_id = uuid4()
    cash_account = SimpleNamespace(
        id=uuid4(),
        provider="plaid",
        item_id="item-checking",
        institution_id="inst-checking",
        is_active=True,
        updated_at=datetime(2026, 1, 2, tzinfo=timezone.utc),
        created_at=datetime(2026, 1, 2, tzinfo=timezone.utc),
        name="Checking Account",
        account_type="depository",
        subtype="checking",
    )
    holdings = [
        SimpleNamespace(
            account_id=cash_account.id,
            canonical_symbol="USD",
            asset_class="cash_equivalent",
            quantity=Decimal("2266.02"),
            security_id=None,
            source="plaid",
            institution_value=Decimal("2266.02"),
        ),
        SimpleNamespace(
            account_id=cash_account.id,
            canonical_symbol="USDC",
            asset_class="cash_equivalent",
            quantity=Decimal("2266.02"),
            security_id=None,
            source="plaid",
            institution_value=None,
        ),
    ]

    db = SimpleNamespace(
        execute=AsyncMock(
            side_effect=[
                _FakeResult(holdings),   # holdings query
                _FakeResult([cash_account]),  # accounts query
                _FakeResult([]),  # securities
                _FakeResult([]),  # asset metadata
            ]
        )
    )

    service = AggregationService(db)
    monkeypatch.setattr(service.pricing_service, "get_prices_batch", AsyncMock(return_value={"USD": Decimal("1")}))

    result = await service.aggregate_portfolio([str(user_id)])

    assert result["total_value"] == Decimal("2266.02")
    assert len(result["assets"]) == 1
    assert result["assets"][0].symbol == "USD"
    assert result["assets"][0].value_usd == Decimal("2266.02")
    assert len(result["assets"][0].sources) == 1
    assert result["assets"][0].sources[0].account_id == str(cash_account.id)
