"""
Financial-analysis controller — Monte Carlo, DCF, Comps, LBO,
plus portfolio-aware concentration risk and goal-fit endpoints.

Mirrors the patterns used by the other controllers in this package:
  - router = APIRouter() at module level (prefix applied in router.py)
  - Depends(get_authenticated_user) on every endpoint
  - get_logger() for structured logging
  - HTTPException for user-facing errors
"""
from __future__ import annotations

import time

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import get_current_user as get_authenticated_user
from app.core.database import get_db
from app.core.logging import get_logger
from app.core import redis_client as redis_module
from app.core.redis_client import get_raw_data, store_raw_data
from app.models.user import User
from app.schemas.analysis import (
    CompsRequest,
    DCFRequest,
    ExplainRequest,
    ExplainResponse,
    GoalFitRequest,
    LBORequest,
    PortfolioXRayInsightPayload,
    MonteCarloRequest,
    ResearchLabRequest,
)
from app.services.financial_analysis.comps import run_comps_analysis
from app.services.financial_analysis.concentration_risk import analyze_concentration
from app.services.financial_analysis.dcf import build_dcf_model
from app.services.financial_analysis.goal_fit import score_goal_fit
from app.services.financial_analysis.lbo import run_lbo_scenario
from app.services.financial_analysis.monte_carlo import simulate_retirement
from app.services.financial_analysis.portfolio_xray import build_portfolio_xray
from app.services.financial_analysis.portfolio_xray_insights import generate_portfolio_xray_insights
from app.services.asset_metadata_service import AssetMetadataService
from app.services.etf_lookthrough_service import ETFLookthroughService
from app.services.holdings_analysis_service import HoldingsAnalysisService
from app.services.fmp_service import FMPService
from app.services.research_lab_service import run_research_lab
from app.services.explain_service import explain_analysis

logger = get_logger()
_PORTFOLIO_XRAY_CACHE_TTL_SECONDS = 300
_portfolio_xray_memory_cache: dict[str, tuple[float, dict]] = {}


async def _get_cached_portfolio_xray(user_id: str) -> dict | None:
    cache_key = f"portfolio_xray:{user_id}"
    cached = _portfolio_xray_memory_cache.get(cache_key)
    if cached is not None:
        cached_at, payload = cached
        if time.monotonic() - cached_at < _PORTFOLIO_XRAY_CACHE_TTL_SECONDS:
            return payload
        _portfolio_xray_memory_cache.pop(cache_key, None)

    if redis_module.redis_client is None:
        return None
    try:
        payload = await get_raw_data(cache_key)
        if payload is not None:
            _portfolio_xray_memory_cache[cache_key] = (time.monotonic(), payload)
        return payload
    except Exception as exc:
        logger.warning("portfolio_xray_cache_read_failed", error=str(exc))
        return None


async def _store_cached_portfolio_xray(user_id: str, payload: dict) -> None:
    cache_key = f"portfolio_xray:{user_id}"
    _portfolio_xray_memory_cache[cache_key] = (time.monotonic(), payload)
    if redis_module.redis_client is None:
        return
    try:
        await store_raw_data(
            cache_key,
            payload,
            ttl=_PORTFOLIO_XRAY_CACHE_TTL_SECONDS,
        )
    except Exception as exc:
        logger.warning("portfolio_xray_cache_write_failed", error=str(exc))

router = APIRouter()


async def _get_user(current_user: dict, db: AsyncSession) -> User:
    user_id = current_user["user_id"]
    stmt = select(User).where(User.supabase_user_id == user_id)
    result = await db.execute(stmt)
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user


