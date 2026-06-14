"""
Restore Plaid sandbox data for all users with stored tokens.
Creates account rows from balance data, then syncs transactions.
"""
import asyncio
import sys
import httpx
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from dotenv import load_dotenv
load_dotenv()

import os
from datetime import datetime
from sqlalchemy import select, delete
from app.core.database import AsyncSessionLocal
from app.models.user import User
from app.models.account import Account
from app.models.provider_token import ProviderToken
from app.core.supabase_client import get_encrypted_token
from app.services.plaid_sync import sync_plaid_transactions_for_item
from app.services.providers.plaid import PlaidAdapter
from app.services.plaid_safe import normalize_plaid_list, normalize_plaid_value

PLAID_CLIENT_ID = os.getenv("PLAID_CLIENT_ID")
PLAID_SECRET = os.getenv("PLAID_SECRET")
PLAID_BASE_URL = "https://sandbox.plaid.com"
HEADERS = {
    "Content-Type": "application/json",
    "PLAID-CLIENT-ID": PLAID_CLIENT_ID,
    "PLAID-SECRET": PLAID_SECRET,
}


async def get_plaid_accounts(access_token: str) -> list:
    """Fetch accounts directly from Plaid /accounts/balance/get."""
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(
            f"{PLAID_BASE_URL}/accounts/balance/get",
            headers=HEADERS,
            json={"access_token": access_token},
        )
        resp.raise_for_status()
        data = resp.json()
        return data.get("accounts", [])


async def create_accounts_from_plaid(db, user: User, item_id: str, accounts_raw: list) -> dict:
    """Upsert Plaid accounts into the DB and return account_map."""
    account_map = {}
    for raw in accounts_raw:
        plaid_account_id = raw.get("account_id") or raw.get("id")
        if not plaid_account_id:
            continue

        balances = raw.get("balances", {})

        stmt = select(Account).where(
            Account.user_id == user.id,
            Account.provider == "plaid",
            Account.provider_account_id == plaid_account_id,
        )
        result = await db.execute(stmt)
        existing = result.scalar_one_or_none()

        if existing:
            existing.name = raw.get("name", existing.name)
            existing.account_type = raw.get("type", existing.account_type)
            existing.subtype = raw.get("subtype", existing.subtype)
            existing.mask = raw.get("mask", existing.mask)
            existing.item_id = item_id
            existing.is_active = True
            existing.balance_current = balances.get("current")
            existing.balance_available = balances.get("available")
            existing.balance_limit = balances.get("limit")
            existing.balance_currency = balances.get("iso_currency_code", "USD")
            existing.last_synced_at = datetime.utcnow()
            account_map[plaid_account_id] = str(existing.id)
        else:
            new_acc = Account(
                user_id=user.id,
                provider="plaid",
                provider_account_id=plaid_account_id,
                name=raw.get("name", "Plaid Account"),
                account_type=raw.get("type", "depository"),
                subtype=raw.get("subtype"),
                mask=raw.get("mask"),
                item_id=item_id,
                is_active=True,
                balance_current=balances.get("current"),
                balance_available=balances.get("available"),
                balance_limit=balances.get("limit"),
                balance_currency=balances.get("iso_currency_code", "USD"),
                last_synced_at=datetime.utcnow(),
            )
            db.add(new_acc)
            await db.flush()
            account_map[plaid_account_id] = str(new_acc.id)

    await db.commit()
    return account_map


async def main():
    async with AsyncSessionLocal() as db:
        stmt = select(ProviderToken).where(ProviderToken.provider == "plaid")
        result = await db.execute(stmt)
        tokens = result.scalars().all()
        print(f"Found {len(tokens)} stored Plaid tokens\n")

        adapter = PlaidAdapter()

        for token_row in tokens:
            print(f"User: {token_row.user_id}")
            try:
                token_data = await get_encrypted_token(str(token_row.user_id), "plaid", token_row.item_id)
                if not token_data:
                    print("  No token data, skip")
                    continue

                access_token = token_data.get("access_token")
                item_id = token_data.get("item_id") or token_row.item_id
                if not access_token:
                    print("  No access_token, skip")
                    continue

                # Get user
                user_stmt = select(User).where(User.id == token_row.user_id)
                user_result = await db.execute(user_stmt)
                user = user_result.scalar_one_or_none()
                if not user:
                    print("  No user found, skip")
                    continue

                # Ensure consent is set
                user.data_storage_consent = True
                await db.commit()

                # Step 1: Fetch accounts from Plaid directly
                print("  Fetching accounts from Plaid...")
                try:
                    accounts_raw = await get_plaid_accounts(access_token)
                    print(f"  Got {len(accounts_raw)} accounts from Plaid")
                except Exception as e:
                    print(f"  Failed to get accounts: {e}")
                    continue

                # Step 2: Create/update account rows in DB
                account_map = await create_accounts_from_plaid(db, user, item_id, accounts_raw)
                print(f"  Created/updated {len(account_map)} account rows")
                for plaid_id, db_id in account_map.items():
                    print(f"    {plaid_id[:20]}... -> DB:{db_id[:8]}...")

                # Step 3: Sync transactions (uses item cursor, fetches full history)
                print("  Syncing transactions...")
                try:
                    txn = await sync_plaid_transactions_for_item(
                        db=db, user=user, item_id=item_id,
                        access_token=access_token, adapter=adapter,
                    )
                    s = txn.get("summary", {})
                    print(f"  Transactions: +{s.get('added',0)} modified:{s.get('modified',0)} removed:{s.get('removed',0)}")
                except Exception as e:
                    print(f"  Transaction sync error: {e}")

            except Exception as e:
                print(f"  Error: {e}")
            print()

    print("Restore complete. Check localhost:5173/dashboard/transactions")


if __name__ == "__main__":
    asyncio.run(main())
