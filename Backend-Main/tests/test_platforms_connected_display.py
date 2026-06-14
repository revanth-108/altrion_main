from datetime import datetime, timezone, timedelta
from types import SimpleNamespace

from app.controllers.platforms import _filter_accounts_for_display, _should_replace_display_account


def _account(*, provider_account_id: str, item_id: str | None, updated_at: datetime, created_at: datetime):
    return SimpleNamespace(
        provider="plaid",
        provider_account_id=provider_account_id,
        item_id=item_id,
        updated_at=updated_at,
        created_at=created_at,
    )


def test_should_replace_display_account_prefers_item_scoped_row():
    legacy = _account(
        provider_account_id="robinhood-acc-1",
        item_id=None,
        updated_at=datetime(2026, 1, 1, tzinfo=timezone.utc),
        created_at=datetime(2026, 1, 1, tzinfo=timezone.utc),
    )
    canonical = _account(
        provider_account_id="robinhood-acc-1",
        item_id="item-robinhood-a",
        updated_at=datetime(2025, 12, 31, tzinfo=timezone.utc),
        created_at=datetime(2025, 12, 31, tzinfo=timezone.utc),
    )

    assert _should_replace_display_account(canonical, legacy) is True
    assert _should_replace_display_account(legacy, canonical) is False


def test_filter_accounts_for_display_keeps_latest_item_per_institution():
    older = _account(
        provider_account_id="acc-a",
        item_id="item-a",
        updated_at=datetime(2026, 1, 1, tzinfo=timezone.utc),
        created_at=datetime(2026, 1, 1, tzinfo=timezone.utc),
    )
    newer = _account(
        provider_account_id="acc-b",
        item_id="item-b",
        updated_at=datetime(2026, 1, 2, tzinfo=timezone.utc),
        created_at=datetime(2026, 1, 2, tzinfo=timezone.utc),
    )
    older.institution_id = "inst-robinhood"
    newer.institution_id = "inst-robinhood"

    filtered = _filter_accounts_for_display([newer, older])

    assert [row.item_id for row in filtered] == ["item-b"]
