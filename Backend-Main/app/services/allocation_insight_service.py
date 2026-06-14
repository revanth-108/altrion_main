"""
Allocation insight orchestration service.
"""
from __future__ import annotations

from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.logging import get_logger
from app.services.claude_client import ASSET_STANCES, ClaudeClient
from app.services.holdings_analysis_service import HoldingsAnalysisService

logger = get_logger()


class AllocationInsightService:
    def __init__(self, db: AsyncSession):
        self.db = db
        self.analysis_service = HoldingsAnalysisService(db)
        self.claude_client = ClaudeClient()

    async def build_for_user(self, user_id) -> dict[str, Any]:
        analysis = await self.analysis_service.analyze_user(user_id)
        return await self._build_allocation_payload(analysis, scope="portfolio")

    async def build_for_account(self, user_id, account_id) -> dict[str, Any]:
        analysis = await self.analysis_service.analyze_account(user_id, account_id)
        return await self._build_allocation_payload(analysis, scope="account")

    async def build_for_asset(self, user_id, bucket: str, symbol: str) -> dict[str, Any]:
        analysis = await self.analysis_service.analyze_asset(user_id, bucket, symbol)
        summary = self._deterministic_asset_summary(analysis)

        try:
            llm_summary = await self.claude_client.summarize(
                {
                    "asset": analysis["asset"],
                    "accounts": analysis["accounts"],
                    "warnings": analysis["warnings"],
                    "status": analysis["status"],
                    "deterministic_summary": summary,
                },
                allowed_stances=ASSET_STANCES,
            )
            summary = llm_summary
        except Exception as exc:
            logger.warning("Claude asset insight unavailable", error=str(exc))

        return {
            "summary": summary,
            "asset": analysis["asset"],
            "accounts": analysis["accounts"],
            "status": analysis["status"],
            "warnings": analysis["warnings"],
        }

    async def _build_allocation_payload(self, analysis: dict[str, Any], scope: str) -> dict[str, Any]:
        summary = self._deterministic_summary(analysis, scope=scope)
        try:
            llm_summary = await self.claude_client.summarize(
                {
                    "metrics": analysis["metrics"],
                    "breakdowns": analysis["breakdowns"],
                    "warnings": analysis["warnings"],
                    "status": analysis["status"],
                    "scope": scope,
                    "deterministic_summary": summary,
                }
            )
            summary = llm_summary
        except Exception as exc:
            logger.warning("Claude allocation summary unavailable", error=str(exc))

        return {
            "summary": summary,
            "metrics": analysis["metrics"],
            "breakdowns": analysis["breakdowns"],
            "status": analysis["status"],
            "warnings": analysis["warnings"],
        }

    def _deterministic_summary(self, analysis: dict[str, Any], scope: str = "portfolio") -> dict[str, Any]:
        metrics = analysis["metrics"]
        warnings = analysis["warnings"]
        cash_pct = metrics["cash_pct"]
        crypto_pct = metrics["crypto_pct"]
        stocks_pct = metrics["stocks_pct"]
        top_position_pct = metrics["top_position_pct"]

        stance = "Balanced"
        confidence = 0.62
        caution = warnings[0] if warnings else None

        if cash_pct >= 50:
            stance = "Cash-Heavy"
            confidence = 0.82
        elif top_position_pct >= 35:
            stance = "Concentrated"
            confidence = 0.8
        elif crypto_pct >= 60:
            stance = "Speculative"
            confidence = 0.78
        elif stocks_pct >= 55 and crypto_pct <= 25:
            stance = "Growth"
            confidence = 0.72

        text = (
            f"The {scope} allocation is {stance.lower()} with {stocks_pct:.0f}% in stocks, "
            f"{crypto_pct:.0f}% in crypto, and {cash_pct:.0f}% in cash. "
            f"Top stock sector is {metrics['top_sector'] or 'Unknown'}, "
            f"and top crypto category is {metrics['top_crypto_category'] or 'Unknown'}."
        )

        return {
            "stance": stance,
            "confidence": confidence,
            "text": text,
            "caution": caution,
            "used_llm": False,
        }

    def _deterministic_asset_summary(self, analysis: dict[str, Any]) -> dict[str, Any]:
        asset = analysis["asset"]
        warnings = analysis["warnings"]
        bucket = asset["bucket"]
        weight_pct = asset["portfolio_weight_pct"]
        category = asset["category"] or asset["sector"] or "Unknown"

        stance = "Unknown"
        confidence = 0.58
        if bucket == "cash":
            stance = "Cash"
            confidence = 0.82
        elif bucket == "crypto" and category == "Stablecoin":
            stance = "Stablecoin"
            confidence = 0.82
        elif bucket == "crypto":
            stance = "Speculative"
            confidence = 0.72
        elif bucket == "stocks":
            stance = "Core" if weight_pct < 35 else "Speculative"
            confidence = 0.68

        text = (
            f"{asset['symbol']} represents {weight_pct:.0f}% of the portfolio "
            f"with ${asset['value_usd']:,.0f} in value. "
            f"Its current classification is {bucket}, with category {category}."
        )

        return {
            "stance": stance,
            "confidence": confidence,
            "text": text,
            "caution": warnings[0] if warnings else None,
            "used_llm": False,
        }
