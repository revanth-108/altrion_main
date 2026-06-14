"""Worth It insights and preferences service.

Responsibilities:
  - Session insights: transaction-driven summaries for one completed session.
  - Preferences: aggregated keep/cut patterns across all sessions for the user.
  - Streak data: thin wrapper that reads WorthItStreak directly.
  - History: list all past sessions with summary counts.
"""
from __future__ import annotations

from collections import Counter, defaultdict
from datetime import datetime, timedelta, timezone
from typing import Any

from sqlalchemy import select, and_
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user import User
from app.models.worth_it_rating import WorthItRating, WorthItRatingValue
from app.models.worth_it_session import WorthItSession, WorthItSessionStatus
from app.models.worth_it_session_transaction import WorthItSessionTransaction
from app.models.worth_it_streak import WorthItStreak

# Keywords that suggest a transaction is a recurring subscription
_SUBSCRIPTION_KEYWORDS = frozenset([
    "subscription", "monthly", "annual", "membership", "premium",
    "plan", "renewal", "recurring",
])


# ---------------------------------------------------------------------------
# Session insights
# ---------------------------------------------------------------------------

async def get_session_insights(
    session_id: str,
    user: User,
    db: AsyncSession,
) -> dict:
    """Compute transaction-driven insights for a single completed session."""
    session = await _load_session(session_id, user.id, db)
    if session is None:
        return _empty_insights()

    transactions = await _load_session_transactions(session.id, db)
    ratings = await _load_session_ratings(session.id, user.id, db)
    return await _build_session_insights(session, transactions, ratings, user.id, db)


async def get_last_30_days_insights(user: User, db: AsyncSession) -> dict:
    """Compute rolling Worth It insights for the last 30 days of reviewed ratings."""
    cutoff = _now_utc() - timedelta(days=30)
    stmt = (
        select(WorthItRating, WorthItSessionTransaction)
        .join(
            WorthItSessionTransaction,
            and_(
                WorthItSessionTransaction.session_id == WorthItRating.session_id,
                WorthItSessionTransaction.transaction_ref_id == WorthItRating.transaction_ref_id,
            ),
        )
        .where(
            WorthItRating.user_id == user.id,
            WorthItSessionTransaction.user_id == user.id,
            WorthItRating.created_at >= cutoff,
        )
        .order_by(
            WorthItRating.created_at.desc(),
            WorthItRating.updated_at.desc(),
            WorthItRating.id.desc(),
        )
    )
    rows = (await db.execute(stmt)).all()
    rows = [
        row for row in rows
        if getattr(row[0], "created_at", None) is None or row[0].created_at >= cutoff
    ]
    if not rows:
        return _empty_last_30_days_insights()
    return _build_last_30_days_insights(rows)


# ---------------------------------------------------------------------------
# Preferences (aggregated across all sessions)
# ---------------------------------------------------------------------------

async def get_preferences(user: User, db: AsyncSession) -> dict:
    """
    Aggregate all ratings across all sessions for this user.

    Returns the PreferenceSummaryResponse payload dict.
    """
    all_ratings_stmt = (
        select(WorthItRating)
        .where(WorthItRating.user_id == user.id)
        .order_by(
            WorthItRating.updated_at.desc(),
            WorthItRating.created_at.desc(),
            WorthItRating.rated_at.desc(),
            WorthItRating.id.desc(),
        )
    )
    all_ratings = _dedupe_ratings((await db.execute(all_ratings_stmt)).scalars().all())

    kept_categories: Counter = Counter()
    cut_categories: Counter = Counter()
    cut_subscription_merchants: set[str] = set()
    total_ratings = len(all_ratings)

    for r in all_ratings:
        cat = r.category or "Other"
        if r.rating == WorthItRatingValue.KEEP:
            kept_categories[cat] += 1
        elif r.rating == WorthItRatingValue.CUT:
            cut_categories[cat] += 1
            # Flag as a subscription if description/merchant contains keywords
            desc = (r.merchant or "").lower()
            if any(kw in desc for kw in _SUBSCRIPTION_KEYWORDS):
                cut_subscription_merchants.add(r.merchant or "")

    # Confidence: approaches 1.0 as the user rates more (saturates at 50 ratings)
    model_confidence = min(total_ratings / 50.0, 1.0)

    return {
        "top_kept_categories": [cat for cat, _ in kept_categories.most_common(5)],
        "top_cut_categories": [cat for cat, _ in cut_categories.most_common(5)],
        "cut_subscriptions": sorted(cut_subscription_merchants)[:10],
        "total_ratings": total_ratings,
        "model_confidence": round(model_confidence, 3),
    }


