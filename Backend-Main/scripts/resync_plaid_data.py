"""
Direct Plaid re-sync script — bypasses HTTP auth.
Syncs transactions + balances for all users with active Plaid connections,
re-encrypting names with the current ENCRYPTION_KEY.
"""
import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from dotenv import load_dotenv
load_dotenv()

from sqlalchemy import select
from app.core.database import AsyncSessionLocal
from app.models.user import User
from app.models.account import Account
from app.core.supabase_client import get_encrypted_token
from app.services.plaid_sync import sync_plaid_transactions_for_item, sync_plaid_balances_for_item
from app.services.providers.plaid import PlaidAdapter
from app.core.logging import get_logger

logger = get_logger()


async def resync_all_plaid_users():
    async with AsyncSessionLocal() as db:
        # Get all users with active Plaid accounts
        stmt = (
            select(User)
            .join(Account, Account.user_id == User.id)
            .where(Account.provider == "plaid", Account.is_active == True)
            .distinct()
        )
        result = await db.execute(stmt)
        users = result.scalars().all()

        print(f"Found {len(users)} users with active Plaid accounts\n")

        adapter = PlaidAdapter()

        for user in users:
            print(f"Processing user: {user.id}")
            try:
                # Get all unique item_ids for this user
                acc_stmt = select(Account.item_id).where(
                    Account.user_id == user.id,
                    Account.provider == "plaid",
                    Account.is_active == True,
                    Account.item_id.isnot(None),
                ).distinct()
                acc_result = await db.execute(acc_stmt)
                item_ids = [row[0] for row in acc_result.all()]

                if not item_ids:
                    # Try getting token without item_id
                    item_ids = [None]

                for item_id in item_ids:
                    print(f"  item_id: {item_id}")
                    token_data = await get_encrypted_token(str(user.id), "plaid", item_id)
                    if not token_data:
                        print(f"  -> No token found, skipping")
                        continue

                    access_token = token_data.get("access_token")
                    resolved_item_id = item_id or token_data.get("item_id", "unknown")

                    if not access_token:
                        print(f"  -> No access_token in token_data, skipping")
                        continue

                    # Sync balances (re-encrypts account names)
                    try:
                        bal_result = await sync_plaid_balances_for_item(
                            db=db,
                            user=user,
                            item_id=resolved_item_id,
                            access_token=access_token,
                            adapter=adapter,
                        )
                        print(f"  -> Balances synced: {bal_result.get('synced', 0)} accounts")
                    except Exception as e:
                        print(f"  -> Balance sync error: {e}")

                    # Sync transactions (re-encrypts transaction names)
                    try:
                        txn_result = await sync_plaid_transactions_for_item(
                            db=db,
                            user=user,
                            item_id=resolved_item_id,
                            access_token=access_token,
                            adapter=adapter,
                        )
                        summary = txn_result.get("summary", {})
                        print(f"  -> Transactions synced: +{summary.get('added',0)} modified:{summary.get('modified',0)}")
                    except Exception as e:
                        print(f"  -> Transaction sync error: {e}")

            except Exception as e:
                print(f"  -> Error: {e}")

        print("\nDone. All Plaid data re-synced with current encryption key.")


if __name__ == "__main__":
    asyncio.run(resync_all_plaid_users())
