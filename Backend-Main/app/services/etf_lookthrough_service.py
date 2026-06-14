"""
ETF Look-Through Service

Fetches real ETF constituent data from FMP (/v3/etf-holder/{symbol}) and caches
it in `public.etf_constituents` (TTL = 7 days). Used by Portfolio X-Ray to replace
heuristic overlap estimates with actual underlying stock weights.

How true exposure is computed
------------------------------
For each stock S in the portfolio (direct or inside an ETF):
  direct_pct     = S's portfolio weight (0 if only held via ETFs)
  via_etf_contrib = sum over all ETFs E: (E's portfolio weight) × (S's weight inside E / 100)
  total_pct      = direct_pct + via_etf_contrib

Example: AAPL direct 6.9%, VOO is 12% of portfolio and holds AAPL at 7.1%
  → AAPL via VOO = 12.0 × 7.1 / 100 = 0.852%
  → AAPL true total = 6.9 + 0.852 = 7.752%
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any

from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.logging import get_logger
from app.models.etf_constituent import EtfConstituent
from app.services.fmp_service import FMPService

logger = get_logger()

_CACHE_TTL_DAYS = 7          # re-fetch after 7 days
_MAX_CONSTITUENTS = 100      # store/look-through top-N holdings per ETF
_MIN_CONTRIBUTION = 0.005    # ignore contributions < 0.005% (noise)


class ETFLookthroughService:
    def __init__(self, db: AsyncSession):
        self._db = db
        self._fmp = FMPService()

    # ── Cache helpers ─────────────────────────────────────────────────────────

    async def _get_cached(self, etf_symbol: str) -> tuple[list[dict], dict[str, float]] | None:
        """Return (holdings, sector_weights) from cache if still fresh, else None."""
        now = datetime.now(timezone.utc)
        result = await self._db.execute(
            select(EtfConstituent)
            .where(
                EtfConstituent.etf_symbol == etf_symbol,
                EtfConstituent.refresh_after > now,
            )
            .order_by(EtfConstituent.weight_pct.desc())
        )
        rows = result.scalars().all()
        if not rows:
            return None
        holdings = [
            {
                "symbol": r.constituent_symbol,
                "name": r.constituent_name or r.constituent_symbol,
                "weight_pct": float(r.weight_pct or 0.0),
            }
            for r in rows
        ]
        # Sector weights are stored on every row; read from first non-null
        sector_weights: dict[str, float] = {}
        for r in rows:
            if r.sector_weights_json:
                sector_weights = dict(r.sector_weights_json)
                break
        return holdings, sector_weights

    async def _fetch_and_cache(
        self,
        etf_symbol: str,
        *,
        client=None,
        crumb: str | None = None,
    ) -> tuple[list[dict], dict[str, float]]:
        """Fetch from Yahoo Finance and upsert into cache table.

        `client` and `crumb` may be supplied from a shared _yf_session so that
        the cookie/crumb setup is performed only once when multiple ETFs are
        fetched sequentially (saves 2 HTTP round-trips per ETF).

        Returns (holdings, sector_weights) where:
            holdings:       [{symbol, name, weight_pct}]  (cache format)
            sector_weights: {standard_sector_name: weight_pct_0_to_100} from Yahoo
        """
        try:
            raw, sector_weights = await self._fmp.get_etf_holders(
                etf_symbol, limit=_MAX_CONSTITUENTS, client=client, crumb=crumb
            )
        except Exception as exc:
            logger.warning("etf_holder_fetch_failed", etf=etf_symbol, error=str(exc))
            return [], {}

        if not raw:
            return [], sector_weights

        now = datetime.now(timezone.utc)
        refresh_after = now + timedelta(days=_CACHE_TTL_DAYS)
        parsed: list[dict] = []

        for row in raw[:_MAX_CONSTITUENTS]:
            # FMP uses "asset" for the ticker; some endpoints use "symbol"
            sym = (row.get("asset") or row.get("symbol") or "").strip().upper()
            if not sym:
                continue
            weight = float(row.get("weightPercentage") or row.get("weight_percentage") or 0.0)
            name = (row.get("name") or sym).strip()
            shares_raw = row.get("sharesNumber") or row.get("shares")
            shares = int(shares_raw) if shares_raw else None

            await self._db.execute(
                text("""
                    INSERT INTO public.etf_constituents
                        (etf_symbol, constituent_symbol, constituent_name,
                         weight_pct, shares, sector_weights_json, fetched_at, refresh_after)
                    VALUES
                        (:etf, :sym, :name, :weight, :shares,
                         CAST(:sw_json AS jsonb), NOW(), :refresh_after)
                    ON CONFLICT (etf_symbol, constituent_symbol) DO UPDATE SET
                        constituent_name    = EXCLUDED.constituent_name,
                        weight_pct          = EXCLUDED.weight_pct,
                        shares              = EXCLUDED.shares,
                        sector_weights_json = EXCLUDED.sector_weights_json,
                        fetched_at          = NOW(),
                        refresh_after       = EXCLUDED.refresh_after,
                        updated_at          = NOW()
                """),
                {
                    "etf": etf_symbol,
                    "sym": sym,
                    "name": name,
                    "weight": weight,
                    "shares": shares,
                    "sw_json": __import__("json").dumps(sector_weights) if sector_weights else None,
                    "refresh_after": refresh_after,
                },
            )
            parsed.append({"symbol": sym, "name": name, "weight_pct": weight})

        try:
            await self._db.commit()
        except Exception as exc:
            await self._db.rollback()
            logger.error("etf_constituents_commit_failed", etf=etf_symbol, error=str(exc))
            return [], {}

        logger.info("etf_constituents_cached", etf=etf_symbol, count=len(parsed))
        return parsed, sector_weights

    # ── Public interface ──────────────────────────────────────────────────────

    async def get_constituents(self, etf_symbol: str) -> list[dict]:
        """Return top holdings for one ETF (DB cache → FMP fallback)."""
        cached = await self._get_cached(etf_symbol)
        if cached is not None:
            return cached
        return await self._fetch_and_cache(etf_symbol)

    async def get_many(
        self, etf_symbols: list[str]
    ) -> tuple[dict[str, list[dict]], dict[str, dict[str, float]]]:
        """
        Fetch constituents and sector weights for multiple ETFs.

        Uses a SINGLE batch SELECT for cached rows (safe for one AsyncSession),
        then fetches stale / missing ETFs from Yahoo Finance one at a time
        (sequential writes avoid concurrent-write conflicts on the same session).

        asyncio.gather is intentionally NOT used here — it issues multiple
        concurrent execute() calls on the same SQLAlchemy AsyncSession, which
        is unsupported and causes silent failures or ORM state corruption.

        Returns
        -------
        (constituents_map, sector_weights_map)
            constituents_map:   {etf_symbol: [{symbol, name, weight_pct}]}
            sector_weights_map: {etf_symbol: {standard_sector: weight_pct_0_to_100}}
                                Populated from Yahoo Finance when freshly fetched;
                                approximated from KNOWN_SECTOR_MAP for DB-cached ETFs.
        """
        if not etf_symbols:
            return {}, {}

        now = datetime.now(timezone.utc)

        # 1 — one batch SELECT for all fresh cached entries
        result = await self._db.execute(
            select(EtfConstituent)
            .where(
                EtfConstituent.etf_symbol.in_(etf_symbols),
                EtfConstituent.refresh_after > now,
            )
            .order_by(EtfConstituent.etf_symbol, EtfConstituent.weight_pct.desc())
        )
        rows = result.scalars().all()

        # Group into a per-ETF dict — also collect sector weights from DB rows
        cached: dict[str, list[dict]] = {sym: [] for sym in etf_symbols}
        sector_weights_db: dict[str, dict[str, float]] = {}
        for r in rows:
            if r.etf_symbol in cached:
                cached[r.etf_symbol].append({
                    "symbol": r.constituent_symbol,
                    "name": r.constituent_name or r.constituent_symbol,
                    "weight_pct": float(r.weight_pct or 0.0),
                })
                # Collect sector weights from first non-null row per ETF
                if r.sector_weights_json and r.etf_symbol not in sector_weights_db:
                    sector_weights_db[r.etf_symbol] = dict(r.sector_weights_json)

        # 2 — for ETFs with no (or stale) cached data, fetch from Yahoo sequentially.
        # One shared _yf_session covers all stale ETFs: cookie + crumb setup runs
        # once instead of once-per-ETF, saving 2 HTTP round-trips per additional ETF.
        sector_weights_fresh: dict[str, dict[str, float]] = {}
        stale = [sym for sym in etf_symbols if not cached[sym]]
        if stale:
            async with self._fmp._yf_session() as (yf_client, yf_crumb):
                for sym in stale:
                    fetched, sw = await self._fetch_and_cache(
                        sym, client=yf_client, crumb=yf_crumb
                    )
                    cached[sym] = fetched
                    sector_weights_fresh[sym] = sw

        # 3 — merge: fresh Yahoo takes priority, then DB-cached, then empty
        sector_weights_map: dict[str, dict[str, float]] = {
            sym: (
                sector_weights_fresh.get(sym)
                or sector_weights_db.get(sym)
                or {}
            )
            for sym in etf_symbols
        }

        return cached, sector_weights_map

    # ── True-exposure computation ─────────────────────────────────────────────

    def compute_true_exposure(
        self,
        enriched: list[dict[str, Any]],
        constituents_map: dict[str, list[dict]],
    ) -> dict[str, dict[str, Any]]:
        """
        Compute true per-stock exposure across direct holdings + ETF look-through.

        Parameters
        ----------
        enriched:
            List of portfolio holding dicts (from build_portfolio_xray),
            each with: symbol, name, weight_pct, is_etf, bucket
        constituents_map:
            {etf_symbol: [{symbol, name, weight_pct}]}  (weight_pct = % inside the ETF)

        Returns
        -------
        {symbol: {
            symbol, name, direct_pct, via_etfs, total_pct,
            etf_contribution_pct, is_direct
        }}
        Only stocks (bucket == "stocks") appear; crypto and cash are excluded.
        """
        exposure: dict[str, dict[str, Any]] = {}

        # 1 — seed direct stock holdings
        for h in enriched:
            if h["bucket"] != "stocks" or h["is_etf"]:
                continue
            sym = h["symbol"]
            exposure[sym] = {
                "symbol": sym,
                "name": h["name"],
                "direct_pct": round(float(h["weight_pct"]), 3),
                "via_etfs": [],
                "is_direct": True,
            }

        # 2 — add ETF look-through contributions
        for h in enriched:
            if not h["is_etf"]:
                continue
            etf_sym = h["symbol"]
            etf_portfolio_pct = float(h["weight_pct"])
            constituents = constituents_map.get(etf_sym) or []

            for c in constituents:
                c_sym = c["symbol"]
                weight_in_etf = float(c.get("weight_pct") or 0.0)
                contribution = round(etf_portfolio_pct * weight_in_etf / 100.0, 4)

                if contribution < _MIN_CONTRIBUTION:
                    continue

                if c_sym not in exposure:
                    exposure[c_sym] = {
                        "symbol": c_sym,
                        "name": c.get("name") or c_sym,
                        "direct_pct": 0.0,
                        "via_etfs": [],
                        "is_direct": False,
                    }

                exposure[c_sym]["via_etfs"].append(
                    {
                        "etf": etf_sym,
                        "etf_portfolio_pct": round(etf_portfolio_pct, 2),
                        "holding_weight_in_etf_pct": round(weight_in_etf, 3),
                        "contribution_pct": contribution,
                    }
                )

        # 3 — aggregate totals
        for data in exposure.values():
            etf_contrib = round(sum(v["contribution_pct"] for v in data["via_etfs"]), 4)
            data["etf_contribution_pct"] = etf_contrib
            data["total_pct"] = round(data["direct_pct"] + etf_contrib, 4)
            # Sort via_etfs by contribution descending
            data["via_etfs"].sort(key=lambda v: v["contribution_pct"], reverse=True)

        return exposure
