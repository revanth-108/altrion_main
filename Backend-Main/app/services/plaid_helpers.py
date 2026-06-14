"""Shared Plaid lookup helpers.

These helpers centralize the repeated user, item, and access-token lookup
patterns used by the Plaid controllers and sync services.
"""
from __future__ import annotations

from uuid import UUID

from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession
from fastapi import HTTPException

from app.models.provider_token import ProviderToken
from app.models.user import User


USER_NOT_FOUND_DETAIL = "User not found"
PLAID_ITEM_NOT_FOUND_DETAIL = "No Plaid account connected. Please connect a bank account first."
PLAID_ITEM_SCOPE_NOT_FOUND_DETAIL = "Plaid item not found for current user"


async def get_user_by_supabase_id(
    db: AsyncSession,
    supabase_user_id: str,
) -> User:
    """Return the internal User row for a Supabase user id."""
    stmt = select(User).where(User.supabase_user_id == supabase_user_id)
    result = await db.execute(stmt)
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail=USER_NOT_FOUND_DETAIL)
    return user


async def get_plaid_token_row_for_user(
    db: AsyncSession,
    user_id: str | UUID,
    item_id: str | None = None,
    *,
    active_only: bool = True,
) -> ProviderToken | None:
    """Return the newest Plaid provider token row matching the given user/item."""
    stmt = select(ProviderToken).where(
        ProviderToken.user_id == user_id,
        ProviderToken.provider == "plaid",
    )
    if active_only:
        stmt = stmt.where(ProviderToken.is_active == True)
    if item_id:
        stmt = stmt.where(ProviderToken.item_id == item_id)
    else:
        stmt = stmt.order_by(desc(ProviderToken.created_at))

    result = await db.execute(stmt)
    return result.scalar_one_or_none()
