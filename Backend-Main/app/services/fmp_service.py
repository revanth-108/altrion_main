"""
FMP (Financial Modeling Prep) API client.
All calls are proxied through this service — the API key never reaches the frontend.

Note: FMP v3/v4 endpoints are "Legacy" as of August 2025; only the /stable/ API is
available on new subscriptions.  ETF constituent data (previously /v3/etf-holder) is
fetched from Yahoo Finance quoteSummary instead — no API key required, top-10 holdings
per ETF, normalized to the same {asset, name, weightPercentage} dict shape.

Yahoo Finance is used for:
  - ETF holdings / sector weights (quoteSummary topHoldings)
  - Stock valuation (quoteSummary summaryDetail + defaultKeyStatistics + financialData)
  - Price history (v8/finance/chart — replaces FMP legacy endpoints)
  - Research Lab comprehensive data (quoteSummary multi-module batch)
  - Asset news (v1/finance/search)
"""
from __future__ import annotations

from contextlib import asynccontextmanager
from datetime import datetime, timezone as _tz
from typing import AsyncGenerator

import httpx

from app.core.config import settings
from app.core.logging import get_logger

logger = get_logger()

_V3 = "https://financialmodelingprep.com/api/v3"
_V4 = "https://financialmodelingprep.com/api/v4"
_STABLE = "https://financialmodelingprep.com/stable"
_TIMEOUT = 8

# Period → number of daily trading days to fetch
_PERIOD_DAYS = {"1M": 30, "6M": 180, "1Y": 365, "5Y": 1825}

_YF_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    ),
    "Accept": "application/json, text/plain, */*",
    "Accept-Language": "en-US,en;q=0.9",
}

# Yahoo Finance sectorWeightings key → standard sector name used in portfolio_xray.py
_YF_SECTOR_MAP: dict[str, str] = {
    "technology": "Technology",
    "financial_services": "Financials",
    "healthcare": "Healthcare",
    "consumer_cyclical": "Consumer Discretionary",
    "communication_services": "Communication Services",
    "industrials": "Industrials",
    "consumer_defensive": "Consumer Staples",
    "energy": "Energy",
    "utilities": "Utilities",
    "realestate": "Real Estate",
    "basic_materials": "Materials",
}


