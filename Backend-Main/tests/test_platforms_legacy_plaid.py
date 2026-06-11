from types import SimpleNamespace
from uuid import uuid4
from unittest.mock import AsyncMock

import pytest
from fastapi import HTTPException

from app.controllers.platforms import connect_platform
from app.schemas.platform import ConnectionRequest


class _FakeUserResult:
    def __init__(self, user):
        self._user = user

    def scalar_one_or_none(self):
        return self._user


@pytest.mark.asyncio
async def test_legacy_plaid_connect_route_logs_structured_context(monkeypatch):
    user = SimpleNamespace(id=uuid4(), supabase_user_id="supabase-user-1")
    db = SimpleNamespace(
        execute=AsyncMock(return_value=_FakeUserResult(user)),
        commit=AsyncMock(),
        rollback=AsyncMock(),
    )
    fake_adapter = SimpleNamespace(
        authenticate=AsyncMock(return_value={"access_token": "token-123", "item_id": "item-123"}),
        fetch_accounts=AsyncMock(),
    )
    logged = []

    monkeypatch.setattr("app.controllers.platforms.PlaidAdapter", lambda: fake_adapter)
    monkeypatch.setattr("app.controllers.platforms.store_encrypted_token", AsyncMock())
    monkeypatch.setattr("app.controllers.platforms.should_persist_user_data", lambda _user: False)
    monkeypatch.setattr(
        "app.controllers.platforms.logger.warning",
        lambda event, **kwargs: logged.append((event, kwargs)),
    )

    with pytest.raises(HTTPException) as exc_info:
        await connect_platform(
            platform_id="plaid",
            request=ConnectionRequest(credentials={}),
            current_user={"user_id": "supabase-user-1"},
            db=db,
        )

    assert exc_info.value.status_code == 410
    assert "Legacy Plaid connect route removed" in str(exc_info.value.detail)
    assert logged
    event, payload = logged[0]
    assert event == "legacy_plaid_connect_route_used"
    assert payload["route"] == "/platforms/plaid/connect"
    assert payload["user_id"] == "supabase-user-1"
    assert "timestamp" in payload
    assert "caller" in payload
