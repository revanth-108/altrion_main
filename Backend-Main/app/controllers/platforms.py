"""
Platform connection endpoints
"""
import inspect
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from uuid import UUID
from app.core.database import get_db
from app.core.auth import get_current_user as get_authenticated_user
from app.core.supabase_client import store_encrypted_token, delete_encrypted_token
from app.schemas.platform import ConnectionRequest, ConnectionResponse, PlatformResponse
from app.models.account import Account
from app.services.providers.coinbase import CoinbaseAdapter
from app.services.providers.plaid import PlaidAdapter
from app.services.providers.wallet import WalletAdapter
from app.services.normalization import NormalizationService
from app.core.redis_client import store_raw_data
from app.core.config import settings
from sqlalchemy import desc, select
from app.core.logging import get_logger
from app.services.plaid_helpers import (
    get_plaid_token_row_for_user,
    get_user_by_supabase_id,
    PLAID_ITEM_SCOPE_NOT_FOUND_DETAIL,
)
from app.services.plaid_sync import (
    account_role_label,
    classify_plaid_account,
    is_liability_account,
    positive_debt_amount,
)
from app.services import plaid_persist
from app.services.data_consent import should_persist_user_data
from app.services.plaid_safe import parse_token_data

logger = get_logger()

router = APIRouter()


def _log_legacy_plaid_connect_usage(user_id: str, **extra) -> None:
    """Emit a structured log whenever the legacy Plaid connect route is used."""
    logger.warning(
        "legacy_plaid_connect_route_used",
        route="/platforms/plaid/connect",
        user_id=user_id,
        timestamp=datetime.utcnow().isoformat(),
        caller=inspect.stack()[1].function,
        **extra,
    )


# Platform definitions
PLATFORMS = {
    "coinbase": {
        "id": "coinbase",
        "name": "Coinbase",
        "icon": "/coinbase.svg",
        "category": "crypto",
    },
    "plaid": {
        "id": "plaid",
        "name": "Plaid",
        "icon": "/plaid.svg",
        "category": "bank",
    },
    "wallet": {
        "id": "wallet",
        "name": "Wallet",
        "icon": "/wallet.svg",
        "category": "crypto",
    },
}


def _should_replace_display_account(candidate: Account, existing: Account) -> bool:
    """Prefer item-scoped Plaid rows over legacy null-item rows for display."""
    candidate_item_scoped = candidate.item_id is not None
    existing_item_scoped = existing.item_id is not None

    if candidate_item_scoped != existing_item_scoped:
        return candidate_item_scoped

    candidate_rank = candidate.updated_at or candidate.created_at
    existing_rank = existing.updated_at or existing.created_at
    return candidate_rank > existing_rank


def _filter_accounts_for_display(accounts: list[Account]) -> list[Account]:
    """Keep only the newest active Plaid item per institution for display."""
    chosen_item_by_institution: dict[str, str | None] = {}
    for account in accounts:
        if account.provider != "plaid" or not account.institution_id:
            continue
        chosen_item_id = chosen_item_by_institution.get(account.institution_id)
        if chosen_item_id is None and account.institution_id not in chosen_item_by_institution:
            chosen_item_by_institution[account.institution_id] = account.item_id
            continue
        if chosen_item_id is None and account.item_id is not None:
            chosen_item_by_institution[account.institution_id] = account.item_id

    filtered_accounts: list[Account] = []
    for account in accounts:
        if account.provider == "plaid" and account.institution_id:
            chosen_item_id = chosen_item_by_institution.get(account.institution_id)
            if chosen_item_id is not None and account.item_id != chosen_item_id:
                continue
        filtered_accounts.append(account)

    return filtered_accounts


@router.get("", response_model=list[PlatformResponse])
async def get_platforms():
    """Get all available platforms"""
    return [PlatformResponse(**platform) for platform in PLATFORMS.values()]


