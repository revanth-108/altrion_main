from decimal import Decimal
from types import SimpleNamespace
from uuid import uuid4

from fastapi.testclient import TestClient

from app.core.auth import get_current_user as get_authenticated_user
from app.core.database import get_db
from app.main import app


class _FakeExecuteResult:
    def __init__(self, scalar_one_or_none=None, all_rows=None):
        self._scalar_one_or_none = scalar_one_or_none
        self._all_rows = list(all_rows or [])

    def scalar_one_or_none(self):
        return self._scalar_one_or_none

    def scalars(self):
        return self

    def all(self):
        return self._all_rows


class _FakeDbSession:
    def __init__(self, execute_results):
        self._execute_results = list(execute_results)

    async def execute(self, _stmt):
        return self._execute_results.pop(0)

    async def commit(self):
        return None

    async def rollback(self):
        return None

    async def close(self):
        return None


def _make_user():
    return SimpleNamespace(
        id=uuid4(),
        supabase_user_id="supabase-user-id",
        email="test@example.com",
        name="Test User",
    )


def _make_portfolio_payload():
    asset = SimpleNamespace(
        symbol="USD",
        name="US Dollar",
        quantity=Decimal("1000"),
        value_usd=Decimal("1000"),
        price_usd=Decimal("1"),
        change_24h=None,
        asset_class="cash_equivalent",
        sources=[],
    )
    return {
        "assets": [asset],
        "total_value": Decimal("1000"),
        "categories": {
            "crypto": Decimal("0"),
            "equity": Decimal("0"),
            "cash_equivalent": Decimal("1000"),
        },
        "warnings": [],
    }


def _override_auth():
    return {"user_id": "supabase-user-id"}


def _make_override_db(user):
    async def _override_db():
        yield _FakeDbSession(
            [
                _FakeExecuteResult(scalar_one_or_none=user),
                _FakeExecuteResult(all_rows=[]),
            ]
        )

    return _override_db


def _assert_compatibility_fields(body, *, change_24h, change_24h_pct, change_24h_value):
    assert "change_24h" in body
    assert "change_24h_pct" in body
    assert "change_24h_value" in body
    assert body["change_24h"] == change_24h
    assert body["change_24h_pct"] == change_24h_pct
    assert body["change_24h_value"] == change_24h_value


def _run_portfolio_request(monkeypatch, display_change):
    user = _make_user()
    portfolio_payload = _make_portfolio_payload()
    call_order: list[str] = []
    save_calls: list[dict] = []

    async def _aggregate_portfolio(self, user_ids):
        call_order.append("aggregate")
        assert str(user.id) in user_ids
        assert str(user.supabase_user_id) in user_ids
        return portfolio_payload

    async def _compute_display_change(self, user_id, current_total_value):
        call_order.append("compute")
        assert user_id == user.id
        assert current_total_value == portfolio_payload["total_value"]
        return display_change

    async def _save_snapshot(self, user_id, total_value, categories=None):
        call_order.append("save")
        save_calls.append(
            {
                "user_id": user_id,
                "total_value": total_value,
                "categories": categories,
            }
        )

    monkeypatch.setattr("app.controllers.portfolio.AggregationService.aggregate_portfolio", _aggregate_portfolio)
    monkeypatch.setattr("app.controllers.portfolio.PortfolioValuationHistoryService.compute_display_change", _compute_display_change)
    monkeypatch.setattr("app.controllers.portfolio.PortfolioValuationHistoryService.save_snapshot", _save_snapshot)

    previous_overrides = dict(app.dependency_overrides)
    app.dependency_overrides[get_authenticated_user] = _override_auth
    app.dependency_overrides[get_db] = _make_override_db(user)

    try:
        with TestClient(app) as client:
            response = client.get("/api/portfolio")
    finally:
        app.dependency_overrides = previous_overrides

    assert save_calls == [
        {
            "user_id": user.id,
            "total_value": portfolio_payload["total_value"],
            "categories": portfolio_payload["categories"],
        }
    ]
    assert call_order == ["aggregate", "compute", "save"]
    return response