# ---------------------------------------------------------------------------
# POST /analysis/monte-carlo
# ---------------------------------------------------------------------------
@router.post("/monte-carlo")
async def run_monte_carlo(
    payload: MonteCarloRequest,
    current_user: dict = Depends(get_authenticated_user),
):
    """Run a Monte Carlo retirement simulation."""
    try:
        result = simulate_retirement(
            initial_balance=payload.initial_balance,
            monthly_contribution=payload.monthly_contribution,
            annual_income=payload.annual_income,
            annual_expenses=payload.annual_expenses,
            use_cash_flow_contribution=payload.use_cash_flow_contribution,
            income_growth_rate=payload.income_growth_rate,
            expense_growth_rate=payload.expense_growth_rate,
            events=[event.model_dump() for event in payload.events],
            current_age=payload.current_age,
            retirement_age=payload.retirement_age,
            planning_age=payload.planning_age,
            target_annual_income=payload.target_annual_income,
            social_security_income=payload.social_security_income,
            mean_return=payload.mean_return,
            return_std=payload.return_std,
            retirement_mean_return=payload.retirement_mean_return,
            retirement_return_std=payload.retirement_return_std,
            mean_inflation=payload.mean_inflation,
            inflation_std=payload.inflation_std,
            n_iterations=payload.n_iterations,
            random_salt=payload.random_salt,
        )
        return result
    except ValueError as exc:
        logger.warning("monte_carlo_validation_error", error=str(exc))
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:
        logger.error("monte_carlo_failed", error=str(exc))
        raise HTTPException(status_code=500, detail="Simulation failed")


# ---------------------------------------------------------------------------
# POST /analysis/dcf
# ---------------------------------------------------------------------------
@router.post("/dcf")
async def run_dcf(
    payload: DCFRequest,
    current_user: dict = Depends(get_authenticated_user),
):
    """Run a Discounted Cash Flow valuation."""
    try:
        return build_dcf_model(
            investment_name=payload.investment_name,
            revenue=payload.revenue,
            revenue_growth=payload.revenue_growth,
            profit_margin=payload.profit_margin,
            tax_rate=payload.tax_rate,
            capex_pct=payload.capex_pct,
            working_capital_pct=payload.working_capital_pct,
            discount_rate=payload.discount_rate,
            terminal_growth=payload.terminal_growth,
            projection_years=payload.projection_years,
        )
    except ValueError as exc:
        logger.warning("dcf_validation_error", error=str(exc))
        raise HTTPException(status_code=400, detail=str(exc))


# ---------------------------------------------------------------------------
# POST /analysis/comps
# ---------------------------------------------------------------------------
@router.post("/comps")
async def run_comps(
    payload: CompsRequest,
    current_user: dict = Depends(get_authenticated_user),
):
    """Run a comparable-multiples analysis against a peer set."""
    if not payload.comparison_investments:
        raise HTTPException(status_code=400, detail="At least one peer investment is required.")
    return run_comps_analysis(
        target_investment=payload.target_investment,
        comparison_investments=payload.comparison_investments,
        multiples_to_use=payload.multiples_to_use,
    )


# ---------------------------------------------------------------------------
# POST /analysis/lbo
# ---------------------------------------------------------------------------
@router.post("/lbo")
async def run_lbo(
    payload: LBORequest,
    current_user: dict = Depends(get_authenticated_user),
):
    """Run a leveraged-investment scenario builder."""
    try:
        return run_lbo_scenario(
            investment_name=payload.investment_name,
            investment_amount=payload.investment_amount,
            entry_multiple=payload.entry_multiple,
            leverage_ratio=payload.leverage_ratio,
            interest_rate=payload.interest_rate,
            income_growth=payload.income_growth,
            exit_multiple=payload.exit_multiple,
            hold_period=payload.hold_period,
            initial_annual_income=payload.initial_annual_income,
        )
    except ValueError as exc:
        logger.warning("lbo_validation_error", error=str(exc))
        raise HTTPException(status_code=400, detail=str(exc))


# ---------------------------------------------------------------------------
# POST /analysis/goal-fit  (form-driven)
# ---------------------------------------------------------------------------
@router.post("/goal-fit")
async def run_goal_fit(
    payload: GoalFitRequest,
    current_user: dict = Depends(get_authenticated_user),
):
    """Score how well a portfolio allocation fits a financial goal."""
    return score_goal_fit(
        current_assets=payload.current_assets,
        target_amount=payload.target_amount,
        years_to_goal=payload.years_to_goal,
        annual_savings=payload.annual_savings,
        allocation=payload.allocation,
        goal_type=payload.goal_type,
        risk_comfort=payload.risk_comfort,
    )


