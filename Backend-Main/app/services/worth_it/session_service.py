"""Worth It session service.

Creates rolling review sessions from the user's newest unreviewed transactions.
Reviewed transactions are excluded permanently using existing Worth It rating
rows, so the same transaction never re-enters a future queue.
"""
from __future__ import annotations

from datetime import date, timedelta
from typing import Any

from sqlalchemy import desc, not_, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.logging import get_logger
from app.models.transaction import Transaction
from app.models.user import User
from app.models.worth_it_rating import WorthItRating
from app.models.worth_it_session import WorthItSession, WorthItSessionStatus
from app.models.worth_it_session_transaction import WorthItSessionTransaction
from app.models.worth_it_streak import WorthItStreak

logger = get_logger()

# ---------------------------------------------------------------------------
# Hard exclusions — never surfaced in a Worth It session (§5.1 of spec).
# These are non-discretionary, legally obligated, or psychologically harmful
# to frame as cuttable spending. No config flag should bypass this list.
# ---------------------------------------------------------------------------

_EXCLUDED_PRIMARY_CATEGORIES: frozenset[str] = frozenset([
    "RENT_AND_UTILITIES",    # Fixed costs — rating as "Cut" creates anxiety
    "MEDICAL",               # Health expenses are never optional
    "HEALTH_AND_FITNESS",    # Gym/wellness — treated as non-discretionary
    "LOAN_PAYMENTS",         # Legal contractual commitments
    "INCOME",                # Not a spend event
    "TRANSFER_IN",           # Internal money movement
    "TRANSFER_OUT",          # Internal money movement
    "BANK_FEES",             # Not controllable by user behaviour
    "LOAN_DISBURSEMENTS",    # Incoming loan funds — not a spend event
    "GOV_NON_PROFIT",        # Tax/legal obligations, not discretionary
])

# FOOD_AND_DRINK restaurants should still appear — only grocery stores excluded.
# Filtered via category_detailed to preserve coffee, fast food, dining out.
_EXCLUDED_DETAILED_CATEGORIES: frozenset[str] = frozenset([
    "FOOD_AND_DRINK_GROCERIES",
])

# ---------------------------------------------------------------------------
# Plaid primary category → friendly display name
# ---------------------------------------------------------------------------

_CATEGORY_MAP: dict[str, str] = {
    "FOOD_AND_DRINK": "Food & Drink",
    "TRANSPORTATION": "Transport",
    "TRAVEL": "Travel",
    "ENTERTAINMENT": "Entertainment",
    "SHOPPING": "Shopping",
    "GENERAL_MERCHANDISE": "Shopping",
    "HEALTH_AND_FITNESS": "Health",
    "PERSONAL_CARE": "Personal Care",
    "HOME_IMPROVEMENT": "Home",
    "UTILITIES": "Utilities",
    "RENT_AND_UTILITIES": "Utilities",
    "LOAN_PAYMENTS": "Loans",
    "BANK_FEES": "Bank Fees",
    "INCOME": "Income",
    "GENERAL_SERVICES": "Services",
    "GOVERNMENT_AND_NON_PROFIT": "Government",
    "MEDICAL": "Medical",
    "SUBSCRIPTION": "Subscriptions",
    "TRANSFER_IN": "Transfer",
    "TRANSFER_OUT": "Transfer",
}

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def get_current_week_monday() -> date:
    """Return the Monday of the current UTC week (ISO week start)."""
    today = date.today()
    return today - timedelta(days=today.weekday())  # weekday() 0=Mon … 6=Sun


def compute_week_label(monday: date) -> str:
    """Format 'MAY 12–18' or 'APR 28 – MAY 4' for cross-month weeks."""
    sunday = monday + timedelta(days=6)
    start_month = monday.strftime("%b").upper()
    if monday.month == sunday.month:
        return f"{start_month} {monday.day}–{sunday.day}"
    end_month = sunday.strftime("%b").upper()
    return f"{start_month} {monday.day} – {end_month} {sunday.day}"


def _format_tx_date(d: date) -> str:
    """Cross-platform: 'Sat, Apr 11' without platform-specific %-d."""
    return f"{d.strftime('%a, %b')} {d.day}"


def _map_category(plaid_primary: str | None) -> str:
    if not plaid_primary:
        return "Other"
    return _CATEGORY_MAP.get(plaid_primary.upper(), plaid_primary.replace("_", " ").title())


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

