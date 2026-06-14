"""
Consent helpers for backend data persistence.
"""
from datetime import datetime

from sqlalchemy import delete, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.account import Account
from app.models.holding import Holding
from app.models.investment_transaction import InvestmentTransaction
from app.models.portfolio_valuation_snapshot import PortfolioValuationSnapshot
from app.models.recurring_stream import RecurringStream
from app.models.transaction import Transaction
from app.models.user import User


DATA_STORAGE_CONSENT_VERSION = "2026-05-02"


def should_persist_user_data(user: User) -> bool:
    """Return True only when the user has explicitly opted into storage."""
    return bool(getattr(user, "data_storage_consent", False))


def apply_data_storage_consent(user: User, consent: bool) -> None:
    """Update the user's storage consent metadata."""
    user.data_storage_consent = consent
    if consent:
        user.data_storage_consent_version = DATA_STORAGE_CONSENT_VERSION
        user.data_storage_consent_at = datetime.utcnow()
    else:
        user.data_storage_consent_version = None
        user.data_storage_consent_at = None


async def purge_stored_plaid_data(db: AsyncSession, user_id, item_id: str | None = None) -> None:
    """
    Delete previously persisted Plaid-derived data while keeping the access token.

    When item_id is provided, only rows for that Plaid item are removed.
    This keeps multi-item users from losing unrelated accounts/assets.
    """
    account_query = select(Account.id).where(
        Account.user_id == user_id,
        Account.provider == "plaid",
    )
    if item_id:
        account_query = account_query.where(Account.item_id == item_id)

    result = await db.execute(account_query)
    plaid_account_ids = [row[0] for row in result.all()]

    if plaid_account_ids:
        await db.execute(delete(Transaction).where(Transaction.account_id.in_(plaid_account_ids)))
        await db.execute(delete(InvestmentTransaction).where(InvestmentTransaction.account_id.in_(plaid_account_ids)))
        await db.execute(delete(Holding).where(Holding.account_id.in_(plaid_account_ids)))
        await db.execute(delete(RecurringStream).where(RecurringStream.account_id.in_(plaid_account_ids)))
        await db.execute(
            text("""
                DELETE FROM public.liabilities
                WHERE user_id = :user_id
                  AND account_id = ANY(CAST(:account_ids AS uuid[]))
            """),
            {"user_id": str(user_id), "account_ids": [str(account_id) for account_id in plaid_account_ids]},
        )

    if item_id is None:
        await db.execute(delete(RecurringStream).where(RecurringStream.user_id == user_id))
        await db.execute(delete(PortfolioValuationSnapshot).where(PortfolioValuationSnapshot.user_id == user_id))
        await db.execute(text("DELETE FROM public.liabilities WHERE user_id = :user_id"), {"user_id": str(user_id)})

    account_delete_stmt = delete(Account).where(
        Account.user_id == user_id,
        Account.provider == "plaid",
    )
    if item_id:
        account_delete_stmt = account_delete_stmt.where(Account.item_id == item_id)
    await db.execute(account_delete_stmt)
