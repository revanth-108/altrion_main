"""
Shared Plaid sync helpers.

These helpers keep Plaid fetch/persist behavior consistent between the
dedicated Plaid endpoints, initial Link exchange, and portfolio refresh.
"""
from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import Any

from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.logging import get_logger
from app.models.account import Account
from app.models.holding import Holding
from app.models.provider_token import ProviderToken
from app.models.user import User
from app.services import plaid_persist
from app.services.normalization import NormalizationService
from app.services.plaid_safe import normalize_plaid_list, normalize_plaid_value, parse_token_data, value_type
from app.services.plaid_utils import plaid_error_context
from app.services.plaid_investments_sync import sync_plaid_investments_for_user
from app.services.providers.plaid import PlaidAdapter

logger = get_logger()

ASSET_DEPOSITORY_SUBTYPES = {
    "checking",
    "savings",
    "cash management",
    "money market",
    "cd",
}

LIABILITY_LOAN_SUBTYPES = {
    "mortgage",
    "student",
    "auto",
    "personal",
    "loan",
    "home equity",
}


def normalize_account_type(value: str | None) -> str:
    return (value or "").strip().lower()


def classify_plaid_account(account_type: str | None, subtype: str | None) -> str:
    """
    Classify Plaid accounts for financial totals.

    asset: positive-value accounts that can contribute to portfolio/assets.
    liability: debt accounts that must stay out of portfolio/assets.
    other: connected metadata that should not affect totals.
    """
    account_type_norm = normalize_account_type(account_type)
    subtype_norm = normalize_account_type(subtype)

    if account_type_norm == "credit" or subtype_norm == "credit card":
        return "liability"
    if account_type_norm == "loan" or subtype_norm in LIABILITY_LOAN_SUBTYPES:
        return "liability"
    if account_type_norm == "investment":
        return "asset"
    if account_type_norm == "depository":
        return "asset" if not subtype_norm or subtype_norm in ASSET_DEPOSITORY_SUBTYPES else "other"
    return "other"


def is_asset_account(account_type: str | None, subtype: str | None) -> bool:
    return classify_plaid_account(account_type, subtype) == "asset"


def is_liability_account(account_type: str | None, subtype: str | None) -> bool:
    return classify_plaid_account(account_type, subtype) == "liability"


def positive_debt_amount(balance) -> float | None:
    if balance is None:
        return None
    try:
        return abs(float(balance))
    except (TypeError, ValueError):
        return None


def account_role_label(account_type: str | None, subtype: str | None) -> str:
    classification = classify_plaid_account(account_type, subtype)
    account_type_norm = normalize_account_type(account_type)
    subtype_norm = normalize_account_type(subtype)

    if classification == "liability":
        if account_type_norm == "credit" or subtype_norm == "credit card":
            return "Credit Card / Liability"
        if subtype_norm:
            return f"{subtype_norm.title()} Loan / Liability"
        return "Loan / Liability"
    if classification == "asset":
        if account_type_norm == "investment":
            return "Investment Account / Asset"
        return "Bank Account / Asset"
    return "Connected Account"


def depository_cash_amount(account_data: dict[str, Any]) -> float | None:
    """Return the asset value for supported Plaid depository accounts."""
    account_data = normalize_plaid_value(account_data)
    if not is_asset_account(account_data.get("type"), account_data.get("subtype")):
        return None

    # Current balance is the dashboard value. Available is only a fallback
    # because some institutions do not provide it consistently.
    amount = account_data.get("current")
    if amount is None:
        amount = account_data.get("available")
    if amount is None:
        return None
    try:
        parsed = float(amount)
    except (TypeError, ValueError):
        return None
    return parsed if parsed > 0 else None