# ---------------------------------------------------------------------------
# Streak
# ---------------------------------------------------------------------------

async def get_streak(user: User, db: AsyncSession) -> dict:
    result = await db.execute(
        select(WorthItStreak).where(WorthItStreak.user_id == user.id)
    )
    row = result.scalar_one_or_none()
    if row is None:
        return {
            "streak": 0,
            "longest_streak": 0,
            "last_completed_week": None,
            "total_sessions_completed": 0,
        }
    return {
        "streak": row.current_streak,
        "longest_streak": row.longest_streak,
        "last_completed_week": row.last_completed_week.isoformat() if row.last_completed_week else None,
        "total_sessions_completed": row.total_sessions_completed,
    }


# ---------------------------------------------------------------------------
# History
# ---------------------------------------------------------------------------

async def get_history(user: User, db: AsyncSession) -> dict:
    """List all sessions for the user, newest first, with per-status counts."""
    sessions_stmt = (
        select(WorthItSession)
        .where(WorthItSession.user_id == user.id)
        .order_by(WorthItSession.created_at.desc(), WorthItSession.id.desc())
    )
    sessions = (await db.execute(sessions_stmt)).scalars().all()

    items = []
    for s in sessions:
        keep_count = cut_count = skip_count = 0
        keep_total_amount = cut_total_amount = skip_total_amount = 0.0
        reviewed_count = 0
        summary_message = "Review a few transactions first, then your insights will appear here."
        if s.status == WorthItSessionStatus.COMPLETED:
            txs = await _load_session_transactions(s.id, db)
            ratings = await _load_session_ratings(s.id, user.id, db)
            summary = await _build_session_insights(s, txs, ratings, user.id, db)
            keep_count = summary["keep_count"]
            cut_count = summary["cut_count"]
            skip_count = summary["skip_count"]
            keep_total_amount = summary["keep_total_amount"]
            cut_total_amount = summary["cut_total_amount"]
            skip_total_amount = summary["skip_total_amount"]
            reviewed_count = summary["total_reviewed_count"]
            summary_message = summary["summary_message"]

        items.append({
            "session_id": str(s.id),
            "week_label": s.week_label,
            "status": s.status.value,
            "keep_count": keep_count,
            "cut_count": cut_count,
            "skip_count": skip_count,
            "reviewed_count": reviewed_count,
            "keep_total_amount": round(keep_total_amount, 2),
            "cut_total_amount": round(cut_total_amount, 2),
            "skip_total_amount": round(skip_total_amount, 2),
            "summary_message": summary_message,
            "completed_at": s.completed_at.isoformat() if s.completed_at else None,
        })

    return {"sessions": items}


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

async def _compute_trend(session_id: str, user_id: Any, db: AsyncSession) -> str:
    """
    Compare cut-rate of current session vs the immediately preceding one.

    'improving' = cutting a higher fraction this week (more spending awareness)
    'declining' = cutting less
    'stable'    = same or no prior session to compare against
    """
    # Get the current session's creation time so we can find the prior session
    current_session_stmt = select(WorthItSession).where(
        WorthItSession.id == session_id,
        WorthItSession.user_id == user_id,
    )
    current_session = (await db.execute(current_session_stmt)).scalar_one_or_none()
    if current_session is None:
        return "stable"

    # Find the most recent completed session before this one
    prior_stmt = (
        select(WorthItSession)
        .where(
            WorthItSession.user_id == user_id,
            WorthItSession.status == WorthItSessionStatus.COMPLETED,
        )
        .where(WorthItSession.created_at < current_session.created_at)
        .order_by(WorthItSession.created_at.desc(), WorthItSession.id.desc())
        .limit(1)
    )
    prior_session = (await db.execute(prior_stmt)).scalar_one_or_none()
    if prior_session is None:
        return "stable"

    # Current session cut rate
    cur_counts = await _rating_counts(session_id, db)
    cur_total = sum(cur_counts.values())
    cur_cut_rate = cur_counts.get("cut", 0) / cur_total if cur_total else 0.0

    # Prior session cut rate
    prior_counts = await _rating_counts(str(prior_session.id), db)
    prior_total = sum(prior_counts.values())
    prior_cut_rate = prior_counts.get("cut", 0) / prior_total if prior_total else 0.0

    if cur_cut_rate > prior_cut_rate + 0.05:
        return "improving"
    if cur_cut_rate < prior_cut_rate - 0.05:
        return "declining"
    return "stable"


