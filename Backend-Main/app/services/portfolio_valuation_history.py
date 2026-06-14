"""
Portfolio valuation history.

Persists point-in-time total portfolio values and computes 24h portfolio
movement from historical valuation snapshots.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone
from decimal import Decimal

from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.logging import get_logger
from app.models.portfolio_valuation_snapshot import PortfolioValuationSnapshot

logger = get_logger()

_SNAPSHOT_INTERVAL_MINUTES = 15
_TARGET_LOOKBACK_HOURS = 24
_MAX_TARGET_DISTANCE_HOURS = 3


class PortfolioValuationHistoryService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def save_snapshot(
        self,
        user_id: uuid.UUID,
        total_value: Decimal,
        categories: dict | None = None,
    ) -> None:
        """
        Persist a portfolio valuation snapshot.

        A recent snapshot is not replaced; this keeps history periodic when
        /portfolio is read frequently.
        """
        if total_value is None or total_value < Decimal("0"):
            return

        try:
            cutoff = datetime.now(tz=timezone.utc) - timedelta(minutes=_SNAPSHOT_INTERVAL_MINUTES)
            existing_stmt = (
                select(PortfolioValuationSnapshot.id)
                .where(
                    and_(
                        PortfolioValuationSnapshot.user_id == user_id,
                        PortfolioValuationSnapshot.computed_at >= cutoff,
                    )
                )
                .limit(1)
            )
            existing = await self.db.execute(existing_stmt)
            if existing.scalar_one_or_none() is not None:
                return

            snapshot = PortfolioValuationSnapshot(
                user_id=user_id,
                total_value=total_value,
                categories=self._serialize_categories(categories),
            )
            self.db.add(snapshot)
            await self.db.commit()
        except Exception as exc:
            logger.warning("Failed to save portfolio valuation snapshot", error=str(exc))
            await self.db.rollback()

    async def compute_display_change(
        self,
        user_id: uuid.UUID,
        current_total_value: Decimal,
    ) -> dict[str, float | str | None]:
        """
        Compute the best available portfolio change for display.

        Priority:
        1. Snapshot closest to 24h ago within the allowed tolerance
        2. Most recent previous snapshot
        3. Tracking started
        """
        try:
            if current_total_value is None or current_total_value < Decimal("0"):
                return self._tracking_started_payload()

            target = datetime.now(tz=timezone.utc) - timedelta(hours=_TARGET_LOOKBACK_HOURS)
            window_start = target - timedelta(hours=_MAX_TARGET_DISTANCE_HOURS)
            window_end = target + timedelta(hours=_MAX_TARGET_DISTANCE_HOURS)

            stmt = (
                select(PortfolioValuationSnapshot)
                .where(
                    and_(
                        PortfolioValuationSnapshot.user_id == user_id,
                        PortfolioValuationSnapshot.computed_at >= window_start,
                        PortfolioValuationSnapshot.computed_at <= window_end,
                    )
                )
                .order_by(PortfolioValuationSnapshot.computed_at.desc())
            )
            result = await self.db.execute(stmt)
            snapshots = result.scalars().all()
            if snapshots:
                baseline = min(
                    snapshots,
                    key=lambda row: abs((self._aware(row.computed_at) - target).total_seconds()),
                )
                return self._build_payload("24h", current_total_value, Decimal(str(baseline.total_value)))

            latest_stmt = (
                select(PortfolioValuationSnapshot)
                .where(PortfolioValuationSnapshot.user_id == user_id)
                .order_by(PortfolioValuationSnapshot.computed_at.desc())
                .limit(1)
            )
            latest_result = await self.db.execute(latest_stmt)
            latest_snapshot = latest_result.scalar_one_or_none()
            if latest_snapshot is None:
                return self._tracking_started_payload()

            return self._build_payload(
                "since_last",
                current_total_value,
                Decimal(str(latest_snapshot.total_value)),
            )
        except Exception as exc:
            logger.warning("Failed to compute portfolio display change", error=str(exc))
            await self.db.rollback()
            return self._tracking_started_payload()

    def _build_payload(
        self,
        change_type: str,
        current_total_value: Decimal,
        baseline_value: Decimal,
    ) -> dict[str, float | str | None]:
        change = calculate_24h_change(current_total_value, baseline_value)
        if change["change_24h_pct"] is None:
            return self._tracking_started_payload()
        return {
            "change_type": change_type,
            "change_value": change["change_24h_value"],
            "change_pct": change["change_24h_pct"],
            "change_since_last_value": change["change_24h_value"] if change_type == "since_last" else None,
            "change_since_last_pct": change["change_24h_pct"] if change_type == "since_last" else None,
            "change_24h_value": change["change_24h_value"] if change_type == "24h" else None,
            "change_24h_pct": change["change_24h_pct"] if change_type == "24h" else None,
        }

    def _tracking_started_payload(self) -> dict[str, float | str | None]:
        return {
            "change_type": "tracking_started",
            "change_value": None,
            "change_pct": None,
            "change_since_last_value": None,
            "change_since_last_pct": None,
            "change_24h_value": None,
            "change_24h_pct": None,
        }

    def _serialize_categories(self, categories: dict | None) -> dict | None:
        if not categories:
            return None
        return {key: str(value) for key, value in categories.items()}

    def _aware(self, value: datetime) -> datetime:
        if value.tzinfo is None:
            return value.replace(tzinfo=timezone.utc)
        return value


def calculate_24h_change(
    current_total_value: Decimal,
    baseline_value: Decimal,
) -> dict[str, float | None]:
    if baseline_value <= Decimal("0"):
        return {"change_24h_pct": None, "change_24h_value": None}

    change_value = current_total_value - baseline_value
    change_pct = (change_value / baseline_value) * Decimal("100")

    return {
        "change_24h_pct": float(change_pct),
        "change_24h_value": float(change_value),
    }
