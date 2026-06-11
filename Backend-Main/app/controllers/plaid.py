"""
Plaid Link endpoints
"""
import inspect
from datetime import datetime, date
from typing import Any, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, text
from pydantic import BaseModel

from app.core.auth import get_current_user as get_authenticated_user
from app.core.database import get_db
from app.core.logging import get_logger
from app.models.account import Account
from app.models.provider_token import ProviderToken
from app.models.transaction import Transaction
from app.services.providers.plaid import PlaidAdapter
from app.services.plaid_helpers import (
    get_plaid_token_row_for_user,
    get_user_by_supabase_id,
    PLAID_ITEM_NOT_FOUND_DETAIL,
)
from app.services import plaid_persist
from app.services.plaid_investments_sync import sync_plaid_investments_for_user
from app.services.plaid_sync import (
    account_role_label,
    classify_plaid_account,
    deactivate_plaid_accounts_for_item_ids,
    deactivate_plaid_provider_tokens_for_item_ids,
    get_active_plaid_item_ids_for_institution,
    get_plaid_transaction_sync_status_for_user,
    get_plaid_token_rows_for_user,
    mark_plaid_item_failed,
    is_liability_account,
    positive_debt_amount,
    request_plaid_transactions_refresh_for_user,
    plaid_item_supports_transactions,
    sync_plaid_refresh_for_user,
    sync_plaid_transactions_for_item,
    sync_plaid_step_for_user,
    sync_plaid_balances_for_item,
    sync_plaid_item_after_connection,
    sync_plaid_liabilities_for_item,
    sync_plaid_recurring_for_item,
)
from app.services.plaid_utils import plaid_error_context
from app.services.plaid_safe import parse_token_data, normalize_plaid_value, value_type
from app.services.data_consent import should_persist_user_data
from app.schemas.plaid import (
    PlaidExchangeTokenResponse,
    PlaidRefreshResponse,
    PlaidSyncStatusResponse,
    PlaidTransactionsSyncUpdatesResponse,
)


def _account_display_name(account: Account) -> str:
    """Build a readable name from unencrypted account fields.

    accounts.name and accounts.mask are Supabase column-level encrypted;
    reading them via SQLAlchemy returns ciphertext. Use institution_name +
    subtype instead, which are stored as plaintext.
    """
    institution = (getattr(account, "institution_name", None) or "").strip()
    subtype = (getattr(account, "subtype", None) or "").replace("_", " ").title()
    acct_type = (getattr(account, "account_type", None) or "").replace("_", " ").title()

    if institution and subtype:
        return f"{institution} {subtype}"
    if institution:
        return institution
    if subtype:
        return subtype
    if acct_type:
        return acct_type
    return "Account"

logger = get_logger()

router = APIRouter()


def _plaid_response(
    *,
    status: str,
    message: str,
    success: bool = True,
    items: list[dict[str, Any]] | None = None,
    errors: list[dict[str, Any]] | None = None,
    counts: dict[str, int] | None = None,
    **extra: Any,
) -> dict[str, Any]:
    """Build a stable Plaid API response envelope without dropping legacy keys."""
    response: dict[str, Any] = {
        "success": success,
        "status": status,
        "message": message,
        "items": items or [],
        "errors": errors or [],
    }
    if counts is not None:
        response["counts"] = counts
    response.update(extra)
    return response


def _log_legacy_plaid_usage(event: str, *, route: str, user_id: str, **extra: Any) -> None:
    """Emit a structured legacy-path usage log for audit/removal planning."""
    logger.warning(
        event,
        route=route,
        user_id=user_id,
        timestamp=datetime.utcnow().isoformat(),
        caller=inspect.stack()[1].function,
        **extra,
    )


class ExchangeTokenRequest(BaseModel):
    # The one-time public_token received from Plaid Link UI
    # Must be exchanged within 30 minutes
    public_token: str


class SyncTransactionsRequest(BaseModel):
    # Optional — specify which bank if user has multiple connected
    # If omitted, uses most recently connected item
    item_id: str = None


class InvestmentTransactionsRequest(BaseModel):
    # Start of date range — required by Plaid
    start_date: str  # YYYY-MM-DD format
    # End of date range — required by Plaid
    end_date: str    # YYYY-MM-DD format
    # Optional — specify which bank if multiple connected
    item_id: str = None
    # Optional — filter to specific account IDs
    account_ids: str = None


async def get_plaid_token_for_user(user_id: str, db, item_id: str | None = None) -> tuple[str, str]:
    """Backward-compatible wrapper around the shared Plaid lookup helper."""
    token_row = await get_plaid_token_row_for_user(db, user_id, item_id=item_id)
    if not token_row:
        raise HTTPException(status_code=404, detail=PLAID_ITEM_NOT_FOUND_DETAIL)
    if item_id is None and token_row.item_id is None:
        # Compatibility path: legacy null-item provider tokens still fall back to
        # the newest row until the migration window closes.
        _log_legacy_plaid_usage(
            "legacy_plaid_item_fallback_used",
            route="/plaid/* token lookup",
            user_id=str(user_id),
            compatibility_field="item_id=None",
        )

    token_data = parse_token_data(token_row.token_data)
    access_token = token_data.get("access_token")
    if not access_token:
        message = "Plaid sync failed: access token missing or token_data could not be parsed"
        logger.warning(
            "Plaid token missing access token",
            user_id=str(user_id),
            item_id=token_row.item_id,
            provider=token_row.provider,
            token_data_type=value_type(token_row.token_data),
            access_token_present=False,
        )
        await mark_plaid_item_failed(db, user_id, token_row.item_id, message)
        raise HTTPException(status_code=400, detail=message)
    return access_token, token_row.item_id


async def _get_plaid_token_row_for_user(user_id: str, db, item_id: str) -> ProviderToken | None:
    return await get_plaid_token_row_for_user(db, user_id, item_id=item_id)


@router.post("/link-token")
async def create_link_token(
    current_user: dict = Depends(get_authenticated_user),
    db: AsyncSession = Depends(get_db),
):
    """Create Plaid Link token for the current user"""
    user_id = current_user["user_id"]
    user = await get_user_by_supabase_id(db, user_id)

    try:
        adapter = PlaidAdapter()
        link_token = await adapter.create_link_token(str(user.id))
        return {"success": True, "link_token": link_token}
    except Exception as e:
        import traceback
        logger.error(
            "Failed to create Plaid link token",
            error=str(e),
            traceback=traceback.format_exc(),
            user_id=str(user.id),
        )
        raise HTTPException(
            status_code=500,
            detail=f"Failed to create link token: {str(e)}",
        )