def test_get_portfolio_tracking_started_response(monkeypatch):
    response = _run_portfolio_request(
        monkeypatch,
        {
            "change_type": "tracking_started",
            "change_value": None,
            "change_pct": None,
            "change_since_last_value": None,
            "change_since_last_pct": None,
            "change_24h_value": None,
            "change_24h_pct": None,
        },
    )

    assert response.status_code == 200
    body = response.json()

    assert body["change_type"] == "tracking_started"
    assert body["change_value"] is None
    assert body["change_pct"] is None
    assert body["change_since_last_value"] is None
    assert body["change_since_last_pct"] is None
    _assert_compatibility_fields(body, change_24h=None, change_24h_pct=None, change_24h_value=None)


def test_get_portfolio_since_last_response(monkeypatch):
    response = _run_portfolio_request(
        monkeypatch,
        {
            "change_type": "since_last",
            "change_value": 25.0,
            "change_pct": 2.5,
            "change_since_last_value": 25.0,
            "change_since_last_pct": 2.5,
            "change_24h_value": None,
            "change_24h_pct": None,
        },
    )

    assert response.status_code == 200
    body = response.json()

    assert body["change_type"] == "since_last"
    assert body["change_value"] == 25.0
    assert body["change_pct"] == 2.5
    assert body["change_since_last_value"] == 25.0
    assert body["change_since_last_pct"] == 2.5
    _assert_compatibility_fields(body, change_24h=2.5, change_24h_pct=None, change_24h_value=None)


def test_get_portfolio_24h_response(monkeypatch):
    response = _run_portfolio_request(
        monkeypatch,
        {
            "change_type": "24h",
            "change_value": 100.0,
            "change_pct": 10.0,
            "change_since_last_value": None,
            "change_since_last_pct": None,
            "change_24h_value": 100.0,
            "change_24h_pct": 10.0,
        },
    )

    assert response.status_code == 200
    body = response.json()

    assert body["change_type"] == "24h"
    assert body["change_value"] == 100.0
    assert body["change_pct"] == 10.0
    assert body["change_since_last_value"] is None
    assert body["change_since_last_pct"] is None
    _assert_compatibility_fields(body, change_24h=10.0, change_24h_pct=10.0, change_24h_value=100.0)


def test_get_portfolio_zero_change_returns_zero_not_null(monkeypatch):
    response = _run_portfolio_request(
        monkeypatch,
        {
            "change_type": "24h",
            "change_value": 0.0,
            "change_pct": 0.0,
            "change_since_last_value": None,
            "change_since_last_pct": None,
            "change_24h_value": 0.0,
            "change_24h_pct": 0.0,
        },
    )

    assert response.status_code == 200
    body = response.json()

    assert body["change_type"] == "24h"
    assert body["change_value"] == 0.0
    assert body["change_pct"] == 0.0
    _assert_compatibility_fields(body, change_24h=0.0, change_24h_pct=0.0, change_24h_value=0.0)


def test_get_portfolio_negative_change_returns_negative_percentage(monkeypatch):
    response = _run_portfolio_request(
        monkeypatch,
        {
            "change_type": "since_last",
            "change_value": -75.0,
            "change_pct": -7.5,
            "change_since_last_value": -75.0,
            "change_since_last_pct": -7.5,
            "change_24h_value": None,
            "change_24h_pct": None,
        },
    )

    assert response.status_code == 200
    body = response.json()

    assert body["change_type"] == "since_last"
    assert body["change_value"] == -75.0
    assert body["change_pct"] == -7.5
    assert body["change_since_last_value"] == -75.0
    assert body["change_since_last_pct"] == -7.5
    _assert_compatibility_fields(body, change_24h=-7.5, change_24h_pct=None, change_24h_value=None)
