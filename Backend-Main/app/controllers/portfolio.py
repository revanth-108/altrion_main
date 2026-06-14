"""
Portfolio endpoints
"""
import time
from uuid import UUID
from decimal import Decimal
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import func, select, text
from datetime import datetime, timedelta, timezone
from app.core.database import get_db, AsyncSessionLocal
from app.core.auth import get_current_user as get_authenticated_user
from app.core.supabase_client import get_encrypted_token
from app.core.rate_limit import check_rate_limit
from app.core.logging import get_logger, timing_log
from app.schemas.portfolio import PortfolioResponse, RefreshPortfolioResponse
from app.schemas.allocation_insights import AllocationInsightsResponse, AssetInsightResponse
from app.schemas.health import PortfolioHealthResponse
from app.services.health_score import compute_portfolio_health
from app.services.providers.defi import fetch_defi_positions
from app.services.score_history import save_score_snapshot, get_score_history
from app.schemas.health import HealthHistoryResponse
from app.models.user import User
from app.models.account import Account
from app.models.holding import Holding
from app.models.provider_token import ProviderToken
from app.services.aggregation import AggregationService
from app.services.normalization import NormalizationService
from app.services.providers.coinbase import CoinbaseAdapter
from app.services.providers.plaid import PlaidAdapter
from app.services.providers.wallet import WalletAdapter
from app.core.redis_client import store_raw_data
from app.core.config import settings
from app.services.allocation_insight_service import AllocationInsightService
from app.services.plaid_investments_sync import sync_plaid_investments_for_user
from app.services.plaid_sync import (
    is_liability_account,
    get_plaid_token_rows_for_user,
    mark_plaid_item_failed,
    positive_debt_amount,
    sync_plaid_balances_for_item,
    sync_plaid_liabilities_for_item,
    sync_plaid_recurring_for_item,
    sync_plaid_transactions_for_item,
)
from app.services.plaid_utils import plaid_error_context
from app.services.plaid_safe import parse_token_data, value_type
from app.services.portfolio_valuation_history import PortfolioValuationHistoryService
from app.models.portfolio_valuation_snapshot import PortfolioValuationSnapshot

logger = get_logger()

router = APIRouter()


async def _save_health_snapshot_bg(user_id: UUID) -> None:
    """Background task: compute AFHS and persist a snapshot (own session, non-blocking)."""
    try:
        async with AsyncSessionLocal() as db:
            stmt = select(User).where(User.id == user_id)
            result = await db.execute(stmt)
            user = result.scalar_one_or_none()
            if not user:
                return
            aggregation_service = AggregationService(db)
            portfolio_data = await aggregation_service.aggregate_portfolio([str(user.id), str(user.supabase_user_id)])
            health = await compute_portfolio_health(portfolio_data["assets"], user, db)
            await save_score_snapshot(db, user.id, health)
    except Exception as e:
        logger.warning("background_health_snapshot_failed", error=str(e))


