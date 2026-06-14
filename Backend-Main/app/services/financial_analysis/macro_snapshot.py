"""
Live macro snapshot for Portfolio X-Ray.

Fetches real-time market indicators from Yahoo Finance and BLS:
  - VIX         → Yahoo Finance ^VIX
  - 10Y Yield   → Yahoo Finance ^TNX
  - Fed Funds   → Yahoo Finance ^IRX (13-week T-bill — tracks Fed Funds closely)
  - CPI YoY     → BLS API series CPIAUCSL (no key required)
  - Unemployment → BLS API series LNS14000000 (no key required)
  - HY Spread   → static fallback (FRED requires API key)

Falls back to static placeholders when any fetch fails.
"""
from __future__ import annotations

import asyncio
import time
from typing import Any

import httpx

from app.core.logging import get_logger

logger = get_logger()

_YF_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    ),
    "Accept": "application/json, text/plain, */*",
}

# Static fallbacks if live fetches fail — update these periodically
_STATIC = {
    "fed_funds":    4.33,   # ~current 3-month T-bill / Fed Funds range
    "ten_year":     4.51,   # 10Y Treasury yield %
    "cpi_yoy":      2.4,    # CPI YoY %
    "unemployment": 4.2,    # US unemployment rate %
    "vix":          18.2,   # CBOE VIX
    "hy_spread":    3.25,   # ICE BofA HY OAS spread %
}

# ── In-memory cache ────────────────────────────────────────────────────────────
# All 5 external HTTP calls (Yahoo × 3, BLS × 2) are cached here for 30 minutes.
# This prevents ~3–5s of serial network I/O on every Portfolio X-Ray page load.
_MACRO_CACHE_TTL = 30 * 60        # seconds — macro data doesn't change minute-to-minute
_macro_cache_data: dict[str, float] = {}
_macro_cache_ts: float = 0.0      # monotonic time of last successful fetch


# ── Live data fetching ─────────────────────────────────────────────────────────

async def _fetch_yf_quote(client: httpx.AsyncClient, yf_symbol: str) -> float | None:
    """Fetch the latest price/value of a Yahoo Finance ticker (e.g. ^VIX, ^TNX)."""
    try:
        r = await client.get(
            f"https://query1.finance.yahoo.com/v8/finance/chart/{yf_symbol}",
            params={"range": "1d", "interval": "1d"},
            timeout=3,   # fail fast — static fallback is fine if YF is slow
        )
        if r.status_code != 200:
            return None
        result = ((r.json().get("chart") or {}).get("result") or [{}])[0]
        price = (result.get("meta") or {}).get("regularMarketPrice")
        return float(price) if price is not None else None
    except Exception as exc:
        logger.warning("yf_macro_fetch_failed", symbol=yf_symbol, error=str(exc))
        return None


async def _fetch_bls_latest(client: httpx.AsyncClient, series_id: str) -> float | None:
    """Fetch the latest value for a BLS series (unauthenticated v1 API)."""
    try:
        r = await client.get(
            f"https://api.bls.gov/publicAPI/v1/timeseries/data/{series_id}",
            timeout=4,   # BLS is a slow govt server — fail fast, fall back to static value
        )
        if r.status_code != 200:
            return None
        series_list = (r.json().get("Results") or {}).get("series") or []
        if not series_list:
            return None
        data_points = series_list[0].get("data") or []
        return float(data_points[0]["value"]) if data_points else None
    except Exception as exc:
        logger.warning("bls_fetch_failed", series=series_id, error=str(exc))
        return None


