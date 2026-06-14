"""
AFHS score history — persists snapshots and queries historical data.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone
from typing import Optional

from sqlalchemy import select, and_
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.afhs_score import AfhsScore
from app.core.logging import get_logger

logger = get_logger()

# Minimum gap between snapshots for the same user (deduplication)
_SNAPSHOT_INTERVAL_MINUTES = 15


async def save_score_snapshot(
    db: AsyncSession,
    user_id: uuid.UUID,
    health: dict,
) -> None:
    """
    Persist a health score snapshot. Skips insert if a snapshot already
    exists within the last _SNAPSHOT_INTERVAL_MINUTES for this user.
    """
    try:
        cutoff = datetime.now(tz=timezone.utc) - timedelta(minutes=_SNAPSHOT_INTERVAL_MINUTES)
        stmt = (
            select(AfhsScore.id)
            .where(
                and_(
                    AfhsScore.user_id == user_id,
                    AfhsScore.computed_at >= cutoff,
                )
            )
            .limit(1)
        )
        existing = await db.execute(stmt)
        if existing.scalar_one_or_none() is not None:
            return  # Recent snapshot exists — skip

        dims = health.get("dimension_scores", {})
        snapshot = AfhsScore(
            user_id=user_id,
            overall_score=int(health["overall_score"]),
            completeness_pct=int(health.get("completeness_pct", 50)),
            life_stage=health.get("life_stage", "early"),
            solvency_tier=health.get("solvency_tier", "solvent"),
            d1_liquidity=dims.get("d1_liquidity"),
            d2_investment=dims.get("d2_investment"),
            d3_retirement=dims.get("d3_retirement"),
            d4_crypto=dims.get("d4_crypto"),
            d5_defi=dims.get("d5_defi"),
            d6_debt=dims.get("d6_debt"),
            d7_velocity=dims.get("d7_velocity"),
            breakdown=health.get("breakdown"),
        )
        db.add(snapshot)
        await db.commit()
    except Exception as e:
        logger.warning("Failed to save AFHS score snapshot", error=str(e))
        await db.rollback()


async def get_score_history(
    db: AsyncSession,
    user_id: uuid.UUID,
    days: int = 90,
) -> list[dict]:
    """
    Return chronological AFHS score snapshots for the last `days` days.
    """
    cutoff = datetime.now(tz=timezone.utc) - timedelta(days=days)
    stmt = (
        select(AfhsScore)
        .where(
            and_(
                AfhsScore.user_id == user_id,
                AfhsScore.computed_at >= cutoff,
            )
        )
        .order_by(AfhsScore.computed_at.asc())
    )
    result = await db.execute(stmt)
    rows = result.scalars().all()

    return [
        {
            "computed_at": row.computed_at.isoformat(),
            "overall_score": row.overall_score,
            "d1_liquidity": float(row.d1_liquidity) if row.d1_liquidity is not None else None,
            "d2_investment": float(row.d2_investment) if row.d2_investment is not None else None,
            "d3_retirement": float(row.d3_retirement) if row.d3_retirement is not None else None,
            "d4_crypto": float(row.d4_crypto) if row.d4_crypto is not None else None,
            "d5_defi": float(row.d5_defi) if row.d5_defi is not None else None,
            "d6_debt": float(row.d6_debt) if row.d6_debt is not None else None,
            "d7_velocity": float(row.d7_velocity) if row.d7_velocity is not None else None,
            "life_stage": row.life_stage,
            "solvency_tier": row.solvency_tier,
        }
        for row in rows
    ]