async def _rating_counts(session_id: str, db: AsyncSession) -> dict[str, int]:
    rows = (
        await db.execute(
            select(WorthItRating)
            .where(WorthItRating.session_id == session_id)
            .order_by(
                WorthItRating.updated_at.desc(),
                WorthItRating.created_at.desc(),
                WorthItRating.rated_at.desc(),
                WorthItRating.id.desc(),
            )
        )
    ).scalars().all()
    counts: dict[str, int] = {"keep": 0, "cut": 0, "skip": 0}
    for rating in _dedupe_ratings(rows):
        counts[rating.rating.value] += 1
    return {key: value for key, value in counts.items() if value}


async def _load_session(session_id: str, user_id: Any, db: AsyncSession) -> WorthItSession | None:
    result = await db.execute(
        select(WorthItSession).where(
            WorthItSession.id == session_id,
            WorthItSession.user_id == user_id,
        )
    )
    return result.scalar_one_or_none()


async def _load_session_transactions(session_id: str, db: AsyncSession) -> list[WorthItSessionTransaction]:
    result = await db.execute(
        select(WorthItSessionTransaction)
        .where(WorthItSessionTransaction.session_id == session_id)
        .order_by(
            WorthItSessionTransaction.position.asc(),
            WorthItSessionTransaction.created_at.asc(),
            WorthItSessionTransaction.id.asc(),
        )
    )
    return _dedupe_session_transactions(result.scalars().all())


async def _load_session_ratings(session_id: str, user_id: Any, db: AsyncSession) -> dict[str, WorthItRating]:
    result = await db.execute(
        select(WorthItRating)
        .where(
            WorthItRating.session_id == session_id,
            WorthItRating.user_id == user_id,
        )
        .order_by(
            WorthItRating.updated_at.desc(),
            WorthItRating.created_at.desc(),
            WorthItRating.rated_at.desc(),
            WorthItRating.id.desc(),
        )
    )
    return _ratings_by_transaction_ref(result.scalars().all())


def _format_money(value: float) -> str:
    return f"${value:,.0f}" if float(value).is_integer() else f"${value:,.2f}"


def _now_utc() -> datetime:
    return datetime.now(timezone.utc)


def _tx_payload(tx: WorthItSessionTransaction, rating_value: str) -> dict[str, Any]:
    return {
        "id": tx.transaction_ref_id,
        "merchant": tx.merchant,
        "description": tx.description,
        "amount": float(tx.amount),
        "category": tx.category,
        "date": tx.tx_date.strftime("%b %d, %Y"),
        "initial": tx.initial,
        "rating": rating_value,
    }


def _empty_insights() -> dict:
    return {
        "total_reviewed_count": 0,
        "keep_count": 0,
        "cut_count": 0,
        "skip_count": 0,
        "keep_total_amount": 0.0,
        "cut_total_amount": 0.0,
        "skip_total_amount": 0.0,
        "top_kept_categories": [],
        "top_cut_categories": [],
        "biggest_kept_transaction": None,
        "biggest_cut_transaction": None,
        "recent_happy_transactions": [],
        "recent_not_happy_transactions": [],
        "summary_message": "Review a few transactions first, then your insights will appear here.",
        "category_breakdown": {},
        "total_saved_estimate": 0.0,
        "recurring_cuts": [],
        "week_over_week_trend": "stable",
    }


def _empty_last_30_days_insights() -> dict:
    return {
        "total_reviewed_count": 0,
        "keep_count": 0,
        "cut_count": 0,
        "skip_count": 0,
        "keep_total_amount": 0.0,
        "cut_total_amount": 0.0,
        "skip_total_amount": 0.0,
        "top_kept_categories": [],
        "top_cut_categories": [],
        "recent_happy_transactions": [],
        "recent_not_happy_transactions": [],
        "biggest_kept_transaction": None,
        "biggest_cut_transaction": None,
        "summary_message": "Review transactions to unlock your 30-day insights.",
    }


def _sort_category_stats(stats: dict[str, dict[str, Any]]) -> list[str]:
    ordered = sorted(
        stats.items(),
        key=lambda item: (
            -item[1]["count"],
            -item[1]["amount"],
            item[0].lower(),
        ),
    )
    return [category for category, _ in ordered[:3]]


def _build_review_payload(
    rating: WorthItRating,
    tx: WorthItSessionTransaction,
) -> dict[str, Any]:
    rating_value = rating.rating.value
    return _tx_payload(tx, rating_value)


