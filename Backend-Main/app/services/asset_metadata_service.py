"""
Asset metadata enrichment and cache management.

Enrichment strategy for equities (in order of preference):
  1. FMP /profile/{symbol}          — works for standard tickers (AAPL, SBSI, CAMYX)
  2. FMP /search?query={name}        — resolves non-standard fund codes via security name
  3. FMP /search?query={symbol}      — last-resort symbol search
  4. Plaid securities table fallback — name + type only, status=partial
  5. Internal stub                   — status=missing

For crypto:
  1. CoinGecko (existing logic, unchanged)
  2. Internal category map fallback
"""
from __future__ import annotations

import asyncio
from datetime import datetime, timedelta, timezone
from typing import Any

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.logging import get_logger
from app.models.asset_metadata import AssetMetadata
from app.models.security import Security

logger = get_logger()

# ── Crypto lookup maps ────────────────────────────────────────────────────────
STABLECOINS = {"USDC", "USDT", "DAI", "PYUSD", "BUSD", "TUSD", "GUSD", "LUSD", "FRAX"}
CRYPTO_CATEGORY_MAP = {
    "BTC": {"category": "Store of Value", "tags": ["Bitcoin", "Store of Value"]},
    "ETH": {"category": "Smart Contract Layer", "tags": ["Layer 1", "Smart Contract Platform"]},
    "USDC": {"category": "Stablecoin", "tags": ["Stablecoin"]},
    "USDT": {"category": "Stablecoin", "tags": ["Stablecoin"]},
    "DAI": {"category": "Stablecoin", "tags": ["Stablecoin", "DeFi"]},
    "SOL": {"category": "Layer 1", "tags": ["Layer 1"]},
    "ADA": {"category": "Layer 1", "tags": ["Layer 1"]},
    "AVAX": {"category": "Layer 1", "tags": ["Layer 1"]},
    "MATIC": {"category": "Layer 2", "tags": ["Layer 2"]},
    "ARB": {"category": "Layer 2", "tags": ["Layer 2"]},
    "OP": {"category": "Layer 2", "tags": ["Layer 2"]},
    "DOGE": {"category": "Memecoin", "tags": ["Memecoin"]},
    "SHIB": {"category": "Memecoin", "tags": ["Memecoin"]},
}
COINGECKO_ID_MAP = {
    "BTC": "bitcoin",
    "ETH": "ethereum",
    "USDC": "usd-coin",
    "USDT": "tether",
    "DAI": "dai",
    "SOL": "solana",
    "ADA": "cardano",
    "AVAX": "avalanche-2",
    "MATIC": "matic-network",
    "ARB": "arbitrum",
    "OP": "optimism",
    "DOGE": "dogecoin",
    "SHIB": "shiba-inu",
}


# ── Helpers ───────────────────────────────────────────────────────────────────
def build_asset_key(asset_class: str, canonical_symbol: str) -> str:
    prefix = "stock" if asset_class == "equity" else "cash" if asset_class == "cash_equivalent" else "crypto"
    return f"{prefix}:{canonical_symbol.upper()}"


def build_asset_key_for_bucket(bucket: str, canonical_symbol: str) -> str:
    prefix = "stock" if bucket == "stocks" else "cash" if bucket == "cash" else "crypto"
    return f"{prefix}:{canonical_symbol.upper()}"


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _is_non_standard_code(symbol: str) -> bool:
    """Return True for internal fund codes that aren't exchange tickers (e.g. NHX105509)."""
    return len(symbol) > 8 or any(c.isdigit() for c in symbol[:3])


# ── FMP helpers (raw httpx, no FMPService import to avoid circular) ───────────
# /api/v3 and /api/v4 are "Legacy" endpoints blocked for subscriptions after
# August 2025.  Only /stable/ endpoints work on the current plan.
# Confirmed working: /stable/profile, /stable/historical-price-eod/full
_FMP_STABLE = "https://financialmodelingprep.com/stable"
_FMP_TIMEOUT = 12