async def _compute_cpi_yoy(client: httpx.AsyncClient) -> float | None:
    """Compute CPI YoY% from BLS CPIAUCSL index (current vs 12 months ago)."""
    try:
        r = await client.get(
            "https://api.bls.gov/publicAPI/v1/timeseries/data/CPIAUCSL",
            timeout=4,   # fail fast — static fallback is acceptable
        )
        if r.status_code != 200:
            return None
        data_points = (
            ((r.json().get("Results") or {}).get("series") or [{}])[0]
            .get("data") or []
        )
        if len(data_points) < 13:
            return None
        # data_points[0] is the most recent; they come newest-first
        latest = float(data_points[0]["value"])
        year_ago = float(data_points[12]["value"])
        return round((latest - year_ago) / year_ago * 100, 1)
    except Exception as exc:
        logger.warning("bls_cpi_yoy_failed", error=str(exc))
        return None


async def fetch_live_macro_data() -> dict[str, float]:
    """
    Return live macro indicator values, backed by a 30-minute in-memory cache.

    On a cache hit the function returns immediately — no network I/O.
    On a cache miss, all 5 external calls are fired in parallel (asyncio.gather)
    so the total wait is ~max(individual latencies) ≈ 1s instead of ~5s serial.
    Falls back to _STATIC values for any indicator that fails to fetch.

    Returns
    -------
    dict with keys: fed_funds, ten_year, cpi_yoy, unemployment, vix, hy_spread
    All values are floats (percentages or index levels).
    """
    global _macro_cache_data, _macro_cache_ts

    # ── Cache hit ─────────────────────────────────────────────────────────────
    now = time.monotonic()
    if _macro_cache_data and (now - _macro_cache_ts) < _MACRO_CACHE_TTL:
        logger.debug("macro_cache_hit", age_s=round(now - _macro_cache_ts))
        return dict(_macro_cache_data)

    # ── Parallel fetch ────────────────────────────────────────────────────────
    live: dict[str, float] = {}
    try:
        async with httpx.AsyncClient(
            headers=_YF_HEADERS, timeout=5, follow_redirects=True
        ) as client:
            # Fire all 5 requests concurrently — shared client is safe for reads
            results = await asyncio.gather(
                _fetch_yf_quote(client, "%5EVIX"),          # ^VIX
                _fetch_yf_quote(client, "%5ETNX"),          # ^TNX  (10Y)
                _fetch_yf_quote(client, "%5EIRX"),          # ^IRX  (13W T-bill ≈ Fed Funds)
                _fetch_bls_latest(client, "LNS14000000"),   # unemployment rate
                _compute_cpi_yoy(client),                   # CPI YoY computed from CPIAUCSL
                return_exceptions=True,
            )

        vix, ten_yr, fed_prx, unemp, cpi_yoy = (
            None if isinstance(r, Exception) else r for r in results
        )

        if vix     is not None: live["vix"]          = round(vix, 1)
        if ten_yr  is not None: live["ten_year"]      = round(ten_yr, 2)
        if fed_prx is not None: live["fed_funds"]     = round(fed_prx, 2)
        if unemp   is not None: live["unemployment"]  = round(unemp, 1)
        if cpi_yoy is not None: live["cpi_yoy"]       = round(cpi_yoy, 1)

        logger.info("macro_live_data_fetched", keys=list(live.keys()))

    except Exception as exc:
        logger.warning("macro_live_fetch_failed", error=str(exc))

    # Merge live values over static fallbacks, then store in cache
    result = {**_STATIC, **live}
    _macro_cache_data = dict(result)
    _macro_cache_ts = time.monotonic()
    return result


# ── Tone helpers ───────────────────────────────────────────────────────────────

def _tone_fed(v: float) -> str:
    return "lime" if v < 4.0 else ("amber" if v <= 5.0 else "rose")

def _tone_ten_year(v: float) -> str:
    return "lime" if v < 4.5 else ("amber" if v <= 5.5 else "rose")

def _tone_cpi(v: float) -> str:
    return "lime" if v < 3.0 else ("amber" if v < 4.0 else "rose")

def _tone_unemployment(v: float) -> str:
    return "lime" if v < 4.0 else ("amber" if v <= 5.0 else "rose")

def _tone_vix(v: float) -> str:
    return "lime" if v < 15 else ("cyan" if v < 20 else ("amber" if v < 30 else "rose"))