def _build_last_30_days_insights(rows: list[tuple[WorthItRating, WorthItSessionTransaction]]) -> dict:
    rows = _dedupe_review_rows(rows)
    keep_count = cut_count = skip_count = 0
    keep_amount = cut_amount = skip_amount = 0.0
    category_stats: dict[str, dict[str, dict[str, Any]]] = {
        "keep": defaultdict(lambda: {"count": 0, "amount": 0.0}),
        "cut": defaultdict(lambda: {"count": 0, "amount": 0.0}),
    }
    recent_happy: list[dict[str, Any]] = []
    recent_not_happy: list[dict[str, Any]] = []
    biggest_keep: dict[str, Any] | None = None
    biggest_cut: dict[str, Any] | None = None

    for rating, tx in rows:
        rating_value = rating.rating.value
        amount = float(rating.amount if rating.amount is not None else tx.amount or 0)
        category = rating.category or tx.category or "Other"
        payload = _build_review_payload(rating, tx)

        if rating_value == WorthItRatingValue.KEEP.value:
            keep_count += 1
            keep_amount += amount
            category_stats["keep"][category]["count"] += 1
            category_stats["keep"][category]["amount"] += amount
            recent_happy.append(payload)
            if biggest_keep is None or amount > biggest_keep["amount"]:
                biggest_keep = payload
        elif rating_value == WorthItRatingValue.CUT.value:
            cut_count += 1
            cut_amount += amount
            category_stats["cut"][category]["count"] += 1
            category_stats["cut"][category]["amount"] += amount
            recent_not_happy.append(payload)
            if biggest_cut is None or amount > biggest_cut["amount"]:
                biggest_cut = payload
        else:
            skip_count += 1
            skip_amount += amount

    total_reviewed = keep_count + cut_count + skip_count
    summary_parts: list[str] = []
    if keep_count:
        summary_parts.append(f"You felt good about {keep_count} purchases worth {_format_money(keep_amount)}.")
    if cut_count:
        summary_parts.append(f"You marked {cut_count} purchases as not worth it, totaling {_format_money(cut_amount)}.")
    if skip_count:
        summary_parts.append(f"You skipped {skip_count} purchases worth {_format_money(skip_amount)}.")

    top_kept_categories = _sort_category_stats(category_stats["keep"])
    top_cut_categories = _sort_category_stats(category_stats["cut"])

    if top_kept_categories:
        summary_parts.append(f"Top kept categories: {', '.join(top_kept_categories)}.")
    if top_cut_categories:
        summary_parts.append(f"Top cut categories: {', '.join(top_cut_categories)}.")

    if not summary_parts:
        summary_parts.append("Review transactions to unlock your 30-day insights.")

    return {
        "total_reviewed_count": total_reviewed,
        "keep_count": keep_count,
        "cut_count": cut_count,
        "skip_count": skip_count,
        "keep_total_amount": round(keep_amount, 2),
        "cut_total_amount": round(cut_amount, 2),
        "skip_total_amount": round(skip_amount, 2),
        "top_kept_categories": top_kept_categories,
        "top_cut_categories": top_cut_categories,
        "recent_happy_transactions": recent_happy[:5],
        "recent_not_happy_transactions": recent_not_happy[:5],
        "biggest_kept_transaction": biggest_keep,
        "biggest_cut_transaction": biggest_cut,
        "summary_message": " ".join(summary_parts),
    }


