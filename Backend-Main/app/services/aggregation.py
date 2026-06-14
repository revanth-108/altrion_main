"""
Aggregation Service - computes portfolio totals on-the-fly

Aggregation rules:
- Sum quantities per canonical symbol across all accounts
- Multiply by USD price
- Group by asset class
- NO stored portfolio totals - always computed fresh
"""
import time

from typing import Dict
from decimal import Decimal
from datetime import datetime
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from collections import defaultdict

from app.core.logging import get_logger, timing_log
from app.models.holding import Holding
from app.models.account import Account
from app.models.security import Security
from app.services.portfolio_classification import classify_holding
from app.models.asset_metadata import AssetMetadata
from app.services.pricing import PricingService
from app.services.asset_metadata_service import build_asset_key
from app.schemas.portfolio import AssetResponse, AssetSourceBreakdown

logger = get_logger()


def _latest_active_plaid_item_by_institution(account_map: dict) -> dict[str, str | None]:
    """Pick the newest active Plaid item per institution for aggregation."""
    plaid_accounts = [
        account
        for account in account_map.values()
        if getattr(account, "provider", None) == "plaid"
        and getattr(account, "institution_id", None)
        and getattr(account, "is_active", False)
    ]
    plaid_accounts.sort(
        key=lambda account: (
            getattr(account, "updated_at", None) or getattr(account, "created_at", None) or datetime.min,
        ),
        reverse=True,
    )

    selected: dict[str, str | None] = {}
    for account in plaid_accounts:
        institution_id = getattr(account, "institution_id", None)
        if institution_id and institution_id not in selected:
            selected[institution_id] = getattr(account, "item_id", None)
    return selected


