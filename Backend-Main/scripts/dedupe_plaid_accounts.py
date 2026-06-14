"""
Find and safely deactivate duplicate Plaid account rows.

Duplicate key:
    user_id + provider + item_id + provider_account_id

Dry-run by default. Use --apply to write changes.
"""
from __future__ import annotations

import argparse
import asyncio
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from dotenv import load_dotenv
load_dotenv()

from sqlalchemy import func, select, text, update

from app.core.database import AsyncSessionLocal
from app.core.logging import get_logger
from app.models.account import Account
from app.models.holding import Holding
from app.models.investment_transaction import InvestmentTransaction
from app.models.recurring_stream import RecurringStream
from app.models.transaction import Transaction

logger = get_logger()


@dataclass
class DuplicateGroup:
    user_id: str
    provider: str
    item_id: str | None
    provider_account_id: str
    rows: list[Account]


def row_score(account: Account) -> tuple:
    return (
        int(account.balance_current is not None),
        int(account.balance_available is not None),
        int(account.balance_limit is not None),
        int(account.last_synced_at is not None),
        int(account.institution_id is not None),
        int(account.error_message is None),
        int(account.is_active),
        account.updated_at or datetime.min,
        account.created_at or datetime.min,
    )


async def load_duplicate_groups(db, user_id: str | None = None) -> list[DuplicateGroup]:
    stmt = (
        select(
            Account.user_id,
            Account.provider,
            Account.item_id,
            Account.provider_account_id,
        )
        .where(Account.provider == "plaid")
        .group_by(
            Account.user_id,
            Account.provider,
            Account.item_id,
            Account.provider_account_id,
        )
        .having(func.count() > 1)
    )
    if user_id:
        stmt = stmt.where(Account.user_id == user_id)

    result = await db.execute(stmt)
    rows = result.all()
    groups: list[DuplicateGroup] = []
    for user_id_value, provider, item_id, provider_account_id in rows:
        acc_stmt = (
            select(Account)
            .where(
                Account.user_id == user_id_value,
                Account.provider == provider,
                Account.item_id == item_id,
                Account.provider_account_id == provider_account_id,
            )
            .order_by(Account.updated_at.desc(), Account.created_at.desc())
        )
        acc_result = await db.execute(acc_stmt)
        accounts = acc_result.scalars().all()
        groups.append(
            DuplicateGroup(
                user_id=str(user_id_value),
                provider=provider,
                item_id=item_id,
                provider_account_id=provider_account_id,
                rows=accounts,
            )
        )
    return groups


async def clean_duplicates(apply_changes: bool, user_id: str | None = None) -> None:
    async with AsyncSessionLocal() as db:
        groups = await load_duplicate_groups(db, user_id=user_id)
        print(f"Found {len(groups)} duplicate Plaid account groups")
        total_rows = sum(len(group.rows) for group in groups)
        print(f"Duplicate rows involved: {total_rows}")

        if not apply_changes:
            for group in groups:
                keeper = max(group.rows, key=row_score)
                print(
                    f"DRY RUN keep={keeper.id} user_id={group.user_id} item_id={group.item_id} "
                    f"provider_account_id={group.provider_account_id} duplicates={[str(row.id) for row in group.rows if row.id != keeper.id]}"
                )
            return

        moved_children = 0
        deactivated = 0

        for group in groups:
            keeper = max(group.rows, key=row_score)
            duplicates = [row for row in group.rows if row.id != keeper.id]

            for duplicate in duplicates:
                await db.execute(update(Transaction).where(Transaction.account_id == duplicate.id).values(account_id=keeper.id))
                await db.execute(update(InvestmentTransaction).where(InvestmentTransaction.account_id == duplicate.id).values(account_id=keeper.id))
                await db.execute(update(Holding).where(Holding.account_id == duplicate.id).values(account_id=keeper.id))
                await db.execute(update(RecurringStream).where(RecurringStream.account_id == duplicate.id).values(account_id=keeper.id))
                await db.execute(
                    text("UPDATE public.liabilities SET account_id = :keeper_id WHERE account_id = :duplicate_id"),
                    {"keeper_id": str(keeper.id), "duplicate_id": str(duplicate.id)},
                )
                duplicate.is_active = False
                duplicate.error_message = "Duplicate Plaid account deactivated"
                moved_children += 1
                deactivated += 1

            keeper.is_active = True
            keeper.error_message = None

        await db.commit()
        print(f"Moved child rows for {moved_children} duplicate accounts")
        print(f"Deactivated {deactivated} duplicate accounts")


def main() -> None:
    parser = argparse.ArgumentParser(description="Deactivate duplicate Plaid accounts safely.")
    parser.add_argument("--apply", action="store_true", help="Apply changes instead of dry run.")
    parser.add_argument("--user-id", dest="user_id", help="Optional internal user UUID to limit cleanup.")
    args = parser.parse_args()
    asyncio.run(clean_duplicates(apply_changes=args.apply, user_id=args.user_id))


if __name__ == "__main__":
    main()
