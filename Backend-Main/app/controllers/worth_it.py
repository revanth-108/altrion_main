"""
Worth It? controller — 7 endpoints.

All endpoints follow the exact same patterns as budget.py and portfolio.py:
  - router = APIRouter() at module level (prefix added in router.py)
  - Depends(get_authenticated_user) + Depends(get_db) on every route
  - _get_user() resolves the internal User row from the Supabase JWT
  - HTTPException for user-visible errors
  - get_logger() for structured logs
"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import get_current_user as get_authenticated_user
from app.core.database import get_db
from app.core.logging import get_logger
from app.models.user import User
from app.schemas.worth_it import (
    InsightsDataResponse,
    Last30DaysInsightsResponse,
    PreferenceSummaryResponse,
    RateTransactionRequest,
    RateTransactionResponse,
    SessionDataResponse,
    SessionHistoryDataResponse,
    StreakDataResponse,
)
from app.services.worth_it import insights_service, rating_service, session_service
from sqlalchemy import select

logger = get_logger()
router = APIRouter()


# ---------------------------------------------------------------------------
# Helper — same pattern used in budget.py, portfolio.py, etc.
# ---------------------------------------------------------------------------

async def _get_user(current_user: dict, db: AsyncSession) -> User:
    user_id = current_user["user_id"]
    result = await db.execute(select(User).where(User.supabase_user_id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    return user


# ---------------------------------------------------------------------------
# GET /worth-it/session
# ---------------------------------------------------------------------------

@router.get("/session", response_model=SessionDataResponse)
async def get_session(
    current_user: dict = Depends(get_authenticated_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Return the current week's session.

    Creates a new session (and snapshots transactions) if one doesn't exist yet.
    Returns session_complete=True or session_skipped=True for terminal states.
    """
    user = await _get_user(current_user, db)
    payload = await session_service.get_or_create_session(user, db)

    logger.info(
        "worth_it_session_loaded",
        user_id=str(user.id),
        session_id=payload["session_id"],
        session_complete=payload["session_complete"],
        session_skipped=payload["session_skipped"],
    )
    return payload


# ---------------------------------------------------------------------------
# POST /worth-it/session/rate
# ---------------------------------------------------------------------------

@router.post("/session/rate", response_model=RateTransactionResponse)
async def rate_transaction(
    body: RateTransactionRequest,
    current_user: dict = Depends(get_authenticated_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Upsert a keep / cut / skip rating for one transaction.

    If this rating completes the session (all transactions rated), the session
    is marked completed and the streak is updated atomically.
    """
    user = await _get_user(current_user, db)
    result = await rating_service.rate_transaction(
        user=user,
        transaction_id=body.transaction_id,
        rating=body.rating,
        merchant=body.merchant,
        description=body.description,
        amount=body.amount,
        category=body.category,
        db=db,
    )

    logger.info(
        "worth_it_transaction_rated",
        user_id=str(user.id),
        transaction_id=body.transaction_id,
        rating=body.rating,
        session_complete=result["session_complete"],
    )
    return result


# ---------------------------------------------------------------------------
# POST /worth-it/session/skip
# ---------------------------------------------------------------------------

@router.post("/session/skip", status_code=status.HTTP_200_OK)
async def skip_session(
    current_user: dict = Depends(get_authenticated_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Mark the current week's active session as skipped.

    Skipping does NOT reset or increment the streak.
    The frontend invalidates the session query on success and re-fetches,
    receiving session_skipped=True on the next GET /session call.
    """
    user = await _get_user(current_user, db)
    await rating_service.skip_session(user, db)
    logger.info("worth_it_session_skip_requested", user_id=str(user.id))
    return {"success": True}


# ---------------------------------------------------------------------------
# GET /worth-it/streak
# ---------------------------------------------------------------------------

@router.get("/streak", response_model=StreakDataResponse)
async def get_streak(
    current_user: dict = Depends(get_authenticated_user),
    db: AsyncSession = Depends(get_db),
):
    """Return the user's current streak and lifetime stats."""
    user = await _get_user(current_user, db)
    return await insights_service.get_streak(user, db)


# ---------------------------------------------------------------------------
# GET /worth-it/preferences
# ---------------------------------------------------------------------------

@router.get("/preferences", response_model=PreferenceSummaryResponse)
async def get_preferences(
    current_user: dict = Depends(get_authenticated_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Return aggregated keep/cut preferences across all the user's sessions.

    model_confidence (0–1) grows as more ratings are collected (saturates at 50).
    """
    user = await _get_user(current_user, db)
    return await insights_service.get_preferences(user, db)


# ---------------------------------------------------------------------------
# GET /worth-it/history
# ---------------------------------------------------------------------------

@router.get("/history", response_model=SessionHistoryDataResponse)
async def get_history(
    current_user: dict = Depends(get_authenticated_user),
    db: AsyncSession = Depends(get_db),
):
    """Return all past Worth It sessions for the user, newest first."""
    user = await _get_user(current_user, db)
    return await insights_service.get_history(user, db)


# ---------------------------------------------------------------------------
# GET /worth-it/session/{session_id}/insights
# ---------------------------------------------------------------------------

@router.get("/session/{session_id}/insights", response_model=InsightsDataResponse)
async def get_session_insights(
    session_id: str,
    current_user: dict = Depends(get_authenticated_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Return detailed insights for one specific completed session.

    Includes category breakdown, total savings estimate, recurring cut
    alerts (merchants cut 2+ times), and week-over-week trend.
    """
    user = await _get_user(current_user, db)

    # Validate the session belongs to this user before computing insights
    from app.models.worth_it_session import WorthItSession
    result = await db.execute(
        select(WorthItSession).where(
            WorthItSession.id == session_id,
            WorthItSession.user_id == user.id,
        )
    )
    if result.scalar_one_or_none() is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Session not found",
        )

    return await insights_service.get_session_insights(session_id, user, db)


# ---------------------------------------------------------------------------
# GET /worth-it/insights/last-30-days
# ---------------------------------------------------------------------------

@router.get("/insights/last-30-days", response_model=Last30DaysInsightsResponse)
async def get_last_30_days_insights(
    current_user: dict = Depends(get_authenticated_user),
    db: AsyncSession = Depends(get_db),
):
    """Return rolling Worth It insights across the user's last 30 days of reviews."""
    user = await _get_user(current_user, db)
    return await insights_service.get_last_30_days_insights(user, db)