def _filter_holdings_for_aggregation(holdings, account_map: dict) -> list:
    """Exclude holdings from inactive accounts and older duplicate Plaid items."""
    latest_item_by_institution = _latest_active_plaid_item_by_institution(account_map)
    filtered = []
    plaid_depository_cash_candidates: dict[object, list] = defaultdict(list)
    for holding in holdings:
        account = account_map.get(holding.account_id)
        if not account or not getattr(account, "is_active", False):
            continue

        if getattr(account, "provider", None) == "plaid" and getattr(account, "institution_id", None):
            selected_item_id = latest_item_by_institution.get(account.institution_id)
            if selected_item_id is not None and getattr(account, "item_id", None) != selected_item_id:
                continue

        if (
            getattr(account, "provider", None) == "plaid"
            and getattr(account, "account_type", None) == "depository"
            and getattr(holding, "asset_class", None) == "cash_equivalent"
        ):
            plaid_depository_cash_candidates[account.id].append(holding)
            continue

        filtered.append(holding)

    for account_id, candidates in plaid_depository_cash_candidates.items():
        preferred = next(
            (holding for holding in candidates if (getattr(holding, "canonical_symbol", "") or "").upper() == "USD"),
            candidates[0],
        )
        filtered.append(preferred)
    return filtered


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
        
        # Fetch holdings only from active accounts.
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

        t_holdings = time.time()
        stmt = (
            select(Holding)
            .join(Account, Holding.account_id == Account.id)
            .where(
                Holding.user_id.in_(user_id_uuids),
                Account.user_id.in_(user_id_uuids),
                Account.is_active == True,
            )
        )
        result = await self.db.execute(stmt)
        holdings = result.scalars().all()
        t_holdings_ms = round((time.time() - t_holdings) * 1000)
        timing_log(endpoint="AGGREGATION", step="fetch_holdings", duration_ms=t_holdings_ms, module="aggregation.py", holding_count=len(holdings))

        if not holdings:
            timing_log(endpoint="AGGREGATION", step="fetch_holdings", duration_ms=0, module="aggregation.py", detail="No holdings found - returning empty portfolio", holding_count=0)
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

        # Log each holding (debug level for selectivity)
        for h in holdings:
            logger.debug("aggregation_holding_detail", symbol=h.canonical_symbol, quantity=str(h.quantity), asset_class=h.asset_class, source=h.source, account_id=str(h.account_id)[:8])

        # Collect unique account IDs and group holdings
        unique_account_ids = set()
        for holding in holdings:
            unique_account_ids.add(holding.account_id)

        # Batch fetch all accounts in a single query
        t_accounts = time.time()
        account_map = {}
        if unique_account_ids:
            account_stmt = select(Account).where(Account.id.in_(list(unique_account_ids)))
            account_result = await self.db.execute(account_stmt)
            for account in account_result.scalars().all():
                account_map[account.id] = account
        t_accounts_ms = round((time.time() - t_accounts) * 1000)
        timing_log(endpoint="AGGREGATION", step="fetch_accounts", duration_ms=t_accounts_ms, module="aggregation.py", account_count=len(account_map))
        for acc in account_map.values():
            logger.debug("aggregation_account_detail", name=acc.name, provider=acc.provider, account_type=acc.account_type or "N/A")

        holdings = _filter_holdings_for_aggregation(holdings, account_map)

        # Rebuild symbol groups after filtering inactive/older duplicate items.
        symbol_groups = defaultdict(list)
        unique_account_ids = set()
        for holding in holdings:
            classified = classify_holding(holding)
            symbol_groups[(classified.normalized_symbol, classified.effective_asset_class)].append(holding)
            unique_account_ids.add(holding.account_id)

        # Batch fetch securities to resolve real names and close prices for 24h change
        security_ids = [h.security_id for h in holdings if h.security_id]
        security_map: dict[str, Security] = {}
        if security_ids:
            sec_result = await self.db.execute(
                select(Security).where(Security.security_id.in_(security_ids))
            )
            for sec in sec_result.scalars().all():
                security_map[sec.security_id] = sec

        # Aggregate per symbol
        assets = []
        categories = defaultdict(Decimal)
        all_symbols = [symbol for symbol, _ in symbol_groups.keys()]
        crypto_symbols = {
            symbol.upper()
            for symbol, asset_class in symbol_groups.keys()
            if asset_class == "crypto"
        }

        asset_keys = [
            build_asset_key(asset_class, symbol)
            for symbol, asset_class in symbol_groups.keys()
        ]

        # Fetch prices for all symbols (may upsert prices + crypto asset_metadata)
        t_prices = time.time()
        prices = await self.pricing_service.get_prices_batch(all_symbols, crypto_symbols=crypto_symbols)
        t_prices_ms = round((time.time() - t_prices) * 1000)

        meta_by_key: dict[str, AssetMetadata] = {}
        if asset_keys:
            meta_stmt = select(AssetMetadata).where(AssetMetadata.asset_key.in_(asset_keys))
            meta_result = await self.db.execute(meta_stmt)
            meta_by_key = {m.asset_key: m for m in meta_result.scalars().all()}
        timing_log(endpoint="AGGREGATION", step="fetch_prices", duration_ms=t_prices_ms, module="aggregation.py", price_count=len(prices))
        for sym, price in prices.items():
            logger.debug("aggregation_price_detail", symbol=sym, price_usd=str(price))

        for (symbol, asset_class), symbol_holdings in symbol_groups.items():
            # Sum quantities across all accounts
            total_quantity = sum(holding.quantity for holding in symbol_holdings)

            # Get price — CREDIT-* quantities are already in USD so default to 1
            if symbol.upper().startswith("CREDIT-"):
                price = prices.get(symbol, Decimal("1"))
            else:
                price = prices.get(symbol, Decimal("0"))

            # For investment holdings with institution_value, use it directly
            # when market price is unavailable (stocks, mutual funds, ETFs)
            if price == Decimal("0"):
                for holding in symbol_holdings:
                    if holding.institution_value is not None and holding.quantity and holding.quantity != 0:
                        price = Decimal(str(holding.institution_value)) / Decimal(str(holding.quantity))
                        break

            value_usd = total_quantity * price

            # Resolve security name, display symbol, and 24h change from Security table
            sec = next(
                (security_map[h.security_id] for h in symbol_holdings if h.security_id and h.security_id in security_map),
                None,
            )
            resolved_name = self._get_asset_name(symbol, sec)
            # Use the proper ticker from the Security table when the canonical_symbol
            # is a raw Plaid security_id (no real ticker was available at sync time)
            display_symbol = (sec.ticker_symbol.upper() if sec and sec.ticker_symbol else None) or symbol
            change_24h: float | None = None
            if sec and sec.close_price and price and price > 0:
                try:
                    close = Decimal(str(sec.close_price))
                    if close > 0:
                        change_24h = float((price - close) / close * 100)
                except Exception:
                    pass

            # Get asset class (should be same for all holdings of same symbol)
            # Build source breakdown
            sources = []
            for holding in symbol_holdings:
                account = account_map.get(holding.account_id)
                source_value = holding.quantity * price

                sources.append(AssetSourceBreakdown(
                    source=holding.source,
                    account_id=str(holding.account_id),
                    account_name=self._readable_account_name(account) if account else None,
                    quantity=holding.quantity,
                    value_usd=source_value,
                ))

            # Add to category total
            categories[asset_class] += value_usd

            assets.append(AssetResponse(
                symbol=display_symbol,
                name=resolved_name,
                quantity=total_quantity,
                value_usd=value_usd,
                price_usd=price,
                change_24h=change_24h,
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
    
    def _get_asset_name(self, symbol: str, security: "Security | None" = None) -> str:
        if security and security.name:
            return security.name
        names = {
            "BTC": "Bitcoin",
            "ETH": "Ethereum",
            "USDC": "USD Coin",
            "USDT": "Tether",
            "USD": "US Dollar",
        }
        return names.get(symbol.upper(), symbol.upper())

    @staticmethod
    def _readable_account_name(account: "Account") -> str:
        """Return a human-readable account label from unencrypted fields.

        Account names and masks are encrypted by Supabase column-level encryption;
        only provider, account_type, and subtype remain in plaintext.
        """
        provider_label = {
            "plaid": "Bank",
            "coinbase": "Coinbase",
            "wallet": "Crypto Wallet",
        }.get((account.provider or "").lower(), (account.provider or "Account").title())

        subtype = (account.subtype or "").replace("_", " ").title()
        if subtype and provider_label == "Bank":
            return f"{subtype} Account"
        return provider_label