async def upsert_plaid_cash_holding(
    db: AsyncSession,
    user_id,
    account_id,
    amount: float | None,
) -> bool:
    """
    Persist a depository account balance as the USD cash holding consumed by
    portfolio aggregation.

    This intentionally bypasses asset_mappings; USD cash from Plaid balances is
    already canonical and should not depend on seed data.
    """
    if amount is None:
        return False

    stmt = select(Holding).where(
        Holding.account_id == account_id,
        Holding.source == "plaid",
        Holding.asset_class == "cash_equivalent",
        Holding.security_id.is_(None),
    )
    result = await db.execute(stmt)
    existing = result.scalar_one_or_none()
    now = datetime.utcnow()

    if existing:
        existing.canonical_symbol = "USD"
        existing.asset_class = "cash_equivalent"
        existing.quantity = Decimal(str(amount))
        existing.institution_price = Decimal("1")
        existing.institution_value = Decimal(str(amount))
        existing.retrieved_at = now
        existing.last_updated = now
    else:
        db.add(
            Holding(
                user_id=user_id,
                account_id=account_id,
                canonical_symbol="USD",
                asset_class="cash_equivalent",
                quantity=Decimal(str(amount)),
                institution_price=Decimal("1"),
                institution_value=Decimal(str(amount)),
                source="plaid",
                retrieved_at=now,
            )
        )

    return True




async def mark_plaid_item_failed(
    db: AsyncSession,
    user_id,
    item_id: str | None,
    message: str,
) -> None:
    stmt = select(Account).where(
        Account.user_id == user_id,
        Account.provider == "plaid",
    )
    if item_id:
        stmt = stmt.where(Account.item_id == item_id)

    result = await db.execute(stmt)
    for account in result.scalars().all():
        account.error_message = message
    await db.commit()


async def get_plaid_token_rows_for_user(
    db: AsyncSession,
    user_id,
    item_id: str | None = None,
) -> list[ProviderToken]:
    """
    Return every Plaid provider_tokens row for a user.

    When item_id is provided, rows are matched against both the stored item_id
    column and legacy rows whose token_data still carries the Plaid item_id.
    """
    stmt = select(ProviderToken).where(
        ProviderToken.user_id == user_id,
        ProviderToken.provider == "plaid",
    ).order_by(desc(ProviderToken.created_at))
    result = await db.execute(stmt)
    rows = result.scalars().all()

    if item_id is None:
        deduped_rows: list[ProviderToken] = []
        seen_item_ids: set[str] = set()
        for row in rows:
            token_data = parse_token_data(row.token_data)
            resolved_item_id = row.item_id or token_data.get("item_id")
            if resolved_item_id:
                if resolved_item_id in seen_item_ids:
                    continue
                seen_item_ids.add(resolved_item_id)
                if row.item_id != resolved_item_id:
                    row.item_id = resolved_item_id
            deduped_rows.append(row)
        return deduped_rows

    matched_rows: list[ProviderToken] = []
    seen_item_ids: set[str] = set()
    for row in rows:
        token_data = parse_token_data(row.token_data)
        resolved_item_id = row.item_id or token_data.get("item_id")
        if resolved_item_id == item_id and resolved_item_id not in seen_item_ids:
            if row.item_id != resolved_item_id:
                row.item_id = resolved_item_id
            matched_rows.append(row)
            seen_item_ids.add(resolved_item_id)

    return matched_rows