async def get_or_create_session(user: User, db: AsyncSession) -> dict:
    """Return the current active queue or create a new rolling review session."""
    week_start = get_current_week_monday()
    week_label = compute_week_label(week_start)

    active_session = await _get_latest_session(user.id, db, status=WorthItSessionStatus.ACTIVE)
    if active_session is not None:
        return await _serialize_session(active_session, user.id, db)

    reviewed_transaction_ids = await _load_reviewed_transaction_ids(user.id, db)
    logger.info(
        "worth_it_reviewed_transaction_ids_loaded",
        user_id=str(user.id),
        reviewed_count=len(reviewed_transaction_ids),
    )
    snapshot = await _load_reviewable_transactions(
        user.id,
        db,
        reviewed_transaction_ids=reviewed_transaction_ids,
        limit=15,
    )
    snapshot, duplicate_snapshot_count = _dedupe_snapshot_rows(snapshot)
    logger.info(
        "worth_it_reviewable_transactions_selected",
        user_id=str(user.id),
        reviewed_count=len(reviewed_transaction_ids),
        selected_count=len(snapshot),
        duplicate_snapshot_count=duplicate_snapshot_count,
        transaction_ref_ids=[row["transaction_ref_id"] for row in snapshot],
    )

    if snapshot:
        session = WorthItSession(
            user_id=user.id,
            week_start=week_start,
            week_label=week_label,
            status=WorthItSessionStatus.ACTIVE,
        )
        db.add(session)
        await db.flush()

        for i, row in enumerate(snapshot):
            db.add(WorthItSessionTransaction(
                session_id=session.id,
                user_id=user.id,
                transaction_ref_id=row["transaction_ref_id"],
                merchant=row["merchant"],
                description=row["description"],
                amount=row["amount"],
                category=row["category"],
                tx_date=row["tx_date"],
                initial=row["initial"],
                position=i,
            ))

        await db.commit()

        logger.info(
            "worth_it_session_created",
            user_id=str(user.id),
            session_id=str(session.id),
            count=len(snapshot),
        )
        return await _serialize_session(session, user.id, db)

    latest_session = await _get_latest_session(user.id, db)
    streak = await _load_streak(user.id, db)
    if latest_session is not None:
        return _build_response(
            session=latest_session,
            transactions=[],
            ratings={},
            streak=streak,
            week_label=latest_session.week_label,
            session_complete=True,
            session_skipped=False,
        )

    return _build_response(
        session=None,
        transactions=[],
        ratings={},
        streak=streak,
        week_label=week_label,
        session_complete=True,
        session_skipped=False,
    )


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

async def _serialize_session(session: WorthItSession, user_id: Any, db: AsyncSession) -> dict:
    tx_stmt = (
        select(WorthItSessionTransaction)
        .where(WorthItSessionTransaction.session_id == session.id)
        .order_by(WorthItSessionTransaction.position)
    )
    tx_result = await db.execute(tx_stmt)
    snapshot_txs = _dedupe_session_transactions(tx_result.scalars().all())

    rating_stmt = select(WorthItRating).where(
        WorthItRating.session_id == session.id,
        WorthItRating.user_id == user_id,
    ).order_by(
        WorthItRating.updated_at.desc(),
        WorthItRating.created_at.desc(),
        WorthItRating.rated_at.desc(),
        WorthItRating.id.desc(),
    )
    rating_result = await db.execute(rating_stmt)
    ratings = _dedupe_ratings_to_map(rating_result.scalars().all())

    streak = await _load_streak(user_id, db)
    visible_snapshot_txs = [tx for tx in snapshot_txs if tx.transaction_ref_id not in ratings]
    logger.info(
        "worth_it_session_serialized",
        user_id=str(user_id),
        session_id=str(session.id),
        total_snapshot_count=len(snapshot_txs),
        reviewed_count=len(ratings),
        visible_count=len(visible_snapshot_txs),
    )
    transactions = [
        {
            "id": tx.transaction_ref_id,
            "merchant": tx.merchant,
            "description": tx.description,
            "amount": float(tx.amount),
            "category": tx.category,
            "date": _format_tx_date(tx.tx_date),
            "initial": tx.initial,
        }
        for tx in snapshot_txs
        if tx.transaction_ref_id not in ratings
    ]
    session_complete = (not snapshot_txs) or len(ratings) >= len(snapshot_txs)
    return _build_response(
        session=session,
        transactions=transactions,
        ratings=ratings,
        streak=streak,
        week_label=session.week_label,
        session_complete=session_complete,
        session_skipped=session.status == WorthItSessionStatus.SKIPPED,
    )