class FMPService:
    @property
    def key(self) -> str:
        return settings.FMP_API_KEY

    def _p(self, **extra) -> dict:
        return {"apikey": self.key, **extra}

    @staticmethod
    def _fmp_symbol(symbol: str) -> str:
        """Normalize Yahoo Finance crypto symbols (BTC-USD → BTCUSD) for FMP endpoints."""
        s = symbol.upper()
        if s.endswith("-USD"):
            return s.replace("-USD", "USD")
        return s

    async def search(self, query: str, limit: int = 10) -> list[dict]:
        """Search tickers via Yahoo Finance (reliable, no key needed, covers stocks/ETFs/crypto/indices).
        FMP Enterprise is reserved for detailed data endpoints where it provides richer data.
        """
        async with httpx.AsyncClient(timeout=_TIMEOUT, headers={"User-Agent": "Mozilla/5.0"}) as client:
            r = await client.get(
                "https://query1.finance.yahoo.com/v1/finance/search",
                params={"q": query, "quotesCount": limit, "newsCount": 0, "enableFuzzyQuery": False},
            )
            r.raise_for_status()
            quotes = r.json().get("quotes") or []

        return [
            {
                "symbol": q["symbol"],
                "name": q.get("longname") or q.get("shortname") or q["symbol"],
                "currency": q.get("currency", "USD"),
                "stockExchange": q.get("exchange", ""),
                "exchangeShortName": q.get("exchDisp", ""),
            }
            for q in quotes
            if q.get("symbol") and q.get("quoteType") in ("EQUITY", "ETF", "CRYPTOCURRENCY", "INDEX", "MUTUALFUND")
        ][:limit]

    async def get_quote(self, symbol: str) -> dict | None:
        symbol = self._fmp_symbol(symbol)
        async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
            r = await client.get(f"{_V3}/quote/{symbol}", params=self._p())
            r.raise_for_status()
            data = r.json()
            return data[0] if data else None

    async def get_profile(self, symbol: str) -> dict | None:
        symbol = self._fmp_symbol(symbol)
        async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
            r = await client.get(f"{_V3}/profile/{symbol}", params=self._p())
            r.raise_for_status()
            data = r.json()
            return data[0] if data else None

    async def get_key_metrics_ttm(self, symbol: str) -> dict | None:
        symbol = self._fmp_symbol(symbol)
        async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
            r = await client.get(f"{_V3}/key-metrics-ttm/{symbol}", params=self._p())
            r.raise_for_status()
            data = r.json()
            return data[0] if data else None

    async def get_analyst_estimates(self, symbol: str) -> list[dict]:
        symbol = self._fmp_symbol(symbol)
        async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
            r = await client.get(f"{_V3}/analyst-estimates/{symbol}", params=self._p(limit=4))
            r.raise_for_status()
            return r.json() or []

    async def get_earnings_surprises(self, symbol: str) -> list[dict]:
        symbol = self._fmp_symbol(symbol)
        async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
            r = await client.get(f"{_V3}/earnings-surprises/{symbol}", params=self._p())
            r.raise_for_status()
            return (r.json() or [])[:4]

    async def get_analyst_grades(self, symbol: str) -> list[dict]:
        symbol = self._fmp_symbol(symbol)
        async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
            r = await client.get(f"{_V3}/grade/{symbol}", params=self._p(limit=5))
            r.raise_for_status()
            return r.json() or []

    async def get_price_target_summary(self, symbol: str) -> dict | None:
        symbol = self._fmp_symbol(symbol)
        async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
            r = await client.get(f"{_V4}/price-target-summary", params=self._p(symbol=symbol))
            r.raise_for_status()
            data = r.json()
            if isinstance(data, list):
                return data[0] if data else None
            return data if isinstance(data, dict) else None

    async def get_insider_trading(self, symbol: str) -> list[dict]:
        symbol = self._fmp_symbol(symbol)
        async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
            r = await client.get(f"{_V4}/insider-trading", params=self._p(symbol=symbol, limit=5))
            r.raise_for_status()
            return (r.json() or [])[:5]

    async def get_stock_news(self, symbol: str) -> list[dict]:
        symbol = self._fmp_symbol(symbol)
        async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
            r = await client.get(f"{_V3}/stock_news", params=self._p(tickers=symbol, limit=5))
            r.raise_for_status()
            return r.json() or []

    # ── Yahoo Finance helpers ────────────────────────────────────────────────

    @asynccontextmanager
    async def _yf_session(
        self,
    ) -> AsyncGenerator[tuple[httpx.AsyncClient, str | None], None]:
        """Context manager that yields (client, crumb) for reuse across multiple calls.

        Visits fc.yahoo.com once to set the session cookie, then fetches the
        crumb once.  The caller makes all quoteSummary requests within the
        block — saving 2 HTTP round-trips per additional symbol vs opening a
        fresh client each time.

        Usage::
            async with self._yf_session() as (client, crumb):
                data_a = await self._yf_quotesummary("AAPL", "price", client=client, crumb=crumb)
                data_b = await self._yf_quotesummary("MSFT", "price", client=client, crumb=crumb)
        """
        async with httpx.AsyncClient(
            headers=_YF_HEADERS, follow_redirects=True, timeout=_TIMEOUT
        ) as client:
            crumb: str | None = None
            try:
                await client.get("https://fc.yahoo.com")
                crumb_r = await client.get(
                    "https://query1.finance.yahoo.com/v1/test/getcrumb"
                )
                if crumb_r.status_code == 200:
                    crumb = crumb_r.text.strip()
                else:
                    logger.warning("yf_crumb_failed_in_session")
            except Exception as exc:
                logger.warning("yf_session_setup_failed", error=str(exc))
            yield client, crumb

    async def _yf_quotesummary(
        self,
        symbol: str,
        modules: str,
        *,
        client: httpx.AsyncClient | None = None,
        crumb: str | None = None,
    ) -> dict:
        """Yahoo Finance quoteSummary with cookie+crumb auth.

        When `client` and `crumb` are supplied (from _yf_session), skips the
        cookie/crumb setup — saves 2 HTTP round-trips per call.  Without them,
        opens its own session (original behaviour, used for one-off calls).
        """
        async def _fetch(c: httpx.AsyncClient, token: str) -> dict:
            r = await c.get(
                "https://query2.finance.yahoo.com/v10/finance/quoteSummary/"
                + symbol.upper(),
                params={"modules": modules, "crumb": token},
            )
            if r.status_code != 200:
                return {}
            data = r.json()
            result = (data.get("quoteSummary") or {}).get("result") or []
            return result[0] if result else {}

        # Pre-authenticated session provided by caller
        if client is not None and crumb is not None:
            try:
                return await _fetch(client, crumb)
            except Exception as exc:
                logger.warning("yf_quotesummary_failed", symbol=symbol, error=str(exc))
                return {}

        # Own session (one-off call)
        async with httpx.AsyncClient(
            headers=_YF_HEADERS, follow_redirects=True, timeout=_TIMEOUT
        ) as own_client:
            await own_client.get("https://fc.yahoo.com")
            crumb_r = await own_client.get(
                "https://query1.finance.yahoo.com/v1/test/getcrumb"
            )
            if crumb_r.status_code != 200:
                logger.warning("yf_crumb_failed", symbol=symbol)
                return {}
            try:
                return await _fetch(own_client, crumb_r.text.strip())
            except Exception as exc:
                logger.warning("yf_quotesummary_failed", symbol=symbol, error=str(exc))
                return {}

    @staticmethod
    def _yf_raw(val: object) -> float | None:
        """Extract numeric value from a Yahoo Finance RawNumberValue or plain float."""
        if val is None:
            return None
        if isinstance(val, dict):
            v = val.get("raw")
            return float(v) if v is not None else None
        try:
            return float(val)
        except (TypeError, ValueError):
            return None

    # ── ETF look-through ─────────────────────────────────────────────────────

    async def get_etf_holders(
        self,
        symbol: str,
        limit: int = 100,
        *,
        client: httpx.AsyncClient | None = None,
        crumb: str | None = None,
    ) -> tuple[list[dict], dict[str, float]]:
        """Return top holdings and sector weights for an ETF via Yahoo Finance.

        FMP /v3/etf-holder is a legacy endpoint (blocked for subscriptions after
        August 2025).  Yahoo Finance topHoldings returns the top 10 constituents
        plus the full sector distribution (sectorWeightings) — no API key needed.

        Returns
        -------
        (holdings, sector_weights)
            holdings:       [{asset, name, weightPercentage, sharesNumber}, ...]
                            weightPercentage is a percentage (e.g. 7.84 = 7.84 %).
            sector_weights: {standard_sector_name: weight_pct_0_to_100}
                            Covers 100 % of the ETF via the provider's own data.
        """
        try:
            data = await self._yf_quotesummary(
                symbol, "topHoldings", client=client, crumb=crumb
            )
            if not data:
                return [], {}

            top_holdings = data.get("topHoldings") or {}

            # ── Parse constituent holdings ────────────────────────────────
            raw_holdings = top_holdings.get("holdings") or []
            parsed: list[dict] = []
            for h in raw_holdings[:limit]:
                sym = (h.get("symbol") or "").strip().upper()
                if not sym:
                    continue
                pct_decimal = self._yf_raw(h.get("holdingPercent")) or 0.0
                weight_pct = round(pct_decimal * 100, 4)
                name = (h.get("holdingName") or sym).strip()
                parsed.append({
                    "asset": sym,
                    "name": name,
                    "weightPercentage": weight_pct,
                    "sharesNumber": None,
                })

            # ── Parse sector distribution ────────────────────────────────
            sector_weights: dict[str, float] = {}
            for sw_dict in top_holdings.get("sectorWeightings") or []:
                for yf_key, val in sw_dict.items():
                    std_sector = _YF_SECTOR_MAP.get(yf_key)
                    if not std_sector:
                        continue
                    pct = (self._yf_raw(val) or 0.0) * 100
                    if pct > 0.01:
                        sector_weights[std_sector] = round(
                            sector_weights.get(std_sector, 0.0) + pct, 2
                        )

            return parsed, sector_weights

        except Exception as exc:
            logger.warning("yf_etf_holders_failed", symbol=symbol, error=str(exc))
            return [], {}

    # ── Stock valuation ───────────────────────────────────────────────────────

    async def get_stock_valuation(self, symbol: str) -> dict:
        """Return key valuation metrics for a stock via Yahoo Finance quoteSummary.

        Modules used: summaryDetail (P/E, forward P/E, market cap, dividend),
                      defaultKeyStatistics (P/B, EV/EBITDA, PEG),
                      financialData (ROE, revenue growth, profit margins).

        Returns a flat dict with keys:
            trailing_pe, forward_pe, price_to_book, ev_to_ebitda, peg_ratio,
            market_cap, dividend_yield, roe, revenue_growth, profit_margins
        Values are raw floats (no fmt strings) or None.
        Returns {} for invalid/unknown symbols.
        """
        try:
            data = await self._yf_quotesummary(
                symbol, "summaryDetail,defaultKeyStatistics,financialData"
            )
            if not data:
                return {}

            sd = data.get("summaryDetail") or {}
            ks = data.get("defaultKeyStatistics") or {}
            fd = data.get("financialData") or {}

            r = self._yf_raw

            return {
                "trailing_pe":    r(sd.get("trailingPE")),
                "forward_pe":     r(sd.get("forwardPE")),
                "price_to_book":  r(ks.get("priceToBook")),
                "ev_to_ebitda":   r(ks.get("enterpriseToEbitda")),
                "peg_ratio":      r(ks.get("pegRatio")),
                "market_cap":     r(sd.get("marketCap")),
                "dividend_yield": r(sd.get("dividendYield")),
                "roe":            r(fd.get("returnOnEquity")),
                "revenue_growth": r(fd.get("revenueGrowth")),
                "profit_margins": r(fd.get("profitMargins")),
            }

        except Exception as exc:
            logger.warning("yf_valuation_failed", symbol=symbol, error=str(exc))
            return {}

    async def get_historical_prices(self, symbol: str, period: str) -> list[dict]:
        """Return [{date, close}] in ascending date order.

        Daily periods (1M, 6M, 1Y, 5Y, MAX) use FMP /stable/historical-price-eod/full —
        more reliable than Yahoo Finance (no cookie/crumb auth, clean JSON).
        Intraday periods (1D, 1W) fall back to Yahoo Finance chart API (FMP stable
        has end-of-day data only, no intraday bars).
        """
        if period in ("1D", "1W"):
            return await self._yf_historical_intraday(symbol, period)
        return await self._fmp_historical_daily(symbol, period)

    async def _fmp_historical_daily(self, symbol: str, period: str) -> list[dict]:
        """Daily OHLC from FMP /stable/historical-price-eod/full (newest-first → reversed)."""
        _PERIOD_LIMIT = {"1M": 35, "6M": 195, "1Y": 380, "5Y": 1850}
        limit = _PERIOD_LIMIT.get(period)  # None = no limit (MAX)

        params: dict = {"symbol": symbol.upper(), "apikey": self.key}
        if limit:
            params["limit"] = limit

        try:
            async with httpx.AsyncClient(timeout=max(_TIMEOUT, 20)) as client:
                r = await client.get(
                    f"https://financialmodelingprep.com/stable/historical-price-eod/full",
                    params=params,
                )
                r.raise_for_status()
                rows: list[dict] = r.json() or []

            # FMP returns newest-first; reverse to ascending for the chart
            output = [
                {"date": row["date"], "close": round(float(row["close"]), 4)}
                for row in reversed(rows)
                if row.get("date") and row.get("close") is not None
            ]
            logger.info("fmp_daily_prices_ok", symbol=symbol, period=period, points=len(output))
            return output

        except Exception as exc:
            logger.warning("fmp_daily_prices_failed", symbol=symbol, period=period, error=str(exc))
            # Fall back to Yahoo Finance on any FMP error
            return await self._yf_historical_intraday(symbol, "1M")

    async def _yf_historical_intraday(self, symbol: str, period: str) -> list[dict]:
        """Intraday bars from Yahoo Finance chart API (1D = 5-min, 1W = 1-hour)."""
        yf_sym = symbol.upper()
        _YF_PERIOD_MAP: dict[str, tuple[str, str]] = {
            "1D":  ("1d",  "5m"),
            "1W":  ("5d",  "1h"),
            "1M":  ("1mo", "1d"),   # fallback only
        }
        yf_range, yf_interval = _YF_PERIOD_MAP.get(period, ("1mo", "1d"))

        try:
            async with httpx.AsyncClient(
                headers=_YF_HEADERS, timeout=max(_TIMEOUT, 20), follow_redirects=True
            ) as client:
                r = await client.get(
                    f"https://query1.finance.yahoo.com/v8/finance/chart/{yf_sym}",
                    params={"range": yf_range, "interval": yf_interval, "includePrePost": "false"},
                )
                r.raise_for_status()
                payload = r.json()

            result = ((payload.get("chart") or {}).get("result") or [{}])[0]
            timestamps: list[int] = result.get("timestamp") or []
            quotes_list = (result.get("indicators") or {}).get("quote") or [{}]
            closes: list[float | None] = (quotes_list[0] if quotes_list else {}).get("close") or []

            output: list[dict] = []
            for ts, close in zip(timestamps, closes):
                if close is None:
                    continue
                dt = datetime.fromtimestamp(ts, tz=_tz.utc)
                date_str = (
                    dt.strftime("%Y-%m-%d %H:%M")
                    if period in ("1D", "1W")
                    else dt.strftime("%Y-%m-%d")
                )
                output.append({"date": date_str, "close": round(float(close), 4)})

            logger.info("yf_intraday_prices_ok", symbol=symbol, period=period, points=len(output))
            return output

        except Exception as exc:
            logger.warning("yf_intraday_prices_failed", symbol=symbol, period=period, error=str(exc))
            return []

    # ── Research Lab: comprehensive Yahoo Finance data ─────────────────────────

    async def _yf_get_news(self, symbol: str) -> list[dict]:
        """Fetch up to 5 recent headlines from Yahoo Finance search."""
        try:
            async with httpx.AsyncClient(
                timeout=10, headers={"User-Agent": "Mozilla/5.0"}
            ) as client:
                r = await client.get(
                    "https://query1.finance.yahoo.com/v1/finance/search",
                    params={"q": symbol, "quotesCount": 0, "newsCount": 5},
                )
                r.raise_for_status()
                news_list = r.json().get("news") or []
            return [
                {
                    "title": a.get("title", ""),
                    "publishedDate": a.get("providerPublishTime", ""),
                    "url": a.get("link", ""),
                    "publisher": a.get("publisher", ""),
                }
                for a in news_list[:5]
            ]
        except Exception as exc:
            logger.warning("yf_news_failed", symbol=symbol, error=str(exc))
            return []

    async def get_asset_research_data(self, symbol: str) -> dict:
        """Fetch all Research Lab data from Yahoo Finance in a single batch call.

        Replaces the 9 separate FMP v3/v4 calls (all legacy / broken) in
        run_research_lab.  Returns a dict with keys matching _build_context's
        signature: profile, quote, metrics, estimates, surprises, grades,
        price_target, insider, news.
        """
        modules = ",".join([
            "assetProfile",
            "price",
            "summaryDetail",
            "defaultKeyStatistics",
            "financialData",
            "earningsTrend",
            "earningsHistory",
            "upgradeDowngradeHistory",
            "recommendationTrend",
            "insiderTransactions",
        ])

        empty: dict = {
            "profile": None, "quote": None, "metrics": None,
            "estimates": [], "surprises": [], "grades": [],
            "price_target": None, "insider": [], "news": [],
        }

        try:
            data = await self._yf_quotesummary(symbol, modules)
        except Exception as exc:
            logger.warning("yf_research_data_failed", symbol=symbol, error=str(exc))
            empty["news"] = await self._yf_get_news(symbol)
            return empty

        if not data:
            empty["news"] = await self._yf_get_news(symbol)
            return empty

        r = self._yf_raw

        # ── Profile ───────────────────────────────────────────────────────
        ap = data.get("assetProfile") or {}
        pr = data.get("price") or {}
        profile = {
            "companyName": pr.get("longName") or pr.get("shortName") or symbol,
            "sector": ap.get("sector") or "—",
            "industry": ap.get("industry") or "—",
            "description": (ap.get("longBusinessSummary") or "")[:400],
            "website": ap.get("website") or "",
            "country": ap.get("country") or "",
            "employees": ap.get("fullTimeEmployees"),
        } if (ap or pr) else None

        # ── Quote ─────────────────────────────────────────────────────────
        sd = data.get("summaryDetail") or {}
        quote = None
        if pr:
            change_pct_raw = r(pr.get("regularMarketChangePercent"))
            quote = {
                "price": r(pr.get("regularMarketPrice")),
                "changesPercentage": (
                    round(change_pct_raw * 100, 2)
                    if change_pct_raw is not None else None
                ),
                "yearHigh": r(sd.get("fiftyTwoWeekHigh") or pr.get("fiftyTwoWeekHigh")),
                "yearLow":  r(sd.get("fiftyTwoWeekLow")  or pr.get("fiftyTwoWeekLow")),
                "marketCap": r(pr.get("marketCap") or sd.get("marketCap")),
                "avgVolume": r(
                    pr.get("averageDailyVolume10Day")
                    or pr.get("averageDailyVolume3Month")
                ),
                "pe":  r(sd.get("trailingPE")),
                "eps": r(pr.get("epsTrailingTwelveMonths")),
                "currency": pr.get("currency", "USD"),
            }

        # ── Key metrics ───────────────────────────────────────────────────
        ks = data.get("defaultKeyStatistics") or {}
        fd = data.get("financialData") or {}
        metrics = None
        if ks or fd:
            metrics = {
                "peRatioTTM":                  r(sd.get("trailingPE")),
                "enterpriseValueOverEBITDATTM": r(ks.get("enterpriseToEbitda")),
                "priceToSalesRatioTTM":         r(ks.get("priceToSalesTrailing12Months")),
                "pbRatioTTM":                  r(ks.get("priceToBook")),
                "roeTTM":                      r(fd.get("returnOnEquity")),
                "roicTTM":                     r(fd.get("returnOnAssets")),
                "debtToEquityTTM":             r(fd.get("debtToEquity")),
                "freeCashFlowYieldTTM":         r(ks.get("freeCashflow")),
                "netProfitMarginTTM":           r(fd.get("profitMargins")),
                "revenuePerShareTTM":           r(fd.get("revenuePerShare")),
                "pegRatio":                    r(ks.get("pegRatio")),
                "shortPercentOfFloat":          r(ks.get("shortPercentOfFloat")),
            }

        # ── Analyst estimates (earningsTrend) ─────────────────────────────
        et = data.get("earningsTrend") or {}
        trend_list = et.get("trend") or []
        estimates: list[dict] = []
        for t in trend_list[:4]:
            eps_est = t.get("earningsEstimate") or {}
            rev_est = t.get("revenueEstimate") or {}
            estimates.append({
                "date":                t.get("endDate", ""),
                "estimatedEpsAvg":    r(eps_est.get("avg")),
                "estimatedRevenueAvg": r(rev_est.get("avg")),
                "estimatedEpsHigh":   r(eps_est.get("high")),
                "estimatedEpsLow":    r(eps_est.get("low")),
                "numberOfAnalysts":   r(eps_est.get("numberOfAnalysts")),
            })

        # ── Earnings history / surprises ────────────────────────────────
        eh = data.get("earningsHistory") or {}
        hist_list = list(reversed(eh.get("history") or []))  # newest-first
        surprises: list[dict] = []
        for h in hist_list[:4]:
            q = h.get("quarter") or {}
            date_str = q.get("fmt", "") if isinstance(q, dict) else str(q)
            surprises.append({
                "date":                 date_str,
                "actualEarningResult":  r(h.get("epsActual")),
                "estimatedEarning":     r(h.get("epsEstimate")),
                "surprisePct":          r(h.get("surprisePercent")),
            })

        # ── Analyst grade changes ──────────────────────────────────────
        udh = data.get("upgradeDowngradeHistory") or {}
        history_list = udh.get("history") or []
        grades: list[dict] = []
        for g in history_list[:5]:
            epoch = g.get("epochGradeDate")
            date_str = (
                datetime.fromtimestamp(epoch, tz=_tz.utc).strftime("%Y-%m-%d")
                if epoch else ""
            )
            grades.append({
                "date":          date_str,
                "gradingCompany": g.get("firm", ""),
                "previousGrade": g.get("fromGrade") or "—",
                "newGrade":      g.get("toGrade") or "—",
                "action":        g.get("action", ""),
            })

        # ── Price targets ──────────────────────────────────────────────
        price_target = None
        if fd:
            price_target = {
                "targetConsensus":   r(fd.get("targetMeanPrice")),
                "targetHigh":        r(fd.get("targetHighPrice")),
                "targetLow":         r(fd.get("targetLowPrice")),
                "numberOfAnalysts":  r(fd.get("numberOfAnalystOpinions")),
                "currentPrice":      r(fd.get("currentPrice")),
            }

        # ── Insider transactions ───────────────────────────────────────
        it = data.get("insiderTransactions") or {}
        tx_list = it.get("transactions") or []
        insider: list[dict] = []
        for tx in tx_list[:5]:
            start = tx.get("startDate") or {}
            epoch = start.get("raw") if isinstance(start, dict) else start
            date_str = (
                datetime.fromtimestamp(epoch, tz=_tz.utc).strftime("%Y-%m-%d")
                if epoch else ""
            )
            shares = r(tx.get("shares"))
            insider.append({
                "transactionDate":     date_str,
                "reportingName":       tx.get("filerName", ""),
                "transactionType":     tx.get("transactionText") or tx.get("relationship", ""),
                "securitiesTransacted": int(shares) if shares is not None else None,
                "value":               r(tx.get("value")),
            })

        # ── News ───────────────────────────────────────────────────────
        news = await self._yf_get_news(symbol)

        return {
            "profile": profile,
            "quote": quote,
            "metrics": metrics,
            "estimates": estimates,
            "surprises": surprises,
            "grades": grades,
            "price_target": price_target,
            "insider": insider,
            "news": news,
        }