async def sync_plaid_step_for_user(
    db: AsyncSession,
    user: User,
    sync_name: str,
    sync_fn,
    *,
    item_id: str | None = None,
    adapter: PlaidAdapter | None = None,
    sync_kwargs: dict | None = None,
) -> dict[str, Any]:
    """
    Run one Plaid sync function for every connected item or a single item.

    The response includes per-item success/failure entries so callers can keep
    syncing when one Plaid Item errors out.
    """
    token_rows = await get_plaid_token_rows_for_user(db, user.id, item_id=item_id)
    if item_id is not None and not token_rows:
        raise LookupError(f"No Plaid item found for item_id={item_id}")

    adapter = adapter or PlaidAdapter()
    sync_kwargs = sync_kwargs or {}
    items: list[dict[str, Any]] = []
    errors: list[dict[str, str]] = []

    for token_row in token_rows:
        token_data = parse_token_data(token_row.token_data)
        access_token = token_data.get("access_token")
        resolved_item_id = token_row.item_id or token_data.get("item_id")
        institution_id = token_row.institution_id

        if resolved_item_id and token_row.item_id != resolved_item_id:
            token_row.item_id = resolved_item_id

        if not resolved_item_id:
            message = "Plaid sync failed: item_id missing on provider token"
            logger.warning(
                "Plaid sync skipped missing item_id",
                user_id=str(user.id),
                item_id=None,
                institution_id=institution_id,
                sync_step=sync_name,
                provider=token_row.provider,
                token_data_type=value_type(token_row.token_data),
            )
            errors.append(
                {
                    "item_id": "",
                    "sync_step": sync_name,
                    "error": message,
                    "plaid_error_code": None,
                    "plaid_error_message": message,
                }
            )
            items.append(
                {
                    "item_id": "",
                    "institution_id": institution_id,
                    "success": False,
                    "error": message,
                }
            )
            continue

        if not access_token:
            message = "Plaid sync failed: access token missing or token_data could not be parsed"
            logger.warning(
                "Plaid sync skipped missing access token",
                user_id=str(user.id),
                item_id=resolved_item_id,
                institution_id=institution_id,
                sync_step=sync_name,
                provider=token_row.provider,
                token_data_type=value_type(token_row.token_data),
                access_token_present=False,
            )
            errors.append(
                {
                    "item_id": resolved_item_id,
                    "sync_step": sync_name,
                    "error": message,
                    "plaid_error_code": None,
                    "plaid_error_message": message,
                }
            )
            items.append(
                {
                    "item_id": resolved_item_id,
                    "institution_id": institution_id,
                    "success": False,
                    "error": message,
                }
            )
            continue

        try:
            result = await sync_fn(
                db=db,
                user=user,
                item_id=resolved_item_id,
                access_token=access_token,
                adapter=adapter,
                **sync_kwargs,
            )
            items.append(
                {
                    "item_id": resolved_item_id,
                    "institution_id": institution_id,
                    "success": True,
                    "result": result,
                }
            )
        except Exception as exc:
            await db.rollback()
            context = plaid_error_context(exc)
            logger.error(
                "Plaid item sync step failed",
                user_id=str(user.id),
                item_id=resolved_item_id,
                institution_id=institution_id,
                sync_step=sync_name,
                **context,
            )
            errors.append(
                {
                    "item_id": resolved_item_id,
                    "sync_step": sync_name,
                    "error": context.get("plaid_display_message") or context.get("error") or str(exc),
                    "plaid_error_type": context.get("plaid_error_type"),
                    "plaid_error_code": context.get("plaid_error_code"),
                    "plaid_error_message": context.get("plaid_display_message") or context.get("error") or str(exc),
                    "request_id": context.get("request_id"),
                }
            )
            items.append(
                {
                    "item_id": resolved_item_id,
                    "institution_id": institution_id,
                    "success": False,
                    "error": context.get("plaid_display_message") or context.get("error") or str(exc),
                }
            )

    return {
        "success": len(errors) == 0,
        "items": items,
        "errors": errors,
        "item_count": len(token_rows),
    }


