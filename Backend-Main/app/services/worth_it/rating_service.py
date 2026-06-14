"""
Worth It — rating service.

Responsibilities:
  - Upsert a rating for one transaction (keep / cut / skip).
  - Detect when all transactions in the session have been rated and mark
    the session completed.
  - Update the streak counter atomically with session completion.
  - Mark the active session as skipped.
"""
from __future__ import annotations

from datetime import date, timedelta, timezone
from datetime import datetime as dt

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.logging import get_logger
from app.models.user import User
from app.models.worth_it_rating import WorthItRating, WorthItRatingValue
from app.models.worth_it_session import WorthItSession, WorthItSessionStatus
from app.models.worth_it_session_transaction import WorthItSessionTransaction
from app.models.worth_it_streak import WorthItStreak

logger = get_logger()


# ---------------------------------------------------------------------------
# Rate a transaction
# ---------------------------------------------------------------------------

async def rate_transaction(
    *,
    user: User,
    transaction_id: str,
    rating: str,
    merchant: str,
    description: str,
    amount: float,
    category: str,
    db: AsyncSession,
) -> dict:
    """
    Upsert a rating row for the given transaction.

    Returns {"success": True, "session_complete": bool, "ratings_count": int}.
    """
    # ── Find the active session ─────────────────────────────────────────────
    session = await _get_active_session(user.id, db)
    if session is None:
        # Shouldn't happen in normal flow — frontend always calls GET /session
        # first. Return gracefully rather than erroring.
        return {"success": False, "session_complete": False, "ratings_count": 0}

    # ── Upsert the rating ───────────────────────────────────────────────────
    existing_stmt = select(WorthItRating).where(
        WorthItRating.user_id == user.id,
        WorthItRating.transaction_ref_id == transaction_id,
    ).order_by(
        WorthItRating.updated_at.desc(),
        WorthItRating.created_at.desc(),
        WorthItRating.rated_at.desc(),
        WorthItRating.id.desc(),
    ).limit(1)
    existing = (await db.execute(existing_stmt)).scalar_one_or_none()

    rating_enum = WorthItRatingValue(rating)
    logger.info(
        "worth_it_rating_upsert_requested",
        user_id=str(user.id),
        session_id=str(session.id),
        transaction_ref_id=transaction_id,
        rating=rating,
    )

    if existing:
        existing.rating = rating_enum
        existing.merchant = merchant
        existing.category = category
        existing.amount = amount
        existing.rated_at = dt.now(timezone.utc)
    else:
        db.add(WorthItRating(
            session_id=session.id,
            user_id=user.id,
            transaction_ref_id=transaction_id,
            rating=rating_enum,
            merchant=merchant,
            category=category,
            amount=amount,
        ))

    await db.flush()

    # ── Check session completion ────────────────────────────────────────────
    total_txs = (
        await db.execute(
            select(func.count(func.distinct(WorthItSessionTransaction.transaction_ref_id))).where(
                WorthItSessionTransaction.session_id == session.id
            )
        )
    ).scalar_one()

    total_ratings = (
        await db.execute(
            select(func.count(func.distinct(WorthItRating.transaction_ref_id))).where(
                WorthItRating.user_id == user.id,
                WorthItRating.session_id == session.id,
            )
        )
    ).scalar_one()

    session_complete = total_txs > 0 and total_ratings >= total_txs

    if session_complete and session.status == WorthItSessionStatus.ACTIVE:
        session.status = WorthItSessionStatus.COMPLETED
        session.completed_at = dt.now(timezone.utc)
        await _update_streak(user.id, session.week_start, db)
        logger.info(
            "worth_it_session_completed",
            user_id=str(user.id),
            session_id=str(session.id),
        )

    await db.commit()
    logger.info(
        "worth_it_rating_upsert_saved",
        user_id=str(user.id),
        session_id=str(session.id),
        transaction_ref_id=transaction_id,
        rating=rating,
        updated_existing=bool(existing),
    )

    return {
        "success": True,
        "session_complete": session_complete,
        "ratings_count": int(total_ratings),
    }


# ---------------------------------------------------------------------------
# Skip the current week's session
# ---------------------------------------------------------------------------

async def skip_session(user: User, db: AsyncSession) -> None:
    """
    Mark the active session as skipped.

    Skipping does NOT affect the streak — it neither increments nor resets it.
    If no active session exists, nothing is created or changed.
    """
    session = await _get_active_session(user.id, db)
    if session is None:
        # Nothing to skip — silently succeed
        return

    session.status = WorthItSessionStatus.SKIPPED
    session.skipped_at = dt.now(timezone.utc)
    await db.commit()

    logger.info(
        "worth_it_session_skipped",
        user_id=str(user.id),
        session_id=str(session.id),
    )


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

async def _get_active_session(
    user_id,
    db: AsyncSession,
) -> WorthItSession | None:
    result = await db.execute(
        select(WorthItSession).where(
            WorthItSession.user_id == user_id,
            WorthItSession.status == WorthItSessionStatus.ACTIVE,
        ).order_by(WorthItSession.created_at.desc(), WorthItSession.id.desc())
    )
    return result.scalar_one_or_none()


async def _update_streak(user_id, week_start: date, db: AsyncSession) -> None:
    """
    Upsert the WorthItStreak row.

    Streak increments when last_completed_week == week_start - 7 days
    (the immediately preceding Monday).  Any gap resets streak to 1.
    """
    result = await db.execute(
        select(WorthItStreak).where(WorthItStreak.user_id == user_id)
    )
    streak_row = result.scalar_one_or_none()

    prev_monday = week_start - timedelta(days=7)

    if streak_row is None:
        streak_row = WorthItStreak(
            user_id=user_id,
            current_streak=1,
            longest_streak=1,
            last_completed_week=week_start,
            total_sessions_completed=1,
        )
        db.add(streak_row)
    else:
        if streak_row.last_completed_week == week_start:
            # Another session finished in the same week; keep the streak stable.
            pass
        elif streak_row.last_completed_week == prev_monday:
            streak_row.current_streak += 1
            streak_row.longest_streak = max(streak_row.longest_streak, streak_row.current_streak)
            streak_row.last_completed_week = week_start
        else:
            # Gap in consecutive weeks — reset to a new weekly streak.
            streak_row.current_streak = 1
            streak_row.longest_streak = max(streak_row.longest_streak, streak_row.current_streak)
            streak_row.last_completed_week = week_start

        streak_row.total_sessions_completed += 1

    await db.flush()