@router.get("", response_model=PortfolioResponse)
async def get_portfolio(
    background_tasks: BackgroundTasks,
    current_user: dict = Depends(get_authenticated_user),
    db: AsyncSession = Depends(get_db),
):
    """Get user's portfolio"""
    portfolio_start = time.time()
    user_id = current_user["user_id"]

    timing_log(endpoint="PORTFOLIO", step="started", duration_ms=0, module="portfolio.py")

    # Step 1: Get user record
    t1 = time.time()
    stmt = select(User).where(User.supabase_user_id == user_id)
    result = await db.execute(stmt)
    user = result.scalar_one_or_none()
    timing_log(endpoint="PORTFOLIO", step="user_lookup", duration_ms=round((time.time() - t1) * 1000), module="portfolio.py", step_number=1, user_email=user.email if user else "N/A", detail=f"User: {user.name if user else 'NOT FOUND'}")

    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    # Step 2: Aggregate portfolio (holdings + accounts + prices)
    t2 = time.time()
    aggregation_service = AggregationService(db)
    portfolio_data = await aggregation_service.aggregate_portfolio(
        [str(user.id), str(user.supabase_user_id)]
    )
    t2_ms = round((time.time() - t2) * 1000)
    timing_log(endpoint="PORTFOLIO", step="aggregation_complete", duration_ms=t2_ms, module="portfolio.py", step_number=2, asset_count=len(portfolio_data['assets']))

    # Log each asset with its value (debug level for selectivity)
    for asset in portfolio_data["assets"]:
        logger.debug("portfolio_asset", symbol=asset.symbol, name=asset.name, quantity=str(asset.quantity), price_usd=str(asset.price_usd), value_usd=str(asset.value_usd), asset_class=asset.asset_class)

    # Log category breakdown
    cats = portfolio_data["categories"]
    logger.debug("portfolio_categories", crypto=str(cats.get('crypto', 0)), equity=str(cats.get('equity', 0)), cash=str(cats.get('cash_equivalent', 0)))

    # Step 3: Collect warnings from accounts
    t3 = time.time()
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
    t3_ms = round((time.time() - t3) * 1000)
    if warnings:
        timing_log(endpoint="PORTFOLIO", step="warnings_check", duration_ms=t3_ms, module="portfolio.py", step_number=3, warning_count=len(warnings))
        for w in warnings:
            logger.warning("portfolio_account_warning", account_name=w['account_name'], provider=w['provider'], message=w['message'])
    else:
        timing_log(endpoint="PORTFOLIO", step="warnings_check", duration_ms=t3_ms, module="portfolio.py", step_number=3, warning_count=0)

    total_ms = round((time.time() - portfolio_start) * 1000)
    timing_log(endpoint="PORTFOLIO", step="complete", duration_ms=total_ms, module="portfolio.py", is_complete=True, user_email=user.email, total_value=str(portfolio_data['total_value']))

    valuation_history = PortfolioValuationHistoryService(db)
    display_change = await valuation_history.compute_display_change(
        user_id=user.id,
        current_total_value=portfolio_data["total_value"],
    )
    await valuation_history.save_snapshot(
        user_id=user.id,
        total_value=portfolio_data["total_value"],
        categories=portfolio_data["categories"],
    )

    background_tasks.add_task(_save_health_snapshot_bg, user.id)
    total_assets = Decimal(str(portfolio_data["total_value"]))
    total_liabilities = Decimal("0")
    for account in accounts:
        if is_liability_account(account.account_type, account.subtype):
            debt_amount = positive_debt_amount(account.balance_current)
            if debt_amount is not None:
                total_liabilities += Decimal(str(debt_amount))
    net_worth = total_assets - total_liabilities

    return PortfolioResponse(
        schema_version="v1",
        total_value=portfolio_data["total_value"],
        portfolio_value=total_assets,
        total_assets=total_assets,
        total_liabilities=total_liabilities,
        liabilities_total=total_liabilities,
        net_worth=net_worth,
        change_type=display_change["change_type"],
        change_value=display_change["change_value"],
        change_pct=display_change["change_pct"],
        change_since_last_value=display_change["change_since_last_value"],
        change_since_last_pct=display_change["change_since_last_pct"],
        change_24h=display_change["change_pct"],
        change_24h_pct=display_change["change_24h_pct"],
        change_24h_value=display_change["change_24h_value"],
        assets=portfolio_data["assets"],
        categories=portfolio_data["categories"],
        warnings=warnings,
    )


@router.get("/health", response_model=PortfolioHealthResponse)
async def get_portfolio_health(
    current_user: dict = Depends(get_authenticated_user),
    db: AsyncSession = Depends(get_db),
):
    """Compute the Altrion Financial Health Score (AFHS) for the user's portfolio."""
    user_id = current_user["user_id"]

    stmt = select(User).where(User.supabase_user_id == user_id)
    result = await db.execute(stmt)
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    aggregation_service = AggregationService(db)
    portfolio_data = await aggregation_service.aggregate_portfolio(
        [str(user.id), str(user.supabase_user_id)]
    )

    assets = [
        {
            "symbol": a.symbol,
            "name": a.name,
            "value_usd": float(a.value_usd),
            "price_usd": float(a.price_usd),
            "change_24h": a.change_24h,
            "asset_class": a.asset_class,
            "sources": [
                {"source": s.source, "account_id": s.account_id}
                for s in a.sources
            ],
        }
        for a in portfolio_data["assets"]
    ]

    user_age = None
    if user.date_of_birth:
        from datetime import date
        today = date.today()
        dob = user.date_of_birth
        user_age = (today - dob).days / 365.25

    annual_income = float(user.annual_income) if user.annual_income is not None else None

    # ── Extract debt and retirement balances from connected Plaid accounts ──────
    # Credit card subtypes carry high-interest debt (APR typically >15%).
    # Loan subtypes (mortgage, student, auto, personal) are total debt but not high-interest.
    # Retirement subtypes (401k, ira, roth, pension) give us the real D3 balance.
    CREDIT_CARD_SUBTYPES = {"credit card", "credit", "paypal"}
    RETIREMENT_SUBTYPES = {"401k", "ira", "roth", "roth 401k", "pension", "retirement", "403b", "457b", "simple ira", "sep ira"}
    LOAN_SUBTYPES = {"mortgage", "student", "auto", "consumer", "personal", "home equity", "line of credit", "loan"}

    total_debt: float = 0.0
    high_interest_debt: float = 0.0
    retirement_balance: float = 0.0

    acct_stmt = select(Account).where(Account.user_id == user.id, Account.is_active == True)
    acct_result = await db.execute(acct_stmt)
    all_accounts = acct_result.scalars().all()

    for acct in all_accounts:
        subtype = (acct.subtype or "").lower()
        balance = float(acct.balance_current or 0)

        if subtype in CREDIT_CARD_SUBTYPES:
            # balance_current for credit = outstanding balance owed
            total_debt += balance
            high_interest_debt += balance
        elif subtype in LOAN_SUBTYPES:
            total_debt += balance
        elif subtype in RETIREMENT_SUBTYPES:
            retirement_balance += balance

    # Fetch DeFi positions if the user has a wallet address (D5)
    defi_positions = None
    if user.wallet_address:
        try:
            defi_positions = await fetch_defi_positions(user.wallet_address)
        except Exception as e:
            logger.warning("D5 DeFi fetch failed — skipping", error=str(e))

    health = compute_portfolio_health(
        assets=assets,
        categories=portfolio_data["categories"],
        total_value=float(portfolio_data["total_value"]),
        user_age=user_age,
        annual_income=annual_income,
        defi_positions=defi_positions,
        total_debt=total_debt,
        high_interest_debt=high_interest_debt,
        retirement_balance=retirement_balance if retirement_balance > 0 else None,
    )

    # Persist score snapshot (non-blocking — failure must not break response)
    try:
        await save_score_snapshot(db, user.id, health)
    except Exception as e:
        logger.warning("Score snapshot failed", error=str(e))

    return PortfolioHealthResponse(**health)