# ---------------------------------------------------------------------------
# GET /analysis/concentration  (uses logged-in user's holdings)
# ---------------------------------------------------------------------------
@router.get("/concentration")
async def get_concentration(
    current_user: dict = Depends(get_authenticated_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Concentration risk for the authenticated user's portfolio.
    Reads holdings via HoldingsAnalysisService and feeds them into the
    deterministic HHI/severity engine.
    """
    user = await _get_user(current_user, db)
    holdings_service = HoldingsAnalysisService(db)
    allocation = await holdings_service.analyze_user(user.id)

    assets = allocation.get("assets") or []
    positions: list[dict] = []
    for asset in assets:
        value = float(asset.get("value_usd") or 0.0)
        if value <= 0:
            continue
        positions.append({
            "ticker": asset.get("canonical_symbol") or asset.get("display_name") or "?",
            "asset_name": asset.get("display_name") or asset.get("canonical_symbol") or "?",
            "asset_class": asset.get("asset_class") or "Other",
            "quantity": 1.0,
            "price": value,
        })

    if not positions:
        return {
            "error": "No holdings available for analysis.",
            "status": allocation.get("status"),
        }

    return analyze_concentration(positions)


# ---------------------------------------------------------------------------
# GET /analysis/portfolio-xray
# ---------------------------------------------------------------------------
@router.get("/portfolio-xray")
async def get_portfolio_xray(
    refresh: bool = Query(False),
    current_user: dict = Depends(get_authenticated_user),
    db: AsyncSession = Depends(get_db),
):
    """Portfolio X-Ray diagnostics for the authenticated user's holdings."""
    user = await _get_user(current_user, db)
    user_id = str(user.id)
    if not refresh:
        cached = await _get_cached_portfolio_xray(user_id)
        if cached is not None:
            return cached

    holdings_service = HoldingsAnalysisService(db)
    allocation = await holdings_service.analyze_user(user.id)
    metadata_service = AssetMetadataService(db)
    lookthrough_service = ETFLookthroughService(db)
    result = await build_portfolio_xray(allocation, metadata_service, lookthrough_service)
    await _store_cached_portfolio_xray(user_id, result)
    return result


# ---------------------------------------------------------------------------
# POST /analysis/portfolio-xray/insights
# ---------------------------------------------------------------------------
@router.post("/portfolio-xray/insights")
async def get_portfolio_xray_insights(
    payload: PortfolioXRayInsightPayload,
    current_user: dict = Depends(get_authenticated_user),
):
    """Claude-generated X-Ray findings from an already computed report payload."""
    try:
        return await generate_portfolio_xray_insights(payload.model_dump())
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc))
    except Exception as exc:
        logger.error("portfolio_xray_insights_failed", error=str(exc))
        raise HTTPException(status_code=502, detail="Portfolio X-Ray insights temporarily unavailable")


# ---------------------------------------------------------------------------
# GET /analysis/holding/{symbol}/valuation
# ---------------------------------------------------------------------------
@router.get("/holding/{symbol}/valuation")
async def get_holding_valuation(
    symbol: str,
    current_user: dict = Depends(get_authenticated_user),
):
    """Return key valuation metrics for a single stock via Yahoo Finance.

    Returns {} for unknown symbols or cash positions (caller should handle gracefully).
    """
    sym = symbol.strip().upper()
    # Skip cash/stablecoin symbols
    if sym in ("USD", "USDC", "USDT", "DAI", "CASH"):
        return {}
    fmp = FMPService()
    try:
        return await fmp.get_stock_valuation(sym)
    except Exception as exc:
        logger.warning("holding_valuation_failed", symbol=sym, error=str(exc))
        return {}


# ---------------------------------------------------------------------------
# GET /analysis/asset/search?q=
# ---------------------------------------------------------------------------
@router.get("/asset/search")
async def search_asset(
    q: str = Query(..., min_length=1, max_length=100),
    current_user: dict = Depends(get_authenticated_user),
):
    """Search stocks/ETFs by ticker or name. Uses FMP if key is set, falls back to Yahoo Finance."""
    fmp = FMPService()
    try:
        results = await fmp.search(q)
        return {"results": results[:10]}
    except Exception as exc:
        logger.error("fmp_search_failed", error=str(exc))
        raise HTTPException(status_code=502, detail="Asset search temporarily unavailable")