def _tone_hy(v: float) -> str:
    return "lime" if v < 3.5 else ("amber" if v < 5.0 else "rose")


# ── Signal logic ───────────────────────────────────────────────────────────────

def _regime_label(cpi_yoy: float, unemployment: float, vix: float) -> str:
    if cpi_yoy <= 3.0 and unemployment <= 4.5 and vix < 20:
        return "Disinflation / Risk-on"
    if cpi_yoy >= 3.5:
        return "Sticky Inflation"
    if vix >= 25:
        return "Risk-off Volatility"
    return "Mixed Macro"


def _rate_signal(fed: float, ten_yr: float) -> str:
    """Signal for rate-sensitive growth card."""
    if fed <= 4.0 and ten_yr <= 4.5:
        return "Positive"
    if fed >= 5.0 or ten_yr >= 5.5:
        return "Negative"
    return "Mixed"


def _inflation_signal(cpi: float) -> str:
    if cpi < 3.0:
        return "Positive"
    if cpi >= 4.0:
        return "Negative"
    return "Mixed"


def _labor_signal(unemp: float) -> str:
    if unemp < 4.0:
        return "Positive"
    if unemp >= 5.5:
        return "Negative"
    return "Mixed"


def _credit_signal(hy_spread: float) -> str:
    if hy_spread < 3.5:
        return "Positive"
    if hy_spread >= 5.5:
        return "Negative"
    return "Mixed"


# ── Portfolio helpers ──────────────────────────────────────────────────────────

def _join_tickers(symbols: list[str], limit: int = 3) -> str:
    names = [symbol for symbol in symbols if symbol][:limit]
    if not names:
        return "your equity holdings"
    if len(names) == 1:
        return names[0]
    if len(names) == 2:
        return f"{names[0]} and {names[1]}"
    return f"{names[0]}, {names[1]}, and {names[2]}"


def _pick_symbols(
    assets: list[dict[str, Any]],
    *,
    sector: str | None = None,
    etf: bool | None = None,
) -> list[str]:
    filtered = assets
    if sector is not None:
        filtered = [item for item in filtered if item.get("sector") == sector]
    if etf is not None:
        filtered = [item for item in filtered if bool(item.get("is_etf")) is etf]
    return [
        item["symbol"]
        for item in sorted(filtered, key=lambda row: row["weight_pct"], reverse=True)
    ]


# ── Main builder ───────────────────────────────────────────────────────────────

