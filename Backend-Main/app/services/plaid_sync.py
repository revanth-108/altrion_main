"""
Shared Plaid sync helpers.

These helpers keep Plaid fetch/persist behavior consistent between the
dedicated Plaid endpoints, initial Link exchange, and portfolio refresh.
"""
from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from types import SimpleNamespace
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


def build_plaid_sync_item_result(
    *,
    item_id: str,
    step: str,
    success: bool,
    institution_id: str | None = None,
    added: int = 0,
    modified: int = 0,
    removed: int = 0,
    error_code: str | None = None,
    message: str | None = None,
    details: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Return a normalized, JSON-safe Plaid sync result for one item step."""
    result: dict[str, Any] = {
        "item_id": item_id,
        "step": step,
        "success": success,
        "added": added,
        "modified": modified,
        "removed": removed,
        "error_code": error_code,
        "message": message,
    }
    if institution_id is not None:
        result["institution_id"] = institution_id
    if details is not None:
        result["details"] = details
    return result


def build_plaid_sync_error(
    *,
    item_id: str,
    step: str,
    message: str,
    institution_id: str | None = None,
    error_code: str | None = None,
    request_id: str | None = None,
) -> dict[str, Any]:
    """Return a normalized Plaid sync error payload."""
    error: dict[str, Any] = {
        "item_id": item_id,
        "sync_step": step,
        "error_code": error_code,
        "error": message,
        "message": message,
        "plaid_error_code": error_code,
        "plaid_error_message": message,
        "request_id": request_id,
    }
    if institution_id is not None:
        error["institution_id"] = institution_id
    return error

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


def plaid_item_supports_transactions(
    available_products: list[str] | None,
    billed_products: list[str] | None,
) -> bool:
    """
    Return whether an Item should be expected to support normal bank transactions.

    If Plaid item metadata has not been persisted yet, fall back to "unknown"
    and allow sync to proceed. If Plaid explicitly reports products but omits
    transactions, treat the Item as investment-only or otherwise non-transactional.
    """
    available = {str(product).lower() for product in (available_products or []) if product}
    billed = {str(product).lower() for product in (billed_products or []) if product}
    if not available and not billed:
        return True
    return "transactions" in available or "transactions" in billed


async def get_plaid_transaction_sync_status_for_user(
    db: AsyncSession,
    user_id,
) -> dict[str, Any]:
    """Return transaction sync readiness for active Plaid items."""
    stmt = select(ProviderToken).where(
        ProviderToken.user_id == user_id,
        ProviderToken.provider == "plaid",
        ProviderToken.is_active == True,
        ProviderToken.item_id.isnot(None),
    ).order_by(desc(ProviderToken.updated_at), desc(ProviderToken.created_at))
    result = await db.execute(stmt)
    rows = result.scalars().all()

    items: list[dict[str, Any]] = []
    has_transaction_updates = False
    seen_item_ids: set[str] = set()

    for row in rows:
        token_data = parse_token_data(row.token_data)
        resolved_item_id = row.item_id or token_data.get("item_id")
        if not resolved_item_id or resolved_item_id in seen_item_ids:
            continue
        seen_item_ids.add(resolved_item_id)
        available_products = normalize_plaid_list(getattr(row, "available_products", None) or [])
        billed_products = normalize_plaid_list(getattr(row, "billed_products", None) or [])
        transactions_supported = plaid_item_supports_transactions(available_products, billed_products)
        if not transactions_supported:
            continue
        update_available = bool(getattr(row, "transactions_update_available", False))
        has_transaction_updates = has_transaction_updates or update_available
        institution_name = getattr(row, "institution_name", None)
        if not institution_name:
            account_stmt = select(Account.institution_name).where(
                Account.user_id == user_id,
                Account.provider == "plaid",
                Account.item_id == resolved_item_id,
                Account.is_active == True,
            ).limit(1)
            account_result = await db.execute(account_stmt)
            institution_name = account_result.scalar_one_or_none()
        items.append(
            {
                "item_id": resolved_item_id,
                "institution_name": institution_name,
                "transactions_update_available": update_available,
                "updated_at": getattr(row, "transactions_update_available_at", None) or getattr(row, "updated_at", None),
            }
        )

    return {"hasTransactionUpdates": has_transaction_updates, "items": items}


async def get_active_plaid_item_ids_for_institution(
    db: AsyncSession,
    user_id,
    institution_id: str,
    exclude_item_id: str | None = None,
) -> list[str]:
    """Return active Plaid item_ids for a user's institution, newest first."""
    if not institution_id:
        return []

    stmt = select(ProviderToken).where(
        ProviderToken.user_id == user_id,
        ProviderToken.provider == "plaid",
        ProviderToken.institution_id == institution_id,
        ProviderToken.is_active == True,
    ).order_by(desc(ProviderToken.updated_at), desc(ProviderToken.created_at))
    result = await db.execute(stmt)
    rows = result.scalars().all()

    active_item_ids: list[str] = []
    seen_item_ids: set[str] = set()
    for row in rows:
        token_data = parse_token_data(row.token_data)
        resolved_item_id = row.item_id or token_data.get("item_id")
        if not resolved_item_id:
            continue
        if exclude_item_id and resolved_item_id == exclude_item_id:
            continue
        if resolved_item_id in seen_item_ids:
            continue

        account_stmt = select(Account.id).where(
            Account.user_id == user_id,
            Account.provider == "plaid",
            Account.item_id == resolved_item_id,
            Account.is_active == True,
        ).limit(1)
        account_result = await db.execute(account_stmt)
        if account_result.scalar_one_or_none():
            active_item_ids.append(resolved_item_id)
            seen_item_ids.add(resolved_item_id)

    account_stmt = (
        select(Account.item_id)
        .where(
            Account.user_id == user_id,
            Account.provider == "plaid",
            Account.institution_id == institution_id,
            Account.is_active == True,
            Account.item_id.isnot(None),
        )
        .order_by(desc(Account.updated_at), desc(Account.created_at))
    )
    account_result = await db.execute(account_stmt)
    for item_id_value in account_result.scalars().all():
        if not item_id_value:
            continue
        if exclude_item_id and item_id_value == exclude_item_id:
            continue
        if item_id_value in seen_item_ids:
            continue
        active_item_ids.append(item_id_value)
        seen_item_ids.add(item_id_value)

    return active_item_ids


async def deactivate_plaid_accounts_for_item_ids(
    db: AsyncSession,
    user_id,
    item_ids: list[str],
    *,
    reason: str | None = None,
) -> int:
    """Mark all active Plaid accounts for the given item_ids inactive."""
    unique_item_ids = [item_id for item_id in dict.fromkeys(item_ids) if item_id]
    if not unique_item_ids:
        return 0

    stmt = select(Account).where(
        Account.user_id == user_id,
        Account.provider == "plaid",
        Account.item_id.in_(unique_item_ids),
        Account.is_active == True,
    )
    result = await db.execute(stmt)
    rows = result.scalars().all()
    for account in rows:
        account.is_active = False
        if reason:
            account.error_message = reason

    return len(rows)


async def deactivate_plaid_provider_tokens_for_item_ids(
    db: AsyncSession,
    user_id,
    item_ids: list[str],
) -> int:
    """Mark Plaid provider token rows inactive for the given item_ids."""
    unique_item_ids = [item_id for item_id in dict.fromkeys(item_ids) if item_id]
    if not unique_item_ids:
        return 0

    stmt = select(ProviderToken).where(
        ProviderToken.user_id == user_id,
        ProviderToken.provider == "plaid",
        ProviderToken.item_id.in_(unique_item_ids),
        ProviderToken.is_active == True,
    )
    result = await db.execute(stmt)
    rows = result.scalars().all()
    for token_row in rows:
        token_row.is_active = False

    return len(rows)


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
        ProviderToken.is_active == True,
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
                account_stmt = select(Account.id).where(
                    Account.user_id == user_id,
                    Account.provider == "plaid",
                    Account.item_id == resolved_item_id,
                    Account.is_active == True,
                ).limit(1)
                account_result = await db.execute(account_stmt)
                if not account_result.scalar_one_or_none():
                    continue
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


async def get_active_plaid_refresh_rows_for_user(
    db: AsyncSession,
    user_id,
) -> list[SimpleNamespace]:
    """Return active item-scoped Plaid tokens for refresh.

    Legacy rows with item_id NULL are intentionally excluded so refresh only
    operates on safely migrated item-scoped connections.
    """
    stmt = select(ProviderToken).where(
        ProviderToken.user_id == user_id,
        ProviderToken.provider == "plaid",
        ProviderToken.is_active == True,
        ProviderToken.item_id.isnot(None),
    ).order_by(desc(ProviderToken.updated_at), desc(ProviderToken.created_at))
    result = await db.execute(stmt)
    rows = result.scalars().all()
    active_rows: list[SimpleNamespace] = []
    for row in rows:
        token_data = parse_token_data(row.token_data)
        resolved_item_id = row.item_id or token_data.get("item_id")
        if not resolved_item_id:
            continue
        active_rows.append(SimpleNamespace(
            item_id=resolved_item_id,
            institution_id=getattr(row, "institution_id", None),
            cursor=getattr(row, "cursor", None),
            available_products=normalize_plaid_list(getattr(row, "available_products", None) or []),
            billed_products=normalize_plaid_list(getattr(row, "billed_products", None) or []),
            provider_token=row,
        ))
    return active_rows


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
    user_pk = user.id
    user_ref = SimpleNamespace(id=user_pk)
    token_rows = await get_plaid_token_rows_for_user(db, user_pk, item_id=item_id)
    if item_id is not None and not token_rows:
        raise LookupError(f"No Plaid item found for item_id={item_id}")

    adapter = adapter or PlaidAdapter()
    sync_kwargs = sync_kwargs or {}
    items: list[dict[str, Any]] = []
    errors: list[dict[str, Any]] = []
    internal_user_id = str(user_pk)

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
            error = build_plaid_sync_error(
                item_id="",
                step=sync_name,
                institution_id=institution_id,
                message=message,
            )
            errors.append(error)
            items.append(
                build_plaid_sync_item_result(
                    item_id="",
                    step=sync_name,
                    success=False,
                    institution_id=institution_id,
                    message=message,
                )
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
            error = build_plaid_sync_error(
                item_id=resolved_item_id,
                step=sync_name,
                institution_id=institution_id,
                message=message,
            )
            errors.append(error)
            items.append(
                build_plaid_sync_item_result(
                    item_id=resolved_item_id,
                    step=sync_name,
                    success=False,
                    institution_id=institution_id,
                    message=message,
                )
            )
            continue

        try:
            result = await sync_fn(
                db=db,
                user=user_ref,
                item_id=resolved_item_id,
                access_token=access_token,
                adapter=adapter,
                **sync_kwargs,
            )
            summary = result.get("summary", {}) if isinstance(result, dict) else {}
            added = int((result.get("added") if isinstance(result, dict) else None) or summary.get("added", 0) or 0)
            modified = int((result.get("modified") if isinstance(result, dict) else None) or summary.get("modified", 0) or 0)
            removed = int((result.get("removed") if isinstance(result, dict) else None) or summary.get("removed", 0) or 0)
            items.append(
                build_plaid_sync_item_result(
                    item_id=resolved_item_id,
                    step=sync_name,
                    success=True,
                    institution_id=institution_id,
                    added=added,
                    modified=modified,
                    removed=removed,
                    details=result if isinstance(result, dict) else {"result": result},
                )
            )
        except Exception as exc:
            await db.rollback()
            context = plaid_error_context(exc)
            logger.error(
                "Plaid item sync step failed",
                user_id=internal_user_id,
                item_id=resolved_item_id,
                institution_id=institution_id,
                sync_step=sync_name,
                **context,
            )
            message = context.get("plaid_display_message") or context.get("error") or str(exc)
            errors.append(
                build_plaid_sync_error(
                    item_id=resolved_item_id,
                    step=sync_name,
                    institution_id=institution_id,
                    error_code=context.get("plaid_error_code") or context.get("plaid_error_type"),
                    message=message,
                    request_id=context.get("request_id"),
                )
            )
            items.append(
                build_plaid_sync_item_result(
                    item_id=resolved_item_id,
                    step=sync_name,
                    success=False,
                    institution_id=institution_id,
                    error_code=context.get("plaid_error_code") or context.get("plaid_error_type"),
                    message=message,
                )
            )

    return {
        "success": len(errors) == 0,
        "items": items,
        "item_results": items,
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
    user_pk = user.id
    user_ref = SimpleNamespace(id=user_pk)

    token_rows = await get_active_plaid_refresh_rows_for_user(db, user_pk)
    if item_id is not None:
        token_rows = [row for row in token_rows if row.item_id == item_id]

    steps: list[dict[str, Any]] = []
    items: list[dict[str, Any]] = []
    errors: list[dict[str, Any]] = []
    skipped_legacy_count = 0

    for token_row in token_rows:
        token_data = parse_token_data(token_row.provider_token.token_data)
        access_token = token_data.get("access_token")
        item_available_products = {str(product).lower() for product in (token_row.available_products or []) if product}
        item_billed_products = {str(product).lower() for product in (token_row.billed_products or []) if product}
        transactions_supported = plaid_item_supports_transactions(token_row.available_products, token_row.billed_products)
        item_breakdown = {
            "item_id": token_row.item_id,
            "institution_id": token_row.institution_id,
            "transactions_added": 0,
            "transactions_modified": 0,
            "transactions_removed": 0,
            "cursor_saved": False,
            "webhook_expected": transactions_supported,
            "refresh_requested": False,
            "transactions": {
                "added": 0,
                "modified": 0,
                "removed": 0,
                "cursor_saved": False,
                "skipped_reason": None,
            },
            "balances": None,
            "recurring": None,
            "liabilities": None,
            "investments": None,
            "product_errors": [],
            "step_results": [],
        }

        if not token_row.item_id:
            skipped_legacy_count += 1
            item_breakdown["transactions"]["skipped_reason"] = "legacy_item_id_missing"
            item_breakdown["step_results"].append(
                build_plaid_sync_item_result(
                    item_id="",
                    step="transactions",
                    success=False,
                    institution_id=token_row.institution_id,
                    message="legacy_item_id_missing",
                )
            )
            logger.warning(
                "plaid_refresh_legacy_token_skipped",
                user_id=str(user_pk),
                item_id=None,
                institution_id=token_row.institution_id,
                reason="legacy_item_id_missing",
            )
            items.append(item_breakdown)
            continue

        if not access_token:
            item_breakdown["transactions"]["skipped_reason"] = "missing_access_token"
            error = build_plaid_sync_error(
                item_id=token_row.item_id,
                step="refresh",
                institution_id=token_row.institution_id,
                message="missing_access_token",
            )
            errors.append(error)
            item_breakdown["step_results"].append(
                build_plaid_sync_item_result(
                    item_id=token_row.item_id,
                    step="transactions",
                    success=False,
                    institution_id=token_row.institution_id,
                    message="missing_access_token",
                )
            )
            items.append(item_breakdown)
            continue

        # Transactions are skipped for items that do not advertise the product.
        if not transactions_supported:
            item_breakdown["transactions"]["skipped_reason"] = "investment_only"
            item_breakdown["webhook_expected"] = False
            item_breakdown["step_results"].append(
                build_plaid_sync_item_result(
                    item_id=token_row.item_id,
                    step="transactions",
                    success=True,
                    institution_id=token_row.institution_id,
                    message="investment_only",
                )
            )
            logger.info(
                "plaid_refresh_transactions_skipped",
                user_id=str(user_pk),
                item_id=token_row.item_id,
                institution_id=token_row.institution_id,
                available_products=list(item_available_products),
                billed_products=list(item_billed_products),
                cursor_present=token_row.cursor is not None,
                skipped_reason="investment_only",
            )
        else:
            try:
                tx_result = await sync_plaid_transactions_for_item(
                    db=db,
                    user=user_ref,
                    item_id=token_row.item_id,
                    access_token=access_token,
                    adapter=adapter,
                )
                tx_summary = tx_result.get("summary", {})
                item_breakdown["transactions"] = {
                    "added": tx_summary.get("added", 0),
                    "modified": tx_summary.get("modified", 0),
                    "removed": tx_summary.get("removed", 0),
                    "cursor_saved": bool(tx_result.get("next_cursor")),
                    "skipped_reason": None,
                }
                item_breakdown["transactions_added"] = tx_summary.get("added", 0)
                item_breakdown["transactions_modified"] = tx_summary.get("modified", 0)
                item_breakdown["transactions_removed"] = tx_summary.get("removed", 0)
                item_breakdown["cursor_saved"] = bool(tx_result.get("next_cursor"))
                item_breakdown["step_results"].append(
                    build_plaid_sync_item_result(
                        item_id=token_row.item_id,
                        step="transactions",
                        success=True,
                        institution_id=token_row.institution_id,
                        added=int(tx_summary.get("added", 0) or 0),
                        modified=int(tx_summary.get("modified", 0) or 0),
                        removed=int(tx_summary.get("removed", 0) or 0),
                        details=tx_result,
                    )
                )
                logger.info(
                    "plaid_refresh_transactions_complete",
                    user_id=str(user_pk),
                    item_id=token_row.item_id,
                    institution_id=token_row.institution_id,
                    cursor_before=token_row.cursor,
                    cursor_before_present=token_row.cursor is not None,
                    cursor_after=tx_result.get("next_cursor"),
                    cursor_after_present=bool(tx_result.get("next_cursor")),
                    added_count=tx_summary.get("added", 0),
                    modified_count=tx_summary.get("modified", 0),
                    removed_count=tx_summary.get("removed", 0),
                    product_errors=[],
                )
            except Exception as exc:
                context = plaid_error_context(exc)
                message = context.get("plaid_display_message") or context.get("error") or str(exc)
                item_breakdown["transactions"]["skipped_reason"] = message
                item_breakdown["product_errors"].append(context)
                errors.append(
                    build_plaid_sync_error(
                        item_id=token_row.item_id,
                        step="transactions",
                        institution_id=token_row.institution_id,
                        error_code=context.get("plaid_error_code") or context.get("plaid_error_type"),
                        message=message,
                        request_id=context.get("request_id"),
                    )
                )
                item_breakdown["step_results"].append(
                    build_plaid_sync_item_result(
                        item_id=token_row.item_id,
                        step="transactions",
                        success=False,
                        institution_id=token_row.institution_id,
                        error_code=context.get("plaid_error_code") or context.get("plaid_error_type"),
                        message=message,
                    )
                )
                logger.error(
                    "plaid_refresh_transactions_failed",
                    user_id=str(user_pk),
                    item_id=token_row.item_id,
                    institution_id=token_row.institution_id,
                    cursor_before=token_row.cursor,
                    cursor_before_present=token_row.cursor is not None,
                    **context,
                )

        steps.append(
            {
                "sync_step": "transactions",
                "endpoint": "transactions/sync",
                "success": item_breakdown["transactions"]["skipped_reason"] is None,
                "item_count": 1,
                "items": [item_breakdown],
                "errors": errors[-1:] if errors and errors[-1].get("item_id") == token_row.item_id else [],
            }
        )
        items.append(item_breakdown)

        # Balance, recurring, liabilities, and investments refresh remain per-item
        # and are allowed to fail without aborting the whole refresh.
        for sync_name, endpoint, sync_fn, sync_kwargs in (
            ("balances", "accounts/balance/get", sync_plaid_balances_for_item, {}),
            ("recurring", "transactions/recurring/get", sync_plaid_recurring_for_item, {}),
            ("liabilities", "liabilities/get", sync_plaid_liabilities_for_item, {}),
        ):
            try:
                result = await sync_fn(
                    db=db,
                    user=user_ref,
                    item_id=token_row.item_id,
                    access_token=access_token,
                    adapter=adapter,
                    **sync_kwargs,
                )
                item_breakdown[sync_name] = result.get("persisted")
                item_breakdown["step_results"].append(
                    build_plaid_sync_item_result(
                        item_id=token_row.item_id,
                        step=sync_name,
                        success=True,
                        institution_id=token_row.institution_id,
                        details=result,
                    )
                )
                steps.append({
                    "sync_step": sync_name,
                    "endpoint": endpoint,
                    "success": True,
                    "item_count": 1,
                    "items": [item_breakdown],
                    "errors": [],
                })
            except Exception as exc:
                context = plaid_error_context(exc)
                item_breakdown[sync_name] = None
                item_breakdown["product_errors"].append(context)
                message = context.get("plaid_display_message") or context.get("error") or str(exc)
                errors.append(
                    build_plaid_sync_error(
                        item_id=token_row.item_id,
                        step=sync_name,
                        institution_id=token_row.institution_id,
                        error_code=context.get("plaid_error_code") or context.get("plaid_error_type"),
                        message=message,
                        request_id=context.get("request_id"),
                    )
                )
                item_breakdown["step_results"].append(
                    build_plaid_sync_item_result(
                        item_id=token_row.item_id,
                        step=sync_name,
                        success=False,
                        institution_id=token_row.institution_id,
                        error_code=context.get("plaid_error_code") or context.get("plaid_error_type"),
                        message=message,
                    )
                )
                steps.append({
                    "sync_step": sync_name,
                    "endpoint": endpoint,
                    "success": False,
                    "item_count": 1,
                    "items": [item_breakdown],
                    "errors": [errors[-1]],
                })

        try:
            investments_result = await sync_plaid_investments_for_user(
                db=db,
                user=user_ref,
                item_id=token_row.item_id,
            )
            item_breakdown["investments"] = {
                "success": investments_result["success"],
                "item_count": len(investments_result["items"]),
            }
            item_breakdown["step_results"].append(
                build_plaid_sync_item_result(
                    item_id=token_row.item_id,
                    step="investments",
                    success=investments_result["success"],
                    institution_id=token_row.institution_id,
                    details=investments_result,
                )
            )
            steps.append({
                "sync_step": "investments",
                "endpoint": "investments/holdings/get",
                "success": investments_result["success"],
                "item_count": len(investments_result["items"]),
                "items": [item_breakdown],
                "errors": investments_result["errors"],
            })
        except Exception as exc:
            context = plaid_error_context(exc)
            item_breakdown["investments"] = {"success": False, "item_count": 0}
            item_breakdown["product_errors"].append(context)
            message = context.get("plaid_display_message") or context.get("error") or str(exc)
            errors.append(
                build_plaid_sync_error(
                    item_id=token_row.item_id,
                    step="investments",
                    institution_id=token_row.institution_id,
                    error_code=context.get("plaid_error_code") or context.get("plaid_error_type"),
                    message=message,
                    request_id=context.get("request_id"),
                )
            )
            item_breakdown["step_results"].append(
                build_plaid_sync_item_result(
                    item_id=token_row.item_id,
                    step="investments",
                    success=False,
                    institution_id=token_row.institution_id,
                    error_code=context.get("plaid_error_code") or context.get("plaid_error_type"),
                    message=message,
                )
            )

    return {
        "success": len(errors) == 0,
        "item_count": len(token_rows),
        "steps": steps,
        "items": items,
        "item_results": items,
        "errors": errors,
        "skipped_legacy_token_count": skipped_legacy_count,
    }


async def request_plaid_transactions_refresh_for_user(
    db: AsyncSession,
    user: User,
    item_id: str | None = None,
) -> dict[str, Any]:
    """
    Request Plaid to re-check transactions for active items.

    This does not fetch new DB rows directly. It only asks Plaid to refresh data;
    when updates exist, Plaid will later emit SYNC_UPDATES_AVAILABLE.
    """
    adapter = PlaidAdapter()
    user_pk = user.id
    token_rows = await get_active_plaid_refresh_rows_for_user(db, user_pk)
    if item_id is not None:
        token_rows = [row for row in token_rows if row.item_id == item_id]

    items: list[dict[str, Any]] = []
    errors: list[dict[str, Any]] = []

    for token_row in token_rows:
        token_data = parse_token_data(token_row.provider_token.token_data)
        access_token = token_data.get("access_token")
        item_available_products = {str(product).lower() for product in (token_row.available_products or []) if product}
        item_billed_products = {str(product).lower() for product in (token_row.billed_products or []) if product}
        transactions_supported = plaid_item_supports_transactions(token_row.available_products, token_row.billed_products)
        item_breakdown = {
            "item_id": token_row.item_id,
            "institution_id": token_row.institution_id,
            "transactions_added": 0,
            "transactions_modified": 0,
            "transactions_removed": 0,
            "cursor_saved": False,
            "webhook_expected": transactions_supported,
            "refresh_requested": False,
            "transactions": {
                "added": 0,
                "modified": 0,
                "removed": 0,
                "cursor_saved": False,
                "skipped_reason": None,
            },
        }

        if not token_row.item_id:
            item_breakdown["transactions"]["skipped_reason"] = "legacy_item_id_missing"
            item_breakdown["webhook_expected"] = False
            items.append(item_breakdown)
            continue

        if not transactions_supported:
            item_breakdown["transactions"]["skipped_reason"] = "investment_only"
            item_breakdown["webhook_expected"] = False
            logger.info(
                "plaid_transactions_refresh_skipped",
                user_id=str(user_pk),
                item_id=token_row.item_id,
                institution_id=token_row.institution_id,
                available_products=list(item_available_products),
                billed_products=list(item_billed_products),
                skipped_reason="investment_only",
            )
            items.append(item_breakdown)
            continue

        if not access_token:
            item_breakdown["transactions"]["skipped_reason"] = "missing_access_token"
            errors.append({
                "item_id": token_row.item_id,
                "sync_step": "transactions/refresh",
                "error": "missing_access_token",
            })
            items.append(item_breakdown)
            continue

        try:
            await adapter.refresh_transactions(access_token)
            item_breakdown["refresh_requested"] = True
            item_breakdown["transactions"]["skipped_reason"] = "pending_webhook"
            logger.info(
                "plaid_transactions_refresh_requested",
                user_id=str(user_pk),
                item_id=token_row.item_id,
                institution_id=token_row.institution_id,
                webhook_expected=True,
                refresh_requested=True,
            )
        except Exception as exc:
            context = plaid_error_context(exc)
            item_breakdown["transactions"]["skipped_reason"] = context.get("plaid_display_message") or context.get("error") or str(exc)
            item_breakdown["webhook_expected"] = False
            errors.append({
                "item_id": token_row.item_id,
                "sync_step": "transactions/refresh",
                "error": item_breakdown["transactions"]["skipped_reason"],
                **context,
            })
            logger.error(
                "plaid_transactions_refresh_failed",
                user_id=str(user_pk),
                item_id=token_row.item_id,
                institution_id=token_row.institution_id,
                **context,
            )
            items.append(item_breakdown)
            continue

        item_breakdown["transactions"]["skipped_reason"] = "pending_webhook"
        item_breakdown["transactions"]["cursor_saved"] = False
        items.append(item_breakdown)

    return {
        "success": len(errors) == 0,
        "item_count": len(token_rows),
        "items": items,
        "errors": errors,
        "requested": True,
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

        account_row = await plaid_persist.find_existing_plaid_account(
            db=db,
            user_id=user.id,
            item_id=item_id,
            provider_account_id=plaid_account_id,
        )

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
    return {
        "step": "balances",
        "success": len(errors) == 0,
        "item_id": item_id,
        "added": len(synced),
        "modified": 0,
        "removed": 0,
        "synced": synced,
        "errors": errors,
        "details": {"synced": synced, "errors": errors},
    }


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
        ProviderToken.is_active == True,
    )
    result = await db.execute(stmt)
    token_row = result.scalar_one_or_none()
    stored_cursor = token_row.cursor if token_row else None
    transactions_supported = plaid_item_supports_transactions(
        getattr(token_row, "available_products", None) if token_row else None,
        getattr(token_row, "billed_products", None) if token_row else None,
    )

    if token_row and not transactions_supported:
        logger.info(
            "transactions_sync_skipped",
            endpoint="transactions/sync",
            user_id=str(user.id),
            item_id=item_id,
            reason="investment_only",
        )
        return {
            "summary": {"added": 0, "modified": 0, "removed": 0, "skipped": 1},
            "added": [],
            "modified": [],
            "removed": [],
            "next_cursor": stored_cursor,
            "has_more": False,
            "loop_count": 0,
            "skipped_reason": "investment_only",
        }

    logger.info(
        "transactions_sync_start",
        endpoint="transactions/sync",
        user_id=str(user.id),
        item_id=item_id,
        cursor_before=stored_cursor,
        cursor_present=stored_cursor is not None,
    )
    reset_required = False
    sync_context = {"user_id": str(user.id), "item_id": item_id, "cursor_present": stored_cursor is not None}
    try:
        sync_result = await adapter.sync_transactions(
            access_token=access_token,
            cursor=stored_cursor,
            log_context=sync_context,
        )
    except Exception as exc:
        context = plaid_error_context(exc)
        cursor_error_code = (context.get("plaid_error_code") or "").upper()
        error_message = (context.get("plaid_display_message") or context.get("error") or str(exc)).lower()
        should_reset_cursor = bool(
            stored_cursor
            and (
                cursor_error_code in {
                    "INVALID_CURSOR",
                    "TRANSACTIONS_SYNC_MUTATION_DURING_PAGINATION",
                    "TRANSACTIONS_SYNC_MUTATION_DURING_CURSOR",
                }
                or "cursor" in error_message
                or "reset" in error_message
            )
        )
        if not should_reset_cursor:
            if token_row:
                token_row.last_transactions_sync_status = "failed"
            logger.error(
                "Plaid API call failed",
                endpoint="transactions/sync",
                user_id=str(user.id),
                item_id=item_id,
                **context,
            )
            raise

        reset_required = True
        logger.warning(
            "transactions_cursor_reset_required",
            endpoint="transactions/sync",
            user_id=str(user.id),
            item_id=item_id,
            cursor_before=stored_cursor,
            old_cursor_present=True,
            **context,
        )
        try:
            sync_result = await adapter.sync_transactions(
                access_token=access_token,
                cursor=None,
                log_context={**sync_context, "cursor_reset_required": True},
            )
        except Exception as retry_exc:
            retry_context = plaid_error_context(retry_exc)
            if token_row:
                token_row.last_transactions_sync_status = "failed"
            logger.error(
                "Plaid API call failed",
                endpoint="transactions/sync",
                user_id=str(user.id),
                item_id=item_id,
                cursor_reset_required=True,
                **retry_context,
            )
            raise
    logger.info(
        "Plaid API call succeeded",
        endpoint="transactions/sync",
        user_id=str(user.id),
        item_id=item_id,
        request_id=None,
        cursor_before=stored_cursor,
        cursor_after=sync_result.get("next_cursor"),
        added_count=len(sync_result["added"]),
        modified_count=len(sync_result["modified"]),
        removed_count=len(sync_result["removed"]),
        has_more=sync_result["has_more"],
        loop_count=sync_result.get("loop_count"),
        cursor_reset_required=reset_required,
    )

    account_stmt = select(Account).where(
        Account.user_id == user.id,
        Account.provider == "plaid",
        Account.item_id == item_id,
        Account.is_active == True,
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
    if token_row:
        token_row.last_transactions_synced_at = datetime.utcnow()
        token_row.last_transactions_sync_status = "success"
        token_row.transactions_update_available = False
        token_row.transactions_update_available_at = None

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
        db_inserted_count=persist_counts.get("added", 0),
        db_updated_count=persist_counts.get("modified", 0),
        cursor_before=stored_cursor,
        cursor_after=sync_result.get("next_cursor"),
        cursor_saved=bool(token_row and sync_result["next_cursor"]),
        next_cursor_saved=bool(token_row and sync_result["next_cursor"]),
        old_cursor_present=stored_cursor is not None,
    )
    return {
        "step": "transactions",
        "success": True,
        "item_id": item_id,
        "added": int(persist_counts.get("added", 0) or 0),
        "modified": int(persist_counts.get("modified", 0) or 0),
        "removed": int(persist_counts.get("removed", 0) or 0),
        "summary": persist_counts,
        **sync_result,
    }


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
            "step": "recurring",
            "success": True,
            "item_id": item_id,
            "added": 0,
            "modified": 0,
            "removed": 0,
            "data": {"inflow_streams": [], "outflow_streams": []},
            "persisted": {"inflow": 0, "outflow": 0, "total": 0},
            "details": {"data": {"inflow_streams": [], "outflow_streams": []}, "persisted": {"inflow": 0, "outflow": 0, "total": 0}},
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
    return {
        "step": "recurring",
        "success": True,
        "item_id": item_id,
        "added": int(persisted.get("total", 0) or 0),
        "modified": 0,
        "removed": 0,
        "data": data,
        "persisted": persisted,
        "details": {"data": data, "persisted": persisted},
    }


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
    merged_persisted = {**persisted, **balance_fallback}
    return {
        "step": "liabilities",
        "success": True,
        "item_id": item_id,
        "added": int(merged_persisted.get("total", 0) or 0),
        "modified": 0,
        "removed": 0,
        "persisted": merged_persisted,
        "data": plaid_data,
        "details": {"persisted": merged_persisted, "data": plaid_data},
    }


async def sync_plaid_item_after_connection(
    db: AsyncSession,
    user: User,
    item_id: str,
    access_token: str,
    available_products: list[str] | None = None,
    billed_products: list[str] | None = None,
) -> dict[str, Any]:
    """
    Run the first local sync after a successful Plaid Link exchange.

    Balance sync is required for account values. Transactions and liabilities
    are attempted because they are Link products in this app, but failures are
    returned instead of failing the bank connection.
    Investments sync is also attempted and is non-fatal.
    """
    adapter = PlaidAdapter()
    result: dict[str, Any] = {
        "balances": None,
        "transactions": None,
        "recurring": None,
        "liabilities": None,
        "investments": None,
        "errors": [],
        "step_results": [],
    }
    user_pk = user.id
    user_ref = SimpleNamespace(id=user_pk)
    internal_user_id = str(user_pk)
    transactions_supported = plaid_item_supports_transactions(available_products, billed_products)

    for name, endpoint, sync_fn in (
        ("balances", "accounts/balance/get", sync_plaid_balances_for_item),
        ("transactions", "transactions/sync", sync_plaid_transactions_for_item),
        ("recurring", "transactions/recurring/get", sync_plaid_recurring_for_item),
        ("liabilities", "liabilities/get", sync_plaid_liabilities_for_item),
    ):
        if name == "transactions" and not transactions_supported:
            result[name] = {
                "summary": {"added": 0, "modified": 0, "removed": 0, "skipped": 1},
                "added": [],
                "modified": [],
                "removed": [],
                "next_cursor": None,
                "has_more": False,
                "loop_count": 0,
                "skipped_reason": "investment_only",
            }
            result["step_results"].append(
                build_plaid_sync_item_result(
                    item_id=item_id,
                    step=name,
                    success=True,
                    message="investment_only",
                    details=result[name],
                )
            )
            logger.info(
                "Plaid sync step skipped",
                endpoint=endpoint,
                user_id=internal_user_id,
                item_id=item_id,
                reason="investment_only",
                transactions_supported=False,
            )
            continue
        try:
            result[name] = await sync_fn(db, user_ref, item_id, access_token, adapter)
            result["step_results"].append(
                build_plaid_sync_item_result(
                    item_id=item_id,
                    step=name,
                    success=True,
                    details=result[name],
                )
            )
        except Exception as exc:
            await db.rollback()
            context = plaid_error_context(exc)
            message = context.get("plaid_display_message") or context.get("error") or str(exc)
            result["errors"].append(
                build_plaid_sync_error(
                    item_id=item_id,
                    step=name,
                    message=message,
                    error_code=context.get("plaid_error_code") or context.get("plaid_error_type"),
                    request_id=context.get("request_id"),
                )
            )
            result["step_results"].append(
                build_plaid_sync_item_result(
                    item_id=item_id,
                    step=name,
                    success=False,
                    error_code=context.get("plaid_error_code") or context.get("plaid_error_type"),
                    message=message,
                )
            )
            logger.error(
                "Plaid sync step failed",
                endpoint=endpoint,
                user_id=internal_user_id,
                item_id=item_id,
                **context,
            )
            if name == "balances":
                await mark_plaid_item_failed(
                    db=db,
                    user_id=internal_user_id,
                    item_id=item_id,
                    message=(
                        "Plaid balance sync parse failed: expected dict/list in Plaid balance response"
                        if "object has no attribute 'get'" in str(exc)
                        else message
                    ),
                )

    # Investments sync — non-fatal, runs after all item-scoped syncs.
    # sync_plaid_investments_for_user fetches its own access tokens internally.
    # Imported lazily to avoid a circular import with plaid_investments_sync.
    from app.services.plaid_investments_sync import sync_plaid_investments_for_user

    try:
        result["investments"] = await sync_plaid_investments_for_user(
            db=db,
            user=user_ref,
            item_id=item_id,
        )
        result["step_results"].append(
            build_plaid_sync_item_result(
                item_id=item_id,
                step="investments",
                success=True,
                details=result["investments"],
            )
        )
    except Exception as exc:
        await db.rollback()
        context = plaid_error_context(exc)
        message = context.get("plaid_display_message") or context.get("error") or str(exc)
        result["errors"].append(
            build_plaid_sync_error(
                item_id=item_id,
                step="investments",
                message=message,
                error_code=context.get("plaid_error_code") or context.get("plaid_error_type"),
                request_id=context.get("request_id"),
            )
        )
        result["step_results"].append(
            build_plaid_sync_item_result(
                item_id=item_id,
                step="investments",
                success=False,
                error_code=context.get("plaid_error_code") or context.get("plaid_error_type"),
                message=message,
            )
        )
        logger.error(
            "Plaid sync step failed",
            endpoint="investments/holdings/get",
            user_id=internal_user_id,
            item_id=item_id,
            **context,
        )

    return result
