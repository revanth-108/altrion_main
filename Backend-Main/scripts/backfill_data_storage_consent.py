"""
Admin-only one-off backfill for users who completed onboarding but never had
users.data_storage_consent persisted.

The backend does not currently store an explicit "terms accepted" flag, so the
best durable proxy available is a completed onboarding profile:
- nickname present
- date_of_birth present
- annual_income present
- income_source present

Dry-run is the default. Use --apply to write changes and --refresh to run the
Plaid refresh stack for the affected users after consent is granted.
"""
from __future__ import annotations

import argparse
import asyncio
import sys
from pathlib import Path
from typing import Sequence

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from dotenv import load_dotenv

load_dotenv()

from sqlalchemy import select

from app.core.database import AsyncSessionLocal
from app.core.logging import get_logger
from app.models.user import User
from app.services.data_consent import apply_data_storage_consent
from app.services.plaid_sync import sync_plaid_refresh_for_user

logger = get_logger()


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Backfill data_storage_consent for completed onboarding users.")
    parser.add_argument("--apply", action="store_true", help="Write updates instead of dry-running.")
    parser.add_argument("--refresh", action="store_true", help="Run Plaid refresh for affected users after updating consent.")
    parser.add_argument("--user-id", dest="user_id", help="Limit to one internal user UUID for testing.")
    parser.add_argument("--email", help="Limit to one user email for testing.")
    parser.add_argument("--limit", type=int, default=None, help="Maximum number of matching users to process.")
    return parser


def onboarding_complete(user: User) -> bool:
    """Conservative proxy for onboarding completion.

    We do not have a server-side terms-accepted flag, so we only target users
    with the full profile data set that onboarding collects before the terms
    screen.
    """
    return bool(
        user.nickname
        and user.date_of_birth is not None
        and user.annual_income is not None
        and user.income_source is not None
    )


async def fetch_candidates(db, *, user_id: str | None = None, email: str | None = None, limit: int | None = None) -> list[User]:
    stmt = select(User).where(
        (User.data_storage_consent.is_(False) | User.data_storage_consent.is_(None)),
        User.nickname.is_not(None),
        User.date_of_birth.is_not(None),
        User.annual_income.is_not(None),
        User.income_source.is_not(None),
    ).order_by(User.updated_at.asc())

    if user_id:
        stmt = stmt.where(User.id == user_id)
    if email:
        stmt = stmt.where(User.email == email.strip().lower())
    if limit:
        stmt = stmt.limit(limit)

    result = await db.execute(stmt)
    return list(result.scalars().all())


async def run_backfill(args: argparse.Namespace) -> int:
    async with AsyncSessionLocal() as db:
        candidates = await fetch_candidates(
            db,
            user_id=args.user_id,
            email=args.email,
            limit=args.limit,
        )

        eligible = [user for user in candidates if onboarding_complete(user)]
        logger.info(
            "data_storage_consent_backfill_dry_run" if not args.apply else "data_storage_consent_backfill_apply_start",
            matched_users=len(candidates),
            eligible_users=len(eligible),
            apply=args.apply,
            refresh=args.refresh,
        )

        for user in eligible[:20]:
            logger.info(
                "data_storage_consent_backfill_candidate",
                user_id=str(user.id),
                email=user.email,
                nickname=user.nickname,
                date_of_birth=str(user.date_of_birth) if user.date_of_birth else None,
                annual_income=str(user.annual_income) if user.annual_income is not None else None,
                income_source=user.income_source,
                current_consent=user.data_storage_consent,
            )

        if not args.apply:
            print(f"DRY RUN: {len(eligible)} user(s) would be updated.")
            return 0

        updated_users: list[User] = []
        for user in eligible:
            apply_data_storage_consent(user, True)
            updated_users.append(user)

        await db.commit()
        logger.info(
            "data_storage_consent_backfill_apply_complete",
            updated_users=len(updated_users),
            matched_users=len(candidates),
        )
        print(f"UPDATED: {len(updated_users)} user(s) set to data_storage_consent=true.")

        if args.refresh:
            refreshed = 0
            for user in updated_users:
                try:
                    result = await sync_plaid_refresh_for_user(db=db, user=user)
                    refreshed += 1
                    logger.info(
                        "data_storage_consent_backfill_refresh_complete",
                        user_id=str(user.id),
                        item_count=result.get("item_count", 0),
                        success=result.get("success"),
                    )
                except Exception as exc:
                    logger.error(
                        "data_storage_consent_backfill_refresh_failed",
                        user_id=str(user.id),
                        error=str(exc),
                    )
            print(f"REFRESHED: {refreshed} user(s) via Plaid refresh.")

        return 0


def main(argv: Sequence[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    return asyncio.run(run_backfill(args))


if __name__ == "__main__":
    raise SystemExit(main())