@router.post("/{platform_id}/connect", response_model=ConnectionResponse)
async def connect_platform(
    platform_id: str,
    request: ConnectionRequest,
    current_user: dict = Depends(get_authenticated_user),
    db: AsyncSession = Depends(get_db),
):
    """Connect to a platform"""
    user_id = current_user["user_id"]
    
    # Get user record
    user = await get_user_by_supabase_id(db, user_id)
    
    # Get appropriate adapter
    adapter = None
    if platform_id == "coinbase":
        adapter = CoinbaseAdapter(settings.COINBASE_CLIENT_ID, settings.COINBASE_CLIENT_SECRET)
    elif platform_id == "wallet":
        adapter = WalletAdapter()
    elif platform_id == "plaid":
        # Legacy Plaid connect route removed. The dedicated Plaid Link flow
        # must use /plaid/link-token and /plaid/exchange-token.
        _log_legacy_plaid_connect_usage(user_id, platform_id=platform_id)
        raise HTTPException(
            status_code=status.HTTP_410_GONE,
            detail="Legacy Plaid connect route removed. Use /plaid/link-token and /plaid/exchange-token.",
        )
    else:
        raise HTTPException(status_code=404, detail="Platform not found")
    
    try:
        # Authenticate with provider
        credentials = request.credentials or {}
        if request.oauth_code:
            credentials["code"] = request.oauth_code
        if request.public_token:
            credentials["public_token"] = request.public_token
        if request.api_key:
            credentials["api_key"] = request.api_key
        if request.api_secret:
            credentials["api_secret"] = request.api_secret
        
        token_data = await adapter.authenticate(credentials)
        
        # Store encrypted token (always — needed for live reads even without storage consent)
        await store_encrypted_token(str(user.id), platform_id, token_data)

        # Gate account persistence on data storage consent (all providers)
        if not should_persist_user_data(user):
            return ConnectionResponse(
                platform_id=platform_id,
                status="success",
                message="Connected successfully without backend data storage (storage consent not given)",
                account_id=None,
            )

        # Fetch accounts from provider
        accounts = await adapter.fetch_accounts(token_data)
        
        # Create account records
        created_accounts = []
        for account_data in accounts:
            # Check if account already exists
            if platform_id == "plaid":
                existing = await plaid_persist.find_existing_plaid_account(
                    db=db,
                    user_id=user.id,
                    item_id=token_data.get("item_id"),
                    provider_account_id=account_data["id"],
                )
            else:
                stmt = select(Account).where(
                    Account.user_id == user.id,
                    Account.provider == platform_id,
                    Account.provider_account_id == account_data["id"],
                )
                result = await db.execute(stmt)
                existing = result.scalar_one_or_none()
            
            if existing:
                existing.is_active = True
                existing.error_message = None
                account = existing
            else:
                account = Account(
                    user_id=user.id,
                    provider=platform_id,
                    provider_account_id=account_data["id"],
                    name=account_data.get("name", f"{platform_id} Account"),
                    account_type=account_data.get("type", "exchange"),
                    is_active=True,
                )
                db.add(account)
            
            created_accounts.append(account)
        
        await db.commit()
        
        # Refresh accounts to get IDs
        for account in created_accounts:
            await db.refresh(account)
        
        # Trigger initial sync
        if created_accounts:
            # Legacy Plaid path only syncs one account. New Plaid flows should
            # not use this route because it does not iterate every Plaid Item.
            account = created_accounts[0]
            await sync_account(account.id, platform_id, token_data, db)
        
        return ConnectionResponse(
            platform_id=platform_id,
            status="success",
            message="Connected successfully",
            account_id=str(created_accounts[0].id) if created_accounts else None,
        )
    except Exception as e:
        logger.error("Platform connection failed", error=str(e), platform_id=platform_id, user_id=user_id)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Failed to connect: {str(e)}",
        )


async def sync_account(account_id: UUID, platform_id: str, token_data: dict, db: AsyncSession):
    """Sync account data"""
    # Get account
    stmt = select(Account).where(Account.id == account_id)
    result = await db.execute(stmt)
    account = result.scalar_one_or_none()
    
    if not account:
        return
    
    # Get adapter
    adapter = None
    if platform_id == "coinbase":
        adapter = CoinbaseAdapter(settings.COINBASE_CLIENT_ID, settings.COINBASE_CLIENT_SECRET)
    elif platform_id == "plaid":
        adapter = PlaidAdapter()
    elif platform_id == "wallet":
        adapter = WalletAdapter()
    
    if not adapter:
        return
    
    try:
        # Fetch holdings
        raw_data = await adapter.fetch_holdings(account.provider_account_id, token_data)
        
        # Store raw data in Redis
        await store_raw_data(f"{account_id}:{platform_id}", raw_data)
        
        # Normalize data
        normalization_service = NormalizationService(db)
        await normalization_service.normalize_provider_data(
            user_id=str(account.user_id),
            account_id=str(account.id),
            provider=platform_id,
            raw_data=raw_data,
            adapter=adapter,
        )
        
        # Update account sync time
        from datetime import datetime
        account.last_synced_at = datetime.utcnow()
        account.error_message = None
        await db.commit()
    except Exception as e:
        logger.error("Account sync failed", error=str(e), account_id=account_id)
        account.error_message = str(e)
        await db.commit()