async def _get_latest_session(
    user_id: Any,
    db: AsyncSession,
    status: WorthItSessionStatus | None = None,
) -> WorthItSession | None:
    stmt = select(WorthItSession).where(WorthItSession.user_id == user_id)
    if status is not None:
        stmt = stmt.where(WorthItSession.status == status)
    stmt = stmt.order_by(desc(WorthItSession.created_at), desc(WorthItSession.id)).limit(1)
    result = await db.execute(stmt)
    return result.scalar_one_or_none()


async def _load_reviewed_transaction_ids(user_id: Any, db: AsyncSession) -> set[str]:
    stmt = select(WorthItRating.transaction_ref_id).where(
        WorthItRating.user_id == user_id,
    )
    rows = (await db.execute(stmt)).scalars().all()
    return {tx_id for tx_id in rows if tx_id}


async def _load_reviewable_transactions(
    user_id: Any,
    db: AsyncSession,
    *,
    reviewed_transaction_ids: set[str],
    limit: int,
) -> list[dict]:
    stmt = (
        select(Transaction)
        .where(
            Transaction.user_id == user_id,
            Transaction.amount > 0,
            Transaction.pending == False,  # noqa: E712
            not_(Transaction.category_primary.in_(_EXCLUDED_PRIMARY_CATEGORIES)),
            or_(
                Transaction.category_detailed.is_(None),
                not_(Transaction.category_detailed.in_(_EXCLUDED_DETAILED_CATEGORIES)),
            ),
        )
        .order_by(
            Transaction.date.desc(),
            desc(Transaction.created_at),
            desc(Transaction.transaction_id),
        )
    )
    if reviewed_transaction_ids:
        stmt = stmt.where(not_(Transaction.transaction_id.in_(reviewed_transaction_ids)))
    stmt = stmt.limit(limit)

    txs = (await db.execute(stmt)).scalars().all()
    payloads = [
        {
            "transaction_ref_id": tx.transaction_id,
            "merchant": (tx.merchant_name or tx.name or "Unknown").strip(),
            "description": (tx.name or tx.merchant_name or "Unknown").strip(),
            "amount": tx.amount,
            "category": _map_category(tx.category_primary),
            "tx_date": tx.date,
            "initial": ((tx.merchant_name or tx.name or "?").strip()[:1] or "?").upper(),
        }
        for tx in txs
    ]
    return _dedupe_snapshot_rows(payloads)[0]


async def _load_streak(user_id: Any, db: AsyncSession) -> int:
    result = await db.execute(
        select(WorthItStreak).where(WorthItStreak.user_id == user_id)
    )
    row = result.scalar_one_or_none()
    return row.current_streak if row else 0


def _build_response(
    *,
    session: WorthItSession | None,
    transactions: list,
    ratings: dict,
    streak: int,
    week_label: str,
    session_complete: bool,
    session_skipped: bool,
) -> dict:
    return {
        "session_id": str(session.id) if session else "",
        "week_label": week_label,
        "transactions": transactions,
        "ratings": ratings,
        "streak": streak,
        "session_complete": session_complete,
        "session_skipped": session_skipped,
    }


def _dedupe_snapshot_rows(rows: list[dict]) -> tuple[list[dict], int]:
    seen: set[str] = set()
    deduped: list[dict] = []
    duplicates = 0
    for row in rows:
        ref_id = row.get("transaction_ref_id")
        if not ref_id:
            continue
        if ref_id in seen:
            duplicates += 1
            continue
        seen.add(ref_id)
        deduped.append(row)
    return deduped, duplicates


def _dedupe_session_transactions(rows: list[WorthItSessionTransaction]) -> list[WorthItSessionTransaction]:
    seen: set[str] = set()
    deduped: list[WorthItSessionTransaction] = []
    for tx in rows:
        ref_id = tx.transaction_ref_id
        if not ref_id or ref_id in seen:
            continue
        seen.add(ref_id)
        deduped.append(tx)
    return deduped


def _dedupe_ratings_to_map(rows: list[WorthItRating]) -> dict[str, str]:
    ratings: dict[str, str] = {}
    for row in rows:
        ref_id = row.transaction_ref_id
        if not ref_id or ref_id in ratings:
            continue
        ratings[ref_id] = row.rating.value
    return ratings