async def sync_plaid_refresh_for_user(
    db: AsyncSession,
    user: User,
    item_id: str | None = None,
) -> dict[str, Any]:
    """
    Run the standard Plaid refresh stack for one item or every connected item.

    This is intended for UI refresh actions and webhook-driven refreshes.
    """
    adapter = PlaidAdapter()
    step_specs = (
        ("balances", "accounts/balance/get", sync_plaid_balances_for_item, {}),
        ("transactions", "transactions/sync", sync_plaid_transactions_for_item, {}),
        ("recurring", "transactions/recurring/get", sync_plaid_recurring_for_item, {}),
        ("liabilities", "liabilities/get", sync_plaid_liabilities_for_item, {}),
    )

    steps: list[dict[str, Any]] = []
    all_items: list[dict[str, Any]] = []
    all_errors: list[dict[str, Any]] = []

    for sync_name, endpoint, sync_fn, sync_kwargs in step_specs:
        step_result = await sync_plaid_step_for_user(
            db=db,
            user=user,
            sync_name=sync_name,
            sync_fn=sync_fn,
            item_id=item_id,
            adapter=adapter,
            sync_kwargs=sync_kwargs,
        )
        steps.append(
            {
                "sync_step": sync_name,
                "endpoint": endpoint,
                "success": step_result["success"],
                "item_count": step_result["item_count"],
                "items": step_result["items"],
                "errors": step_result["errors"],
            }
        )
        all_items.extend(step_result["items"])
        all_errors.extend(step_result["errors"])

    investments_result = await sync_plaid_investments_for_user(
        db=db,
        user=user,
        item_id=item_id,
    )
    steps.append(
        {
            "sync_step": "investments",
            "endpoint": "investments/holdings/get",
            "success": investments_result["success"],
            "item_count": len(investments_result["items"]),
            "items": investments_result["items"],
            "errors": investments_result["errors"],
        }
    )
    all_items.extend(investments_result["items"])
    all_errors.extend(investments_result["errors"])

    unique_item_ids = {item.get("item_id") for item in all_items if item.get("item_id")}

    return {
        "success": len(all_errors) == 0,
        "item_count": len(unique_item_ids),
        "steps": steps,
        "items": all_items,
        "errors": all_errors,
    }


