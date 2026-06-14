"""
Loan business service.
"""
from __future__ import annotations

import time
from typing import Dict, Optional

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.logging import get_logger, timing_log

from app.domain.errors import BadRequest
from app.services.loan.dto import (
    LoanAnalyticsSummaryDTO,
    LoanCalculateRequestDTO,
    LoanCalculateResponseDTO,
)
from app.services.loan.loan_engine import (
    attach_amortization,
    per_asset_breakdown,
    portfolio_aggregate,
)
from app.services.loan.repository import LoanRepository
from app.services.loan.summary_service import build_analyst_summary

logger = get_logger()


class LoanService:
    """Encapsulates loan calculation business rules."""

    def __init__(self, repository: Optional[LoanRepository] = None):
        self._repository = repository or LoanRepository()

    async def calculate(
        self,
        request: LoanCalculateRequestDTO,
        db: Optional[AsyncSession] = None,
        context: Optional[Dict] = None,
    ) -> LoanCalculateResponseDTO:
        if not request.assets:
            raise BadRequest("assets is required")

        # --- Step 1: Per-asset tier resolution and breakdown ---
        t_tier = time.perf_counter()
        rows = []
        for asset in request.assets:
            symbol = (asset.symbol or "").strip().upper()
            allocation_usd = float(asset.allocation_usd or 0)

            if not symbol:
                raise BadRequest("asset symbol is required")

            if allocation_usd <= 0:
                raise BadRequest(f"allocation_usd must be positive for symbol {symbol}")

            tier = self._repository.resolve_tier(symbol, asset.tier)
            metrics = self._repository.fetch_metrics(symbol)
            row = per_asset_breakdown(allocation_usd, tier, metrics, symbol)
            rows.append(row)

            logger.info(
                "loan_asset_processed",
                symbol=symbol,
                tier=tier,
                allocation_usd=allocation_usd,
                ltv=row.get("ltv"),
                interest_rate=row.get("interest_rate"),
                loan_usd=row.get("loan_usd"),
                user_tier_override=asset.tier,
            )

        tier_ms = int((time.perf_counter() - t_tier) * 1000)
        timing_log(
            endpoint="LOAN_CALCULATE",
            step="tier_resolution_and_breakdown",
            duration_ms=tier_ms,
            module="loan/service.py",
            step_number=1,
            detail=f"{len(rows)} assets resolved",
        )

        months = int(request.months or 0)
        if months < 1 or months > 36:
            raise BadRequest("months must be between 1 and 36")

        # --- Step 2: Portfolio aggregation ---
        t_agg = time.perf_counter()
        summary = portfolio_aggregate(rows, months)
        summary["months"] = months
        agg_ms = int((time.perf_counter() - t_agg) * 1000)

        logger.info(
            "loan_portfolio_aggregated",
            asset_count=len(rows),
            months=months,
            total_collateral=summary.get("total_collateral"),
            total_loan=summary.get("total_loan"),
            portfolio_ltv=summary.get("portfolio_ltv"),
            interest_rate=summary.get("interest_rate"),
            monthly_emi=summary.get("monthly_emi"),
        )
        timing_log(
            endpoint="LOAN_CALCULATE",
            step="portfolio_aggregation",
            duration_ms=agg_ms,
            module="loan/service.py",
            step_number=2,
        )

        # --- Step 3: Amortization schedule ---
        t_amort = time.perf_counter()
        profile = {"assets": rows, "summary": summary}
        profile = attach_amortization(profile)
        amort_ms = int((time.perf_counter() - t_amort) * 1000)

        schedule_months = len(profile.get("schedule", {}).get("portfolio", []))
        logger.info(
            "loan_amortization_built",
            months=months,
            schedule_rows=schedule_months,
            monthly_emi=profile["summary"].get("monthly_emi"),
        )
        timing_log(
            endpoint="LOAN_CALCULATE",
            step="amortization",
            duration_ms=amort_ms,
            module="loan/service.py",
            step_number=3,
        )

        # --- Step 4: Analyst summary (CoinGecko + optional LLM) ---
        t_summary = time.perf_counter()
        analyst = build_analyst_summary(profile)
        profile["summary"]["analyst"] = analyst
        summary_ms = int((time.perf_counter() - t_summary) * 1000)

        logger.info(
            "loan_analyst_summary_built",
            provider=analyst.get("provider"),
            model=analyst.get("model"),
            used_llm=analyst.get("used_llm"),
            duration_ms=summary_ms,
        )
        timing_log(
            endpoint="LOAN_CALCULATE",
            step="analyst_summary",
            duration_ms=summary_ms,
            module="loan/service.py",
            step_number=4,
        )

        # --- Step 5: Persist to DB ---
        calculation_id = None
        if db is not None:
            t_persist = time.perf_counter()
            try:
                calculation_id = await self._repository.persist_calculation(
                    db=db,
                    request=request,
                    rows=rows,
                    summary=profile["summary"],
                    context=context,
                )
                persist_ms = int((time.perf_counter() - t_persist) * 1000)
                logger.info(
                    "loan_calculation_persisted",
                    calculation_id=calculation_id,
                    asset_count=len(rows),
                    duration_ms=persist_ms,
                )
                timing_log(
                    endpoint="LOAN_CALCULATE",
                    step="db_persist",
                    duration_ms=persist_ms,
                    module="loan/service.py",
                    step_number=5,
                )
            except Exception as exc:
                persist_ms = int((time.perf_counter() - t_persist) * 1000)
                await db.rollback()
                logger.warning(
                    "loan_calculation_persist_failed",
                    error=str(exc),
                    asset_count=len(rows),
                    duration_ms=persist_ms,
                )

        return LoanCalculateResponseDTO(
            calculation_id=calculation_id,
            summary=profile["summary"],
            schedule=profile.get("schedule", {}),
            assets=rows,
        )

    async def get_analytics_summary(
        self,
        db: AsyncSession,
        days: int = 30,
    ) -> LoanAnalyticsSummaryDTO:
        if days < 1 or days > 365:
            raise BadRequest("days must be between 1 and 365")

        t0 = time.perf_counter()
        try:
            payload = await self._repository.analytics_summary(db=db, days=days)
            elapsed_ms = int((time.perf_counter() - t0) * 1000)
            logger.info(
                "loan_analytics_query_success",
                days=days,
                total_requests=payload.get("total_requests"),
                total_loan_usd=payload.get("total_loan_usd"),
                top_symbols_count=len(payload.get("top_symbols", [])),
                duration_ms=elapsed_ms,
            )
        except Exception as exc:
            elapsed_ms = int((time.perf_counter() - t0) * 1000)
            await db.rollback()
            logger.warning(
                "loan_analytics_summary_fallback_empty",
                error=str(exc),
                days=days,
                duration_ms=elapsed_ms,
            )
            payload = {
                "days": days,
                "total_requests": 0,
                "total_collateral_usd": 0.0,
                "total_loan_usd": 0.0,
                "avg_interest_rate_pct": 0.0,
                "avg_monthly_emi_usd": 0.0,
                "top_symbols": [],
                "tier_breakdown": [],
            }
        return LoanAnalyticsSummaryDTO(**payload)


loan_service = LoanService()
