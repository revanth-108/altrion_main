"""
Platform connection endpoints
"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from uuid import UUID
from app.core.database import get_db
from app.core.auth import get_current_user as get_authenticated_user
from app.core.supabase_client import store_encrypted_token, get_encrypted_token, delete_encrypted_token
from app.schemas.platform import ConnectionRequest, ConnectionResponse, PlatformResponse
from app.models.account import Account
from app.models.user import User
from app.services.providers.coinbase import CoinbaseAdapter
from app.services.providers.plaid import PlaidAdapter
from app.services.providers.wallet import WalletAdapter
from app.services.normalization import NormalizationService
from app.core.redis_client import store_raw_data
from app.core.config import settings
from sqlalchemy import select
import structlog

logger = structlog.get_logger()

router = APIRouter()


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
    stmt = select(User).where(User.supabase_user_id == user_id)
    result = await db.execute(stmt)
    user = result.scalar_one_or_none()
    
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Get appropriate adapter
    adapter = None
    if platform_id == "coinbase":
        adapter = CoinbaseAdapter(settings.COINBASE_CLIENT_ID, settings.COINBASE_CLIENT_SECRET)
    elif platform_id == "plaid":
        adapter = PlaidAdapter()
    elif platform_id == "wallet":
        adapter = WalletAdapter()
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
        
        # Store encrypted token
        await store_encrypted_token(str(user.id), platform_id, token_data)
        
        # Fetch accounts from provider
        accounts = await adapter.fetch_accounts(token_data)
        
        # Create account records
        created_accounts = []
        for account_data in accounts:
            # Check if account already exists
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
            # Sync first account as example
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
    stmt = select(User).where(User.supabase_user_id == user_id)
    result = await db.execute(stmt)
    user = result.scalar_one_or_none()
    
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Get accounts
    stmt = select(Account).where(Account.user_id == user.id, Account.is_active == True)
    result = await db.execute(stmt)
    accounts = result.scalars().all()
    
    # Group by provider
    platforms = {}
    for account in accounts:
        if account.provider not in platforms:
            platforms[account.provider] = {
                "platform": PLATFORMS.get(account.provider, {"id": account.provider, "name": account.provider}),
                "accounts": [],
            }
        platforms[account.provider]["accounts"].append({
            "id": str(account.id),
            "name": account.name,
            "last_synced_at": account.last_synced_at.isoformat() if account.last_synced_at else None,
            "error_message": account.error_message,
        })
    
    return list(platforms.values())


@router.delete("/{platform_id}/connection")
async def disconnect_platform(
    platform_id: str,
    current_user: dict = Depends(get_authenticated_user),
    db: AsyncSession = Depends(get_db),
):
    """Disconnect from a platform"""
    user_id = current_user["user_id"]
    
    # Get user record
    stmt = select(User).where(User.supabase_user_id == user_id)
    result = await db.execute(stmt)
    user = result.scalar_one_or_none()
    
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Delete encrypted token
    await delete_encrypted_token(str(user.id), platform_id)
    
    # Deactivate accounts
    stmt = select(Account).where(
        Account.user_id == user.id,
        Account.provider == platform_id,
    )
    result = await db.execute(stmt)
    accounts = result.scalars().all()
    
    for account in accounts:
        account.is_active = False
    
    await db.commit()
    
    return {
        "success": True,
        "message": "Platform disconnected",
    }