async def _fmp_stable_get(endpoint: str, **params) -> Any:
    """GET from FMP /stable/ with the configured API key. Returns parsed JSON or None."""
    if not settings.FMP_API_KEY:
        return None
    try:
        async with httpx.AsyncClient(timeout=_FMP_TIMEOUT) as client:
            r = await client.get(
                f"{_FMP_STABLE}/{endpoint}",
                params={"apikey": settings.FMP_API_KEY, **params},
            )
            if r.status_code in (402, 403, 401):
                logger.warning("fmp_stable_restricted", endpoint=endpoint, status=r.status_code)
                return None
            if r.status_code == 404 or not r.text or r.text.strip() in ("[]", "{}"):
                return None
            r.raise_for_status()
            return r.json()
    except Exception as exc:
        logger.warning("fmp_stable_request_failed", endpoint=endpoint, error=str(exc))
        return None


def _parse_fmp_profile(profile: dict) -> dict[str, Any]:
    """Convert a raw FMP /stable/profile dict into the metadata payload we store.

    Field name differences vs legacy /v3/profile:
      stable: marketCap     v3: mktCap
      stable: averageVolume v3: volAvg
      stable: exchange      v3: exchangeShortName  (stable also has exchangeFullName)
      stable: lastDividend  v3: lastDiv
    Both sets of names are checked so existing cached records stay compatible.
    """
    is_etf = bool(profile.get("isEtf"))
    is_fund = bool(profile.get("isFund")) and not is_etf
    sector = profile.get("sector") or ("Funds / ETFs" if is_etf else ("Funds / ETFs" if is_fund else "Unknown"))
    tags = [t for t in [profile.get("sector"), profile.get("industry")] if t]

    return {
        "display_name": profile.get("companyName") or profile.get("symbol"),
        "description": (profile.get("description") or "")[:2000] or None,
        "image_url": profile.get("image"),
        "website": profile.get("website"),
        "metadata_source": "fmp",
        "metadata_status": "ready",
        "sector": sector,
        "industry": profile.get("industry"),
        "country": profile.get("country"),
        # stable uses "exchange"; v3 used "exchangeShortName"
        "exchange": profile.get("exchange") or profile.get("exchangeShortName"),
        "cik": profile.get("cik"),
        "isin": profile.get("isin"),
        "fmp_symbol": profile.get("symbol"),
        # stable uses "marketCap"; v3 used "mktCap"
        "market_cap": profile.get("marketCap") or profile.get("mktCap"),
        "beta": profile.get("beta"),
        # stable uses "averageVolume"; v3 used "volAvg"
        "vol_avg": profile.get("averageVolume") or profile.get("volAvg"),
        "is_etf": is_etf,
        "is_fund": is_fund,
        "tags_json": tags,
        "raw_payload_json": {
            k: profile[k]
            for k in (
                "symbol", "companyName", "sector", "industry", "country",
                "exchange", "exchangeFullName", "marketCap", "beta", "averageVolume",
                "isEtf", "isFund", "cik", "isin", "image", "website",
                "price", "lastDividend", "range", "volume",
                # v3 legacy keys kept for backwards compat with any cached records
                "exchangeShortName", "mktCap", "volAvg", "lastDiv",
                "pe", "eps", "dcf", "priceAvg50", "priceAvg200", "yearHigh", "yearLow",
            )
            if k in profile and profile[k] is not None
        },
    }


async def _fmp_profile(symbol: str) -> dict | None:
    """Fetch company profile from FMP /stable/profile."""
    data = await _fmp_stable_get("profile", symbol=symbol)
    if not data or not isinstance(data, list):
        return None
    return _parse_fmp_profile(data[0]) if data else None


async def _fmp_search_best(query: str, limit: int = 5) -> dict | None:
    """Search FMP for the best matching profile.

    /stable/search currently returns empty results — fall back to fetching
    the profile directly if the query looks like a ticker symbol.
    """
    # Try direct profile lookup first (works for standard tickers)
    clean = query.strip().upper()
    if clean and len(clean) <= 6 and clean.isalpha():
        result = await _fmp_profile(clean)
        if result:
            return result
    return None


