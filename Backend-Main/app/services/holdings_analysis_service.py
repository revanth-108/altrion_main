"""
Deterministic holdings analysis for allocation insights.
"""
from __future__ import annotations

from collections import defaultdict
from decimal import Decimal
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.account import Account
from app.models.holding import Holding
from app.models.asset_metadata import AssetMetadata
from app.services.asset_metadata_service import AssetMetadataService, build_asset_key_for_bucket
from app.services.portfolio_classification import STABLECOINS, classify_holding
from app.services.pricing import PricingService

VALID_BUCKETS = {"crypto", "stocks", "cash"}


def _to_float(value: Decimal | float | int | None) -> float:
    if value is None:
        return 0.0
    return float(value)


class HoldingsAnalysisService:
    def __init__(self, db: AsyncSession):
        self.db = db
        self.pricing_service = PricingService(db)
        self.metadata_service = AssetMetadataService(db)

    async def analyze_user(self, user_id) -> dict[str, Any]:
        holdings = await self._load_holdings(user_id)
        if not holdings:
            return self._empty_payload("No holdings available for analysis.")
        return await self._analyze_holdings(holdings)

    async def analyze_account(self, user_id, account_id) -> dict[str, Any]:
        holdings = await self._load_holdings(user_id, account_id=account_id)
        if not holdings:
            return self._empty_payload("No holdings available for this account.")
        return await self._analyze_holdings(holdings)

    async def analyze_asset(self, user_id, bucket: str, symbol: str) -> dict[str, Any]:
        bucket = bucket.lower()
        symbol = symbol.upper()
        if bucket not in VALID_BUCKETS:
            return self._empty_asset_payload(bucket=bucket, symbol=symbol, warnings=["Unsupported asset bucket."])

        all_holdings = await self._load_holdings(user_id)
        if not all_holdings:
            return self._empty_asset_payload(bucket=bucket, symbol=symbol, warnings=["No holdings available for analysis."])

        prices = await self.pricing_service.get_prices_batch([holding.canonical_symbol for holding in all_holdings])
        account_map = await self._load_account_map(all_holdings)

        total_portfolio_value = 0.0
        matching_holdings: list[Holding] = []
        for holding in all_holdings:
            holding_bucket = self._bucket_for(holding)
            value_usd = self._value_for_holding(holding, prices)
            total_portfolio_value += value_usd
            if holding_bucket == bucket and holding.canonical_symbol.upper() == symbol:
                matching_holdings.append(holding)

        if not matching_holdings or total_portfolio_value <= 0:
            return self._empty_asset_payload(bucket=bucket, symbol=symbol, warnings=["Asset not found in this portfolio."])

        asset = self._group_holdings(matching_holdings, prices, account_map)[0]
        metadata = await self._metadata_for_asset(asset)
        account_breakdown = self._account_breakdown_for_asset(matching_holdings, prices, account_map, asset["value_usd"])
        portfolio_weight_pct = (asset["value_usd"] / total_portfolio_value) * 100
        warnings = self._asset_warnings(asset, metadata, portfolio_weight_pct)
        status = self._status_for_metadata(asset["value_usd"], metadata, asset["value_usd"])

        return {
            "asset": {
                "symbol": asset["canonical_symbol"],
                "bucket": asset["bucket"],
                "display_name": metadata.display_name or asset["canonical_symbol"],
                "portfolio_weight_pct": round(portfolio_weight_pct, 2),
                "value_usd": round(asset["value_usd"], 2),
                "quantity": round(asset["quantity"], 8),
                "sector": metadata.sector,
                "category": metadata.sector if asset["bucket"] == "crypto" else None,
                "metadata_status": metadata.metadata_status,
            },
            "accounts": account_breakdown,
            "status": status,
            "warnings": warnings,
        }

    async def _load_holdings(self, user_id, account_id=None) -> list[Holding]:
        stmt = select(Holding).where(Holding.user_id == user_id)
        if account_id is not None:
            stmt = stmt.where(Holding.account_id == account_id)
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def _analyze_holdings(self, holdings: list[Holding]) -> dict[str, Any]:
        account_map = await self._load_account_map(holdings)
        prices = await self.pricing_service.get_prices_batch([holding.canonical_symbol for holding in holdings])
        assets = self._group_holdings(holdings, prices, account_map)
        metadata_map = await self.metadata_service.get_many(assets)
        return self._build_allocation_payload(assets, metadata_map)

    async def _load_account_map(self, holdings: list[Holding]) -> dict[Any, Account]:
        account_ids = {holding.account_id for holding in holdings}
        if not account_ids:
            return {}
        account_stmt = select(Account).where(Account.id.in_(account_ids))
        account_result = await self.db.execute(account_stmt)
        return {account.id: account for account in account_result.scalars().all()}

    def _group_holdings(
        self,
        holdings: list[Holding],
        prices: dict[str, Decimal],
        account_map: dict[Any, Account],
    ) -> list[dict[str, Any]]:
        grouped: dict[tuple[str, str], dict[str, Any]] = {}
        for holding in holdings:
            bucket = self._bucket_for(holding)
            classified = classify_holding(holding)
            symbol = classified.normalized_symbol
            asset_key = build_asset_key_for_bucket(bucket, symbol)
            group_key = (bucket, symbol)
            value_usd = self._value_for_holding(holding, prices)

            if group_key not in grouped:
                grouped[group_key] = {
                    "bucket": bucket,
                    "canonical_symbol": symbol,
                    "asset_class": classified.effective_asset_class,
                    "metadata_asset_class": self._metadata_asset_class_for_bucket(bucket),
                    "security_id": holding.security_id,
                    "asset_key": asset_key,
                    "display_name": symbol,
                    "value_usd": 0.0,
                    "quantity": 0.0,
                    "sources": [],
                }

            grouped[group_key]["value_usd"] += value_usd
            grouped[group_key]["quantity"] += _to_float(holding.quantity)
            account = account_map.get(holding.account_id)
            grouped[group_key]["sources"].append(
                {
                    "source": holding.source,
                    "account_name": self._readable_account_name(account) if account else None,
                }
            )
        return list(grouped.values())

    def _build_allocation_payload(
        self,
        assets: list[dict[str, Any]],
        metadata_map: dict[str, AssetMetadata],
    ) -> dict[str, Any]:
        total_value = sum(asset["value_usd"] for asset in assets)
        if total_value <= 0:
            return self._empty_payload("No positive-value holdings available for analysis.")

        bucket_totals = defaultdict(float)
        stablecoin_value = 0.0
        metadata_covered = 0.0
        unknown_allocations = 0.0
        sector_totals = defaultdict(float)
        crypto_category_totals = defaultdict(float)
        warnings: list[str] = []

        for asset in assets:
            metadata = metadata_map[asset["asset_key"]]
            asset["display_name"] = metadata.display_name or asset["canonical_symbol"]
            asset["weight_pct"] = (asset["value_usd"] / total_value) * 100
            bucket_totals[asset["bucket"]] += asset["value_usd"]

            if metadata.metadata_status in {"ready", "partial"}:
                metadata_covered += asset["value_usd"]
            else:
                unknown_allocations += asset["value_usd"]

            if asset["bucket"] == "crypto":
                category = metadata.sector or "Unknown"
                crypto_category_totals[category] += asset["value_usd"]
            if asset["canonical_symbol"] in STABLECOINS:
                stablecoin_value += asset["value_usd"]
            elif asset["bucket"] == "stocks":
                sector = metadata.sector or "Unknown"
                sector_totals[sector] += asset["value_usd"]

        top_positions = sorted(assets, key=lambda item: item["value_usd"], reverse=True)[:5]
        by_sector = self._sorted_breakdown(sector_totals, total_value)
        by_crypto_category = self._sorted_breakdown(crypto_category_totals, total_value)

        top_sector = by_sector[0]["label"] if by_sector else "Unknown"
        top_crypto_category = by_crypto_category[0]["label"] if by_crypto_category else "Unknown"
        top_position_pct = top_positions[0]["weight_pct"] if top_positions else 0.0
        metadata_coverage_pct = (metadata_covered / total_value) * 100
        unknown_allocations_pct = (unknown_allocations / total_value) * 100

        if bucket_totals["cash"] / total_value >= 0.5:
            warnings.append("Portfolio is heavily cash-weighted.")
        if top_position_pct >= 35:
            warnings.append("Portfolio is concentrated in a single position.")
        if unknown_allocations_pct >= 20:
            warnings.append("Missing metadata affects a meaningful part of the portfolio.")
        if by_crypto_category and by_crypto_category[0]["label"] == "Unknown" and by_crypto_category[0]["weight_pct"] >= 10:
            warnings.append("A meaningful share of crypto holdings has unknown category metadata.")

        status = "ok"
        if unknown_allocations_pct > 0 or any(item["label"] == "Unknown" for item in by_sector[:1] + by_crypto_category[:1]):
            status = "partial"
        if metadata_coverage_pct < 50:
            status = "degraded"

        return {
            "assets": assets,
            "summary_payload": {
                "bucket_pcts": {
                    "cash_pct": (bucket_totals["cash"] / total_value) * 100,
                    "stocks_pct": (bucket_totals["stocks"] / total_value) * 100,
                    "crypto_pct": (bucket_totals["crypto"] / total_value) * 100,
                    "stablecoin_pct": (stablecoin_value / total_value) * 100,
                },
                "top_position_pct": top_position_pct,
                "top_sector": top_sector,
                "top_crypto_category": top_crypto_category,
                "warnings": warnings,
                "status": status,
            },
            "metrics": {
                "cash_pct": round((bucket_totals["cash"] / total_value) * 100, 2),
                "stocks_pct": round((bucket_totals["stocks"] / total_value) * 100, 2),
                "crypto_pct": round((bucket_totals["crypto"] / total_value) * 100, 2),
                "stablecoin_pct": round((stablecoin_value / total_value) * 100, 2),
                "top_position_pct": round(top_position_pct, 2),
                "top_sector": top_sector,
                "top_crypto_category": top_crypto_category,
                "metadata_coverage_pct": round(metadata_coverage_pct, 2),
                "unknown_allocations_pct": round(unknown_allocations_pct, 2),
            },
            "breakdowns": {
                "top_positions": [
                    {
                        "asset": asset["canonical_symbol"],
                        "name": asset["display_name"],
                        "bucket": asset["bucket"],
                        "weight_pct": round(asset["weight_pct"], 2),
                        "value_usd": round(asset["value_usd"], 2),
                    }
                    for asset in top_positions
                ],
                "by_sector": by_sector,
                "by_crypto_category": by_crypto_category,
            },
            "status": status,
            "warnings": warnings,
        }

    async def _metadata_for_asset(self, asset: dict[str, Any]) -> AssetMetadata:
        metadata_map = await self.metadata_service.get_many([asset])
        return metadata_map[asset["asset_key"]]

    def _account_breakdown_for_asset(
        self,
        holdings: list[Holding],
        prices: dict[str, Decimal],
        account_map: dict[Any, Account],
        total_asset_value: float,
    ) -> list[dict[str, Any]]:
        account_totals: dict[Any, dict[str, Any]] = {}
        for holding in holdings:
            account = account_map.get(holding.account_id)
            value_usd = self._value_for_holding(holding, prices)
            if holding.account_id not in account_totals:
                account_totals[holding.account_id] = {
                    "account_id": str(holding.account_id),
                    "account_name": self._readable_account_name(account) if account else None,
                    "provider": account.provider if account else holding.source,
                    "value_usd": 0.0,
                    "quantity": 0.0,
                    "weight_pct": 0.0,
                }
            account_totals[holding.account_id]["value_usd"] += value_usd
            account_totals[holding.account_id]["quantity"] += _to_float(holding.quantity)

        accounts = sorted(account_totals.values(), key=lambda item: item["value_usd"], reverse=True)
        for account in accounts:
            account["value_usd"] = round(account["value_usd"], 2)
            account["quantity"] = round(account["quantity"], 8)
            account["weight_pct"] = round((account["value_usd"] / total_asset_value) * 100, 2) if total_asset_value > 0 else 0.0
        return accounts

    def _asset_warnings(self, asset: dict[str, Any], metadata: AssetMetadata, portfolio_weight_pct: float) -> list[str]:
        warnings: list[str] = []
        if portfolio_weight_pct >= 35:
            warnings.append("This asset is a concentrated position in the portfolio.")
        if metadata.metadata_status not in {"ready", "partial"}:
            warnings.append("Metadata is missing for this asset.")
        if asset["bucket"] == "crypto" and metadata.sector in {None, "", "Unknown"}:
            warnings.append("Crypto category is unknown for this asset.")
        return warnings

    def _status_for_metadata(self, covered_value: float, metadata: AssetMetadata, total_value: float) -> str:
        if total_value <= 0:
            return "degraded"
        if metadata.metadata_status == "ready":
            return "ok"
        if metadata.metadata_status == "partial":
            return "partial"
        return "degraded"

    def _bucket_for(self, holding: Holding) -> str:
        return classify_holding(holding).bucket

    def _price_for_holding(self, holding: Holding, prices: dict[str, Decimal]) -> float:
        symbol = holding.canonical_symbol.upper()
        if symbol == "USD":
            return 1.0
        price = prices.get(symbol)
        if price is not None and float(price) > 0:
            return float(price)
        if holding.institution_value is not None and holding.quantity:
            quantity = float(holding.quantity)
            if quantity:
                return float(holding.institution_value) / quantity
        if holding.institution_price is not None:
            return float(holding.institution_price)
        return 0.0

    def _value_for_holding(self, holding: Holding, prices: dict[str, Decimal]) -> float:
        return _to_float(holding.quantity) * _to_float(self._price_for_holding(holding, prices))

    def _sorted_breakdown(self, totals: dict[str, float], total_value: float) -> list[dict[str, Any]]:
        ordered = sorted(totals.items(), key=lambda item: item[1], reverse=True)
        return [
            {
                "label": label,
                "weight_pct": round((value / total_value) * 100, 2),
                "value_usd": round(value, 2),
            }
            for label, value in ordered[:5]
        ]

    def _metadata_asset_class_for_bucket(self, bucket: str) -> str:
        if bucket == "cash":
            return "cash_equivalent"
        if bucket == "stocks":
            return "equity"
        return "crypto"

    def _empty_payload(self, warning: str) -> dict[str, Any]:
        return {
            "assets": [],
            "summary_payload": {
                "bucket_pcts": {"cash_pct": 0.0, "stocks_pct": 0.0, "crypto_pct": 0.0, "stablecoin_pct": 0.0},
                "top_position_pct": 0.0,
                "top_sector": "Unknown",
                "top_crypto_category": "Unknown",
                "warnings": [warning],
                "status": "degraded",
            },
            "metrics": {
                "cash_pct": 0.0,
                "stocks_pct": 0.0,
                "crypto_pct": 0.0,
                "stablecoin_pct": 0.0,
                "top_position_pct": 0.0,
                "top_sector": "Unknown",
                "top_crypto_category": "Unknown",
                "metadata_coverage_pct": 0.0,
                "unknown_allocations_pct": 100.0,
            },
            "breakdowns": {"top_positions": [], "by_sector": [], "by_crypto_category": []},
            "status": "degraded",
            "warnings": [warning],
        }

    @staticmethod
    def _readable_account_name(account: Account) -> str:
        provider_label = {
            "plaid": "Bank",
            "coinbase": "Coinbase",
            "wallet": "Crypto Wallet",
        }.get((account.provider or "").lower(), (account.provider or "Account").title())
        subtype = (account.subtype or "").replace("_", " ").title()
        if subtype and provider_label == "Bank":
            return f"{subtype} Account"
        return provider_label

    def _empty_asset_payload(self, bucket: str, symbol: str, warnings: list[str]) -> dict[str, Any]:
        return {
            "asset": {
                "symbol": symbol,
                "bucket": bucket if bucket in VALID_BUCKETS else "stocks",
                "display_name": symbol,
                "portfolio_weight_pct": 0.0,
                "value_usd": 0.0,
                "quantity": 0.0,
                "sector": None,
                "category": None,
                "metadata_status": "missing",
            },
            "accounts": [],
            "status": "degraded",
            "warnings": warnings,
        }