async def sync_plaid_balances_for_item(
    db: AsyncSession,
    user: User,
    item_id: str,
    access_token: str,
    adapter: PlaidAdapter | None = None,
) -> dict[str, Any]:
    adapter = adapter or PlaidAdapter()
    logger.info(
        "Plaid API call started",
        endpoint="accounts/balance/get",
        user_id=str(user.id),
        item_id=item_id,
    )
    try:
        raw_balances = await adapter.get_balances(access_token)
    except Exception as exc:
        logger.error(
            "Plaid balances fetch failed",
            endpoint="accounts/balance/get",
            user_id=str(user.id),
            item_id=item_id,
            **plaid_error_context(exc),
        )
        raise

    balances = normalize_plaid_list(raw_balances)
    if not balances and raw_balances:
        message = f"Plaid balance sync parse failed: expected list/dict but got {value_type(raw_balances)} in accounts"
        logger.error(
            "Plaid balance response parse failed",
            endpoint="accounts/balance/get",
            user_id=str(user.id),
            item_id=item_id,
            variable="accounts",
            variable_type=value_type(raw_balances),
        )
        await mark_plaid_item_failed(db, user.id, item_id, message)
        raise ValueError(message)

    logger.info(
        "Plaid API call succeeded",
        endpoint="accounts/balance/get",
        user_id=str(user.id),
        item_id=item_id,
        request_id=None,
    )
    logger.info(
        "Plaid balances returned",
        endpoint="accounts/balance/get",
        user_id=str(user.id),
        item_id=item_id,
        account_count=len(balances),
    )
    now = datetime.utcnow()
    synced: list[dict[str, Any]] = []
    errors: list[dict[str, str]] = []

    for raw_acc in balances:
        acc = normalize_plaid_value(raw_acc)
        if not acc:
            logger.warning(
                "Plaid balance account parse skipped",
                endpoint="accounts/balance/get",
                user_id=str(user.id),
                item_id=item_id,
                variable="account",
                variable_type=value_type(raw_acc),
            )
            continue

        nested_balances = normalize_plaid_value(acc.get("balances"))
        balance_current = nested_balances.get("current") if nested_balances else acc.get("current")
        balance_available = nested_balances.get("available") if nested_balances else acc.get("available")
        balance_limit = nested_balances.get("limit") if nested_balances else acc.get("limit")
        balance_currency = (
            nested_balances.get("iso_currency_code")
            or nested_balances.get("unofficial_currency_code")
            or nested_balances.get("currency")
            or acc.get("iso_currency_code")
            or acc.get("unofficial_currency_code")
            or acc.get("currency")
            or "USD"
        )
        balance_keys = list(nested_balances.keys()) if nested_balances else []
        plaid_account_id = acc.get("account_id") or acc.get("id")
        if not plaid_account_id:
            logger.warning(
                "Plaid balance account missing account_id",
                endpoint="accounts/balance/get",
                user_id=str(user.id),
                item_id=item_id,
                variable="account",
                variable_type=value_type(raw_acc),
            )
            continue

        stmt = select(Account).where(
            Account.user_id == user.id,
            Account.provider == "plaid",
            Account.provider_account_id == plaid_account_id,
        )
        result = await db.execute(stmt)
        account_row = result.scalar_one_or_none()

        if not account_row:
            errors.append({"account_id": plaid_account_id, "error": "Account not found in DB"})
            logger.warning(
                "Plaid balance account did not match DB row",
                endpoint="accounts/balance/get",
                user_id=str(user.id),
                item_id=item_id,
                plaid_account_id=plaid_account_id,
                db_row_matched=False,
                match_column="accounts.provider_account_id",
                account_type=acc.get("type"),
                subtype=acc.get("subtype"),
                balance_current_present=balance_current is not None,
                balance_available_present=balance_available is not None,
                balance_limit_present=balance_limit is not None,
                balance_keys=balance_keys,
            )
            continue

        logger.info(
            "Plaid balance parsed before save",
            endpoint="accounts/balance/get",
            user_id=str(user.id),
            item_id=item_id,
            plaid_account_id=plaid_account_id,
            account_type=acc.get("type"),
            subtype=acc.get("subtype"),
            balance_current_present=balance_current is not None,
            balance_available_present=balance_available is not None,
            balance_limit_present=balance_limit is not None,
            balance_keys=balance_keys,
            balances_type=value_type(acc.get("balances")) if acc.get("balances") is not None else None,
            db_row_matched=True,
        )

        account_classification = classify_plaid_account(acc.get("type"), acc.get("subtype"))
        missing_required_depository_balance = account_classification == "asset" and normalize_account_type(acc.get("type")) == "depository" and balance_current is None
        missing_all_balance_fields = balance_current is None and balance_available is None and balance_limit is None
        if missing_required_depository_balance or missing_all_balance_fields:
            message = (
                "Plaid balance sync failed: depository account missing balances.current"
                if missing_required_depository_balance
                else "Plaid balance sync failed: Plaid returned no usable balance fields"
            )
            account_row.error_message = message
            errors.append({"account_id": plaid_account_id, "error": message})
            logger.warning(
                "Plaid balance missing usable values",
                endpoint="accounts/balance/get",
                user_id=str(user.id),
                item_id=item_id,
                plaid_account_id=plaid_account_id,
                account_type=acc.get("type"),
                subtype=acc.get("subtype"),
                balance_current_present=balance_current is not None,
                balance_available_present=balance_available is not None,
                balance_limit_present=balance_limit is not None,
                balance_keys=balance_keys,
                db_row_matched=True,
            )
            continue

        account_row.item_id = item_id
        account_row.name = acc.get("name") or account_row.name
        account_row.account_type = acc.get("type") or account_row.account_type
        account_row.subtype = acc.get("subtype") or account_row.subtype
        account_row.mask = acc.get("mask") or account_row.mask
        account_row.balance_available = balance_available
        account_row.balance_current = balance_current
        account_row.balance_limit = balance_limit
        account_row.balance_currency = balance_currency
        account_row.last_synced_at = now
        account_row.error_message = None

        raw_data = {
            "account_id": plaid_account_id,
            "name": acc.get("name"),
            "type": acc.get("type"),
            "subtype": acc.get("subtype"),
            "mask": acc.get("mask"),
            "balances": {
                "available": balance_available,
                "current": balance_current,
                "limit": balance_limit,
                "currency": balance_currency,
            },
        }
        norm_service = NormalizationService(db)
        normalized, warnings = await norm_service.normalize_provider_data(
            raw_data=raw_data,
            provider="plaid",
            account_id=str(account_row.id),
            user_id=str(user.id),
            adapter=adapter,
        )
        cash_amount = depository_cash_amount({
            **acc,
            "current": balance_current,
            "available": balance_available,
        })
        cash_holding_written = await upsert_plaid_cash_holding(
            db=db,
            user_id=user.id,
            account_id=account_row.id,
            amount=cash_amount,
        )

        logger.info(
            "Plaid balance persisted",
            endpoint="accounts/balance/get",
            user_id=str(user.id),
            item_id=item_id,
            plaid_account_id=plaid_account_id,
            db_row_matched=True,
            db_account_id=str(account_row.id),
            matched_db_account_count=1,
            balance_current_value=balance_current,
            balance_available_value=balance_available,
            balance_current_saved=account_row.balance_current is not None,
            balance_available_saved=account_row.balance_available is not None,
            last_synced_at_saved=account_row.last_synced_at is not None,
            last_synced_at=now.isoformat(),
            normalized_holding_count=len(normalized),
            normalization_warning_count=len(warnings),
            cash_holding_written=cash_holding_written,
            cash_holding_amount=cash_amount,
        )

        synced.append(
            {
                "account_id": plaid_account_id,
                "name": acc.get("name"),
                "balance_current": balance_current,
                "balance_available": balance_available,
                "holdings_written": len(normalized),
                "cash_holding_written": cash_holding_written,
                "warning_count": len(warnings),
            }
        )

    await db.commit()
    logger.info(
        "Plaid balances synced",
        endpoint="accounts/balance/get",
        user_id=str(user.id),
        item_id=item_id,
        synced_count=len(synced),
        error_count=len(errors),
    )
    return {"synced": synced, "errors": errors}


