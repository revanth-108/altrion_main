"""
Data-access and external dependency adapter for loan calculations.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Dict, List, Optional

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.logging import get_logger
from app.domain.errors import BadRequest
from app.models.loan_calculation import LoanCalculation
from app.models.loan_calculation_asset import LoanCalculationAsset
from app.services.loan.dto import LoanCalculateRequestDTO
from app.services.loan.model_client import ModelClient
from app.services.loan.volatility_client import get_metrics

logger = get_logger()

ALLOWED_TIERS = {"Tier 1", "Tier 1.5", "Tier 2", "Tier 3"}


class LoanRepository:
    """Repository for fetching risk tiers and market metrics."""

    def __init__(self, model_client: Optional[ModelClient] = None):
        self._model = model_client or ModelClient()

    @staticmethod
    def _normalize_tier(tier: str) -> str:
        normalized = (tier or "").strip()
        if not normalized:
            raise BadRequest("tier cannot be empty when provided")

        for candidate in ALLOWED_TIERS:
            if normalized.lower() == candidate.lower():
                return candidate

        raise BadRequest("tier must be one of: Tier 1, Tier 1.5, Tier 2, Tier 3")

    def resolve_tier(self, symbol: str, tier_override: Optional[str]) -> str:
        """
        Resolve the risk tier with clear precedence:
        1) User-provided tier (validated)
        2) Stablecoin shortcut (USDT -> Tier 1)
        3) AI model classification
        4) Safe fallback (Tier 2) on classifier errors/unknown outputs
        """
        if tier_override:
            resolved = self._normalize_tier(tier_override)
            logger.info(
                "loan_tier_resolved",
                symbol=symbol,
                tier=resolved,
                source="user_override",
            )
            return resolved

        if symbol == "USDT":
            logger.info(
                "loan_tier_resolved",
                symbol=symbol,
                tier="Tier 1",
                source="stablecoin_shortcut",
            )
            return "Tier 1"

        try:
            tier, confidence = self._model.risk_tier(symbol, {"hint": "loan_calculate"})
        except Exception as exc:
            logger.warning(
                "loan_tier_resolution_failed_fallback",
                symbol=symbol,
                error=str(exc),
                fallback_tier="Tier 2",
            )
            return "Tier 2"

        if tier not in ALLOWED_TIERS:
            logger.warning(
                "loan_tier_invalid_fallback",
                symbol=symbol,
                tier=tier,
                fallback_tier="Tier 2",
            )
            return "Tier 2"

        logger.info(
            "loan_tier_resolved",
            symbol=symbol,
            tier=tier,
            confidence=confidence,
            source="ai_model",
        )
        return tier

    @staticmethod
    def fetch_metrics(symbol: str) -> Dict:
        """
        Fetch volatility metrics with non-fatal fallback.
        """
        try:
            metrics = get_metrics(symbol) or {}
            logger.info(
                "loan_metrics_fetched",
                symbol=symbol,
                volatility_score=metrics.get("volatility_score"),
                pct_change_30d=metrics.get("pct_change_30d"),
                has_data=bool(metrics),
            )
            return metrics
        except Exception as exc:
            logger.warning("loan_metrics_fetch_failed", symbol=symbol, error=str(exc))
            return {}

    @staticmethod
    async def persist_calculation(
        db: AsyncSession,
        request: LoanCalculateRequestDTO,
        rows: List[Dict],
        summary: Dict,
        context: Optional[Dict] = None,
    ) -> str:
        """
        Persist aggregate and per-asset telemetry for downstream analytics.
        """
        context = context or {}

        logger.info(
            "loan_persist_start",
            asset_count=len(rows),
            months=int(request.months),
            total_collateral_usd=float(summary.get("total_collateral", 0.0) or 0.0),
            total_loan_usd=float(summary.get("total_loan", 0.0) or 0.0),
        )

        analyst = summary.get("analyst", {}) if isinstance(summary, dict) else {}
        calculation = LoanCalculation(
            user_id=context.get("user_id"),
            months=int(request.months),
            payout_currency=request.payout_currency,
            payout_method=request.payout_method,
            bank=None,
            payment_status="pending",
            assets_count=len(rows),
            total_collateral_usd=float(summary.get("total_collateral", 0.0) or 0.0),
            total_loan_usd=float(summary.get("total_loan", 0.0) or 0.0),
            portfolio_ltv_pct=float(summary.get("portfolio_ltv", 0.0) or 0.0),
            interest_rate_pct=float(summary.get("interest_rate", 0.0) or 0.0),
            monthly_emi_usd=float(summary.get("monthly_emi", 0.0) or 0.0),
            margin_call_ltv_pct=float(summary.get("margin_call_ltv", 0.0) or 0.0),
            liquidation_ltv_pct=float(summary.get("liquidation_ltv", 0.0) or 0.0),
            analyst_provider=analyst.get("provider") if isinstance(analyst, dict) else None,
            analyst_model=analyst.get("model") if isinstance(analyst, dict) else None,
            client_ip=context.get("client_ip"),
            user_agent=context.get("user_agent"),
            request_id=context.get("request_id"),
            metadata_json=context.get("metadata_json"),
        )
        db.add(calculation)
        await db.flush()

        logger.info(
            "loan_persist_aggregate_saved",
            calculation_id=str(calculation.id),
        )

        for idx, row in enumerate(rows):
            db.add(
                LoanCalculationAsset(
                    loan_calculation_id=calculation.id,
                    symbol=str(row.get("symbol", "")).upper(),
                    tier=str(row.get("tier", "Tier 2")),
                    asset_order=idx,
                    collateral_usd=float(row.get("collateral_usd", 0.0) or 0.0),
                    loan_usd=float(row.get("loan_usd", 0.0) or 0.0),
                    ltv_frac=float(row.get("ltv", 0.0) or 0.0),
                    interest_rate_frac=float(row.get("interest_rate", 0.0) or 0.0),
                    base_rate_frac=float(row.get("base_rate", 0.0) or 0.0),
                    risk_premium_frac=float(row.get("risk_premium", 0.0) or 0.0),
                    volatility_premium_frac=float(row.get("volatility_premium", 0.0) or 0.0),
                    pct_change_30d=(
                        float(row.get("pct_change_30d"))
                        if row.get("pct_change_30d") is not None
                        else None
                    ),
                )
            )

        await db.flush()

        logger.info(
            "loan_persist_complete",
            calculation_id=str(calculation.id),
            asset_rows_saved=len(rows),
        )
        return str(calculation.id)

    @staticmethod
    async def analytics_summary(db: AsyncSession, days: int = 30) -> Dict:
        logger.info("loan_analytics_query_start", days=days)
        cutoff = datetime.now(timezone.utc) - timedelta(days=days)

        totals_stmt = select(
            func.count(LoanCalculation.id),
            func.coalesce(func.sum(LoanCalculation.total_collateral_usd), 0.0),
            func.coalesce(func.sum(LoanCalculation.total_loan_usd), 0.0),
            func.coalesce(func.avg(LoanCalculation.interest_rate_pct), 0.0),
            func.coalesce(func.avg(LoanCalculation.monthly_emi_usd), 0.0),
        ).where(LoanCalculation.requested_at >= cutoff)
        totals_row = (await db.execute(totals_stmt)).one()

        top_symbols_stmt = (
            select(
                LoanCalculationAsset.symbol,
                func.count(LoanCalculationAsset.id).label("requests"),
                func.coalesce(func.sum(LoanCalculationAsset.collateral_usd), 0.0).label("total_collateral_usd"),
                func.coalesce(func.sum(LoanCalculationAsset.loan_usd), 0.0).label("total_loan_usd"),
                func.coalesce(func.avg(LoanCalculationAsset.ltv_frac), 0.0).label("avg_ltv_frac"),
            )
            .join(
                LoanCalculation,
                LoanCalculation.id == LoanCalculationAsset.loan_calculation_id,
            )
            .where(LoanCalculation.requested_at >= cutoff)
            .group_by(LoanCalculationAsset.symbol)
            .order_by(func.sum(LoanCalculationAsset.loan_usd).desc())
            .limit(20)
        )
        symbols_rows = (await db.execute(top_symbols_stmt)).all()

        tier_stmt = (
            select(
                LoanCalculationAsset.tier,
                func.count(LoanCalculationAsset.id).label("rows"),
                func.coalesce(func.sum(LoanCalculationAsset.loan_usd), 0.0).label("total_loan_usd"),
            )
            .join(
                LoanCalculation,
                LoanCalculation.id == LoanCalculationAsset.loan_calculation_id,
            )
            .where(LoanCalculation.requested_at >= cutoff)
            .group_by(LoanCalculationAsset.tier)
            .order_by(func.sum(LoanCalculationAsset.loan_usd).desc())
        )
        tier_rows = (await db.execute(tier_stmt)).all()

        result = {
            "days": days,
            "total_requests": int(totals_row[0] or 0),
            "total_collateral_usd": float(totals_row[1] or 0.0),
            "total_loan_usd": float(totals_row[2] or 0.0),
            "avg_interest_rate_pct": float(totals_row[3] or 0.0),
            "avg_monthly_emi_usd": float(totals_row[4] or 0.0),
            "top_symbols": [
                {
                    "symbol": row[0],
                    "requests": int(row[1] or 0),
                    "total_collateral_usd": float(row[2] or 0.0),
                    "total_loan_usd": float(row[3] or 0.0),
                    "avg_ltv_frac": float(row[4] or 0.0),
                }
                for row in symbols_rows
            ],
            "tier_breakdown": [
                {
                    "tier": row[0],
                    "rows": int(row[1] or 0),
                    "total_loan_usd": float(row[2] or 0.0),
                }
                for row in tier_rows
            ],
        }

        logger.info(
            "loan_analytics_query_complete",
            days=days,
            total_requests=result["total_requests"],
            top_symbols_count=len(result["top_symbols"]),
            tier_count=len(result["tier_breakdown"]),
        )
        return result