# ---------------------------------------------------------------------------
# GET /analysis/asset/{symbol}
# ---------------------------------------------------------------------------
@router.get("/asset/{symbol}")
async def get_asset_data(
    symbol: str,
    current_user: dict = Depends(get_authenticated_user),
):
    """Return aggregated FMP data for a symbol (quote, profile, metrics, grades, targets, news)."""
    import asyncio as _asyncio

    fmp = FMPService()
    if not fmp.key:
        raise HTTPException(status_code=503, detail="FMP API not configured")

    try:
        profile, quote, metrics, grades, price_target, news = await _asyncio.gather(
            fmp.get_profile(symbol),
            fmp.get_quote(symbol),
            fmp.get_key_metrics_ttm(symbol),
            fmp.get_analyst_grades(symbol),
            fmp.get_price_target_summary(symbol),
            fmp.get_stock_news(symbol),
            return_exceptions=True,
        )

        def _s(v, default=None):
            return default if isinstance(v, BaseException) else v

        return {
            "symbol": symbol,
            "profile": _s(profile),
            "quote": _s(quote),
            "metrics": _s(metrics),
            "grades": _s(grades, []),
            "price_target": _s(price_target),
            "news": [
                {
                    "title": a.get("title"),
                    "publishedDate": a.get("publishedDate"),
                    "url": a.get("url"),
                }
                for a in (_s(news, []) or [])[:5]
            ],
        }
    except Exception as exc:
        logger.error("fmp_asset_data_failed", symbol=symbol, error=str(exc))
        raise HTTPException(status_code=502, detail="Asset data temporarily unavailable")


# ---------------------------------------------------------------------------
# GET /analysis/asset/{symbol}/history?period=
# ---------------------------------------------------------------------------
@router.get("/asset/{symbol}/history")
async def get_asset_history(
    symbol: str,
    period: str = Query(default="1M", pattern="^(1D|1W|1M|6M|1Y|5Y|MAX)$"),
    current_user: dict = Depends(get_authenticated_user),
):
    """Return close-price history for charting via Yahoo Finance. Periods: 1D, 1M, 6M, 1Y, 5Y, MAX."""
    fmp = FMPService()
    try:
        prices = await fmp.get_historical_prices(symbol, period)
        return {"symbol": symbol, "period": period, "prices": prices}
    except Exception as exc:
        logger.error("fmp_history_failed", symbol=symbol, period=period, error=str(exc))
        raise HTTPException(status_code=502, detail="Price history unavailable")


# ---------------------------------------------------------------------------
# POST /analysis/research-lab
# ---------------------------------------------------------------------------
@router.post("/research-lab")
async def run_research_lab_endpoint(
    payload: ResearchLabRequest,
    current_user: dict = Depends(get_authenticated_user),
):
    """Run a Research Lab analysis: Yahoo Finance data aggregation + Claude synthesis."""
    fmp = FMPService()
    try:
        result = await run_research_lab(
            symbol=payload.symbol,
            mode=payload.mode,
            asset_type=payload.asset_type,
            fmp=fmp,
        )
        return result
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc))
    except Exception as exc:
        logger.error("research_lab_failed", symbol=payload.symbol, mode=payload.mode, error=str(exc))
        raise HTTPException(status_code=500, detail="Research Lab analysis failed")


# ---------------------------------------------------------------------------
# POST /analysis/explain — plain-language explanation of analysis results
# ---------------------------------------------------------------------------
@router.post("/explain", response_model=ExplainResponse)
async def explain_analysis_endpoint(
    payload: ExplainRequest,
    current_user: dict = Depends(get_authenticated_user),
):
    """Generate a plain-language explanation of a Monte Carlo or Financial Analysis result."""
    try:
        result = await explain_analysis(
            kind=payload.kind,
            context=payload.context,
            title=payload.title,
            api_key=payload.api_key,
        )
        return result
    except PermissionError as exc:
        raise HTTPException(status_code=401, detail=str(exc))
    except RuntimeError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except httpx.HTTPStatusError as exc:
        logger.error("explain_upstream_failed", status=exc.response.status_code)
        raise HTTPException(status_code=502, detail="Claude request failed. Check your API key and try again.")
    except Exception as exc:
        logger.error("explain_failed", kind=payload.kind, error=str(exc))
        raise HTTPException(status_code=500, detail="Failed to generate explanation")