async def sync_plaid_transactions_for_item(
    db: AsyncSession,
    user: User,
    item_id: str,
    access_token: str,
    adapter: PlaidAdapter | None = None,
) -> dict[str, Any]:
    adapter = adapter or PlaidAdapter()
    stmt = select(ProviderToken).where(
        ProviderToken.user_id == user.id,
        ProviderToken.provider == "plaid",
        ProviderToken.item_id == item_id,
    )
    result = await db.execute(stmt)
    token_row = result.scalar_one_or_none()
    stored_cursor = token_row.cursor if token_row else None

    logger.info(
        "transactions_sync_start",
        endpoint="transactions/sync",
        user_id=str(user.id),
        item_id=item_id,
        cursor_present=stored_cursor is not None,
    )
    try:
        sync_result = await adapter.sync_transactions(
            access_token=access_token,
            cursor=stored_cursor,
            log_context={"user_id": str(user.id), "item_id": item_id},
        )
    except Exception as exc:
        logger.error(
            "Plaid API call failed",
            endpoint="transactions/sync",
            user_id=str(user.id),
            item_id=item_id,
            **plaid_error_context(exc),
        )
        raise
    logger.info(
        "Plaid API call succeeded",
        endpoint="transactions/sync",
        user_id=str(user.id),
        item_id=item_id,
        request_id=None,
        added_count=len(sync_result["added"]),
        modified_count=len(sync_result["modified"]),
        removed_count=len(sync_result["removed"]),
        has_more=sync_result["has_more"],
        loop_count=sync_result.get("loop_count"),
    )

    account_stmt = select(Account).where(
        Account.user_id == user.id,
        Account.provider == "plaid",
        Account.item_id == item_id,
    )
    account_result = await db.execute(account_stmt)
    account_map = {acc.provider_account_id: acc.id for acc in account_result.scalars().all()}

    persist_counts = await plaid_persist.upsert_transactions(
        db=db,
        user_id=user.id,
        account_map=account_map,
        added=sync_result["added"],
        modified=sync_result["modified"],
        removed=sync_result["removed"],
        item_id=item_id,
    )
    if token_row and sync_result["next_cursor"]:
        token_row.cursor = sync_result["next_cursor"]

    await db.commit()
    logger.info(
        "transactions_persist_complete",
        endpoint="transactions/sync",
        user_id=str(user.id),
        item_id=item_id,
        transactions_received=len(sync_result["added"]) + len(sync_result["modified"]),
        inserted_count=persist_counts.get("added", 0),
        updated_count=persist_counts.get("modified", 0),
        removed_count=persist_counts.get("removed", 0),
        skipped_count=persist_counts.get("skipped", 0),
        cursor_saved=bool(token_row and sync_result["next_cursor"]),
    )
    return {"summary": persist_counts, **sync_result}


