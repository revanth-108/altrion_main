"""
Canonical portfolio snapshot helpers.

This module centralizes the dashboard-facing snapshot so summary cards,
allocation insights, sync metadata, and change history can be derived from
the same filtered portfolio state.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from decimal import Decimal, ROUND_HALF_UP
from hashlib import sha256
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.logging import get_logger
from app.models.account import Account
from app.services.aggregation import AggregationService

logger = get_logger()

_ALLOCATION_PLACES = Decimal("0.1")
_STALE_HOURS = 24


@dataclass(frozen=True)
class PortfolioSyncAccountInfo:
    account_id: str
    account_name: str | None
    provider: str
    last_synced_at: str | None
    status: str
    error_message: str | None


def _decimal(value: Any) -> Decimal:
    if isinstance(value, Decimal):
        return value
    if value is None:
        return Decimal("0")
    return Decimal(str(value))


def _quantize_percent(value: Decimal) -> Decimal:
    return value.quantize(_ALLOCATION_PLACES, rounding=ROUND_HALF_UP)


def _get_value(obj: Any, key: str, default=None):
    if isinstance(obj, dict):
        return obj.get(key, default)
    mapping = getattr(obj, "_mapping", None)
    if mapping is not None:
        try:
            return mapping.get(key, default)
        except Exception:
            pass
    return getattr(obj, key, default)


def build_allocation_rows(categories: dict[str, Any], total_value: Any) -> list[dict[str, Any]]:
    total = _decimal(total_value)
    if total <= 0:
        return [
            {"label": "Cash", "value_usd": Decimal("0"), "percent": 0.0},
            {"label": "Stocks", "value_usd": Decimal("0"), "percent": 0.0},
            {"label": "Crypto", "value_usd": Decimal("0"), "percent": 0.0},
        ]

    raw_rows = [
        ("Cash", _decimal(categories.get("cash_equivalent"))),
        ("Stocks", _decimal(categories.get("equity"))),
        ("Crypto", _decimal(categories.get("crypto"))),
    ]
    raw_rows = sorted(raw_rows, key=lambda item: item[1], reverse=True)

    rounded_percents = []
    for label, value in raw_rows:
        exact = (value / total) * Decimal("100") if total > 0 else Decimal("0")
        rounded = _quantize_percent(exact)
        rounded_percents.append([label, value, rounded])

    rounded_total = sum(row[2] for row in rounded_percents)
    delta = _quantize_percent(Decimal("100") - rounded_total)
    if delta != 0:
        # Adjust the largest allocation so the rounded rows always sum to 100.0.
        idx = max(range(len(rounded_percents)), key=lambda i: rounded_percents[i][1])
        rounded_percents[idx][2] = _quantize_percent(rounded_percents[idx][2] + delta)

    return [
        {"label": label, "value_usd": value, "percent": float(percent)}
        for label, value, percent in rounded_percents
    ]


def build_account_signature(account_ids: list[str]) -> str:
    payload = "|".join(sorted(account_ids))
    return sha256(payload.encode("utf-8")).hexdigest()


class PortfolioSnapshotService:
    def __init__(self, db: AsyncSession):
        self.db = db
        self.aggregation_service = AggregationService(db)

    async def build_user_snapshot(self, user_id, supabase_user_id: str) -> dict[str, Any]:
        portfolio_data = await self.aggregation_service.aggregate_portfolio([str(user_id), str(supabase_user_id)])
        sync = await self._build_sync_metadata(user_id)
        allocation_rows = build_allocation_rows(portfolio_data["categories"], portfolio_data["total_value"])
        included_account_ids = [_get_value(account, "account_id") for account in sync["accounts_included"]]
        failed_account_ids = [_get_value(account, "account_id") for account in sync["failed_accounts"]]
        snapshot_signature = build_account_signature(included_account_ids + failed_account_ids)

        return {
            "assets": portfolio_data["assets"],
            "total_value": portfolio_data["total_value"],
            "categories": portfolio_data["categories"],
            "allocation": {
                "total_value": portfolio_data["total_value"],
                "rows": allocation_rows,
            },
            "sync": sync,
            "snapshot_metadata": {
                "account_signature": snapshot_signature,
                "sync_status": sync["status"],
                "included_account_ids": included_account_ids,
                "failed_account_ids": failed_account_ids,
            },
        }

    async def _build_sync_metadata(self, user_id) -> dict[str, Any]:
        stmt = select(Account).where(Account.user_id == user_id, Account.is_active == True)
        result = await self.db.execute(stmt)
        accounts = result.scalars().all()

        now = datetime.now(timezone.utc)
        included_accounts: list[PortfolioSyncAccountInfo] = []
        failed_accounts: list[PortfolioSyncAccountInfo] = []
        latest_synced_at: datetime | None = None
        stale_count = 0

        for account in accounts:
            last_synced_at = _get_value(account, "last_synced_at")
            last_synced_iso = last_synced_at.isoformat() if last_synced_at else None
            error_message = _get_value(account, "error_message")
            status = "failed" if error_message else "included"
            account_info = PortfolioSyncAccountInfo(
                account_id=str(_get_value(account, "id")),
                account_name=_get_value(account, "name"),
                provider=_get_value(account, "provider"),
                last_synced_at=last_synced_iso,
                status=status,
                error_message=error_message,
            )
            if status == "failed":
                failed_accounts.append(account_info)
            else:
                included_accounts.append(account_info)
                if last_synced_at and (latest_synced_at is None or last_synced_at > latest_synced_at):
                    latest_synced_at = last_synced_at
                if not last_synced_at or (now - last_synced_at).total_seconds() > _STALE_HOURS * 3600:
                    stale_count += 1

        status = "empty"
        if accounts:
            if failed_accounts and included_accounts:
                status = "partial"
            elif failed_accounts and not included_accounts:
                status = "failed"
            else:
                status = "success"
            if stale_count > 0 and status == "success":
                status = "partial"

        stale_warning = None
        if stale_count > 0:
            stale_warning = "Some accounts have stale sync data."

        return {
            "status": status,
            "last_synced_at": latest_synced_at.isoformat() if latest_synced_at else None,
            "accounts_included": [
                {
                    "account_id": account.account_id,
                    "account_name": account.account_name,
                    "provider": account.provider,
                    "last_synced_at": account.last_synced_at,
                    "status": account.status,
                    "error_message": account.error_message,
                }
                for account in included_accounts
            ],
            "failed_accounts": [
                {
                    "account_id": account.account_id,
                    "account_name": account.account_name,
                    "provider": account.provider,
                    "last_synced_at": account.last_synced_at,
                    "status": account.status,
                    "error_message": account.error_message,
                }
                for account in failed_accounts
            ],
            "stale_warning": stale_warning,
            "has_stale_data": stale_count > 0,
            "included_account_count": len(included_accounts),
            "failed_account_count": len(failed_accounts),
            "active_account_count": len(accounts),
        }


def account_signature_from_categories(categories: dict[str, Any] | None) -> str | None:
    if not categories:
        return None
    snapshot_meta = categories.get("__snapshot")
    if not isinstance(snapshot_meta, dict):
        return None
    signature = snapshot_meta.get("account_signature")
    return str(signature) if signature else None


def snapshot_meta_from_categories(categories: dict[str, Any] | None) -> dict[str, Any]:
    if not categories:
        return {}
    snapshot_meta = categories.get("__snapshot")
    return snapshot_meta if isinstance(snapshot_meta, dict) else {}
