"""
Aggregation Service - computes portfolio totals on-the-fly

Aggregation rules:
- Sum quantities per canonical symbol across all accounts
- Multiply by USD price
- Group by asset class
- NO stored portfolio totals - always computed fresh
"""
from typing import List, Dict
from decimal import Decimal
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from collections import defaultdict
import structlog

from app.models.holding import Holding
from app.models.account import Account
from app.services.pricing import PricingService
from app.schemas.portfolio import AssetResponse, AssetSourceBreakdown

logger = structlog.get_logger()


class AggregationService:
    """Service for aggregating holdings into portfolio view"""
    
    def __init__(self, db: AsyncSession):
        self.db = db
        self.pricing_service = PricingService(db)
    
    async def aggregate_portfolio(self, user_id: str | list[str]) -> Dict:
        """
        Aggregate portfolio for a user
        
        Returns:
            Dict with assets, totals, categories, warnings
        """
        from uuid import UUID
        
        # Convert user ids to UUID objects
        user_ids = [user_id] if isinstance(user_id, str) else user_id
        user_id_uuids = []
        for uid in user_ids:
            try:
                user_id_uuids.append(UUID(uid) if isinstance(uid, str) else uid)
            except Exception:
                logger.warning("Invalid user id for aggregation", user_id=uid)
        
        # Fetch all holdings for user
        if not user_id_uuids:
            return {
                "assets": [],
                "total_value": Decimal("0"),
                "categories": {
                    "crypto": Decimal("0"),
                    "equity": Decimal("0"),
                    "cash_equivalent": Decimal("0"),
                },
                "warnings": [],
            }

        stmt = select(Holding).where(Holding.user_id.in_(user_id_uuids))
        result = await self.db.execute(stmt)
        holdings = result.scalars().all()
        
        if not holdings:
            return {
                "assets": [],
                "total_value": Decimal("0"),
                "categories": {
                    "crypto": Decimal("0"),
                    "equity": Decimal("0"),
                    "cash_equivalent": Decimal("0"),
                },
                "warnings": [],
            }
        
        # Group holdings by canonical symbol
        symbol_groups = defaultdict(list)
        account_map = {}
        
        for holding in holdings:
            symbol_groups[holding.canonical_symbol].append(holding)
            
            # Fetch account info if not cached
            if holding.account_id not in account_map:
                account_stmt = select(Account).where(Account.id == holding.account_id)
                account_result = await self.db.execute(account_stmt)
                account = account_result.scalar_one_or_none()
                account_map[holding.account_id] = account
        
        # Aggregate per symbol
        assets = []
        categories = defaultdict(Decimal)
        all_symbols = list(symbol_groups.keys())
        
        # Fetch prices for all symbols
        prices = await self.pricing_service.get_prices_batch(all_symbols)
        
        for symbol, symbol_holdings in symbol_groups.items():
            # Sum quantities across all accounts
            total_quantity = sum(holding.quantity for holding in symbol_holdings)
            
            # Get price
            price = prices.get(symbol, Decimal("0"))
            value_usd = total_quantity * price
            
            # Get asset class (should be same for all holdings of same symbol)
            asset_class = symbol_holdings[0].asset_class
            
            # Build source breakdown
            sources = []
            for holding in symbol_holdings:
                account = account_map.get(holding.account_id)
                source_value = holding.quantity * price
                
                sources.append(AssetSourceBreakdown(
                    source=holding.source,
                    account_id=str(holding.account_id),
                    account_name=account.name if account else None,
                    quantity=holding.quantity,
                    value_usd=source_value,
                ))
            
            # Add to category total
            categories[asset_class] += value_usd
            
            assets.append(AssetResponse(
                symbol=symbol,
                name=self._get_asset_name(symbol),
                quantity=total_quantity,
                value_usd=value_usd,
                price_usd=price,
                change_24h=None,  # TODO: Calculate 24h change if needed
                asset_class=asset_class,
                sources=sources,
            ))
        
        # Calculate total value
        total_value = sum(asset.value_usd for asset in assets)
        
        # Normalize categories
        normalized_categories = {
            "crypto": categories.get("crypto", Decimal("0")),
            "equity": categories.get("equity", Decimal("0")),
            "cash_equivalent": categories.get("cash_equivalent", Decimal("0")),
        }
        
        return {
            "assets": assets,
            "total_value": total_value,
            "categories": normalized_categories,
            "warnings": [],  # Warnings come from normalization service
        }
    
    def _get_asset_name(self, symbol: str) -> str:
        """Get human-readable asset name"""
        names = {
            "BTC": "Bitcoin",
            "ETH": "Ethereum",
            "USDC": "USD Coin",
            "USDT": "Tether",
            "USD": "US Dollar",
        }
        return names.get(symbol.upper(), symbol.upper())