async def _build_session_insights(
    session: WorthItSession,
    transactions: list[WorthItSessionTransaction],
    ratings: dict[str, WorthItRating],
    user_id: Any,
    db: AsyncSession,
) -> dict:
    if not transactions:
        return _empty_insights()

    transactions = _dedupe_session_transactions(transactions)
    ratings = _ratings_by_transaction_ref(list(ratings.values()))

    breakdown: dict[str, dict[str, Any]] = defaultdict(lambda: {
        "keep_count": 0,
        "cut_count": 0,
        "skip_count": 0,
        "total_amount": 0.0,
    })
    category_counts: dict[str, Counter] = {
        "keep": Counter(),
        "cut": Counter(),
    }
    reviewed: list[dict[str, Any]] = []
    happy: list[dict[str, Any]] = []
    not_happy: list[dict[str, Any]] = []
    keep_amount = cut_amount = skip_amount = 0.0
    keep_count = cut_count = skip_count = 0
    biggest_keep: dict[str, Any] | None = None
    biggest_cut: dict[str, Any] | None = None

    for tx in transactions:
        rating = ratings.get(tx.transaction_ref_id)
        if rating is None:
            continue
        rating_value = rating.rating.value
        amount = float(tx.amount or 0)
        cat = tx.category or "Other"

        reviewed.append(_tx_payload(tx, rating_value))
        breakdown[cat][f"{rating_value}_count"] += 1
        breakdown[cat]["total_amount"] += amount
        if rating.rating == WorthItRatingValue.KEEP:
            keep_count += 1
            keep_amount += amount
            category_counts["keep"][cat] += 1
            payload = _tx_payload(tx, rating_value)
            happy.append(payload)
            if biggest_keep is None or amount > biggest_keep["amount"]:
                biggest_keep = payload
        elif rating.rating == WorthItRatingValue.CUT:
            cut_count += 1
            cut_amount += amount
            category_counts["cut"][cat] += 1
            payload = _tx_payload(tx, rating_value)
            not_happy.append(payload)
            if biggest_cut is None or amount > biggest_cut["amount"]:
                biggest_cut = payload
        else:
            skip_count += 1
            skip_amount += amount

    reviewed_count = keep_count + cut_count + skip_count
    total_saved = cut_amount
    top_kept_categories = [cat for cat, _ in category_counts["keep"].most_common(5)]
    top_cut_categories = [cat for cat, _ in category_counts["cut"].most_common(5)]
    recent_happy = [tx for tx in reviewed if tx["rating"] == "keep"][:5]
    recent_not_happy = [tx for tx in reviewed if tx["rating"] == "cut"][:5]

    summary_parts: list[str] = []
    if keep_count:
        summary_parts.append(f"You felt good about {keep_count} purchases worth {_format_money(keep_amount)}.")
    if cut_count:
        summary_parts.append(f"You marked {cut_count} purchases as not worth it, totaling {_format_money(cut_amount)}.")
    if top_cut_categories:
        summary_parts.append(f"{top_cut_categories[0]} showed up most often in your Cut list.")
    if top_kept_categories:
        summary_parts.append(f"Most of your Keep choices were {top_kept_categories[0].lower()}.")
    if not summary_parts:
        summary_parts.append("Review a few transactions first, then your insights will appear here.")

    all_cuts_stmt = (
        select(WorthItRating.merchant, WorthItRating.session_id)
        .where(
            WorthItRating.user_id == user_id,
            WorthItRating.rating == WorthItRatingValue.CUT,
        )
        .distinct()
    )
    all_cuts = (await db.execute(all_cuts_stmt)).all()
    merchant_session_count: Counter = Counter(row.merchant for row in all_cuts if row.merchant)
    recurring_cuts = [m for m, cnt in merchant_session_count.most_common() if cnt >= 2]
    trend = await _compute_trend(str(session.id), user_id, db)

    return {
        "total_reviewed_count": reviewed_count,
        "keep_count": keep_count,
        "cut_count": cut_count,
        "skip_count": skip_count,
        "keep_total_amount": round(keep_amount, 2),
        "cut_total_amount": round(cut_amount, 2),
        "skip_total_amount": round(skip_amount, 2),
        "top_kept_categories": top_kept_categories,
        "top_cut_categories": top_cut_categories,
        "biggest_kept_transaction": biggest_keep,
        "biggest_cut_transaction": biggest_cut,
        "recent_happy_transactions": recent_happy[:5],
        "recent_not_happy_transactions": recent_not_happy[:5],
        "summary_message": " ".join(summary_parts),
        "category_breakdown": dict(breakdown),
        "total_saved_estimate": round(total_saved, 2),
        "recurring_cuts": recurring_cuts[:5],
        "week_over_week_trend": trend,
    }


def _ratings_by_transaction_ref(rows: list[WorthItRating]) -> dict[str, WorthItRating]:
    ratings: dict[str, WorthItRating] = {}
    for row in rows:
        ref_id = row.transaction_ref_id
        if not ref_id or ref_id in ratings:
            continue
        ratings[ref_id] = row
    return ratings


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


def _dedupe_ratings(rows: list[WorthItRating]) -> list[WorthItRating]:
    seen: set[str] = set()
    deduped: list[WorthItRating] = []
    for row in rows:
        ref_id = row.transaction_ref_id
        if not ref_id or ref_id in seen:
            continue
        seen.add(ref_id)
        deduped.append(row)
    return deduped


def _dedupe_review_rows(rows: list[tuple[WorthItRating, WorthItSessionTransaction]]) -> list[tuple[WorthItRating, WorthItSessionTransaction]]:
    seen: set[str] = set()
    deduped: list[tuple[WorthItRating, WorthItSessionTransaction]] = []
    for rating, tx in rows:
        ref_id = rating.transaction_ref_id or tx.transaction_ref_id
        if not ref_id or ref_id in seen:
            continue
        seen.add(ref_id)
        deduped.append((rating, tx))
    return deduped
