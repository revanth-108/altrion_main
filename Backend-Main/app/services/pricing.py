"""
Pricing Service - fetches USD prices from CoinMarketCap
"""
from typing import Dict, Optional
from decimal import Decimal
from datetime import datetime, timezone
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
import httpx
import structlog

from app.models.price import Price
from app.core.config import settings

logger = structlog.get_logger()


class PricingService:
    """Service for fetching and caching asset prices"""
    
    def __init__(self, db: AsyncSession):
        self.db = db
        self.api_key = settings.COINMARKETCAP_API_KEY
        self.use_cmc = bool(self.api_key and not self.api_key.startswith("your-"))
    
    async def get_price(self, canonical_symbol: str) -> Optional[Decimal]:
        """
        Get USD price for a canonical symbol
        
        Args:
            canonical_symbol: Canonical symbol (BTC, ETH, USDC, etc.)
            
        Returns:
            USD price as Decimal, or None if not found
        """
        # First check database cache
        stmt = select(Price).where(Price.canonical_symbol == canonical_symbol.upper())
        result = await self.db.execute(stmt)
        cached_price = result.scalar_one_or_none()
        
        # If cached and recent (within 1 hour), return it
        if cached_price:
            last_updated = cached_price.last_updated
            if last_updated.tzinfo is None:
                last_updated = last_updated.replace(tzinfo=timezone.utc)
            age = datetime.now(timezone.utc) - last_updated
            if age.total_seconds() < 3600:  # 1 hour
                return cached_price.usd_price
        
        # Fetch from CoinMarketCap
        try:
            if self.use_cmc:
                price = await self._fetch_from_coinmarketcap(canonical_symbol)
            else:
                price = await self._fetch_from_coingecko(canonical_symbol)
            
            if price:
                # Update or create price record
                if cached_price:
                    cached_price.usd_price = price
                    cached_price.last_updated = datetime.utcnow()
                else:
                    new_price = Price(
                        id=canonical_symbol.upper(),
                        canonical_symbol=canonical_symbol.upper(),
                        usd_price=price,
                        source="coinmarketcap",
                    )
                    self.db.add(new_price)
                
                await self.db.commit()
                return price
        except Exception as e:
            logger.error("Failed to fetch price", error=str(e), symbol=canonical_symbol)
            # Return cached price if available, even if stale
            if cached_price:
                return cached_price.usd_price
        
        return None
    
    async def _fetch_from_coinmarketcap(self, symbol: str) -> Optional[Decimal]:
        """Fetch price from CoinMarketCap API"""
        # Map symbol to CoinMarketCap symbol
        symbol_map = {
            "BTC": "BTC",
            "ETH": "ETH",
            "USDC": "USDC",
            "USDT": "USDT",
            # Add more mappings as needed
        }
        
        cmc_symbol = symbol_map.get(symbol.upper(), symbol.upper())
        
        async with httpx.AsyncClient() as client:
            response = await client.get(
                "https://pro-api.coinmarketcap.com/v1/cryptocurrency/quotes/latest",
                params={
                    "symbol": cmc_symbol,
                    "convert": "USD",
                },
                headers={
                    "X-CMC_PRO_API_KEY": self.api_key,
                },
                timeout=10.0,
            )
            
            if response.status_code == 200:
                data = response.json()
                quote = data.get("data", {}).get(cmc_symbol, {}).get("quote", {}).get("USD", {})
                price = quote.get("price")
                
                if price:
                    return Decimal(str(price))
            
            logger.warning("CoinMarketCap API returned non-200", status=response.status_code, symbol=symbol)
            return None

    async def _fetch_from_coingecko(self, symbol: str) -> Optional[Decimal]:
        """Fetch price from CoinGecko API (no key required)"""
        symbol_map = {
            "BTC": "bitcoin",
            "ETH": "ethereum",
            "USDC": "usd-coin",
            "USDT": "tether",
            "ADA": "cardano",
            "SOL": "solana",
            "DOT": "polkadot",
            "MATIC": "matic-network",
            "AVAX": "avalanche-2",
            "LINK": "chainlink",
        }

        coingecko_id = symbol_map.get(symbol.upper())
        if not coingecko_id:
            return None

        async with httpx.AsyncClient() as client:
            response = await client.get(
                "https://api.coingecko.com/api/v3/simple/price",
                params={
                    "ids": coingecko_id,
                    "vs_currencies": "usd",
                },
                timeout=10.0,
            )

            if response.status_code == 200:
                data = response.json()
                price = data.get(coingecko_id, {}).get("usd")
                if price:
                    return Decimal(str(price))

            logger.warning("CoinGecko API returned non-200", status=response.status_code, symbol=symbol)
            return None
    
    async def get_prices_batch(self, symbols: list[str]) -> Dict[str, Decimal]:
        """Get prices for multiple symbols (optimized batch API call)"""
        if not symbols:
            return {}
        
        prices = {}
        
        # First check database cache for all symbols
        symbols_to_fetch = []
        for symbol in symbols:
            symbol_upper = symbol.upper()
            stmt = select(Price).where(Price.canonical_symbol == symbol_upper)
            result = await self.db.execute(stmt)
            cached_price = result.scalar_one_or_none()
            
            if cached_price:
                last_updated = cached_price.last_updated
                if last_updated.tzinfo is None:
                    last_updated = last_updated.replace(tzinfo=timezone.utc)
                age = datetime.now(timezone.utc) - last_updated
                if age.total_seconds() < 3600:  # 1 hour
                    prices[symbol_upper] = cached_price.usd_price
                else:
                    symbols_to_fetch.append(symbol_upper)
            else:
                symbols_to_fetch.append(symbol_upper)
        
        # Fetch missing/stale prices from CoinMarketCap in batch
        if symbols_to_fetch:
            try:
                if self.use_cmc:
                    batch_prices = await self._fetch_batch_from_coinmarketcap(symbols_to_fetch)
                else:
                    batch_prices = await self._fetch_batch_from_coingecko(symbols_to_fetch)
                
                # Update database with fetched prices
                for symbol, price in batch_prices.items():
                    prices[symbol] = price
                    
                    # Update or create price record
                    stmt = select(Price).where(Price.canonical_symbol == symbol)
                    result = await self.db.execute(stmt)
                    cached_price = result.scalar_one_or_none()
                    
                    if cached_price:
                        cached_price.usd_price = price
                        cached_price.last_updated = datetime.utcnow()
                    else:
                        new_price = Price(
                            id=symbol,
                            canonical_symbol=symbol,
                            usd_price=price,
                            source="coinmarketcap",
                        )
                        self.db.add(new_price)
                
                await self.db.commit()
            except Exception as e:
                logger.error("Failed to fetch batch prices", error=str(e), symbols=symbols_to_fetch)
                # Return cached prices even if stale
                for symbol in symbols_to_fetch:
                    stmt = select(Price).where(Price.canonical_symbol == symbol)
                    result = await self.db.execute(stmt)
                    cached_price = result.scalar_one_or_none()
                    if cached_price and symbol not in prices:
                        prices[symbol] = cached_price.usd_price
        
        return prices
    
    async def _fetch_batch_from_coinmarketcap(self, symbols: list[str]) -> Dict[str, Decimal]:
        """Fetch prices for multiple symbols from CoinMarketCap in a single API call"""
        # Map symbols to CoinMarketCap symbols
        symbol_map = {
            "BTC": "BTC",
            "ETH": "ETH",
            "USDC": "USDC",
            "USDT": "USDT",
            # Add more mappings as needed
        }
        
        cmc_symbols = [symbol_map.get(s.upper(), s.upper()) for s in symbols]
        symbols_str = ",".join(cmc_symbols)
        
        async with httpx.AsyncClient() as client:
            response = await client.get(
                "https://pro-api.coinmarketcap.com/v1/cryptocurrency/quotes/latest",
                params={
                    "symbol": symbols_str,
                    "convert": "USD",
                },
                headers={
                    "X-CMC_PRO_API_KEY": self.api_key,
                },
                timeout=10.0,
            )
            
            if response.status_code == 200:
                data = response.json()
                prices = {}
                
                for symbol in cmc_symbols:
                    quote = data.get("data", {}).get(symbol, {}).get("quote", {}).get("USD", {})
                    price = quote.get("price")
                    
                    if price:
                        # Map back to canonical symbol
                        canonical_symbol = symbol.upper()
                        prices[canonical_symbol] = Decimal(str(price))
                
                return prices
            
            logger.warning("CoinMarketCap API returned non-200", status=response.status_code, symbols=symbols_str)
            return {}

    async def _fetch_batch_from_coingecko(self, symbols: list[str]) -> Dict[str, Decimal]:
        """Fetch prices for multiple symbols from CoinGecko in a single API call"""
        symbol_map = {
            "BTC": "bitcoin",
            "ETH": "ethereum",
            "USDC": "usd-coin",
            "USDT": "tether",
            "ADA": "cardano",
            "SOL": "solana",
            "DOT": "polkadot",
            "MATIC": "matic-network",
            "AVAX": "avalanche-2",
            "LINK": "chainlink",
        }

        ids = [symbol_map.get(symbol.upper()) for symbol in symbols]
        ids = [i for i in ids if i]
        if not ids:
            return {}

        async with httpx.AsyncClient() as client:
            response = await client.get(
                "https://api.coingecko.com/api/v3/simple/price",
                params={
                    "ids": ",".join(ids),
                    "vs_currencies": "usd",
                },
                timeout=10.0,
            )

            if response.status_code == 200:
                data = response.json()
                prices: Dict[str, Decimal] = {}
                for symbol, cg_id in symbol_map.items():
                    if cg_id in data:
                        price = data[cg_id].get("usd")
                        if price:
                            prices[symbol] = Decimal(str(price))
                return prices

            logger.warning("CoinGecko API returned non-200", status=response.status_code, symbols=",".join(symbols))
            return {}