@router.post("/exchange-token", response_model=PlaidExchangeTokenResponse)
async def exchange_token(
    request: ExchangeTokenRequest,
    current_user: dict = Depends(get_authenticated_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Exchange a Plaid public_token for a permanent access_token.

    Flow:
    1. Frontend completes Plaid Link UI → receives public_token
    2. Frontend calls this endpoint with the public_token
    3. We exchange it for access_token + item_id
    4. We store the token in provider_tokens (one row per bank)
    5. We fetch and store the bank accounts
    6. Returns item_id and list of connected accounts

    This is separate from /platforms/plaid/connect to:
    - Support multi-bank connections (each bank = separate item_id)
    - Store richer account metadata (subtype, mask, institution)
    - Use the dedicated Plaid controller instead of generic platforms
    """
    user_id = current_user["user_id"]

    user = await get_user_by_supabase_id(db, user_id)

    adapter = PlaidAdapter()
    user_pk = user.id
    internal_user_id = str(user_pk)
    has_storage_consent = should_persist_user_data(user)

    try:
        # Step 1: Exchange public_token for access_token + item_id
        token_data = await adapter.exchange_public_token(request.public_token)
        access_token = token_data["access_token"]
        item_id = token_data["item_id"]

        # Step 2: Store token in provider_tokens
        # One row per (user_id, provider, item_id) — supports multiple banks
        stmt = select(ProviderToken).where(
            ProviderToken.user_id == user_pk,
            ProviderToken.provider == "plaid",
            ProviderToken.item_id == item_id,
        )
        result = await db.execute(stmt)
        existing_token = result.scalar_one_or_none()

        if existing_token:
            existing_token.token_data = {"access_token": access_token}
            existing_token.item_id = item_id
            existing_token.is_active = True
        else:
            db.add(ProviderToken(
                user_id=user_pk,
                provider="plaid",
                token_data={"access_token": access_token},
                item_id=item_id,
                is_active=True,
            ))

        await db.commit()

        item_status = None
        try:
            item_status = await adapter.get_item_status(access_token)
            await plaid_persist.upsert_item_status(
                db=db,
                item_id=item_id,
                item_status=item_status,
            )
            await db.commit()
        except Exception as status_exc:
            await db.rollback()
            logger.warning(
                "Plaid item status sync failed during exchange",
                user_id=internal_user_id,
                item_id=item_id,
                **plaid_error_context(status_exc),
            )

        # Gate: if user hasn't consented to storage, stop here.
        if not has_storage_consent:
            logger.info(
                "Plaid token stored but account persistence blocked (storage consent not given)",
                user_id=internal_user_id,
                item_id=item_id,
            )
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Data storage consent is required before connecting financial accounts.",
            )

        institution_id = item_status.get("institution_id") if item_status else None

        duplicate_item_ids: list[str] = []
        if institution_id:
            duplicate_item_ids = await get_active_plaid_item_ids_for_institution(
                db=db,
                user_id=user_pk,
                institution_id=institution_id,
                exclude_item_id=item_id,
            )
            if duplicate_item_ids:
                deactivated_count = await deactivate_plaid_accounts_for_item_ids(
                    db=db,
                    user_id=user_pk,
                    item_ids=duplicate_item_ids,
                    reason="Replaced by a newer Plaid connection for the same institution",
                )
                deactivated_token_count = await deactivate_plaid_provider_tokens_for_item_ids(
                    db=db,
                    user_id=user_pk,
                    item_ids=duplicate_item_ids,
                )
                logger.warning(
                    "Duplicate Plaid institution detected",
                    user_id=internal_user_id,
                    institution_id=institution_id,
                    new_item_id=item_id,
                    replaced_item_ids=duplicate_item_ids,
                    deactivated_account_count=deactivated_count,
                    deactivated_token_count=deactivated_token_count,
                )

        # Step 3: Fetch accounts for this item
        accounts_data = await adapter.fetch_accounts(token_data)

        # Step 4: Store each account in the accounts table
        connected_accounts = []
        for raw_acc in accounts_data:
            acc = normalize_plaid_value(raw_acc)
            if not acc:
                logger.warning(
                    "Plaid exchange account parse skipped",
                    user_id=internal_user_id,
                    item_id=item_id,
                    account_type=value_type(raw_acc),
                )
                continue
            plaid_account_id = acc.get("id") or acc.get("account_id")
            if not plaid_account_id:
                logger.warning(
                    "Plaid exchange account missing account id",
                    user_id=internal_user_id,
                    item_id=item_id,
                    account_type=value_type(raw_acc),
                )
                continue
            existing_account = await plaid_persist.find_existing_plaid_account(
                db=db,
                user_id=user_pk,
                item_id=item_id,
                provider_account_id=plaid_account_id,
            )

            if existing_account:
                # Re-connecting — update fields
                existing_account.is_active = True
                existing_account.error_message = None
                existing_account.item_id = item_id
                if institution_id:
                    existing_account.institution_id = institution_id
                existing_account.name = acc.get("name")
                existing_account.subtype = acc.get("subtype")
                existing_account.mask = acc.get("mask")
            else:
                # New account
                db.add(Account(
                    user_id=user_pk,
                    provider="plaid",
                    provider_account_id=plaid_account_id,
                    name=acc.get("name"),
                    account_type=acc.get("type", "bank"),
                    subtype=acc.get("subtype"),
                    mask=acc.get("mask"),
                    item_id=item_id,
                    institution_name="",
                    institution_id=institution_id,
                    is_active=True,
                ))

            connected_accounts.append({
                "provider_account_id": plaid_account_id,
                "name": acc.get("name"),
                "type": acc.get("type"),
                "subtype": acc.get("subtype"),
                "mask": acc.get("mask"),
            })

        await db.commit()

        logger.info(
            "Plaid token exchanged and accounts stored",
            user_id=internal_user_id,
            item_id=item_id,
            account_count=len(connected_accounts),
        )

        initial_sync = await sync_plaid_item_after_connection(
            db=db,
            user=user,
            item_id=item_id,
            access_token=access_token,
            available_products=item_status.get("available_products") if item_status else None,
            billed_products=item_status.get("billed_products") if item_status else None,
        )

        warning_items = (
            [{
                "item_id": item_id,
                "step": "exchange-token",
                "success": True,
                "message": "An existing Plaid connection for this institution was replaced by the newest item.",
                "institution_id": institution_id,
                "replaced_item_ids": duplicate_item_ids,
            }]
            if duplicate_item_ids
            else []
        )
        initial_sync_errors = initial_sync.get("errors", [])
        return _plaid_response(
            status="synced",
            message="Plaid item connected.",
            items=[
                {
                    "item_id": item_id,
                    "step": "exchange-token",
                    "success": True,
                    "message": "Plaid item connected.",
                    "added": len(connected_accounts),
                    "modified": 0,
                    "removed": 0,
                    "details": {
                        "account_count": len(connected_accounts),
                        "duplicate_institution_detected": bool(duplicate_item_ids),
                        "replaced_item_ids": duplicate_item_ids,
                    },
                }
            ],
            errors=initial_sync_errors,
            counts={
                "accounts": len(connected_accounts),
                "initial_sync_errors": len(initial_sync_errors),
                "warnings": len(warning_items),
            },
            item_id=item_id,
            accounts=connected_accounts,
            account_count=len(connected_accounts),
            duplicate_institution_detected=bool(duplicate_item_ids),
            replaced_item_ids=duplicate_item_ids,
            warnings=warning_items,
            initial_sync=initial_sync,
        )

    except HTTPException:
        raise
    except Exception as e:
        await db.rollback()
        logger.error("Plaid token exchange failed", user_id=internal_user_id, **plaid_error_context(e))
        raise HTTPException(status_code=502, detail=f"Token exchange failed: {str(e)}")


@router.get("/accounts")
async def get_accounts(
    item_id: str = None,
    current_user: dict = Depends(get_authenticated_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Get all accounts from the local DB (DB-first read).

    Returns cached account data (fast, no Plaid call).
    Use POST /accounts/sync to refresh balances from Plaid.

    Query params:
        item_id: Optional. If user has multiple banks connected,
                 specify which item to fetch.
    """
    user_id = current_user["user_id"]

    user = await get_user_by_supabase_id(db, user_id)

    acc_query = select(Account).where(
        Account.user_id == user.id,
        Account.provider == "plaid",
        Account.is_active == True,
    )
    if item_id:
        acc_query = acc_query.where(Account.item_id == item_id)

    result = await db.execute(acc_query)
    account_rows = result.scalars().all()

    accounts = [
        {
            "id": acc.provider_account_id,
            "name": _account_display_name(acc),
            "type": acc.account_type,
            "subtype": acc.subtype,
            "mask": acc.mask,
            "classification": classify_plaid_account(acc.account_type, acc.subtype),
            "role_label": account_role_label(acc.account_type, acc.subtype),
        }
        for acc in account_rows
    ]

    return {
        "success": True,
        "accounts": accounts,
        "account_count": len(accounts),
        "source": "db",
    }


@router.get("/accounts/balances")
async def get_balances(
    item_id: str = None,
    account_ids: str = None,
    current_user: dict = Depends(get_authenticated_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Get cached balances from the local DB (DB-first read).

    Returns balance data from the last sync (fast, no Plaid call).
    Use POST /accounts/sync to refresh balances from Plaid.

    Query params:
        item_id: Optional. Specify which bank if multiple connected.
        account_ids: Optional comma-separated list of Plaid account IDs to filter.
                     Example: ?account_ids=acc123,acc456
    """
    user_id = current_user["user_id"]

    user = await get_user_by_supabase_id(db, user_id)

    acc_query = select(Account).where(
        Account.user_id == user.id,
        Account.provider == "plaid",
        Account.is_active == True,
    )
    if item_id:
        acc_query = acc_query.where(Account.item_id == item_id)

    # Parse comma-separated account_ids if provided
    if account_ids:
        parsed_account_ids = [a.strip() for a in account_ids.split(",")]
        acc_query = acc_query.where(Account.provider_account_id.in_(parsed_account_ids))

    result = await db.execute(acc_query)
    account_rows = result.scalars().all()

    accounts = [
        {
            "account_id": acc.provider_account_id,
            "name": _account_display_name(acc),
            "type": acc.account_type,
            "subtype": acc.subtype,
            "mask": acc.mask,
            "available": float(acc.balance_available) if acc.balance_available is not None else None,
            "current": float(acc.balance_current) if acc.balance_current is not None else None,
            "limit": float(acc.balance_limit) if acc.balance_limit is not None else None,
            "currency": acc.balance_currency or "USD",
            "classification": classify_plaid_account(acc.account_type, acc.subtype),
            "role_label": account_role_label(acc.account_type, acc.subtype),
            "debt_amount": positive_debt_amount(acc.balance_current) if is_liability_account(acc.account_type, acc.subtype) else None,
        }
        for acc in account_rows
    ]

    return {
        "success": True,
        "accounts": accounts,
        "account_count": len(accounts),
        "source": "db",
    }


@router.post("/accounts/sync")
async def sync_account_balances(
    item_id: str = None,
    current_user: dict = Depends(get_authenticated_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Sync Plaid account balances into the holdings table.

    This is what makes the dashboard show real balance values.
    Flow:
    1. Fetch live balances from Plaid
    2. For each depository/credit account → write USD balance to holdings
    3. Dashboard aggregation picks up from holdings table automatically

    Call this after connecting a bank and periodically to refresh.

    Query params:
        item_id: Optional. Specify which bank if multiple connected.
    """
    user_id = current_user["user_id"]

    user = await get_user_by_supabase_id(db, user_id)

    if not should_persist_user_data(user):
        return {"success": True, "persisted": False, "synced": [], "errors": [], "synced_count": 0, "error_count": 0}

    if item_id is None:
        step_result = await sync_plaid_step_for_user(
            db=db,
            user=user,
            sync_name="balances",
            sync_fn=sync_plaid_balances_for_item,
        )
        if step_result["item_count"] == 0:
            raise HTTPException(status_code=404, detail="No Plaid account connected. Please connect a bank account first.")
        synced_count = sum(
            len(item_result.get("result", {}).get("synced", []))
            for item_result in step_result["items"]
            if item_result.get("success")
        )
        error_count = len(step_result["errors"])
        return {
            "success": error_count == 0,
            "persisted": True,
            "items": step_result["items"],
            "errors": step_result["errors"],
            "item_count": step_result["item_count"],
            "synced_count": synced_count,
            "error_count": error_count,
        }

    access_token, resolved_item_id = await get_plaid_token_for_user(user.id, db, item_id)
    adapter = PlaidAdapter()

    try:
        sync_result = await sync_plaid_balances_for_item(
            db=db,
            user=user,
            item_id=resolved_item_id,
            access_token=access_token,
            adapter=adapter,
        )
        synced = sync_result["synced"]
        errors = sync_result["errors"]

        logger.info(
            "Plaid account balances synced",
            user_id=str(user.id),
            item_id=resolved_item_id,
            synced_count=len(synced),
            error_count=len(errors),
        )

        return {
            "success": True,
            "item_id": resolved_item_id,
            "synced": synced,
            "errors": errors,
            "synced_count": len(synced),
            "error_count": len(errors),
        }

    except Exception as e:
        logger.error(
            "Failed to sync Plaid balances",
            endpoint="accounts/balance/get",
            user_id=user_id,
            item_id=resolved_item_id,
            **plaid_error_context(e),
        )
        raise HTTPException(status_code=502, detail=f"Sync failed: {str(e)}")


@router.post("/transactions/sync")
async def sync_transactions(
    request: SyncTransactionsRequest = None,
    current_user: dict = Depends(get_authenticated_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Sync transactions incrementally using Plaid's cursor system.

    First call: fetches full transaction history (no cursor stored yet)
    Subsequent calls: fetches only new/modified/removed since last sync

    The cursor is stored in provider_tokens.cursor after each successful
    sync and automatically used on the next call — no manual cursor
    management needed from the frontend.

    Returns added, modified, removed transaction lists + sync status.
    """
    user_id = current_user["user_id"]

    user = await get_user_by_supabase_id(db, user_id)

    if not should_persist_user_data(user):
        return {"success": True, "persisted": False, "added": [], "modified": [], "removed": [], "next_cursor": None, "has_more": False, "summary": {}}

    item_id = request.item_id if request else None
    if item_id is None:
        step_result = await sync_plaid_step_for_user(
            db=db,
            user=user,
            sync_name="transactions",
            sync_fn=sync_plaid_transactions_for_item,
        )
        if step_result["item_count"] == 0:
            raise HTTPException(status_code=404, detail="No Plaid account connected. Please connect a bank account first.")
        summary = {
            "added": sum(len(item_result.get("result", {}).get("added", [])) for item_result in step_result["items"] if item_result.get("success")),
            "modified": sum(len(item_result.get("result", {}).get("modified", [])) for item_result in step_result["items"] if item_result.get("success")),
            "removed": sum(len(item_result.get("result", {}).get("removed", [])) for item_result in step_result["items"] if item_result.get("success")),
        }
        return {
            "success": len(step_result["errors"]) == 0,
            "item_count": step_result["item_count"],
            "items": step_result["items"],
            "errors": step_result["errors"],
            "summary": summary,
        }

    access_token, resolved_item_id = await get_plaid_token_for_user(
        user.id, db, item_id
    )

    adapter = PlaidAdapter()

    try:
        sync_result = await sync_plaid_transactions_for_item(
            db=db,
            user=user,
            item_id=resolved_item_id,
            access_token=access_token,
            adapter=adapter,
        )
        persist_error = None
        persist_counts = sync_result["summary"]

        logger.info(
            "Plaid transactions synced",
            user_id=str(user.id),
            item_id=resolved_item_id,
            **persist_counts,
            has_more=sync_result["has_more"],
        )

        response = {
            "success": True,
            "item_id": resolved_item_id,
            "added": sync_result["added"],
            "modified": sync_result["modified"],
            "removed": sync_result["removed"],
            "next_cursor": sync_result["next_cursor"],
            "has_more": sync_result["has_more"],
            "summary": persist_counts,
        }
        if persist_error:
            response["persist_error"] = persist_error
        return response

    except Exception as e:
        await db.rollback()
        logger.error(
            "Transaction sync failed",
            endpoint="transactions/sync",
            user_id=user_id,
            item_id=resolved_item_id,
            **plaid_error_context(e),
        )
        raise HTTPException(
            status_code=502,
            detail=f"Transaction sync failed: {str(e)}"
        )


@router.post("/transactions/refresh")
async def refresh_transactions(
    current_user: dict = Depends(get_authenticated_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Request Plaid to re-check transactions for active transaction-capable Items.

    This endpoint only requests a refresh. It does not fetch new transactions
    immediately; Plaid will later emit SYNC_UPDATES_AVAILABLE if new data exists.
    """
    user_id = current_user["user_id"]

    user = await get_user_by_supabase_id(db, user_id)

    if not should_persist_user_data(user):
        return {"success": True, "requested": False, "items": [], "errors": [], "item_count": 0}

    refresh_result = await request_plaid_transactions_refresh_for_user(db=db, user=user)
    if refresh_result["item_count"] == 0:
        raise HTTPException(status_code=404, detail="No Plaid account connected. Please connect a bank account first.")
    return {
        "success": refresh_result["success"],
        "requested": True,
        "item_count": refresh_result["item_count"],
        "items": refresh_result["items"],
        "errors": refresh_result["errors"],
    }


@router.get("/transactions")
async def get_transactions(
    item_id: str = None,
    account_id: str = None,
    start_date: Optional[date] = Query(None, description="Start date (YYYY-MM-DD). Filters synced transactions."),
    end_date: Optional[date] = Query(None, description="End date (YYYY-MM-DD). Filters synced transactions."),
    count: int = Query(100, ge=1, le=500, description="Number of transactions per page"),
    offset: int = Query(0, ge=0, description="Pagination offset"),
    current_user: dict = Depends(get_authenticated_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Get transactions from the local DB (DB-first read).

    Use POST /transactions/sync to refresh from Plaid.

    Query params:
        item_id: Optional. Filter by specific bank connection.
        account_id: Optional. Filter by specific account (internal UUID).
        start_date: Optional. Filter transactions on or after this date.
        end_date: Optional. Filter transactions on or before this date.
        count: Number of results (default 100, max 500).
        offset: Pagination offset (default 0).
    """
    user_id = current_user["user_id"]

    user = await get_user_by_supabase_id(db, user_id)

    from sqlalchemy import func as sql_func

    txn_query = select(Transaction).join(
        Account,
        Transaction.account_id == Account.id,
    ).where(
        Transaction.user_id == user.id,
        Account.user_id == user.id,
        Account.provider == "plaid",
        Account.is_active == True,
    )

    if account_id:
        txn_query = txn_query.where(Transaction.account_id == account_id)

    if start_date:
        txn_query = txn_query.where(Transaction.date >= start_date)
    if end_date:
        txn_query = txn_query.where(Transaction.date <= end_date)

    if item_id:
        acc_stmt = select(Account.id).where(
            Account.user_id == user.id,
            Account.provider == "plaid",
            Account.item_id == item_id,
            Account.is_active == True,
        )
        result = await db.execute(acc_stmt)
        item_account_ids = [row[0] for row in result.all()]
        if item_account_ids:
            txn_query = txn_query.where(Transaction.account_id.in_(item_account_ids))
        else:
            return {
                "success": True,
                "source": "local_db",
                "transactions": [],
                "total_transactions": 0,
            }

    count_query = select(sql_func.count()).select_from(txn_query.subquery())
    total_result = await db.execute(count_query)
    total = total_result.scalar()

    txn_query = txn_query.order_by(Transaction.date.desc()).offset(offset).limit(count)
    result = await db.execute(txn_query)
    transactions = result.scalars().all()

    # Fetch account metadata so the frontend can show account name in Payment From
    account_ids = list({t.account_id for t in transactions if t.account_id})
    account_map: dict = {}
    if account_ids:
        acc_stmt = select(Account).where(Account.id.in_(account_ids))
        acc_result = await db.execute(acc_stmt)
        for acc in acc_result.scalars().all():
            account_map[str(acc.id)] = {
                "name": acc.name,
                "mask": acc.mask,
                "institution_name": acc.institution_name if hasattr(acc, "institution_name") else None,
            }

    return {
        "success": True,
        "source": "local_db",
        "transactions": [
            {
                "id": str(t.id),
                "account_id": str(t.account_id),
                "transaction_id": getattr(t, "transaction_id", None) or getattr(t, "plaid_transaction_id", None),
                "amount": float(t.amount),
                "date": str(t.date),
                "authorized_date": str(t.authorized_date) if t.authorized_date else None,
                "name": t.name,
                "merchant_name": t.merchant_name,
                "pending": t.pending,
                "category_primary": t.category_primary,
                "category_detailed": t.category_detailed,
                "payment_channel": t.payment_channel,
                "logo_url": t.logo_url,
                "account_name": account_map.get(str(t.account_id), {}).get("name"),
                "account_mask": account_map.get(str(t.account_id), {}).get("mask"),
                "institution_name": account_map.get(str(t.account_id), {}).get("institution_name"),
            }
            for t in transactions
        ],
        "total_transactions": total,
    }


@router.get("/transactions/recurring")
async def get_recurring_transactions(
    current_user: dict = Depends(get_authenticated_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Return recurring streams from DB (DB-first, no Plaid call).
    Use POST /transactions/recurring/sync to refresh from Plaid.
    """
    user_id = current_user["user_id"]

    user = await get_user_by_supabase_id(db, user_id)

    rows = await _read_recurring_streams(db, user.id)
    inflow_streams, outflow_streams = _format_recurring_rows(rows)

    return {
        "success": True,
        "inflow_streams": inflow_streams,
        "outflow_streams": outflow_streams,
        "summary": {
            "inflow_count": len(inflow_streams),
            "outflow_count": len(outflow_streams),
        },
        "source": "db",
    }


async def _read_recurring_streams(db: AsyncSession, internal_user_id):
    """Read all recurring_streams rows for a user, ordered consistently."""
    result = await db.execute(
        text(
            "SELECT rs.*, a.provider_account_id "
            "FROM recurring_streams rs "
            "LEFT JOIN accounts a ON a.id = rs.account_id "
            "WHERE rs.user_id = :uid "
            "ORDER BY rs.stream_type, rs.is_active DESC, rs.merchant_name"
        ),
        {"uid": str(internal_user_id)},
    )
    return result.mappings().all()


def _format_recurring_rows(rows):
    """Split rows into inflow/outflow lists with the frontend-expected shape."""
    inflow, outflow = [], []
    for r in rows:
        entry = {
            "stream_id": r["stream_id"],
            "account_id": r.get("provider_account_id") or str(r["account_id"] or ""),
            "description": r["description"],
            "merchant_name": r["merchant_name"],
            "frequency": r["frequency"],
            "average_amount": float(r["average_amount"]) if r["average_amount"] is not None else None,
            "last_amount": float(r["last_amount"]) if r["last_amount"] is not None else None,
            "first_date": str(r["first_date"]) if r["first_date"] else None,
            "last_date": str(r["last_date"]) if r["last_date"] else None,
            "predicted_next_date": str(r["predicted_next_date"]) if r["predicted_next_date"] else None,
            "status": r["status"],
            "is_active": r["is_active"],
        }
        if r["stream_type"] == "inflow":
            inflow.append(entry)
        else:
            outflow.append(entry)
    return inflow, outflow


@router.post("/transactions/recurring/sync")
async def sync_recurring_transactions(
    account_ids: str = None,
    item_id: str = None,
    current_user: dict = Depends(get_authenticated_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Sync recurring streams from Plaid, persist to DB, then return DB data.
    """
    user_id = current_user["user_id"]

    user = await get_user_by_supabase_id(db, user_id)

    if not should_persist_user_data(user):
        return {"success": True, "persisted": False, "inflow_streams": [], "outflow_streams": [], "summary": {"inflow_count": 0, "outflow_count": 0}}

    if item_id is None:
        step_result = await sync_plaid_step_for_user(
            db=db,
            user=user,
            sync_name="recurring",
            sync_fn=sync_plaid_recurring_for_item,
            sync_kwargs={"account_ids": [a.strip() for a in account_ids.split(",")] if account_ids else None},
        )
        if step_result["item_count"] == 0:
            raise HTTPException(status_code=404, detail="No Plaid account connected. Please connect a bank account first.")
        rows = await _read_recurring_streams(db, user.id)
        inflow_streams, outflow_streams = _format_recurring_rows(rows)
        return {
            "success": len(step_result["errors"]) == 0,
            "inflow_streams": inflow_streams,
            "outflow_streams": outflow_streams,
            "summary": {
                "inflow_count": len(inflow_streams),
                "outflow_count": len(outflow_streams),
            },
            "source": "sync",
            "items": step_result["items"],
            "errors": step_result["errors"],
            "persisted": len(step_result["errors"]) == 0,
        }

    access_token, resolved_item_id = await get_plaid_token_for_user(user.id, db, item_id)

    if account_ids:
        parsed_account_ids = [a.strip() for a in account_ids.split(",")]
    else:
        acc_stmt = select(Account).where(
            Account.user_id == user.id,
            Account.provider == "plaid",
            Account.item_id == resolved_item_id,
            Account.is_active == True,
        )
        acc_result = await db.execute(acc_stmt)
        acc_rows = acc_result.scalars().all()
        parsed_account_ids = [acc.provider_account_id for acc in acc_rows]

    if not parsed_account_ids:
        raise HTTPException(
            status_code=400,
            detail="No accounts found. Connect a bank first.",
        )

    adapter = PlaidAdapter()
    try:
        sync_result = await sync_plaid_recurring_for_item(
            db=db,
            user=user,
            item_id=resolved_item_id,
            access_token=access_token,
            adapter=adapter,
            account_ids=parsed_account_ids,
        )
        persisted = sync_result["persisted"]
    except Exception as e:
        await db.rollback()
        logger.error(
            "Failed to sync recurring transactions from Plaid",
            endpoint="transactions/recurring/get",
            error=str(e),
            user_id=user_id,
            item_id=resolved_item_id,
        )
        raise HTTPException(status_code=502, detail=f"Failed to sync recurring transactions: {str(e)}")

    # Re-read from DB for consistent response
    rows = await _read_recurring_streams(db, user.id)
    inflow_streams, outflow_streams = _format_recurring_rows(rows)

    return {
        "success": True,
        "inflow_streams": inflow_streams,
        "outflow_streams": outflow_streams,
        "summary": {
            "inflow_count": len(inflow_streams),
            "outflow_count": len(outflow_streams),
        },
        "source": "sync",
        "persisted": persisted,
    }



@router.post("/investments/sync")
async def sync_investments(
    item_id: str = None,
    current_user: dict = Depends(get_authenticated_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Sync investment holdings for all (or one) Plaid item.

    For each item:
    1. Calls Plaid /investments/holdings/get
    2. Upserts securities to the global securities table
    3. Upserts holdings to the holdings table directly
       (bypasses asset_mapping — investment tickers are canonical)
    4. Populates institution_price and institution_value on holdings
    5. Updates account.last_synced_at

    Query params:
        item_id: Optional. Sync only this item. If omitted, syncs all items.
    """
    user_id = current_user["user_id"]

    user = await get_user_by_supabase_id(db, user_id)

    if not should_persist_user_data(user):
        return {"success": True, "persisted": False, "synced_items": [], "errors": [], "summary": {"items_synced": 0, "items_failed": 0, "total_securities_upserted": 0, "total_holdings_upserted": 0}}

    sync_result = await sync_plaid_investments_for_user(db=db, user=user, item_id=item_id)
    if not sync_result["items"] and not sync_result["errors"]:
        raise HTTPException(
            status_code=404,
            detail="No Plaid account connected. Please connect a bank account first."
        )

    return {
        "success": sync_result["success"],
        "synced_items": sync_result["items"],
        "errors": sync_result["errors"],
        "summary": {
            "items_synced": len(sync_result["items"]),
            "items_failed": len(sync_result["errors"]),
            "total_securities_upserted": sync_result["securities_upserted"],
            "total_holdings_upserted": sync_result["holdings_upserted"],
        },
    }


@router.post("/investments/transactions/sync")
async def sync_investment_transactions(
    request: InvestmentTransactionsRequest,
    current_user: dict = Depends(get_authenticated_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Fetch and save investment transaction history to the DB.

    Covers buy, sell, dividend, fee, cash, and transfer activity.
    Uses the existing InvestmentTransactionsRequest schema (start_date,
    end_date, item_id, account_ids).

    Flow:
    1. Fetch investment transactions from Plaid for the date range
    2. Upsert securities from the response as a side effect
    3. Upsert investment_transactions keyed on (user_id, investment_transaction_id)
    4. Return counts of added / updated / skipped rows

    amount convention (matches Plaid):
        Positive = cash outflow (you bought something)
        Negative = cash inflow (you sold or received dividend)
    """
    from datetime import date as date_type
    from app.models.security import Security
    from app.models.investment_transaction import InvestmentTransaction

    def parse_date(date_str):
        if not date_str or date_str == "None":
            return None
        if isinstance(date_str, date_type):
            return date_str
        try:
            return date_type.fromisoformat(str(date_str))
        except (ValueError, TypeError):
            return None

    user_id = current_user["user_id"]

    user = await get_user_by_supabase_id(db, user_id)

    if not should_persist_user_data(user):
        return {"success": True, "persisted": False, "investment_transactions": [], "securities": [], "total_investment_transactions": 0, "summary": {"added": 0, "updated": 0, "skipped": 0}}

    parsed_account_ids = None
    if request.account_ids:
        parsed_account_ids = [a.strip() for a in request.account_ids.split(",")]

    if request.item_id is None:
        token_rows = await get_plaid_token_rows_for_user(db, user.id)
        if not token_rows:
            raise HTTPException(status_code=404, detail="No Plaid account connected. Please connect a bank account first.")
        adapter = PlaidAdapter()
        items = []
        errors = []
        total_upserted = 0
        total_count = 0

        for token_row in token_rows:
            token_data = parse_token_data(token_row.token_data)
            resolved_item_id = token_row.item_id or token_data.get("item_id")
            access_token = token_data.get("access_token")
            institution_id = token_row.institution_id
            if resolved_item_id and token_row.item_id != resolved_item_id:
                token_row.item_id = resolved_item_id

            if not resolved_item_id:
                message = "Plaid sync failed: item_id missing on provider token"
                logger.warning(
                    "Plaid investment transaction sync skipped missing item_id",
                    user_id=str(user.id),
                    item_id=None,
                    institution_id=institution_id,
                    provider=token_row.provider,
                )
                errors.append({
                    "item_id": "",
                    "sync_step": "investments/transactions/get",
                    "error": message,
                })
                items.append({
                    "item_id": "",
                    "institution_id": institution_id,
                    "success": False,
                    "error": message,
                })
                continue

            if not access_token:
                message = "Plaid sync failed: access token missing or token_data could not be parsed"
                logger.warning(
                    "Plaid investment transaction sync skipped missing access token",
                    user_id=str(user.id),
                    item_id=resolved_item_id,
                    institution_id=institution_id,
                    provider=token_row.provider,
                    token_data_type=value_type(token_row.token_data),
                    access_token_present=False,
                )
                errors.append({
                    "item_id": resolved_item_id,
                    "sync_step": "investments/transactions/get",
                    "error": message,
                })
                items.append({
                    "item_id": resolved_item_id,
                    "institution_id": institution_id,
                    "success": False,
                    "error": message,
                })
                continue

            try:
                data = await adapter.get_investment_transactions(
                    access_token=access_token,
                    start_date=request.start_date,
                    end_date=request.end_date,
                    account_ids=parsed_account_ids,
                )
                inv_txns = data["investment_transactions"]
                securities_raw = data["securities"]

                stmt = select(Account).where(
                    Account.user_id == user.id,
                    Account.provider == "plaid",
                    Account.item_id == resolved_item_id,
                )
                result = await db.execute(stmt)
                account_rows = result.scalars().all()
                account_map = {acc.provider_account_id: acc.id for acc in account_rows}

                persist_error = None
                upserted_count = 0
                try:
                    await plaid_persist.upsert_securities(db, securities_raw)
                    upserted_count = await plaid_persist.upsert_investment_transactions(
                        db=db,
                        user_id=user.id,
                        account_map=account_map,
                        inv_transactions=inv_txns,
                        item_id=resolved_item_id,
                    )
                    await db.commit()
                except Exception as persist_exc:
                    await db.rollback()
                    persist_error = str(persist_exc)
                    logger.error(
                        "plaid_persist failed for investment transaction sync",
                        error=persist_error,
                        user_id=str(user.id),
                        item_id=resolved_item_id,
                        institution_id=institution_id,
                    )

                total_upserted += upserted_count
                total_count += data["total_investment_transactions"]
                items.append({
                    "item_id": resolved_item_id,
                    "institution_id": institution_id,
                    "success": True,
                    "investment_transactions_count": len(inv_txns),
                    "securities_count": len(securities_raw),
                    "upserted_count": upserted_count,
                    "total_count": data["total_investment_transactions"],
                    "persist_error": persist_error,
                })
                if persist_error:
                    errors.append({
                        "item_id": resolved_item_id,
                        "sync_step": "investments/transactions/persist",
                        "error": persist_error,
                    })
            except Exception as exc:
                await db.rollback()
                context = plaid_error_context(exc)
                logger.error(
                    "Investment transaction sync failed",
                    error=str(exc),
                    user_id=user_id,
                    item_id=resolved_item_id,
                    institution_id=institution_id,
                    **context,
                )
                errors.append({
                    "item_id": resolved_item_id,
                    "sync_step": "investments/transactions/get",
                    "error": context.get("plaid_display_message") or context.get("error") or str(exc),
                    "plaid_error_type": context.get("plaid_error_type"),
                    "plaid_error_code": context.get("plaid_error_code"),
                    "plaid_error_message": context.get("plaid_display_message") or context.get("error") or str(exc),
                    "request_id": context.get("request_id"),
                })
                items.append({
                    "item_id": resolved_item_id,
                    "institution_id": institution_id,
                    "success": False,
                    "error": context.get("plaid_display_message") or context.get("error") or str(exc),
                })

        return {
            "success": len(errors) == 0,
            "items": items,
            "errors": errors,
            "summary": {
                "upserted_count": total_upserted,
                "total_investment_transactions": total_count,
            },
        }

    access_token, resolved_item_id = await get_plaid_token_for_user(
        user.id, db, request.item_id
    )

    adapter = PlaidAdapter()

    try:
        data = await adapter.get_investment_transactions(
            access_token=access_token,
            start_date=request.start_date,
            end_date=request.end_date,
            account_ids=parsed_account_ids,
        )
        inv_txns = data["investment_transactions"]
        securities_raw = data["securities"]

        # Build account_map
        stmt = select(Account).where(
            Account.user_id == user.id,
            Account.provider == "plaid",
            Account.item_id == resolved_item_id,
        )
        result = await db.execute(stmt)
        account_rows = result.scalars().all()
        account_map = {acc.provider_account_id: acc.id for acc in account_rows}

        persist_error = None
        upserted_count = 0
        try:
            # Upsert securities first (side effect)
            await plaid_persist.upsert_securities(db, securities_raw)

            # Upsert investment transactions
            upserted_count = await plaid_persist.upsert_investment_transactions(
                db=db,
                user_id=user.id,
                account_map=account_map,
                inv_transactions=inv_txns,
                item_id=resolved_item_id,
            )
            await db.commit()
        except Exception as persist_exc:
            await db.rollback()
            persist_error = str(persist_exc)
            logger.error(
                "plaid_persist failed for investment transaction sync",
                error=persist_error,
                user_id=str(user.id),
                item_id=resolved_item_id,
            )

        logger.info(
            "Plaid investment transactions synced",
            user_id=str(user.id),
            item_id=resolved_item_id,
            upserted=upserted_count,
            total_from_plaid=data["total_investment_transactions"],
        )

        response = {
            "success": True,
            "item_id": resolved_item_id,
            "investment_transactions": inv_txns,
            "securities": securities_raw,
            "total_count": data["total_investment_transactions"],
            "summary": {
                "upserted_count": upserted_count,
            },
        }
        if persist_error:
            response["persist_error"] = persist_error
        return response

    except Exception as e:
        await db.rollback()
        logger.error("Investment transaction sync failed", error=str(e), user_id=user_id)
        raise HTTPException(
            status_code=502,
            detail=f"Investment transaction sync failed: {str(e)}"
        )


@router.get("/investments/holdings")
async def get_investment_holdings(
    item_id: str = None,
    current_user: dict = Depends(get_authenticated_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Get investment holdings from the local DB (DB-first read).

    Returns holdings joined with security details.
    Use POST /investments/sync to refresh from Plaid.

    Query params:
        item_id: Optional. Specify which bank if multiple connected.
    """
    from app.models.security import Security
    from app.models.holding import Holding

    user_id = current_user["user_id"]

    user = await get_user_by_supabase_id(db, user_id)

    # Build holdings query with optional item_id filter
    holdings_query = select(Holding, Security, Account).outerjoin(
        Security, Holding.security_id == Security.security_id
    ).join(
        Account, Holding.account_id == Account.id
    ).where(
        Holding.user_id == user.id,
        Account.is_active == True,
    )

    if item_id:
        holdings_query = holdings_query.where(Account.item_id == item_id)

    result = await db.execute(holdings_query)
    rows = result.all()

    # Build enriched holdings matching the previous response shape
    enriched_holdings = []
    securities_seen = {}

    for holding, security, account in rows:
        enriched_holdings.append({
            "account_id": account.provider_account_id,
            "security_id": holding.security_id,
            "quantity": float(holding.quantity) if holding.quantity is not None else None,
            "institution_price": float(holding.institution_price) if holding.institution_price is not None else None,
            "institution_value": float(holding.institution_value) if holding.institution_value is not None else None,
            "cost_basis": float(holding.cost_basis) if holding.cost_basis is not None else None,
            "ticker_symbol": security.ticker_symbol if security else None,
            "security_name": security.name if security else None,
            "security_type": security.type if security else None,
            "is_cash_equivalent": security.is_cash_equivalent if security else False,
            "close_price": float(security.close_price) if security and security.close_price is not None else None,
        })

        if security and security.security_id not in securities_seen:
            securities_seen[security.security_id] = {
                "security_id": security.security_id,
                "name": security.name,
                "ticker_symbol": security.ticker_symbol,
                "type": security.type,
                "is_cash_equivalent": security.is_cash_equivalent,
                "close_price": float(security.close_price) if security.close_price is not None else None,
                "currency": security.currency,
            }

    return {
        "success": True,
        "holdings": enriched_holdings,
        "securities": list(securities_seen.values()),
        "holdings_count": len(enriched_holdings),
        "source": "db",
    }


@router.post("/investments/transactions")
async def get_investment_transactions(
    request: InvestmentTransactionsRequest,
    current_user: dict = Depends(get_authenticated_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Get investment transaction history for a date range.

    Returns buy, sell, dividend, and other investment activity.
    Requires explicit start_date and end_date.

    Request body:
        start_date: YYYY-MM-DD
        end_date: YYYY-MM-DD
        item_id: Optional
        account_ids: Optional comma-separated account IDs
    """
    user_id = current_user["user_id"]

    user = await get_user_by_supabase_id(db, user_id)

    access_token, resolved_item_id = await get_plaid_token_for_user(
        user.id, db, request.item_id
    )

    parsed_account_ids = None
    if request.account_ids:
        parsed_account_ids = [a.strip() for a in request.account_ids.split(",")]

    adapter = PlaidAdapter()

    try:
        data = await adapter.get_investment_transactions(
            access_token=access_token,
            start_date=request.start_date,
            end_date=request.end_date,
            account_ids=parsed_account_ids,
        )

        return {
            "success": True,
            "item_id": resolved_item_id,
            "investment_transactions": data["investment_transactions"],
            "securities": data["securities"],
            "total_count": data["total_investment_transactions"],
        }

    except Exception as e:
        logger.error("Failed to get investment transactions", error=str(e), user_id=user_id)
        raise HTTPException(status_code=502, detail=f"Failed to fetch investment transactions: {str(e)}")


async def _read_liabilities_from_db(db: AsyncSession, user_id) -> dict:
    """
    Read liabilities from the DB and return them in the same shape
    the frontend expects (matching the Plaid adapter response format).
    """
    import json as _json

    result = await db.execute(
        text("""
            SELECT * FROM public.liabilities
            WHERE user_id = :user_id
            ORDER BY liability_type, provider_account_id
        """),
        {"user_id": str(user_id)},
    )
    rows = result.mappings().all()

    account_result = await db.execute(
        select(Account).where(
            Account.user_id == user_id,
            Account.provider == "plaid",
            Account.is_active == True,
        )
    )
    all_active_plaid_accounts = account_result.scalars().all()

    liability_accounts = [
        account
        for account in all_active_plaid_accounts
        if is_liability_account(account.account_type, account.subtype)
    ]
    liability_account_map = {account.provider_account_id: account for account in liability_accounts}

    credit = []
    mortgage = []
    student = []
    loans = []
    total_liabilities = 0.0
    seen_liability_account_ids = set()

    for r in rows:
        lt = r["liability_type"]
        provider_account_id = r["provider_account_id"]
        account = liability_account_map.get(provider_account_id)
        seen_liability_account_ids.add(provider_account_id)
        account_debt_amount = positive_debt_amount(account.balance_current) if account else None
        account_limit = float(account.balance_limit) if account and account.balance_limit is not None else None
        account_available = float(account.balance_available) if account and account.balance_available is not None else None

        if lt == "credit":
            # Reconstruct single-element aprs array from the stored primary APR
            aprs = []
            if r.get("credit_apr_percentage") is not None:
                aprs.append({
                    "apr_percentage": float(r["credit_apr_percentage"]) if r["credit_apr_percentage"] is not None else None,
                    "apr_type": r.get("credit_apr_type"),
                    "balance_subject_to_apr": None,
                    "interest_charge_amount": None,
                })

            credit.append({
                "id": str(r["id"]),
                "account_id": provider_account_id,
                "internal_account_id": str(account.id) if account else (str(r["account_id"]) if r.get("account_id") else None),
                "name": _account_display_name(account) if account else None,
                "mask": account.mask if account else None,
                "account_type": account.account_type if account else "credit",
                "subtype": account.subtype if account else "credit card",
                "debt_amount": account_debt_amount,
                "current_balance": account_debt_amount,
                "balance": account_debt_amount,
                "balance_current": account_debt_amount,
                "credit_limit": account_limit,
                "limit": account_limit,
                "balance_limit": account_limit,
                "available_credit": account_available,
                "balance_available": account_available,
                "currency": account.balance_currency if account and account.balance_currency else "USD",
                "sync_status": "synced" if account and account.last_synced_at else "not_synced",
                "error_message": account.error_message if account else None,
                "aprs": aprs,
                "is_overdue": r.get("credit_is_overdue"),
                "last_payment_amount": float(r["credit_last_payment_amount"]) if r.get("credit_last_payment_amount") is not None else None,
                "last_payment_date": str(r["credit_last_payment_date"]) if r.get("credit_last_payment_date") else None,
                "last_statement_balance": float(r["credit_last_statement_balance"]) if r.get("credit_last_statement_balance") is not None else None,
                "last_statement_issue_date": str(r["credit_last_statement_issue_date"]) if r.get("credit_last_statement_issue_date") else None,
                "minimum_payment_amount": float(r["credit_minimum_payment_amount"]) if r.get("credit_minimum_payment_amount") is not None else None,
                "next_payment_due_date": str(r["credit_next_payment_due_date"]) if r.get("credit_next_payment_due_date") else None,
            })

        elif lt == "mortgage":
            # Reconstruct property_address from the stored string
            addr_str = r.get("mortgage_property_address")
            property_address = None
            if addr_str:
                parts = [p.strip() for p in addr_str.split(",")]
                property_address = {
                    "street": parts[0] if len(parts) > 0 else None,
                    "city": parts[1] if len(parts) > 1 else None,
                    "region": parts[2] if len(parts) > 2 else None,
                    "postal_code": parts[3] if len(parts) > 3 else None,
                    "country": parts[4] if len(parts) > 4 else None,
                }

            mortgage.append({
                "account_id": provider_account_id,
                "account_type": account.account_type if account else "loan",
                "subtype": account.subtype if account else "mortgage",
                "debt_amount": account_debt_amount if account_debt_amount is not None else (
                    float(r["mortgage_outstanding_principal_amount"]) if r.get("mortgage_outstanding_principal_amount") is not None else None
                ),
                "interest_rate_percentage": float(r["mortgage_interest_rate_percentage"]) if r.get("mortgage_interest_rate_percentage") is not None else None,
                "interest_rate_type": r.get("mortgage_interest_rate_type"),
                "maturity_date": str(r["mortgage_maturity_date"]) if r.get("mortgage_maturity_date") else None,
                "origination_date": None,
                "origination_principal": float(r["mortgage_origination_principal_amount"]) if r.get("mortgage_origination_principal_amount") is not None else None,
                "outstanding_principal": float(r["mortgage_outstanding_principal_amount"]) if r.get("mortgage_outstanding_principal_amount") is not None else None,
                "next_monthly_payment": float(r["mortgage_next_monthly_payment"]) if r.get("mortgage_next_monthly_payment") is not None else None,
                "next_payment_due_date": str(r["mortgage_next_payment_due_date"]) if r.get("mortgage_next_payment_due_date") else None,
                "escrow_balance": None,
                "has_pmi": None,
                "last_payment_amount": float(r["mortgage_last_payment_amount"]) if r.get("mortgage_last_payment_amount") is not None else None,
                "last_payment_date": str(r["mortgage_last_payment_date"]) if r.get("mortgage_last_payment_date") else None,
                "ytd_interest_paid": float(r["mortgage_ytd_interest_paid"]) if r.get("mortgage_ytd_interest_paid") is not None else None,
                "ytd_principal_paid": float(r["mortgage_ytd_principal_paid"]) if r.get("mortgage_ytd_principal_paid") is not None else None,
                "property_address": property_address,
            })

        elif lt == "student":
            # Parse disbursement_dates from stored JSON
            disbursement_raw = r.get("student_disbursement_dates")
            disbursement_dates = None
            if disbursement_raw:
                if isinstance(disbursement_raw, str):
                    try:
                        disbursement_dates = _json.loads(disbursement_raw)
                    except (ValueError, TypeError):
                        disbursement_dates = None
                else:
                    disbursement_dates = disbursement_raw

            student.append({
                "account_id": provider_account_id,
                "account_type": account.account_type if account else "loan",
                "subtype": account.subtype if account else "student",
                "debt_amount": account_debt_amount,
                "interest_rate_percentage": float(r["student_interest_rate_percentage"]) if r.get("student_interest_rate_percentage") is not None else None,
                "outstanding_interest_amount": float(r["student_outstanding_interest_amount"]) if r.get("student_outstanding_interest_amount") is not None else None,
                "next_payment_due_date": str(r["student_next_payment_due_date"]) if r.get("student_next_payment_due_date") else None,
                "minimum_payment_amount": float(r["student_minimum_payment_amount"]) if r.get("student_minimum_payment_amount") is not None else None,
                "repayment_plan_type": r.get("student_repayment_plan_type"),
                "repayment_plan_description": None,
                "pslf_estimated_eligibility_date": str(r["student_pslf_estimated_eligibility_date"]) if r.get("student_pslf_estimated_eligibility_date") else None,
                "pslf_payments_made": r.get("student_pslf_payments_made"),
                "pslf_payments_remaining": r.get("student_pslf_payments_remaining"),
                "loan_name": r.get("student_loan_name"),
                "loan_status_type": r.get("student_loan_status_type"),
                "sequence_number": r.get("student_sequence_number"),
                "expected_payoff_date": str(r["student_expected_payoff_date"]) if r.get("student_expected_payoff_date") else None,
                "origination_principal": float(r["student_origination_principal_amount"]) if r.get("student_origination_principal_amount") is not None else None,
                "guarantor": r.get("student_guarantor"),
                "is_overdue": r.get("student_is_overdue"),
                "last_payment_amount": float(r["student_last_payment_amount"]) if r.get("student_last_payment_amount") is not None else None,
                "last_payment_date": str(r["student_last_payment_date"]) if r.get("student_last_payment_date") else None,
                "last_statement_balance": float(r["student_last_statement_balance"]) if r.get("student_last_statement_balance") is not None else None,
                "servicer_address": r.get("student_servicer_address"),
                "disbursement_dates": disbursement_dates,
                "payment_reference_number": r.get("student_payment_reference_number"),
            })

    for account in liability_accounts:
        debt_amount = positive_debt_amount(account.balance_current)
        if debt_amount is not None:
            total_liabilities += debt_amount

        if account.provider_account_id in seen_liability_account_ids:
            continue

        subtype = (account.subtype or "").lower()
        base_entry = {
            "account_id": account.provider_account_id,
            "internal_account_id": str(account.id),
            "account_type": account.account_type,
            "subtype": account.subtype,
            "name": _account_display_name(account),
            "mask": account.mask,
            "debt_amount": debt_amount,
            "current_balance": debt_amount,
            "balance": debt_amount,
            "balance_current": debt_amount,
            "credit_limit": float(account.balance_limit) if account.balance_limit is not None else None,
            "limit": float(account.balance_limit) if account.balance_limit is not None else None,
            "balance_limit": float(account.balance_limit) if account.balance_limit is not None else None,
            "available_credit": float(account.balance_available) if account.balance_available is not None else None,
            "balance_available": float(account.balance_available) if account.balance_available is not None else None,
            "currency": account.balance_currency or "USD",
            "sync_status": "synced" if account.last_synced_at else "not_synced",
            "error_message": account.error_message,
        }

        if (account.account_type or "").lower() == "credit" or subtype == "credit card":
            credit.append({
                **base_entry,
                "aprs": [],
                "is_overdue": None,
                "last_payment_amount": None,
                "last_payment_date": None,
                "last_statement_balance": None,
                "last_statement_issue_date": None,
                "minimum_payment_amount": None,
                "next_payment_due_date": None,
            })
        elif subtype == "mortgage":
            mortgage.append({
                **base_entry,
                "interest_rate_percentage": None,
                "interest_rate_type": None,
                "maturity_date": None,
                "origination_date": None,
                "origination_principal": None,
                "outstanding_principal": debt_amount,
                "next_monthly_payment": None,
                "next_payment_due_date": None,
                "escrow_balance": None,
                "has_pmi": None,
                "last_payment_amount": None,
                "last_payment_date": None,
                "ytd_interest_paid": None,
                "ytd_principal_paid": None,
                "property_address": None,
            })
        elif subtype == "student":
            student.append({
                **base_entry,
                "interest_rate_percentage": None,
                "outstanding_interest_amount": None,
                "next_payment_due_date": None,
                "minimum_payment_amount": None,
                "repayment_plan_type": None,
                "repayment_plan_description": None,
                "pslf_estimated_eligibility_date": None,
                "pslf_payments_made": None,
                "pslf_payments_remaining": None,
                "loan_name": account.name,
                "loan_status_type": None,
                "sequence_number": None,
                "expected_payoff_date": None,
                "origination_principal": None,
                "guarantor": None,
                "is_overdue": None,
                "last_payment_amount": None,
                "last_payment_date": None,
                "last_statement_balance": None,
                "servicer_address": None,
                "disbursement_dates": None,
                "payment_reference_number": None,
            })
        else:
            loans.append(base_entry)

    total_liabilities = 0.0
    total_seen_account_ids = set()
    for entry in credit + mortgage + student + loans:
        account_id = entry.get("account_id")
        if account_id in total_seen_account_ids:
            continue
        debt_amount = entry.get("debt_amount")
        if debt_amount is None:
            continue
        total_liabilities += float(debt_amount)
        total_seen_account_ids.add(account_id)

    return {
        "credit": credit,
        "credit_cards": credit,
        "mortgage": mortgage,
        "student": student,
        "loans": loans,
        "total_liabilities": total_liabilities,
        "liabilities_total": total_liabilities,
    }


@router.get("/liabilities")
async def get_liabilities(
    current_user: dict = Depends(get_authenticated_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Get liabilities from the local DB (DB-first read).

    Returns cached liability data. Use POST /liabilities/sync to
    refresh from Plaid.

    Returns empty lists if no data has been synced yet.
    """
    user_id = current_user["user_id"]

    user = await get_user_by_supabase_id(db, user_id)

    data = await _read_liabilities_from_db(db, user.id)

    return {
        "success": True,
        "credit": data["credit"],
        "credit_cards": data["credit_cards"],
        "mortgage": data["mortgage"],
        "student": data["student"],
        "loans": data["loans"],
        "total_liabilities": data["total_liabilities"],
        "liabilities_total": data["liabilities_total"],
        "summary": {
            "credit_count": len(data["credit"]),
            "mortgage_count": len(data["mortgage"]),
            "student_count": len(data["student"]),
            "loan_count": len(data["loans"]),
            "total_liabilities": data["total_liabilities"],
        },
        "source": "db",
    }


@router.post("/liabilities/sync")
async def sync_liabilities(
    item_id: str = None,
    current_user: dict = Depends(get_authenticated_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Sync liabilities from Plaid into the local DB, then return fresh DB read.

    Flow:
    1. Call Plaid /liabilities/get
    2. Upsert results into liabilities table
    3. Return the same shape as GET /liabilities but with source: "sync"

    Query params:
        item_id: Optional. Specify which bank if multiple connected.
    """
    user_id = current_user["user_id"]

    user = await get_user_by_supabase_id(db, user_id)

    if not should_persist_user_data(user):
        return {"success": True, "persisted": False, "credit": [], "credit_cards": [], "mortgage": [], "student": [], "loans": [], "total_liabilities": 0, "liabilities_total": 0, "summary": {"credit_count": 0, "mortgage_count": 0, "student_count": 0, "loan_count": 0, "total_liabilities": 0}}

    if item_id is None:
        step_result = await sync_plaid_step_for_user(
            db=db,
            user=user,
            sync_name="liabilities",
            sync_fn=sync_plaid_liabilities_for_item,
        )
        if step_result["item_count"] == 0:
            raise HTTPException(status_code=404, detail="No Plaid account connected. Please connect a bank account first.")
        data = await _read_liabilities_from_db(db, user.id)
        return {
            "success": len(step_result["errors"]) == 0,
            "credit": data["credit"],
            "credit_cards": data["credit_cards"],
            "mortgage": data["mortgage"],
            "student": data["student"],
            "loans": data["loans"],
            "total_liabilities": data["total_liabilities"],
            "liabilities_total": data["liabilities_total"],
            "summary": {
                "credit_count": len(data["credit"]),
                "mortgage_count": len(data["mortgage"]),
                "student_count": len(data["student"]),
                "loan_count": len(data["loans"]),
                "total_liabilities": data["total_liabilities"],
            },
            "source": "sync",
            "items": step_result["items"],
            "errors": step_result["errors"],
            "persisted": len(step_result["errors"]) == 0,
        }

    access_token, resolved_item_id = await get_plaid_token_for_user(
        user.id, db, item_id
    )
    adapter = PlaidAdapter()

    try:
        sync_result = await sync_plaid_liabilities_for_item(
            db=db,
            user=user,
            item_id=resolved_item_id,
            access_token=access_token,
            adapter=adapter,
        )
        persisted = sync_result["persisted"]

        # Read back from DB so response is consistent with GET
        data = await _read_liabilities_from_db(db, user.id)

        return {
            "success": True,
            "credit": data["credit"],
            "credit_cards": data["credit_cards"],
            "mortgage": data["mortgage"],
            "student": data["student"],
            "loans": data["loans"],
            "total_liabilities": data["total_liabilities"],
            "liabilities_total": data["liabilities_total"],
            "summary": {
                "credit_count": len(data["credit"]),
                "mortgage_count": len(data["mortgage"]),
                "student_count": len(data["student"]),
                "loan_count": len(data["loans"]),
                "total_liabilities": data["total_liabilities"],
            },
            "source": "sync",
            "persisted": persisted,
        }

    except Exception as e:
        await db.rollback()
        logger.error(
            "Liabilities sync failed",
            endpoint="liabilities/get",
            user_id=user_id,
            item_id=resolved_item_id,
            **plaid_error_context(e),
        )
        raise HTTPException(status_code=502, detail=f"Liabilities sync failed: {str(e)}")


@router.post("/refresh", response_model=PlaidRefreshResponse)
async def refresh_plaid_data(
    current_user: dict = Depends(get_authenticated_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Refresh all Plaid data for every connected item.

    This is the preferred refresh path for the UI and for webhook-triggered
    maintenance because it iterates all ProviderToken Plaid items and keeps
    going when one item fails.
    """
    user_id = current_user["user_id"]

    user = await get_user_by_supabase_id(db, user_id)

    if not should_persist_user_data(user):
        return _plaid_response(
            status="skipped",
            message="Plaid refresh skipped because storage consent is missing.",
            success=True,
            items=[],
            errors=[],
            counts={"items": 0, "errors": 0},
            persisted=False,
            steps=[],
            item_count=0,
        )

    refresh_result = await sync_plaid_refresh_for_user(db=db, user=user)
    if refresh_result["item_count"] == 0:
        raise HTTPException(status_code=404, detail="No Plaid account connected. Please connect a bank account first.")
    has_successful_items = any(item.get("success") for item in refresh_result["items"])
    status_value = "failed" if refresh_result["errors"] and not has_successful_items else "synced"
    return _plaid_response(
        status=status_value,
        message=(
            "Plaid refresh completed."
            if status_value == "synced"
            else "Plaid refresh completed with errors."
        ),
        success=refresh_result["success"] or has_successful_items,
        items=refresh_result["items"],
        errors=refresh_result["errors"],
        counts={
            "items": refresh_result["item_count"],
            "errors": len(refresh_result["errors"]),
        },
        persisted=True,
        item_count=refresh_result["item_count"],
        steps=refresh_result["steps"],
        # Compatibility field retained for older frontend consumers that still
        # expect the previous refresh payload shape.
        initial_sync_results=refresh_result.get("items", []),
    )


@router.get("/sync-status", response_model=PlaidSyncStatusResponse)
async def get_plaid_sync_status(
    current_user: dict = Depends(get_authenticated_user),
    db: AsyncSession = Depends(get_db),
):
    """Return whether Plaid has signaled transaction updates for any item."""
    user_id = current_user["user_id"]

    user = await get_user_by_supabase_id(db, user_id)

    if not should_persist_user_data(user):
        return _plaid_response(
            status="no_updates",
            message="No transaction updates available.",
            success=True,
            items=[],
            errors=[],
            counts={"items": 0, "items_with_updates": 0},
            hasTransactionUpdates=False,
        )

    sync_status = await get_plaid_transaction_sync_status_for_user(db=db, user_id=user.id)
    has_updates = bool(sync_status.get("hasTransactionUpdates"))
    return _plaid_response(
        status="updates_available" if has_updates else "no_updates",
        message=(
            "Transaction updates are available."
            if has_updates
            else "No transaction updates available."
        ),
        success=True,
        items=sync_status.get("items", []),
        errors=[],
        counts={
            "items": len(sync_status.get("items", [])),
            "items_with_updates": int(has_updates),
        },
        hasTransactionUpdates=has_updates,
    )


@router.post("/transactions/sync-updates", response_model=PlaidTransactionsSyncUpdatesResponse)
async def sync_plaid_transaction_updates(
    current_user: dict = Depends(get_authenticated_user),
    db: AsyncSession = Depends(get_db),
):
    """Sync transactions only for Items that webhook-marked as updated."""
    user_id = current_user["user_id"]

    user = await get_user_by_supabase_id(db, user_id)

    if not should_persist_user_data(user):
        return _plaid_response(
            status="no_updates",
            message="No transaction updates available.",
            success=True,
            items=[],
            errors=[],
            counts={"items": 0, "requested": 0, "errors": 0},
            requested=False,
            item_count=0,
            hasTransactionUpdates=False,
            skipped_items=[],
        )

    token_rows = await get_plaid_token_rows_for_user(db, user.id)
    items = []
    errors = []
    skipped_items = []
    requested_count = 0

    for token_row in token_rows:
        if not token_row.item_id:
            continue
        if not getattr(token_row, "transactions_update_available", False):
            skipped_items.append({
                "item_id": token_row.item_id,
                "institution_id": token_row.institution_id,
                "transactions_added": 0,
                "transactions_modified": 0,
                "transactions_removed": 0,
                "cursor_saved": False,
                "webhook_expected": True,
                "refresh_requested": False,
                "transactions": {
                    "added": 0,
                    "modified": 0,
                    "removed": 0,
                    "cursor_saved": False,
                    "skipped_reason": "no_updates",
                },
            })
            continue

        item_id = token_row.item_id
        item_breakdown = {
            "item_id": item_id,
            "institution_id": token_row.institution_id,
            "transactions_added": 0,
            "transactions_modified": 0,
            "transactions_removed": 0,
            "cursor_saved": False,
            "webhook_expected": True,
            "refresh_requested": False,
            "transactions": {
                "added": 0,
                "modified": 0,
                "removed": 0,
                "cursor_saved": False,
                "skipped_reason": None,
            },
        }

        if not plaid_item_supports_transactions(getattr(token_row, "available_products", None), getattr(token_row, "billed_products", None)):
            item_breakdown["transactions"]["skipped_reason"] = "investment_only"
            item_breakdown["webhook_expected"] = False
            skipped_items.append(item_breakdown)
            continue

        token_data = parse_token_data(token_row.token_data)
        access_token = token_data.get("access_token")
        if not access_token:
            item_breakdown["transactions"]["skipped_reason"] = "missing_access_token"
            errors.append({
                "item_id": item_id,
                "sync_step": "transactions/sync-updates",
                "error": "missing_access_token",
            })
            items.append(item_breakdown)
            continue

        try:
            sync_result = await sync_plaid_transactions_for_item(
                db=db,
                user=user,
                item_id=item_id,
                access_token=access_token,
                adapter=PlaidAdapter(),
            )
            requested_count += 1
            tx_summary = sync_result.get("summary", {})
            item_breakdown["transactions_added"] = tx_summary.get("added", 0)
            item_breakdown["transactions_modified"] = tx_summary.get("modified", 0)
            item_breakdown["transactions_removed"] = tx_summary.get("removed", 0)
            item_breakdown["cursor_saved"] = bool(sync_result.get("next_cursor"))
            item_breakdown["transactions"] = {
                "added": tx_summary.get("added", 0),
                "modified": tx_summary.get("modified", 0),
                "removed": tx_summary.get("removed", 0),
                "cursor_saved": bool(sync_result.get("next_cursor")),
                "skipped_reason": None,
            }
        except Exception as exc:
            errors.append({
                "item_id": item_id,
                "sync_step": "transactions/sync-updates",
                "error": str(exc),
            })
            item_breakdown["transactions"]["skipped_reason"] = str(exc)

        items.append(item_breakdown)

    has_updates = any(getattr(row, "transactions_update_available", False) for row in token_rows)
    has_already_running = any(
        err.get("error_code") == "already_running" or err.get("error") == "already_running"
        for err in errors
    )
    if has_already_running:
        status_value = "already_running"
    elif errors and requested_count == 0:
        status_value = "failed"
    elif not has_updates:
        status_value = "no_updates"
    else:
        status_value = "synced"
    return _plaid_response(
        status=status_value,
        message=(
            "Transaction sync already running."
            if status_value == "already_running"
            else "Transaction updates synced."
            if requested_count > 0 and not errors
            else "No transaction updates available."
            if not has_updates
            else "Transaction sync completed with errors."
        ),
        success=len(errors) == 0 and status_value != "already_running",
        items=items,
        errors=errors,
        counts={
            "items": len(items),
            "requested": requested_count,
            "skipped": len(skipped_items),
            "errors": len(errors),
        },
        requested=requested_count > 0,
        item_count=len(items),
        hasTransactionUpdates=has_updates,
        # Compatibility field retained until all callers read the normalized
        # items[]/errors[] envelope and stop looking for skipped_items directly.
        skipped_items=skipped_items,
    )


@router.get("/identity")
async def get_identity(
    item_id: str = None,
    current_user: dict = Depends(get_authenticated_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Get account holder identity information from connected bank.

    Returns identity data as reported by the bank:
    - Legal name(s) on the account
    - Physical addresses with primary flag
    - Email addresses with primary flag
    - Phone numbers with type (home/work/mobile)

    Useful for:
    - KYC-lite verification
    - Pre-filling user profile fields
    - Confirming account ownership

    Query params:
        item_id: Optional. Specify which bank if multiple connected.
    """
    user_id = current_user["user_id"]

    user = await get_user_by_supabase_id(db, user_id)

    access_token, resolved_item_id = await get_plaid_token_for_user(
        user.id, db, item_id
    )
    adapter = PlaidAdapter()

    try:
        accounts = await adapter.get_identity(access_token)

        # ── Persist identity to accounts rows (non-fatal) ─────────────────
        persisted = None
        try:
            acc_stmt = select(Account).where(
                Account.user_id == user.id,
                Account.is_active == True,
            )
            acc_result = await db.execute(acc_stmt)
            acc_rows = acc_result.scalars().all()
            account_id_map = {acc.provider_account_id: acc.id for acc in acc_rows}

            persisted = await plaid_persist.upsert_identity(
                db=db,
                user_id=user.id,
                accounts=accounts,
                account_id_map=account_id_map,
            )
            await db.commit()
        except Exception as persist_exc:
            await db.rollback()
            logger.warning(
                "upsert_identity failed — returning live data without persisting",
                error=str(persist_exc),
                item_id=resolved_item_id,
                user_id=user_id,
            )
        # ─────────────────────────────────────────────────────────────────

        response = {
            "success": True,
            "item_id": resolved_item_id,
            "accounts": accounts,
            "account_count": len(accounts),
        }
        if persisted is not None:
            response["persisted"] = persisted
        return response

    except Exception as e:
        logger.error("Failed to get identity", error=str(e), user_id=user_id)
        raise HTTPException(status_code=502, detail=f"Failed to fetch identity: {str(e)}")


@router.get("/item/status")
async def get_item_status(
    item_id: str = None,
    current_user: dict = Depends(get_authenticated_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Get full status of a connected Plaid Item (bank connection).

    Returns item health, error state, available products,
    consent expiration, and webhook config.

    Use this to detect if a bank needs re-authentication
    (error.error_code == 'ITEM_LOGIN_REQUIRED').

    Query params:
        item_id: Optional. Specify which bank if multiple connected.
    """
    user_id = current_user["user_id"]

    user = await get_user_by_supabase_id(db, user_id)

    access_token, resolved_item_id = await get_plaid_token_for_user(
        user.id, db, item_id
    )
    adapter = PlaidAdapter()

    try:
        item_status = await adapter.get_item_status(access_token)

        # ── Persist item-status fields to provider_tokens (non-fatal) ─────
        persisted = False
        try:
            persisted = await plaid_persist.upsert_item_status(
                db=db,
                item_id=resolved_item_id,
                item_status=item_status,
            )
            await db.commit()
        except Exception as persist_exc:
            await db.rollback()
            logger.warning(
                "upsert_item_status failed — returning live data without persisting",
                error=str(persist_exc),
                item_id=resolved_item_id,
                user_id=user_id,
            )
        # ──────────────────────────────────────────────────────────────────

        # Existing behaviour: write error_message onto accounts rows on failure
        if item_status.get("error"):
            error_msg = item_status["error"].get("error_message", "Re-authentication required")
            stmt = select(Account).where(
                Account.user_id == user.id,
                Account.provider == "plaid",
                Account.item_id == resolved_item_id,
            )
            result = await db.execute(stmt)
            accounts = result.scalars().all()
            for account in accounts:
                account.error_message = error_msg
            await db.commit()

        return {
            "success": True,
            "item": item_status,
            "persisted": persisted,
        }
    except Exception as e:
        logger.error("Failed to get Plaid item status", error=str(e), user_id=user_id)
        raise HTTPException(status_code=502, detail=f"Failed to get item status: {str(e)}")



async def _disconnect_plaid_item(
    *,
    item_id: str,
    current_user: dict,
    db: AsyncSession,
):
    """Soft-disconnect a Plaid Item while keeping financial history intact."""
    user_id = current_user["user_id"]

    user = await get_user_by_supabase_id(db, user_id)

    token_row = await _get_plaid_token_row_for_user(user.id, db, item_id)
    if not token_row:
        raise HTTPException(status_code=404, detail="Plaid item not found for current user")

    token_data = parse_token_data(token_row.token_data)
    access_token = token_data.get("access_token")
    resolved_item_id = token_row.item_id or token_data.get("item_id") or item_id
    adapter = PlaidAdapter()

    remote_disconnect_error = None
    if access_token:
        try:
            await adapter.remove_item(access_token)
        except Exception as exc:
            remote_disconnect_error = str(exc)
            logger.warning(
                "Plaid item remove failed; continuing with local soft delete",
                user_id=str(user.id),
                item_id=resolved_item_id,
                error=str(exc),
            )

    stmt = select(Account).where(
        Account.user_id == user.id,
        Account.provider == "plaid",
        Account.item_id == resolved_item_id,
    )
    result = await db.execute(stmt)
    accounts = result.scalars().all()

    deactivated_count = 0
    for account in accounts:
        account.is_active = False
        account.error_message = "Disconnected"
        deactivated_count += 1

    token_row.is_active = False

    await db.commit()

    logger.info(
        "Plaid item disconnected",
        user_id=str(user.id),
        item_id=resolved_item_id,
        accounts_deactivated=deactivated_count,
        plaid_remote_removed=remote_disconnect_error is None,
    )

    response = {
        "success": True,
        "item_id": resolved_item_id,
        "accounts_deactivated": deactivated_count,
        "provider_token_deactivated": True,
        "remote_disconnect_error": remote_disconnect_error,
    }
    return response


@router.delete("/items/{item_id}")
async def remove_item_by_id(
    item_id: str,
    current_user: dict = Depends(get_authenticated_user),
    db: AsyncSession = Depends(get_db),
):
    return await _disconnect_plaid_item(
        item_id=item_id,
        current_user=current_user,
        db=db,
    )

