from decimal import Decimal
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from uuid import uuid4

import pytest

from app.services.health_score import compute_portfolio_health
from app.services.portfolio_classification import classify_holding
from app.services.portfolio_valuation_history import (
    PortfolioValuationHistoryService,
    calculate_24h_change,
)


class _FakeScalarResult:
    def __init__(self, value):
        self._value = value

    def scalar_one_or_none(self):
        return self._value


class _FakeSnapshotResult:
    def __init__(self, snapshots):
        self._snapshots = snapshots

    def scalars(self):
        return self

    def all(self):
        return self._snapshots


class _FakeSession:
    def __init__(self, execute_results):
        self.execute_results = list(execute_results)
        self.added = []
        self.commits = 0
        self.rollbacks = 0

    async def execute(self, _stmt):
        return self.execute_results.pop(0)

    def add(self, value):
        self.added.append(value)

    async def commit(self):
        self.commits += 1

    async def rollback(self):
        self.rollbacks += 1


def test_calculate_24h_change_returns_zero_for_actual_zero_change():
    result = calculate_24h_change(Decimal("100.00"), Decimal("100.00"))

    assert result["change_24h_pct"] == 0
    assert result["change_24h_value"] == 0


def test_calculate_24h_change_returns_null_for_zero_baseline():
    result = calculate_24h_change(Decimal("100.00"), Decimal("0"))

    assert result["change_24h_pct"] is None
    assert result["change_24h_value"] is None


def test_calculate_24h_change_returns_nonzero_real_delta():
    result = calculate_24h_change(Decimal("125.00"), Decimal("100.00"))

    assert result["change_24h_pct"] == 25
    assert result["change_24h_value"] == 25


@pytest.mark.asyncio
async def test_compute_display_change_returns_tracking_started_for_first_snapshot():
    service = PortfolioValuationHistoryService(
        _FakeSession([
            _FakeSnapshotResult([]),
            _FakeScalarResult(None),
        ])
    )

    result = await service.compute_display_change(uuid4(), Decimal("125.00"))

    assert result["change_type"] == "tracking_started"
    assert result["change_pct"] is None
    assert result["change_value"] is None


@pytest.mark.asyncio
async def test_compute_display_change_returns_since_last_when_previous_snapshot_exists():
    service = PortfolioValuationHistoryService(
        _FakeSession([
            _FakeSnapshotResult([]),
            _FakeScalarResult(SimpleNamespace(total_value=Decimal("100.00"))),
        ])
    )

    result = await service.compute_display_change(uuid4(), Decimal("125.00"))

    assert result["change_type"] == "since_last"
    assert result["change_pct"] == 25
    assert result["change_value"] == 25
    assert result["change_since_last_pct"] == 25


@pytest.mark.asyncio
async def test_compute_display_change_returns_24h_when_baseline_exists():
    target = datetime.now(tz=timezone.utc) - timedelta(hours=24)
    service = PortfolioValuationHistoryService(
        _FakeSession(
            [
                _FakeSnapshotResult(
                    [
                        SimpleNamespace(total_value=Decimal("100.00"), computed_at=target),
                    ]
                )
            ]
        )
    )

    result = await service.compute_display_change(uuid4(), Decimal("125.00"))

    assert result["change_type"] == "24h"
    assert result["change_pct"] == 25
    assert result["change_value"] == 25
    assert result["change_24h_pct"] == 25


@pytest.mark.asyncio
async def test_save_snapshot_persists_when_recent_snapshot_does_not_exist():
    session = _FakeSession([_FakeScalarResult(None)])
    service = PortfolioValuationHistoryService(session)

    await service.save_snapshot(uuid4(), Decimal("93.50"), categories={"cash_equivalent": Decimal("93.50")})

    assert len(session.added) == 1
    assert session.commits == 1
    assert session.rollbacks == 0


def test_classify_holding_normalizes_legacy_plaid_cash_usdc_to_usd():
    holding = SimpleNamespace(
        canonical_symbol="USDC",
        asset_class="cash_equivalent",
        source="plaid",
        security_id=None,
    )

    classified = classify_holding(holding)

    assert classified.normalized_symbol == "USD"
    assert classified.bucket == "cash"
    assert classified.effective_asset_class == "cash_equivalent"
    assert classified.is_legacy_plaid_cash is True


def test_health_score_treats_stablecoin_consistently_as_liquid_not_crypto():
    health = compute_portfolio_health(
        assets=[
            {
                "symbol": "USDC",
                "asset_class": "cash_equivalent",
                "value_usd": 1000,
                "change_24h": 0,
                "sources": [],
            }
        ],
        categories={
            "crypto": Decimal("0"),
            "equity": Decimal("0"),
            "cash_equivalent": Decimal("1000"),
        },
        total_value=1000,
    )

    assert health["dimension_scores"]["d4_crypto"] is None
    assert health["breakdown"]["d1"]["stablecoin_quality_score"] == 100.0
