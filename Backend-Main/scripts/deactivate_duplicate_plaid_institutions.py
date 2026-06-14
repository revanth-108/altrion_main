"""
Detect duplicate Plaid institutions per user and deactivate older active items.

Duplicate definition:
    user_id + institution_id with more than one active Plaid item.

Dry-run by default. Use --apply to deactivate older items.
"""
from __future__ import annotations

import argparse
import asyncio
from dataclasses import dataclass
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from dotenv import load_dotenv

load_dotenv()

from sqlalchemy import func, select

from app.core.database import AsyncSessionLocal
from app.core.logging import get_logger
from app.models.provider_token import ProviderToken
from app.services.plaid_sync import (
    deactivate_plaid_accounts_for_item_ids,
    get_active_plaid_item_ids_for_institution,
)

logger = get_logger()


@dataclass
class DuplicateInstitutionGroup:
    user_id: str
    institution_id: str
    active_item_ids: list[str]


async def load_duplicate_institutions(db, user_id: str | None = None, institution_id: str | None = None) -> list[DuplicateInstitutionGroup]:
    stmt = (
        select(
            ProviderToken.user_id,
            ProviderToken.institution_id,
            func.count().label("row_count"),
        )
        .where(
            ProviderToken.provider == "plaid",
            ProviderToken.institution_id.isnot(None),
        )
        .group_by(ProviderToken.user_id, ProviderToken.institution_id)
        .having(func.count() > 1)
    )
    if user_id:
        stmt = stmt.where(ProviderToken.user_id == user_id)
    if institution_id:
        stmt = stmt.where(ProviderToken.institution_id == institution_id)

    result = await db.execute(stmt)
    rows = result.all()

    groups: list[DuplicateInstitutionGroup] = []
    for user_id_value, institution_id_value, _row_count in rows:
        active_item_ids = await get_active_plaid_item_ids_for_institution(
            db=db,
            user_id=user_id_value,
            institution_id=institution_id_value,
        )
        if len(active_item_ids) <= 1:
            continue
        groups.append(
            DuplicateInstitutionGroup(
                user_id=str(user_id_value),
                institution_id=institution_id_value,
                active_item_ids=active_item_ids,
            )
        )
    return groups


async def clean_duplicate_institutions(apply_changes: bool, user_id: str | None = None, institution_id: str | None = None) -> None:
    async with AsyncSessionLocal() as db:
        groups = await load_duplicate_institutions(db, user_id=user_id, institution_id=institution_id)
        print(f"Found {len(groups)} duplicate Plaid institutions")

        if not groups:
            return

        total_deactivated = 0
        for group in groups:
            keep_item_id = group.active_item_ids[0]
            older_item_ids = group.active_item_ids[1:]
            print(
                f"{'APPLY' if apply_changes else 'DRY RUN'} user_id={group.user_id} "
                f"institution_id={group.institution_id} keep_item_id={keep_item_id} "
                f"deactivate_item_ids={older_item_ids}"
            )
            if not apply_changes:
                continue

            deactivated_count = await deactivate_plaid_accounts_for_item_ids(
                db=db,
                user_id=group.user_id,
                item_ids=older_item_ids,
                reason="Deactivated because a newer Plaid item for the same institution was connected",
            )
            total_deactivated += deactivated_count

        if apply_changes:
            await db.commit()
            print(f"Deactivated {total_deactivated} Plaid account rows across duplicate institutions")


def main() -> None:
    parser = argparse.ArgumentParser(description="Deactivate older Plaid items for duplicate institutions.")
    parser.add_argument("--apply", action="store_true", help="Apply changes instead of dry run.")
    parser.add_argument("--user-id", dest="user_id", help="Optional internal user UUID to limit cleanup.")
    parser.add_argument("--institution-id", dest="institution_id", help="Optional institution id to limit cleanup.")
    args = parser.parse_args()
    asyncio.run(clean_duplicate_institutions(apply_changes=args.apply, user_id=args.user_id, institution_id=args.institution_id))


if __name__ == "__main__":
    main()
