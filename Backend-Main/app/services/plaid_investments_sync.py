"""
Shared Plaid investment sync logic used by both Plaid endpoints and portfolio refresh.
"""
from __future__ import annotations

from datetime import datetime
from typing import Any

from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.logging import get_logger
from app.models.account import Account
from app.models.provider_token import ProviderToken
from app.models.user import User
from app.services import plaid_persist
from app.services.plaid_safe import parse_token_data, value_type
from app.services.providers.plaid import PlaidAdapter
from app.services.plaid_utils import plaid_error_context

logger = get_logger()


async def sync_plaid_investments_for_user(
    db: AsyncSession,
    user: User,
    item_id: str | None = None,
) -> dict[str, Any]:
    stmt = select(ProviderToken).where(
        ProviderToken.user_id == user.id,
        ProviderToken.provider == "plaid",
    ).order_by(desc(ProviderToken.created_at))
    internal_user_id = str(user.id)

    result = await db.execute(stmt)
    all_token_rows = result.scalars().all()
    token_rows = []
    seen_item_ids: set[str] = set()
    for row in all_token_rows:
        token_data = parse_token_data(row.token_data)
        resolved_item_id = row.item_id or token_data.get("item_id")
        if resolved_item_id and row.item_id != resolved_item_id:
            row.item_id = resolved_item_id
        if item_id and resolved_item_id != item_id:
            continue
        if resolved_item_id and resolved_item_id in seen_item_ids:
            continue
        if resolved_item_id:
            account_stmt = select(Account.id).where(
                Account.user_id == user.id,
                Account.provider == "plaid",
                Account.item_id == resolved_item_id,
                Account.is_active == True,
            ).limit(1)
            account_result = await db.execute(account_stmt)
            if not account_result.scalar_one_or_none():
                continue
        if resolved_item_id:
            seen_item_ids.add(resolved_item_id)
        token_rows.append(row)

    if not token_rows:
        return {
            "success": True,
            "items": [],
            "securities_upserted": 0,
            "holdings_upserted": 0,
            "errors": [],
        }

    adapter = PlaidAdapter()
    items: list[dict[str, Any]] = []
    errors: list[dict[str, str]] = []
    total_securities = 0
    total_holdings = 0

    for token_row in token_rows:
        token_data = parse_token_data(token_row.token_data)
        access_token = token_data.get("access_token")
        resolved_item_id = token_row.item_id or token_data.get("item_id")
        institution_id = token_row.institution_id

        if resolved_item_id and token_row.item_id != resolved_item_id:
            token_row.item_id = resolved_item_id

        if not access_token:
            message = "Plaid sync failed: access token missing or token_data could not be parsed"
            logger.warning(
                "Plaid investment sync skipped missing access token",
                user_id=internal_user_id,
                item_id=resolved_item_id,
                institution_id=institution_id,
                provider=token_row.provider,
                token_data_type=value_type(token_row.token_data),
                access_token_present=False,
            )
            errors.append({"item_id": resolved_item_id or "", "sync_step": "investments/holdings/get", "error": message})
            continue
        try:
            logger.info(
                "Plaid API call started",
                endpoint="investments/holdings/get",
                user_id=internal_user_id,
                item_id=resolved_item_id,
                institution_id=institution_id,
            )
            data = await adapter.get_holdings(access_token)
            holdings_raw = data["holdings"]
            securities_raw = data["securities"]
            logger.info(
                "Plaid API call succeeded",
                endpoint="investments/holdings/get",
                user_id=internal_user_id,
                item_id=resolved_item_id,
                institution_id=institution_id,
                request_id=None,
                holdings_count=len(holdings_raw),
                securities_count=len(securities_raw),
            )

            account_stmt = select(Account).where(
                Account.user_id == user.id,
                Account.provider == "plaid",
                Account.item_id == resolved_item_id,
            )
            account_result = await db.execute(account_stmt)
            account_rows = account_result.scalars().all()
            account_map = {acc.provider_account_id: acc.id for acc in account_rows}
            account_obj_map = {acc.provider_account_id: acc for acc in account_rows}

            security_map, securities_data_map = await plaid_persist.upsert_securities(db, securities_raw)
            holdings_upserted = await plaid_persist.upsert_holdings(
                db=db,
                user_id=user.id,
                account_map=account_map,
                holdings=holdings_raw,
                security_map=security_map,
                securities_data_map=securities_data_map,
                item_id=resolved_item_id,
            )

            now = datetime.utcnow()
            touched = {h.get("account_id") for h in holdings_raw}
            for plaid_account_id in touched:
                account = account_obj_map.get(plaid_account_id)
                if account:
                    account.last_synced_at = now

            await db.commit()

            securities_upserted = len(security_map)
            total_securities += securities_upserted
            total_holdings += holdings_upserted
            items.append(
                {
                    "item_id": resolved_item_id,
                    "institution_id": institution_id,
                    "securities_upserted": securities_upserted,
                    "holdings_upserted": holdings_upserted,
                    "holdings_total": len(holdings_raw),
                    "skipped": 0,
                }
            )
        except Exception as exc:
            await db.rollback()
            logger.error(
                "Plaid API call failed",
                endpoint="investments/holdings/get",
                item_id=resolved_item_id,
                user_id=internal_user_id,
                institution_id=institution_id,
                **plaid_error_context(exc),
            )
            errors.append({"item_id": resolved_item_id or "", "sync_step": "investments/holdings/get", "error": str(exc)})

    return {
        "success": len(errors) == 0,
        "items": items,
        "securities_upserted": total_securities,
        "holdings_upserted": total_holdings,
        "errors": errors,
    }
