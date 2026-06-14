import asyncio
from decimal import Decimal
from datetime import datetime, timezone
from types import SimpleNamespace
from uuid import uuid4
from unittest.mock import AsyncMock

from app.services.portfolio_snapshot import build_account_signature, build_allocation_rows
from app.services.portfolio_snapshot import PortfolioSnapshotService


def test_build_allocation_rows_rounds_to_hundred_and_safely_hides_tiny_values():
    rows = build_allocation_rows(
        {
            "cash_equivalent": Decimal("3263.92"),
            "equity": Decimal("0.25"),
            "crypto": Decimal("996.49"),
        },
        Decimal("4260.66"),
    )

    assert round(sum(row["percent"] for row in rows), 1) == 100.0
    assert rows[0]["label"] == "Cash"
    assert rows[0]["percent"] == 76.6
    assert rows[1]["label"] == "Crypto"
    assert rows[1]["percent"] == 23.4
    assert rows[2]["label"] == "Stocks"
    assert rows[2]["percent"] == 0.0


def test_build_account_signature_changes_when_account_set_changes():
    signature_a = build_account_signature(["account-1", "account-2"])
    signature_b = build_account_signature(["account-1", "account-3"])

    assert signature_a != signature_b


class _FakeExecuteResult:
    def __init__(self, all_rows=None):
        self._all_rows = list(all_rows or [])

    def scalars(self):
        return self

    def all(self):
        return self._all_rows


class _FakeDbSession:
    def __init__(self, execute_results):
        self._execute_results = list(execute_results)

    async def execute(self, _stmt):
        return self._execute_results.pop(0)


def test_build_user_snapshot_accepts_dict_account_rows():
    db = _FakeDbSession(
        [
            _FakeExecuteResult(
                [
                    {
                        "id": uuid4(),
                        "name": "Checking",
                        "provider": "plaid",
                        "last_synced_at": datetime(2026, 6, 12, 10, 0, tzinfo=timezone.utc),
                        "error_message": None,
                    },
                    {
                        "id": uuid4(),
                        "name": "Brokerage",
                        "provider": "plaid",
                        "last_synced_at": None,
                        "error_message": "sync failed",
                    },
                ]
            )
        ]
    )
    service = PortfolioSnapshotService(db)
    service.aggregation_service = SimpleNamespace(
        aggregate_portfolio=AsyncMock(
            return_value={
                "assets": [],
                "total_value": Decimal("100"),
                "categories": {
                    "cash_equivalent": Decimal("100"),
                    "equity": Decimal("0"),
                    "crypto": Decimal("0"),
                },
            }
        )
    )

    snapshot = asyncio.run(service.build_user_snapshot(uuid4(), "supabase-user-id"))

    assert snapshot["sync"]["status"] == "partial"
    assert len(snapshot["sync"]["accounts_included"]) == 1
    assert len(snapshot["sync"]["failed_accounts"]) == 1
    assert snapshot["sync"]["accounts_included"][0]["account_name"] == "Checking"
    assert snapshot["sync"]["failed_accounts"][0]["error_message"] == "sync failed"
    assert snapshot["snapshot_metadata"]["included_account_ids"]
    assert snapshot["snapshot_metadata"]["failed_account_ids"]
