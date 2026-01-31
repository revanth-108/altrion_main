"""
Portfolio endpoints
"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from datetime import datetime
from app.core.database import get_db
from app.core.auth import get_current_user as get_authenticated_user
from app.core.supabase_client import get_encrypted_token
from app.core.rate_limit import check_rate_limit
from app.schemas.portfolio import PortfolioResponse, RefreshPortfolioResponse
from app.models.user import User
from app.models.account import Account
from app.services.aggregation import AggregationService
from app.services.normalization import NormalizationService
from app.services.providers.coinbase import CoinbaseAdapter
from app.services.providers.plaid import PlaidAdapter
from app.services.providers.wallet import WalletAdapter
from app.core.redis_client import store_raw_data
from app.core.config import settings
import structlog

logger = structlog.get_logger()

router = APIRouter()


@router.get("", response_model=PortfolioResponse)
async def get_portfolio(
    current_user: dict = Depends(get_authenticated_user),
    db: AsyncSession = Depends(get_db),
):
    """Get user's portfolio"""
    user_id = current_user["user_id"]
    
    # Get user record
    stmt = select(User).where(User.supabase_user_id == user_id)
    result = await db.execute(stmt)
    user = result.scalar_one_or_none()
    
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Aggregate portfolio
    aggregation_service = AggregationService(db)
    portfolio_data = await aggregation_service.aggregate_portfolio(
        [str(user.id), str(user.supabase_user_id)]
    )
    
    # Collect warnings from accounts
    warnings = []
    account_stmt = select(Account).where(Account.user_id == user.id, Account.is_active == True)
    account_result = await db.execute(account_stmt)
    accounts = account_result.scalars().all()
    
    for account in accounts:
        if account.error_message:
            warnings.append({
                "type": "account_error",
                "account_id": str(account.id),
                "account_name": account.name,
                "provider": account.provider,
                "message": account.error_message,
            })
    
    return PortfolioResponse(
        schema_version="v1",
        total_value=portfolio_data["total_value"],
        change_24h=None,  # TODO: Calculate if needed
        assets=portfolio_data["assets"],
        categories=portfolio_data["categories"],
        warnings=warnings,
    )


@router.post("/refresh", response_model=RefreshPortfolioResponse)
async def refresh_portfolio(
    current_user: dict = Depends(get_authenticated_user),
    db: AsyncSession = Depends(get_db),
):
    """Refresh portfolio data from all connected providers"""
    user_id = current_user["user_id"]
    
    # Check rate limit
    allowed = await check_rate_limit(
        user_id,
        "refresh_portfolio",
        settings.REFRESH_RATE_LIMIT_MINUTES,
    )
    if not allowed:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"Rate limit exceeded. Please wait {settings.REFRESH_RATE_LIMIT_MINUTES} minutes between refreshes.",
        )
    
    # Get user record
    stmt = select(User).where(User.supabase_user_id == user_id)
    result = await db.execute(stmt)
    user = result.scalar_one_or_none()
    
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Get all active accounts
    stmt = select(Account).where(Account.user_id == user.id, Account.is_active == True)
    result = await db.execute(stmt)
    accounts = result.scalars().all()
    
    warnings = []
    normalization_service = NormalizationService(db)
    
    # Refresh each account
    for account in accounts:
        try:
            # Get encrypted token
            token_data = await get_encrypted_token(str(user.id), account.provider)
            if not token_data:
                warnings.append({
                    "type": "missing_token",
                    "account_id": str(account.id),
                    "provider": account.provider,
                    "message": "Authentication token not found",
                })
                continue
            
            # Get adapter
            adapter = None
            if account.provider == "coinbase":
                adapter = CoinbaseAdapter(settings.COINBASE_CLIENT_ID, settings.COINBASE_CLIENT_SECRET)
            elif account.provider == "plaid":
                adapter = PlaidAdapter()
            elif account.provider == "wallet":
                adapter = WalletAdapter()
            
            if not adapter:
                warnings.append({
                    "type": "unsupported_provider",
                    "account_id": str(account.id),
                    "provider": account.provider,
                    "message": f"Provider {account.provider} not supported",
                })
                continue
            
            # Fetch holdings
            raw_data = await adapter.fetch_holdings(account.provider_account_id, token_data)
            
            # Store raw data in Redis
            await store_raw_data(f"{account.id}:{account.provider}", raw_data)
            
            # Normalize data
            normalized_holdings, normalization_warnings = await normalization_service.normalize_provider_data(
                user_id=str(user.id),
                account_id=str(account.id),
                provider=account.provider,
                raw_data=raw_data,
                adapter=adapter,
            )
            
            warnings.extend(normalization_warnings)
            
            # Update account sync time
            account.last_synced_at = datetime.utcnow()
            account.error_message = None
            await db.commit()
            
        except Exception as e:
            logger.error("Account refresh failed", error=str(e), account_id=account.id, provider=account.provider)
            warnings.append({
                "type": "refresh_error",
                "account_id": str(account.id),
                "provider": account.provider,
                "message": str(e),
            })
            account.error_message = str(e)
            await db.commit()
    
    return RefreshPortfolioResponse(
        schema_version="v1",
        success=True,
        message="Portfolio refreshed",
        refreshed_at=datetime.utcnow().isoformat(),
        warnings=warnings,
    )