@router.get("/health/history", response_model=HealthHistoryResponse)
async def get_health_history(
    days: int = 90,
    current_user: dict = Depends(get_authenticated_user),
    db: AsyncSession = Depends(get_db),
):
    """Return AFHS score history for the last N days (default 90)."""
    user_id = current_user["user_id"]

    stmt = select(User).where(User.supabase_user_id == user_id)
    result = await db.execute(stmt)
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    days = max(1, min(days, 365))
    data = await get_score_history(db, user.id, days)
    return HealthHistoryResponse(days=days, data=data)


_PERIOD_DELTA: dict[str, timedelta] = {
    "1H": timedelta(hours=1),
    "24H": timedelta(hours=24),
    "7D": timedelta(days=7),
    "1M": timedelta(days=30),
    "1Y": timedelta(days=365),
}


@router.get("/history")
async def get_portfolio_history(
    period: str = Query("24H", pattern="^(1H|24H|7D|1M|1Y)$"),
    current_user: dict = Depends(get_authenticated_user),
    db: AsyncSession = Depends(get_db),
):
    """Return portfolio value snapshots for the requested period."""
    user_id = current_user["user_id"]
    result = await db.execute(select(User).where(User.supabase_user_id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    since = datetime.now(timezone.utc) - _PERIOD_DELTA[period]
    rows = await db.execute(
        select(PortfolioValuationSnapshot)
        .where(
            PortfolioValuationSnapshot.user_id == user.id,
            PortfolioValuationSnapshot.computed_at >= since,
        )
        .order_by(PortfolioValuationSnapshot.computed_at.asc())
    )
    snapshots = rows.scalars().all()

    return {
        "schema_version": "1.0",
        "period": period,
        "data": [
            {"timestamp": s.computed_at.isoformat(), "value": float(s.total_value)}
            for s in snapshots
        ],
    }


@router.get("/allocation-insights", response_model=AllocationInsightsResponse)
async def get_allocation_insights(
    current_user: dict = Depends(get_authenticated_user),
    db: AsyncSession = Depends(get_db),
):
    """Get structured asset allocation insights for the dashboard."""
    user_id = current_user["user_id"]

    stmt = select(User).where(User.supabase_user_id == user_id)
    result = await db.execute(stmt)
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    service = AllocationInsightService(db)
    payload = await service.build_for_user(user.id)
    return AllocationInsightsResponse(**payload)


@router.get("/accounts/{account_id}/allocation-insights", response_model=AllocationInsightsResponse)
async def get_account_allocation_insights(
    account_id: UUID,
    current_user: dict = Depends(get_authenticated_user),
    db: AsyncSession = Depends(get_db),
):
    """Get structured allocation insights scoped to one connected account."""
    user_id = current_user["user_id"]

    stmt = select(User).where(User.supabase_user_id == user_id)
    result = await db.execute(stmt)
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    account_stmt = select(Account).where(
        Account.id == account_id,
        Account.user_id == user.id,
        Account.is_active == True,
    )
    account_result = await db.execute(account_stmt)
    account = account_result.scalar_one_or_none()
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")

    service = AllocationInsightService(db)
    payload = await service.build_for_account(user.id, account.id)
    return AllocationInsightsResponse(**payload)


@router.get("/assets/{bucket}/{symbol}/insights", response_model=AssetInsightResponse)
async def get_asset_insights(
    bucket: str,
    symbol: str,
    current_user: dict = Depends(get_authenticated_user),
    db: AsyncSession = Depends(get_db),
):
    """Get structured insight scoped to one normalized asset bucket and symbol."""
    bucket = bucket.lower()
    if bucket not in {"crypto", "stocks", "cash"}:
        raise HTTPException(status_code=400, detail="bucket must be one of: crypto, stocks, cash")

    user_id = current_user["user_id"]
    stmt = select(User).where(User.supabase_user_id == user_id)
    result = await db.execute(stmt)
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    service = AllocationInsightService(db)
    payload = await service.build_for_asset(user.id, bucket, symbol)
    return AssetInsightResponse(**payload)


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
        if account.provider == "plaid":
            continue
        try:
            # Get encrypted token
            token_data = await get_encrypted_token(
                str(user.id),
                account.provider,
                item_id=account.item_id if account.provider == "plaid" else None,
            )
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

    plaid_tokens = await get_plaid_token_rows_for_user(db, user.id)

    provider_names_result = await db.execute(
        select(ProviderToken.provider, ProviderToken.item_id).where(
            ProviderToken.user_id == user.id,
        )
    )
    provider_token_metadata = provider_names_result.all()
    logger.info(
        "Portfolio refresh provider token lookup",
        user_id=str(user.id),
        supabase_user_id=str(user.supabase_user_id),
        plaid_token_count=len(plaid_tokens),
        provider_token_count=len(provider_token_metadata),
        provider_names=[row[0] for row in provider_token_metadata],
        plaid_item_ids=[token.item_id for token in plaid_tokens],
        plaid_access_token_present=[bool(parse_token_data(token.token_data).get("access_token")) for token in plaid_tokens],
        plaid_token_data_types=[value_type(token.token_data) for token in plaid_tokens],
        token_active_field_exists=hasattr(ProviderToken, "is_active"),
        token_enabled_field_exists=hasattr(ProviderToken, "is_enabled"),
    )
    plaid_adapter = PlaidAdapter() if plaid_tokens else None

    for token_row in plaid_tokens:
        token_data = parse_token_data(token_row.token_data)
        access_token = token_data.get("access_token")
        item_id = token_row.item_id or token_data.get("item_id")
        if item_id and token_row.item_id != item_id:
            token_row.item_id = item_id
        if not access_token:
            message = "Plaid sync failed: access token missing or token_data could not be parsed"
            logger.warning(
                "Portfolio refresh Plaid token missing access token",
                user_id=str(user.id),
                item_id=item_id,
                provider=token_row.provider,
                token_data_type=value_type(token_row.token_data),
                access_token_present=False,
            )
            if item_id:
                await mark_plaid_item_failed(db, user.id, item_id, message)
            warnings.append({
                "type": "missing_token",
                "provider": "plaid",
                "message": message,
            })
            continue

        logger.info(
            "Portfolio refresh Plaid token selected",
            user_id=str(user.id),
            provider=token_row.provider,
            item_id=item_id,
            access_token_present=bool(access_token),
        )
        for sync_name, endpoint, sync_fn in (
            ("plaid_balance_sync_error", "accounts/balance/get", sync_plaid_balances_for_item),
            ("plaid_transaction_sync_error", "transactions/sync", sync_plaid_transactions_for_item),
            ("plaid_recurring_sync_error", "transactions/recurring/get", sync_plaid_recurring_for_item),
            ("plaid_liability_sync_error", "liabilities/get", sync_plaid_liabilities_for_item),
        ):
            try:
                await sync_fn(
                    db=db,
                    user=user,
                    item_id=item_id,
                    access_token=access_token,
                    adapter=plaid_adapter,
                )
            except Exception as e:
                await db.rollback()
                context = plaid_error_context(e)
                logger.error(
                    "Plaid refresh sync failed",
                    endpoint=endpoint,
                    user_id=str(user.id),
                    item_id=item_id,
                    **context,
                )
                warnings.append({
                    "type": sync_name,
                    "provider": "plaid",
                    "message": context.get("plaid_display_message") or context.get("error") or str(e),
                })

    try:
        plaid_sync = await sync_plaid_investments_for_user(db=db, user=user)
        for error in plaid_sync["errors"]:
            warnings.append({
                "type": "plaid_investment_sync_error",
                "provider": "plaid",
                "message": error["error"],
            })
    except Exception as e:
        logger.error("Plaid investment refresh failed", error=str(e), user_id=str(user.id))
        warnings.append({
            "type": "plaid_investment_sync_error",
            "provider": "plaid",
            "message": str(e),
        })

    try:
        aggregation_service = AggregationService(db)
        refreshed_portfolio = await aggregation_service.aggregate_portfolio(
            [str(user.id), str(user.supabase_user_id)]
        )
        valuation_history = PortfolioValuationHistoryService(db)
        await valuation_history.save_snapshot(
            user_id=user.id,
            total_value=refreshed_portfolio["total_value"],
            categories=refreshed_portfolio["categories"],
        )
    except Exception as e:
        logger.warning("Portfolio valuation snapshot after refresh failed", error=str(e), user_id=str(user.id))
    
    return RefreshPortfolioResponse(
        schema_version="v1",
        success=True,
        message="Portfolio refreshed",
        refreshed_at=datetime.utcnow().isoformat(),
        warnings=warnings,
    )


@router.get("/debug/plaid-sync-state")
async def debug_plaid_sync_state(
    current_user: dict = Depends(get_authenticated_user),
    db: AsyncSession = Depends(get_db),
):
    """Local/dev-only Plaid sync metadata. Returns no secrets or transaction details."""
    if settings.ENVIRONMENT != "development":
        raise HTTPException(status_code=404, detail="Not found")

    user_id = current_user["user_id"]
    user_result = await db.execute(select(User).where(User.supabase_user_id == user_id))
    user = user_result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    token_result = await db.execute(
        select(ProviderToken).where(
            ProviderToken.user_id == user.id,
            ProviderToken.provider == "plaid",
        )
    )
    token_rows = token_result.scalars().all()

    account_result = await db.execute(
        select(Account).where(Account.user_id == user.id, Account.provider == "plaid")
    )
    accounts = account_result.scalars().all()

    transaction_count = (
        await db.execute(
            text("SELECT COUNT(*) FROM public.transactions WHERE user_id = :user_id"),
            {"user_id": str(user.id)},
        )
    ).scalar_one()
    liability_count = (
        await db.execute(
            text("SELECT COUNT(*) FROM public.liabilities WHERE user_id = :user_id"),
            {"user_id": str(user.id)},
        )
    ).scalar_one()
    recurring_count = (
        await db.execute(
            text("SELECT COUNT(*) FROM public.recurring_streams WHERE user_id = :user_id"),
            {"user_id": str(user.id)},
        )
    ).scalar_one()
    holding_count = (
        await db.execute(select(func.count()).select_from(Holding).where(Holding.user_id == user.id))
    ).scalar_one()
    credit_accounts = [
        account
        for account in accounts
        if is_liability_account(account.account_type, account.subtype)
        and ((account.account_type or "").lower() == "credit" or (account.subtype or "").lower() == "credit card")
    ]

    return {
        "user_id": str(user.id),
        "plaid_token_count": len(token_rows),
        "tokens": [
            {
                "provider": token.provider,
                "item_id": token.item_id,
                "access_token_present": bool(parse_token_data(token.token_data).get("access_token")),
                "token_data_type": value_type(token.token_data),
                "cursor_present": bool(token.cursor),
            }
            for token in token_rows
        ],
        "account_count": len(accounts),
        "accounts": [
            {
                "account_id": str(account.id),
                "provider_account_id": account.provider_account_id,
                "item_id": account.item_id,
                "type": account.account_type,
                "subtype": account.subtype,
                "balance_current_present": account.balance_current is not None,
                "balance_available_present": account.balance_available is not None,
                "last_synced_at": account.last_synced_at.isoformat() if account.last_synced_at else None,
            }
            for account in accounts
        ],
        "transaction_count": int(transaction_count or 0),
        "recurring_transactions_count": int(recurring_count or 0),
        "liabilities_count": int(liability_count or 0),
        "credit_accounts_count": len(credit_accounts),
        "credit_accounts_with_balance": sum(1 for account in credit_accounts if account.balance_current is not None),
        "holdings_count": int(holding_count or 0),
        "latest_sync_error_summaries": [
            {
                "provider_account_id": account.provider_account_id,
                "item_id": account.item_id,
                "error_message": account.error_message,
            }
            for account in accounts
            if account.error_message
        ],
    }