# ── Main service ──────────────────────────────────────────────────────────────
class AssetMetadataService:
    def __init__(self, db: AsyncSession):
        self.db = db

    # ── Public API ─────────────────────────────────────────────────────────────
    async def upsert_minimal_crypto_metadata(
        self,
        canonical_symbol: str,
        *,
        display_name: str | None,
        coingecko_id: str | None,
        metadata_source: str,
    ) -> None:
        """Persist or enrich a crypto metadata row after a live price fetch. No commit."""
        sym = canonical_symbol.upper()
        asset_key = build_asset_key("crypto", sym)
        stmt = select(AssetMetadata).where(AssetMetadata.asset_key == asset_key)
        result = await self.db.execute(stmt)
        record = result.scalar_one_or_none()
        now = _utcnow()
        ttl = timedelta(hours=settings.ASSET_METADATA_CRYPTO_TTL_HOURS)
        refresh_after = now + ttl
        has_label = bool(display_name and display_name.strip() and display_name.strip().upper() != sym)
        status = "ready" if (has_label or coingecko_id) else "partial"
        label = display_name.strip() if display_name and display_name.strip() else sym

        if record is None:
            self.db.add(AssetMetadata(
                asset_key=asset_key,
                canonical_symbol=sym,
                asset_class="crypto",
                display_name=label,
                metadata_source=metadata_source,
                metadata_status=status,
                coingecko_id=coingecko_id,
                first_seen_at=now,
                last_refreshed_at=now,
                refresh_after=refresh_after,
            ))
            return

        updated = False
        if coingecko_id and not record.coingecko_id:
            record.coingecko_id = coingecko_id
            updated = True
        if has_label and (not record.display_name or record.display_name.upper() == sym):
            record.display_name = label
            updated = True
        if updated:
            record.metadata_source = metadata_source
            record.metadata_status = status
            record.last_refreshed_at = now
            record.refresh_after = refresh_after

    async def get_many(self, assets: list[dict[str, Any]]) -> dict[str, AssetMetadata]:
        """
        Optimised batch fetch.

        Old approach (O(n) DB round-trips + sequential FMP calls):
          for asset in assets:
              await get_or_refresh(asset)    # 1 SELECT + maybe 1 FMP call + 1 COMMIT each

        New approach (3 DB round-trips total + parallel FMP calls):
          1. One  SELECT … WHERE asset_key IN (all_keys)        → load cached
          2. One  SELECT … WHERE ticker_symbol IN (stale_syms)  → Plaid Security fallback
          3. asyncio.gather(*[_fetch_metadata(...) for stale])  → parallel FMP / CoinGecko
          4. Apply payloads to records in-process (no extra I/O)
          5. One  COMMIT                                        → write all at once
        """
        if not assets:
            return {}

        # ── Build key list ────────────────────────────────────────────────────
        keyed: list[tuple[str, dict]] = []
        for asset in assets:
            key = asset.get("asset_key") or build_asset_key(
                asset.get("metadata_asset_class", asset["asset_class"]),
                asset["canonical_symbol"],
            )
            keyed.append((key, asset))
        all_keys = [k for k, _ in keyed]

        # ── 1. One batch SELECT for all cached records ────────────────────────
        stmt = select(AssetMetadata).where(AssetMetadata.asset_key.in_(all_keys))
        result = await self.db.execute(stmt)
        existing: dict[str, AssetMetadata] = {r.asset_key: r for r in result.scalars().all()}

        # ── 2. Identify stale / missing ───────────────────────────────────────
        stale: list[tuple[str, dict]] = [
            (key, asset)
            for key, asset in keyed
            if key not in existing or self._is_stale(existing[key])
        ]

        if not stale:
            # All fresh — return immediately (single DB round-trip total)
            return {key: existing[key] for key, _ in keyed}

        # ── 3. Batch load Plaid Security records for stale equities ──────────
        stale_equity_syms: list[str] = []
        stale_security_ids: list[str] = []
        for _, asset in stale:
            cls = asset.get("metadata_asset_class", asset["asset_class"])
            if cls == "equity":
                stale_equity_syms.append(asset["canonical_symbol"].upper())
                if asset.get("security_id"):
                    stale_security_ids.append(asset["security_id"])

        sec_by_ticker: dict[str, Any] = {}
        sec_by_id: dict[str, Any] = {}
        if stale_equity_syms:
            sec_stmt = select(Security).where(Security.ticker_symbol.in_(stale_equity_syms))
            sec_result = await self.db.execute(sec_stmt)
            sec_by_ticker = {s.ticker_symbol: s for s in sec_result.scalars().all()}
        if stale_security_ids:
            id_stmt = select(Security).where(Security.security_id.in_(stale_security_ids))
            id_result = await self.db.execute(id_stmt)
            sec_by_id = {s.security_id: s for s in id_result.scalars().all()}

        # ── 4. Parallel FMP / CoinGecko fetches (pure HTTP, no DB I/O) ───────
        fetch_results = await asyncio.gather(
            *[
                self._fetch_metadata_no_db(asset, sec_by_ticker, sec_by_id)
                for _, asset in stale
            ],
            return_exceptions=True,
        )

        # ── 5. Apply payloads → records (synchronous session ops) ─────────────
        now = _utcnow()
        for (key, asset), payload in zip(stale, fetch_results):
            if isinstance(payload, BaseException):
                logger.warning(
                    "metadata_fetch_error", key=key,
                    error=str(payload),
                )
                continue
            cls = asset.get("metadata_asset_class", asset["asset_class"])
            ttl = self._ttl_for(cls, payload.get("metadata_status", "missing"))
            record = existing.get(key)
            if record is None:
                record = AssetMetadata(
                    asset_key=key,
                    canonical_symbol=asset["canonical_symbol"].upper(),
                    asset_class=cls,
                    first_seen_at=now,
                )
                self.db.add(record)
                existing[key] = record

            record.display_name = payload.get("display_name")
            record.description = payload.get("description")
            record.image_url = payload.get("image_url")
            record.website = payload.get("website")
            record.metadata_source = payload.get("metadata_source", "internal")
            record.metadata_status = payload.get("metadata_status", "missing")
            record.sector = payload.get("sector")
            record.industry = payload.get("industry")
            record.country = payload.get("country")
            record.exchange = payload.get("exchange")
            record.cik = payload.get("cik")
            record.isin = payload.get("isin")
            record.coingecko_id = payload.get("coingecko_id")
            record.fmp_symbol = payload.get("fmp_symbol")
            record.market_cap = payload.get("market_cap")
            record.beta = payload.get("beta")
            record.vol_avg = payload.get("vol_avg")
            record.is_etf = bool(payload.get("is_etf", False))
            record.is_fund = bool(payload.get("is_fund", False))
            record.tags_json = payload.get("tags_json")
            record.raw_payload_json = payload.get("raw_payload_json")
            record.last_refreshed_at = now
            record.refresh_after = now + ttl

        # ── 6. One commit for all refreshed records ───────────────────────────
        try:
            await self.db.commit()
        except Exception as exc:
            await self.db.rollback()
            logger.error("metadata_batch_commit_failed", error=str(exc))

        # Return — create minimal stub for anything still missing
        output: dict[str, AssetMetadata] = {}
        for key, asset in keyed:
            record = existing.get(key)
            if record is None:
                record = AssetMetadata(
                    asset_key=key,
                    canonical_symbol=asset["canonical_symbol"].upper(),
                    asset_class=asset.get("metadata_asset_class", asset["asset_class"]),
                    display_name=asset.get("display_name") or asset["canonical_symbol"],
                    metadata_status="missing",
                )
            output[key] = record
        return output

    async def _fetch_metadata_no_db(
        self,
        asset: dict[str, Any],
        sec_by_ticker: dict[str, Any],
        sec_by_id: dict[str, Any],
    ) -> dict[str, Any]:
        """
        Pure HTTP fetch — no SQLAlchemy I/O — safe for asyncio.gather concurrency.
        Uses pre-loaded Security dicts instead of querying the DB.
        """
        sym = asset["canonical_symbol"].upper()
        cls = asset.get("metadata_asset_class", asset["asset_class"])

        if cls == "cash_equivalent":
            return await self._fetch_metadata(sym, cls)

        if cls == "equity":
            # Resolve Plaid Security from pre-loaded maps
            security = (
                sec_by_id.get(asset.get("security_id", ""))
                or sec_by_ticker.get(sym)
            )
            # Build fallback without DB
            name = security.name if security else sym
            sec_type = (security.type if security else "") or ""
            stl = sec_type.lower()
            is_etf_flag = "etf" in stl
            is_fund_flag = ("mutual fund" in stl or "fund" in stl) and not is_etf_flag
            sector_fb = "Funds / ETFs" if (is_etf_flag or is_fund_flag) else "Unknown"
            fallback: dict[str, Any] = {
                "display_name": name,
                "metadata_source": "plaid_security" if security else "internal",
                "metadata_status": "partial" if security else "missing",
                "sector": sector_fb,
                "industry": sec_type or None,
                "is_etf": is_etf_flag,
                "is_fund": is_fund_flag,
                "country": None,
                "cik": None,
                "isin": None,
                "fmp_symbol": sym,
                "tags_json": [sec_type] if sec_type else [],
                "raw_payload_json": (
                    {"security_type": sec_type, "plaid_name": name} if security else {}
                ),
            }

            if not settings.FMP_API_KEY:
                return fallback

            # Strategy 1: Direct profile
            payload = await _fmp_profile(sym)
            if payload:
                return payload

            # Strategy 2: Search by security name
            security_name = fallback.get("display_name", "")
            if security_name and security_name != sym and not _is_non_standard_code(security_name):
                payload = await _fmp_search_best(security_name)
                if payload:
                    if not payload.get("display_name") or payload["display_name"] == payload.get("fmp_symbol"):
                        payload["display_name"] = security_name
                    return payload

            # Strategy 3: Search by symbol
            if not _is_non_standard_code(sym):
                payload = await _fmp_search_best(sym)
                if payload:
                    return payload

            return fallback

        # Crypto
        return await self._fetch_crypto_metadata(sym)

    async def get_or_refresh(
        self,
        asset_key: str,
        canonical_symbol: str,
        asset_class: str,
        security_id: str | None = None,
    ) -> AssetMetadata:
        stmt = select(AssetMetadata).where(AssetMetadata.asset_key == asset_key)
        result = await self.db.execute(stmt)
        record = result.scalar_one_or_none()

        if record and not self._is_stale(record):
            return record

        refreshed = await self._refresh_record(
            record=record,
            asset_key=asset_key,
            canonical_symbol=canonical_symbol,
            asset_class=asset_class,
            security_id=security_id,
        )
        await self.db.commit()
        return refreshed

    # ── Internal ───────────────────────────────────────────────────────────────
    def _is_stale(self, record: AssetMetadata) -> bool:
        if record.refresh_after is None:
            return True
        ra = record.refresh_after
        if ra.tzinfo is None:
            ra = ra.replace(tzinfo=timezone.utc)
        return ra <= _utcnow()

    async def _refresh_record(
        self,
        record: AssetMetadata | None,
        asset_key: str,
        canonical_symbol: str,
        asset_class: str,
        security_id: str | None = None,
    ) -> AssetMetadata:
        payload = await self._fetch_metadata(canonical_symbol, asset_class, security_id=security_id)
        now = _utcnow()
        ttl = self._ttl_for(asset_class, payload["metadata_status"])

        if record is None:
            record = AssetMetadata(
                asset_key=asset_key,
                canonical_symbol=canonical_symbol.upper(),
                asset_class=asset_class,
                first_seen_at=now,
            )
            self.db.add(record)

        record.display_name = payload.get("display_name")
        record.description = payload.get("description")
        record.image_url = payload.get("image_url")
        record.website = payload.get("website")
        record.metadata_source = payload.get("metadata_source", "internal")
        record.metadata_status = payload.get("metadata_status", "missing")
        record.sector = payload.get("sector")
        record.industry = payload.get("industry")
        record.country = payload.get("country")
        record.exchange = payload.get("exchange")
        record.cik = payload.get("cik")
        record.isin = payload.get("isin")
        record.coingecko_id = payload.get("coingecko_id")
        record.fmp_symbol = payload.get("fmp_symbol")
        record.market_cap = payload.get("market_cap")
        record.beta = payload.get("beta")
        record.vol_avg = payload.get("vol_avg")
        record.is_etf = bool(payload.get("is_etf", False))
        record.is_fund = bool(payload.get("is_fund", False))
        record.tags_json = payload.get("tags_json")
        record.raw_payload_json = payload.get("raw_payload_json")
        record.last_refreshed_at = now
        record.refresh_after = now + ttl
        return record

    def _ttl_for(self, asset_class: str, status: str) -> timedelta:
        if status == "missing":
            return timedelta(hours=settings.ASSET_METADATA_MISSING_TTL_HOURS)
        if asset_class == "equity":
            return timedelta(hours=settings.ASSET_METADATA_EQUITY_TTL_HOURS)
        return timedelta(hours=settings.ASSET_METADATA_CRYPTO_TTL_HOURS)

    # ── Fetch strategies ───────────────────────────────────────────────────────
    async def _fetch_metadata(self, canonical_symbol: str, asset_class: str, security_id: str | None = None) -> dict[str, Any]:
        symbol = canonical_symbol.upper()

        if asset_class == "cash_equivalent":
            return {
                "display_name": "US Dollar" if symbol == "USD" else symbol,
                "metadata_source": "internal",
                "metadata_status": "ready",
                "sector": "Cash",
                "industry": "Fiat Currency",
                "country": "United States" if symbol == "USD" else None,
                "tags_json": ["cash"],
                "raw_payload_json": {"category": "cash"},
            }

        if asset_class == "equity":
            return await self._fetch_equity_metadata(symbol, security_id=security_id)

        return await self._fetch_crypto_metadata(symbol)

    async def _fetch_equity_metadata(self, symbol: str, security_id: str | None = None) -> dict[str, Any]:
        """Multi-strategy FMP enrichment for equities, ETFs, and mutual funds."""
        # Always fetch the Plaid security record — it has the human-readable name
        fallback = await self._equity_fallback_from_security(symbol, security_id=security_id)

        if not settings.FMP_API_KEY:
            return fallback

        # Strategy 1: Direct FMP profile lookup (works for standard tickers)
        payload = await _fmp_profile(symbol)
        if payload:
            logger.info("fmp_metadata_resolved", symbol=symbol, strategy="direct_profile")
            return payload

        # Strategy 2: Non-standard code — search FMP by security name
        security_name = fallback.get("display_name", "")
        if security_name and security_name != symbol and not _is_non_standard_code(security_name):
            payload = await _fmp_search_best(security_name)
            if payload:
                logger.info("fmp_metadata_resolved", symbol=symbol, strategy="name_search", query=security_name)
                # Keep display_name from Plaid if FMP's is generic
                if not payload.get("display_name") or payload["display_name"] == payload.get("fmp_symbol"):
                    payload["display_name"] = security_name
                return payload

        # Strategy 3: Search by symbol (picks up tickers FMP profile 404s on)
        if not _is_non_standard_code(symbol):
            payload = await _fmp_search_best(symbol)
            if payload:
                logger.info("fmp_metadata_resolved", symbol=symbol, strategy="symbol_search")
                return payload

        # Strategy 4: Plaid fallback (name + type, no sector detail)
        logger.info("fmp_metadata_unresolved", symbol=symbol, fallback_status=fallback.get("metadata_status"))
        return fallback

    async def _equity_fallback_from_security(self, symbol: str, security_id: str | None = None) -> dict[str, Any]:
        """Pull name + type from the Plaid securities table."""
        security = None
        if security_id:
            stmt = select(Security).where(Security.security_id == security_id)
            result = await self.db.execute(stmt)
            security = result.scalar_one_or_none()
        if security is None:
            stmt = select(Security).where(Security.ticker_symbol == symbol)
            result = await self.db.execute(stmt)
            security = result.scalar_one_or_none()

        name = security.name if security else symbol
        sec_type = (security.type if security else "") or ""
        sec_type_lower = sec_type.lower()
        is_etf = "etf" in sec_type_lower
        is_fund = "mutual fund" in sec_type_lower or "fund" in sec_type_lower
        sector = "Funds / ETFs" if (is_etf or is_fund) else "Unknown"

        return {
            "display_name": name,
            "metadata_source": "plaid_security" if security else "internal",
            "metadata_status": "partial" if security else "missing",
            "sector": sector,
            "industry": sec_type or None,
            "is_etf": is_etf,
            "is_fund": is_fund,
            "country": None,
            "cik": None,
            "isin": None,
            "fmp_symbol": symbol,
            "tags_json": [sec_type] if sec_type else [],
            "raw_payload_json": {"security_type": sec_type, "plaid_name": name} if security else {},
        }

    # ── Crypto ─────────────────────────────────────────────────────────────────
    async def _fetch_crypto_metadata(self, symbol: str) -> dict[str, Any]:
        fallback = self._crypto_fallback(symbol)
        coin_id = COINGECKO_ID_MAP.get(symbol)
        if not coin_id:
            return fallback

        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                response = await client.get(
                    f"https://api.coingecko.com/api/v3/coins/{coin_id}",
                    params={
                        "localization": "false", "tickers": "false",
                        "market_data": "false", "community_data": "false",
                        "developer_data": "false", "sparkline": "false",
                    },
                )
                response.raise_for_status()
                data = response.json()

            categories = data.get("categories") or fallback["tags_json"] or []
            derived_category = self._pick_crypto_category(symbol, categories)
            return {
                "display_name": data.get("name") or fallback["display_name"],
                "description": (data.get("description", {}).get("en") or "")[:2000] or None,
                "image_url": data.get("image", {}).get("large"),
                "metadata_source": "coingecko",
                "metadata_status": "ready",
                "sector": derived_category,
                "industry": None,
                "country": None,
                "cik": None,
                "isin": None,
                "coingecko_id": coin_id,
                "tags_json": categories or fallback["tags_json"],
                "raw_payload_json": data,
            }
        except Exception as exc:
            logger.warning("crypto_metadata_fetch_failed", symbol=symbol, error=str(exc))
            return fallback

    def _crypto_fallback(self, symbol: str) -> dict[str, Any]:
        default = CRYPTO_CATEGORY_MAP.get(symbol, {"category": "Unknown", "tags": ["Unknown"]})
        return {
            "display_name": symbol,
            "metadata_source": "internal",
            "metadata_status": "partial" if symbol in CRYPTO_CATEGORY_MAP else "missing",
            "sector": default["category"],
            "industry": None,
            "country": None,
            "cik": None,
            "isin": None,
            "coingecko_id": COINGECKO_ID_MAP.get(symbol),
            "tags_json": default["tags"],
            "raw_payload_json": {"symbol": symbol, "category": default["category"]},
        }

    def _pick_crypto_category(self, symbol: str, categories: list[str]) -> str:
        if symbol in STABLECOINS:
            return "Stablecoin"
        normalized = [c.strip() for c in categories if c]
        for cat in normalized:
            lower = cat.lower()
            if "stable" in lower:
                return "Stablecoin"
            if "layer 2" in lower:
                return "Layer 2"
            if "layer 1" in lower:
                return "Layer 1"
            if "meme" in lower:
                return "Memecoin"
            if "defi" in lower:
                return "DeFi"
            if "smart contract" in lower:
                return "Smart Contract Layer"
        return CRYPTO_CATEGORY_MAP.get(symbol, {}).get("category", "Unknown")