@router.get("/connected", response_model=list[dict])
async def get_connected_platforms(
    current_user: dict = Depends(get_authenticated_user),
    db: AsyncSession = Depends(get_db),
):
    """Get connected platforms"""
    user_id = current_user["user_id"]
    
    # Get user record
    user = await get_user_by_supabase_id(db, user_id)
    
    # Get accounts
    stmt = select(Account).where(Account.user_id == user.id, Account.is_active == True).order_by(
        desc(Account.updated_at),
        desc(Account.created_at),
    )
    result = await db.execute(stmt)
    accounts = result.scalars().all()
    
    # Group by provider
    platforms = {}
    best_accounts_by_display_key: dict[tuple[str, str], Account] = {}
    for account in _filter_accounts_for_display(accounts):
        display_key = (account.provider, account.provider_account_id)
        existing = best_accounts_by_display_key.get(display_key)
        if existing is None or _should_replace_display_account(account, existing):
            best_accounts_by_display_key[display_key] = account

    for account in best_accounts_by_display_key.values():
        if account.provider not in platforms:
            platforms[account.provider] = {
                "platform": PLATFORMS.get(account.provider, {"id": account.provider, "name": account.provider}),
                "accounts": [],
            }
        platforms[account.provider]["accounts"].append({
            "id": str(account.id),
            "provider": account.provider,
            "provider_account_id": account.provider_account_id,
            "name": account.name,
            "account_type": account.account_type,
            "subtype": account.subtype,
            "mask": account.mask,
            "institution_name": account.institution_name,
            "item_id": account.item_id,
            "balance_available": float(account.balance_available) if account.balance_available is not None else None,
            "balance_current": float(account.balance_current) if account.balance_current is not None else None,
            "balance_limit": float(account.balance_limit) if account.balance_limit is not None else None,
            "balance_currency": account.balance_currency,
            "classification": classify_plaid_account(account.account_type, account.subtype),
            "role_label": account_role_label(account.account_type, account.subtype),
            "debt_amount": positive_debt_amount(account.balance_current) if is_liability_account(account.account_type, account.subtype) else None,
            "last_synced_at": account.last_synced_at.isoformat() if account.last_synced_at else None,
            "error_message": account.error_message,
        })
    
    return list(platforms.values())


@router.delete("/{platform_id}/connection")
async def disconnect_platform(
    platform_id: str,
    item_id: str | None = None,
    current_user: dict = Depends(get_authenticated_user),
    db: AsyncSession = Depends(get_db),
):
    """Disconnect from a platform"""
    user_id = current_user["user_id"]
    
    # Get user record
    user = await get_user_by_supabase_id(db, user_id)
    
    if platform_id == "plaid":
        token_row = await get_plaid_token_row_for_user(db, user.id, item_id=item_id)
        if not token_row:
            raise HTTPException(status_code=404, detail=PLAID_ITEM_SCOPE_NOT_FOUND_DETAIL)
        token_row.is_active = False
        token_data = parse_token_data(token_row.token_data)
        resolved_item_id = token_row.item_id or token_data.get("item_id")
        if resolved_item_id is None:
            raise HTTPException(status_code=404, detail=PLAID_ITEM_SCOPE_NOT_FOUND_DETAIL)
    else:
        # Delete encrypted token
        await delete_encrypted_token(str(user.id), platform_id, item_id)
        resolved_item_id = item_id

    # Deactivate accounts
    stmt = select(Account).where(
        Account.user_id == user.id,
        Account.provider == platform_id,
    )
    if resolved_item_id is not None:
        stmt = stmt.where(Account.item_id == resolved_item_id)
    result = await db.execute(stmt)
    accounts = result.scalars().all()
    
    for account in accounts:
        account.is_active = False
    
    await db.commit()

    return {
        "success": True,
        "message": "Platform disconnected",
    }
