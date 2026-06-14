from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from app.controllers.webhooks import _handle_plaid_webhook


class _FakeResult:
    def __init__(self, row):
        self._row = row

    def scalar_one_or_none(self):
        return self._row


class _FakeRequest:
    def __init__(self, payload):
        self._payload = payload

    async def json(self):
        return self._payload


@pytest.mark.asyncio
async def test_plaid_webhook_sync_updates_available_marks_flag(monkeypatch):
    token_row = SimpleNamespace(
        user_id="user-1",
        item_id="item-1",
        token_data={"access_token": "access-token"},
        available_products=["transactions"],
        billed_products=["transactions"],
    )
    db = SimpleNamespace(
        execute=AsyncMock(return_value=_FakeResult(token_row)),
        commit=AsyncMock(),
        rollback=AsyncMock(),
    )
    adapter = SimpleNamespace(
        get_item_status=AsyncMock(return_value={"institution_id": "inst-1"}),
    )
    upsert_status_mock = AsyncMock(return_value=True)

    monkeypatch.setattr("app.controllers.webhooks.PlaidAdapter", lambda: adapter)
    monkeypatch.setattr("app.controllers.webhooks.plaid_persist.upsert_item_status", upsert_status_mock)

    result = await _handle_plaid_webhook(
        request=_FakeRequest(
            {
                "webhook_type": "TRANSACTIONS",
                "webhook_code": "SYNC_UPDATES_AVAILABLE",
                "item_id": "item-1",
            }
        ),
        db=db,
    )

    assert result["success"] is True
    assert result["status"] == "synced"
    assert result["message"] == "Transaction updates marked available."
    assert result["sync_triggered"] is False
    assert result["transactions_update_available"] is True
    assert result["status_refreshed"] is True
    db.commit.assert_awaited()


@pytest.mark.asyncio
async def test_plaid_webhook_skips_transaction_sync_for_investment_only_item(monkeypatch):
    token_row = SimpleNamespace(
        user_id="user-1",
        item_id="item-1",
        token_data={"access_token": "access-token"},
        available_products=["investments"],
        billed_products=["investments"],
    )
    db = SimpleNamespace(
        execute=AsyncMock(return_value=_FakeResult(token_row)),
        commit=AsyncMock(),
        rollback=AsyncMock(),
    )
    adapter = SimpleNamespace(
        get_item_status=AsyncMock(return_value={"institution_id": "inst-1"}),
    )
    monkeypatch.setattr("app.controllers.webhooks.PlaidAdapter", lambda: adapter)
    monkeypatch.setattr("app.controllers.webhooks.plaid_persist.upsert_item_status", AsyncMock(return_value=True))

    result = await _handle_plaid_webhook(
        request=_FakeRequest(
            {
                "webhook_type": "TRANSACTIONS",
                "webhook_code": "SYNC_UPDATES_AVAILABLE",
                "item_id": "item-1",
            }
        ),
        db=db,
    )

    assert result["success"] is True
    assert result["status"] == "skipped"
    assert result["message"] == "Webhook received but transaction sync is not supported for this item."
    assert result["sync_triggered"] is False
    assert result["reason"] == "investment_only"