async def sync_plaid_recurring_for_item(
    db: AsyncSession,
    user: User,
    item_id: str,
    access_token: str,
    adapter: PlaidAdapter | None = None,
    account_ids: list[str] | None = None,
) -> dict[str, Any]:
    adapter = adapter or PlaidAdapter()
    logger.info(
        "recurring_sync_start",
        endpoint="transactions/recurring/get",
        user_id=str(user.id),
        item_id=item_id,
    )

    acc_stmt = select(Account).where(
        Account.user_id == user.id,
        Account.provider == "plaid",
        Account.item_id == item_id,
        Account.is_active == True,
    )
    acc_result = await db.execute(acc_stmt)
    acc_rows = acc_result.scalars().all()
    account_id_map = {acc.provider_account_id: acc.id for acc in acc_rows if acc.provider_account_id}
    plaid_account_ids = account_ids or list(account_id_map.keys())

    if not plaid_account_ids:
        logger.info(
            "recurring_unavailable_reason",
            endpoint="transactions/recurring/get",
            user_id=str(user.id),
            item_id=item_id,
            reason="no_plaid_accounts",
        )
        return {
            "data": {"inflow_streams": [], "outflow_streams": []},
            "persisted": {"inflow": 0, "outflow": 0, "total": 0},
        }

    try:
        logger.info(
            "recurring_endpoint_called",
            endpoint="transactions/recurring/get",
            user_id=str(user.id),
            item_id=item_id,
            called=True,
            account_count=len(plaid_account_ids),
        )
        data = normalize_plaid_value(
            await adapter.get_recurring_transactions(
                access_token=access_token,
                account_ids=plaid_account_ids,
            )
        )
    except Exception as exc:
        logger.error(
            "recurring_unavailable_reason",
            endpoint="transactions/recurring/get",
            user_id=str(user.id),
            item_id=item_id,
            recurring_endpoint_called=True,
            reason="plaid_request_failed",
            **plaid_error_context(exc),
        )
        raise

    inflow_streams = normalize_plaid_list(data.get("inflow_streams", []))
    outflow_streams = normalize_plaid_list(data.get("outflow_streams", []))
    persisted = await plaid_persist.upsert_recurring_streams(
        db=db,
        user_id=user.id,
        inflow_streams=inflow_streams,
        outflow_streams=outflow_streams,
        account_id_map=account_id_map,
    )
    await db.commit()
    logger.info(
        "recurring_persisted_count",
        endpoint="transactions/recurring/get",
        user_id=str(user.id),
        item_id=item_id,
        recurring_endpoint_called=True,
        recurring_inflow_count=len(inflow_streams),
        recurring_outflow_count=len(outflow_streams),
        recurring_persisted_count=persisted.get("total", 0),
    )
    return {"data": data, "persisted": persisted}