async def build_macro_snapshot(assets: list[dict[str, Any]]) -> dict[str, Any]:
    """
    Build the macro snapshot for Portfolio X-Ray.

    Fetches live indicators (VIX, 10Y, Fed proxy via ^IRX, CPI, unemployment)
    and falls back gracefully to recent static values on any failure.
    """
    ind = await fetch_live_macro_data()

    fed      = ind["fed_funds"]
    ten_yr   = ind["ten_year"]
    cpi      = ind["cpi_yoy"]
    unemp    = ind["unemployment"]
    vix      = ind["vix"]
    hy       = ind["hy_spread"]

    indicators: list[dict[str, Any]] = [
        {
            "key":     "fed_funds",
            "label":   "Fed Funds Rate",
            "value":   f"{fed:.2f}%",
            "meaning": "Base US interest rate — affects borrowing costs across the economy",
            "tone":    _tone_fed(fed),
        },
        {
            "key":     "ten_year",
            "label":   "10Y Treasury",
            "value":   f"{ten_yr:.2f}%",
            "meaning": "Long-term government borrowing cost",
            "tone":    _tone_ten_year(ten_yr),
        },
        {
            "key":     "cpi_yoy",
            "label":   "CPI YoY",
            "value":   f"{cpi:.1f}%",
            "meaning": "Inflation rate, year over year",
            "tone":    _tone_cpi(cpi),
        },
        {
            "key":     "unemployment",
            "label":   "Unemployment",
            "value":   f"{unemp:.1f}%",
            "meaning": "Share of the workforce without jobs",
            "tone":    _tone_unemployment(unemp),
        },
        {
            "key":     "vix",
            "label":   "VIX",
            "value":   f"{vix:.1f}",
            "meaning": "Market fear and expected volatility",
            "tone":    _tone_vix(vix),
        },
        {
            "key":     "hy_spread",
            "label":   "HY Spread",
            "value":   f"{hy:.2f}%",
            "meaning": "Risk premium in high-yield credit markets",
            "tone":    _tone_hy(hy),
        },
    ]

    # ── Portfolio context ─────────────────────────────────────────────────────
    growth   = _pick_symbols(assets, sector="Technology")
    if not growth:
        growth = _pick_symbols(assets, etf=True)
    value    = _pick_symbols(assets, sector="Energy")
    if not value:
        value = _pick_symbols([a for a in assets if not a.get("is_etf")])
    cash     = _pick_symbols([a for a in assets if a.get("bucket") == "cash"])
    etf_sl   = _pick_symbols(assets, etf=True)

    growth_text = _join_tickers(growth)
    value_text  = _join_tickers(value)
    cash_text   = _join_tickers(cash) if cash else "cash and stablecoin balances"
    etf_text    = _join_tickers(etf_sl)

    # ── Impact cards — dynamic signals from live data ─────────────────────────
    rate_sig  = _rate_signal(fed, ten_yr)
    infl_sig  = _inflation_signal(cpi)
    labor_sig = _labor_signal(unemp)
    cred_sig  = _credit_signal(hy)

    if ten_yr <= 4.5:
        rate_desc = (
            f"Yields near {ten_yr:.2f}% support duration-sensitive growth exposures "
            f"such as {growth_text} and your {etf_text} sleeve."
        )
    else:
        rate_desc = (
            f"Elevated 10Y at {ten_yr:.2f}% compresses multiples — "
            f"growth exposures like {growth_text} face duration headwinds."
        )

    if cpi < 3.0:
        infl_desc = (
            f"CPI at {cpi:.1f}% is near target — pricing power matters less; "
            f"watch how {growth_text} guides margin."
        )
    else:
        infl_desc = (
            f"CPI at {cpi:.1f}% keeps pressure on input costs; watch how {growth_text} "
            f"and {value_text} pass through pricing versus the benchmark."
        )

    if unemp < 4.5:
        labor_desc = (
            f"Unemployment at {unemp:.1f}% signals a healthy consumer backdrop — "
            f"supports consumer-linked names in your portfolio."
        )
    else:
        labor_desc = (
            f"A softening jobs backdrop ({unemp:.1f}%) can weigh on consumer-linked "
            f"names; {value_text} may hold up if energy demand stays firm."
        )

    if hy < 3.5:
        cred_desc = (
            f"Tight HY spreads ({hy:.2f}%) signal functioning credit markets; "
            f"{cash_text} can absorb volatility without forcing sales elsewhere."
        )
    else:
        cred_desc = (
            f"HY spreads at {hy:.2f}% reflect credit stress — "
            f"{cash_text} acts as a stabilizer against potential risk-off moves."
        )

    impact_cards = [
        {
            "title":  "Rate-sensitive growth",
            "signal": rate_sig,
            "description": rate_desc,
        },
        {
            "title":  "Inflation and pricing power",
            "signal": infl_sig,
            "description": infl_desc,
        },
        {
            "title":  "Labor market softness",
            "signal": labor_sig,
            "description": labor_desc,
        },
        {
            "title":  "Liquidity and cash buffer",
            "signal": cred_sig,
            "description": cred_desc,
        },
    ]

    return {
        "regime_label": _regime_label(cpi_yoy=cpi, unemployment=unemp, vix=vix),
        "indicators":   indicators,
        "impact_cards": impact_cards,
        "source":       "live_yahoo_bls",
    }
