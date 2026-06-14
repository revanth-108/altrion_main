"""
Pricing Service - fetches USD prices from CoinMarketCap / CoinGecko
"""
from __future__ import annotations

import asyncio
from datetime import datetime, timezone
from decimal import Decimal
from typing import Dict, Optional, Set

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.logging import get_logger
from app.core.config import settings
from app.models.price import Price
from app.services.asset_metadata_service import AssetMetadataService

logger = get_logger()


class PricingService:
    """Service for fetching and caching asset prices"""

    def __init__(self, db: AsyncSession):
        self.db = db
        self.api_key = settings.COINMARKETCAP_API_KEY
        self.use_cmc = bool(self.api_key and not self.api_key.startswith("your-"))

    async def get_price(self, canonical_symbol: str) -> Optional[Decimal]:
        """Get USD price for a canonical symbol. Does not upsert crypto metadata (unknown asset class)."""
        sym = canonical_symbol.upper()
        out = await self.get_prices_batch([sym], crypto_symbols=None)
        return out.get(sym)

    async def _fetch_batch_from_coinmarketcap(
        self, symbols: list[str]
    ) -> tuple[Dict[str, Decimal], Dict[str, str]]:
        """Returns (prices by canonical symbol upper, display names from CMC when present)."""
        symbol_map = {
            "BTC": "BTC",
            "ETH": "ETH",
            "USDC": "USDC",
            "USDT": "USDT",
        }
        cmc_symbols = [symbol_map.get(s.upper(), s.upper()) for s in symbols]
        symbols_str = ",".join(cmc_symbols)
        prices: Dict[str, Decimal] = {}
        names: Dict[str, str] = {}

        async with httpx.AsyncClient(timeout=8.0) as client:
            response = await client.get(
                "https://pro-api.coinmarketcap.com/v1/cryptocurrency/quotes/latest",
                params={
                    "symbol": symbols_str,
                    "convert": "USD",
                },
                headers={
                    "X-CMC_PRO_API_KEY": self.api_key,
                },
            )

            if response.status_code == 200:
                data = response.json().get("data") or {}
                for symbol in cmc_symbols:
                    coin_data = data.get(symbol) or {}
                    quote = coin_data.get("quote", {}).get("USD", {})
                    price = quote.get("price")
                    if price:
                        canonical = symbol.upper()
                        prices[canonical] = Decimal(str(price))
                        nm = coin_data.get("name")
                        if nm:
                            names[canonical] = nm
            else:
                logger.warning(
                    "CoinMarketCap API returned non-200",
                    status=response.status_code,
                    symbols=symbols_str,
                )

        return prices, names

    async def _coingecko_resolve(self, symbol: str) -> Optional[tuple[str, str]]:
        """Return (coingecko_id, display_name) using /search."""
        q = symbol.upper()
        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                response = await client.get(
                    "https://api.coingecko.com/api/v3/search",
                    params={"query": q},
                )
            if response.status_code != 200:
                logger.warning("CoinGecko search non-200", status=response.status_code, symbol=q)
                return None
            coins = response.json().get("coins") or []
            for c in coins:
                if (c.get("symbol") or "").upper() == q:
                    return c["id"], c.get("name") or q
            if coins:
                c = coins[0]
                return c["id"], c.get("name") or q
        except Exception as exc:
            logger.warning("CoinGecko search failed", symbol=q, error=str(exc))
        return None

    async def _coingecko_simple_price_ids(self, ids: list[str]) -> Dict[str, Decimal]:
        """Map coingecko id -> USD price."""
        if not ids:
            return {}
        out: Dict[str, Decimal] = {}
        async with httpx.AsyncClient(timeout=12.0) as client:
            response = await client.get(
                "https://api.coingecko.com/api/v3/simple/price",
                params={
                    "ids": ",".join(ids),
                    "vs_currencies": "usd",
                },
            )
        if response.status_code != 200:
            logger.warning("CoinGecko simple/price non-200", status=response.status_code)
            return out
        data = response.json()
        for cg_id in ids:
            usd = (data.get(cg_id) or {}).get("usd")
            if usd is not None:
                out[cg_id] = Decimal(str(usd))
        return out

    _CG_STATIC_MAP = {
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

    async def _fetch_batch_from_coingecko(
        self, symbols: list[str]
    ) -> tuple[Dict[str, Decimal], Dict[str, dict]]:
        """
        Fetch prices; second dict maps canonical symbol -> metadata hints for crypto upsert.
        """
        prices: Dict[str, Decimal] = {}
        hints: Dict[str, dict] = {}
        upper = [s.upper() for s in symbols]

        known: list[tuple[str, str]] = []
        unknown: list[str] = []
        for s in upper:
            cg_id = self._CG_STATIC_MAP.get(s)
            if cg_id:
                known.append((s, cg_id))
                hints[s] = {
                    "display_name": None,
                    "coingecko_id": cg_id,
                    "metadata_source": "coingecko",
                }
            else:
                unknown.append(s)

        if known:
            id_to_symbols: Dict[str, list[str]] = {}
            for sym, cg_id in known:
                id_to_symbols.setdefault(cg_id, []).append(sym)
            id_prices = await self._coingecko_simple_price_ids(list(id_to_symbols.keys()))
            for cg_id, syms in id_to_symbols.items():
                p = id_prices.get(cg_id)
                if p is not None:
                    for sym in syms:
                        prices[sym] = p

        if not unknown:
            return prices, hints

        sem = asyncio.Semaphore(4)

        async def resolve_one(sym: str) -> None:
            async with sem:
                resolved = await self._coingecko_resolve(sym)
                if not resolved:
                    return
                cg_id, display_name = resolved
                id_prices = await self._coingecko_simple_price_ids([cg_id])
                p = id_prices.get(cg_id)
                if p is None:
                    return
                prices[sym] = p
                hints[sym] = {
                    "display_name": display_name,
                    "coingecko_id": cg_id,
                    "metadata_source": "coingecko",
                }

        await asyncio.gather(*[resolve_one(s) for s in unknown])
        return prices, hints

    async def get_prices_batch(
        self,
        symbols: list[str],
        crypto_symbols: Optional[Set[str]] = None,
    ) -> Dict[str, Decimal]:
        """Get prices for multiple symbols. Optionally persist crypto metadata after external fetch."""
        if not symbols:
            return {}

        prices: Dict[str, Decimal] = {}

        # Pegged assets: fixed USD price; persisted when missing so `prices` stays useful if APIs fail.
        STATIC_PRICES = {
            "USD": Decimal("1"),
            "USDC": Decimal("1"),
            "USDT": Decimal("1"),
            "DAI": Decimal("1"),
        }
        upper_symbols_set = {s.upper() for s in symbols}
        for sym, price in STATIC_PRICES.items():
            if sym in upper_symbols_set:
                prices[sym.upper()] = price

        upper_symbols = [s.upper() for s in symbols]
        stmt = select(Price).where(Price.canonical_symbol.in_(upper_symbols))
        result = await self.db.execute(stmt)
        cached_prices = {p.canonical_symbol: p for p in result.scalars().all()}

        symbols_to_fetch: list[str] = []
        static_missing_in_db: list[str] = []
        for symbol_upper in upper_symbols:
            cached_price = cached_prices.get(symbol_upper)
            if cached_price:
                last_updated = cached_price.last_updated
                if last_updated.tzinfo is None:
                    last_updated = last_updated.replace(tzinfo=timezone.utc)
                age = datetime.now(timezone.utc) - last_updated
                if age.total_seconds() < 3600:
                    prices[symbol_upper] = cached_price.usd_price
                else:
                    symbols_to_fetch.append(symbol_upper)
            elif symbol_upper in STATIC_PRICES:
                prices[symbol_upper] = STATIC_PRICES[symbol_upper]
                static_missing_in_db.append(symbol_upper)
            else:
                symbols_to_fetch.append(symbol_upper)

        if static_missing_in_db:
            for sym in static_missing_in_db:
                self.db.add(
                    Price(
                        id=sym,
                        canonical_symbol=sym,
                        usd_price=STATIC_PRICES[sym],
                        source="internal",
                    )
                )
            await self.db.commit()

        if not symbols_to_fetch:
            return prices

        crypto_set = {s.upper() for s in crypto_symbols} if crypto_symbols else set()
        src = "coinmarketcap" if self.use_cmc else "coingecko"

        try:
            if self.use_cmc:
                fetched_from_api, cmc_names = await self._fetch_batch_from_coinmarketcap(symbols_to_fetch)
                metadata_hints = {
                    sym: {
                        "display_name": cmc_names.get(sym),
                        "coingecko_id": None,
                        "metadata_source": "coinmarketcap",
                    }
                    for sym in fetched_from_api
                }
            else:
                fetched_from_api, cg_hints = await self._fetch_batch_from_coingecko(symbols_to_fetch)
                metadata_hints = dict(cg_hints)

            if not fetched_from_api:
                return prices

            meta_service = AssetMetadataService(self.db)

            for symbol, price in fetched_from_api.items():
                prices[symbol] = price

                stmt = select(Price).where(Price.canonical_symbol == symbol)
                result = await self.db.execute(stmt)
                cached_row = result.scalar_one_or_none()

                if cached_row:
                    cached_row.usd_price = price
                    cached_row.last_updated = datetime.utcnow()
                    cached_row.source = src
                else:
                    self.db.add(
                        Price(
                            id=symbol,
                            canonical_symbol=symbol,
                            usd_price=price,
                            source=src,
                        )
                    )

                hint = metadata_hints.get(symbol)
                if (
                    crypto_set
                    and symbol in crypto_set
                    and hint
                ):
                    await meta_service.upsert_minimal_crypto_metadata(
                        symbol,
                        display_name=hint.get("display_name"),
                        coingecko_id=hint.get("coingecko_id"),
                        metadata_source=hint["metadata_source"],
                    )

            await self.db.commit()
        except Exception as e:
            logger.error("Failed to fetch batch prices", error=str(e), symbols=symbols_to_fetch)
            for symbol in symbols_to_fetch:
                stmt = select(Price).where(Price.canonical_symbol == symbol)
                result = await self.db.execute(stmt)
                cached_price = result.scalar_one_or_none()
                if cached_price and symbol not in prices:
                    prices[symbol] = cached_price.usd_price

        return prices