async def sync_plaid_liabilities_for_item(
    db: AsyncSession,
    user: User,
    item_id: str,
    access_token: str,
    adapter: PlaidAdapter | None = None,
) -> dict[str, Any]:
    adapter = adapter or PlaidAdapter()
    logger.info(
        "liabilities_sync_start",
        endpoint="liabilities/get",
        user_id=str(user.id),
        item_id=item_id,
    )
    try:
        plaid_data = normalize_plaid_value(await adapter.get_liabilities(access_token))
    except Exception as exc:
        logger.error(
            "Plaid API call failed",
            endpoint="liabilities/get",
            user_id=str(user.id),
            item_id=item_id,
            **plaid_error_context(exc),
        )
        raise
    logger.info(
        "liabilities_get_success",
        endpoint="liabilities/get",
        user_id=str(user.id),
        item_id=item_id,
        request_id=None,
        credit_count=len(plaid_data.get("credit", [])),
        mortgage_count=len(plaid_data.get("mortgage", [])),
        student_count=len(plaid_data.get("student", [])),
        total_liability_records_parsed=sum(len(plaid_data.get(k, [])) for k in ("credit", "mortgage", "student")),
    )

    acc_stmt = select(Account).where(
        Account.user_id == user.id,
        Account.provider == "plaid",
        Account.item_id == item_id,
        Account.is_active == True,
    )
    acc_result = await db.execute(acc_stmt)
    account_rows = acc_result.scalars().all()
    account_id_map = {acc.provider_account_id: acc.id for acc in account_rows}

    persisted = await plaid_persist.upsert_liabilities(
        db=db,
        user_id=user.id,
        liabilities_data=plaid_data,
        account_id_map=account_id_map,
    )
    detailed_credit_account_ids = {
        entry.get("account_id")
        for entry in normalize_plaid_list(plaid_data.get("credit", []))
        if entry.get("account_id")
    }
    balance_fallback = await plaid_persist.upsert_credit_liabilities_from_account_balances(
        db=db,
        user_id=user.id,
        accounts=account_rows,
        exclude_provider_account_ids=detailed_credit_account_ids,
    )
    await db.commit()
    total_balance = sum(
        positive_debt_amount(account.balance_current) or 0
        for account in account_rows
        if is_liability_account(account.account_type, account.subtype)
    )
    logger.info(
        "liabilities_persist_complete",
        endpoint="liabilities/get",
        user_id=str(user.id),
        item_id=item_id,
        total_count=persisted.get("total", 0) + balance_fallback.get("credit_from_balance", 0),
        total_balance=total_balance,
        **persisted,
        **balance_fallback,
    )
    return {"persisted": {**persisted, **balance_fallback}, "data": plaid_data}


async def sync_plaid_item_after_connection(
    db: AsyncSession,
    user: User,
    item_id: str,
    access_token: str,
) -> dict[str, Any]:
    """
    Run the first local sync after a successful Plaid Link exchange.

    Balance sync is required for account values. Transactions and liabilities
    are attempted because they are Link products in this app, but failures are
    returned instead of failing the bank connection.
    Investments sync is also attempted and is non-fatal.
    """
    adapter = PlaidAdapter()
    result: dict[str, Any] = {"balances": None, "transactions": None, "recurring": None, "liabilities": None, "investments": None, "errors": []}

    for name, endpoint, sync_fn in (
        ("balances", "accounts/balance/get", sync_plaid_balances_for_item),
        ("transactions", "transactions/sync", sync_plaid_transactions_for_item),
        ("recurring", "transactions/recurring/get", sync_plaid_recurring_for_item),
        ("liabilities", "liabilities/get", sync_plaid_liabilities_for_item),
    ):
        try:
            result[name] = await sync_fn(db, user, item_id, access_token, adapter)
        except Exception as exc:
            await db.rollback()
            context = plaid_error_context(exc)
            result["errors"].append({"sync": name, **context})
            logger.error(
                "Plaid sync step failed",
                endpoint=endpoint,
                user_id=str(user.id),
                item_id=item_id,
                **context,
            )
            if name == "balances":
                await mark_plaid_item_failed(
                    db=db,
                    user_id=user.id,
                    item_id=item_id,
            message=(
                "Plaid balance sync parse failed: expected dict/list in Plaid balance response"
                if "object has no attribute 'get'" in str(exc)
                else context.get("plaid_display_message") or context.get("error") or "Balance sync failed"
            ),
                )

    # Investments sync — non-fatal, runs after all item-scoped syncs.
    # sync_plaid_investments_for_user fetches its own access tokens internally.
    # Imported lazily to avoid a circular import with plaid_investments_sync.
    from app.services.plaid_investments_sync import sync_plaid_investments_for_user

    try:
        result["investments"] = await sync_plaid_investments_for_user(
            db=db,
            user=user,
            item_id=item_id,
        )
    except Exception as exc:
        await db.rollback()
        context = plaid_error_context(exc)
        result["errors"].append({"sync": "investments", **context})
        logger.error(
            "Plaid sync step failed",
            endpoint="investments/holdings/get",
            user_id=str(user.id),
            item_id=item_id,
            **context,
        )

    return result
