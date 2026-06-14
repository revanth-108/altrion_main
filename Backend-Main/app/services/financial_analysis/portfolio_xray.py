"""
Portfolio X-Ray — deterministic look-through style portfolio diagnostics.

True-exposure path (when ETFLookthroughService is provided):
  For every stock held directly AND inside an ETF, the service fetches real
  constituent weights from FMP (/v3/etf-holder/{etf}) and computes:
    true_exposure = direct_pct + sum(etf_portfolio_pct × holding_weight_in_etf / 100)

  This replaces the heuristic _estimate_true_exposure() with actual data and
  adds a `real_look_through` section to the response with per-stock breakdowns.
"""
from __future__ import annotations

from typing import TYPE_CHECKING, Any

from app.services.asset_metadata_service import AssetMetadataService
from app.services.financial_analysis.concentration_risk import analyze_concentration
from app.services.financial_analysis.macro_snapshot import build_macro_snapshot

if TYPE_CHECKING:
    from app.services.etf_lookthrough_service import ETFLookthroughService

KNOWN_ETFS = {
    "VOO", "VTI", "SPY", "IVV", "QQQ", "VT", "VXUS", "VEA", "VWO", "IWM",
    "DIA", "XLK", "XLF", "XLE", "ARKK", "SCHD", "VUG", "VTV", "BND", "AGG",
}

BENCHMARK_SECTOR_WEIGHTS: dict[str, float] = {
    "Technology": 28.0,
    "Financials": 13.0,
    "Healthcare": 13.0,
    "Consumer Discretionary": 10.0,
    "Communication Services": 9.0,
    "Industrials": 9.0,
    "Consumer Staples": 6.0,
    "Energy": 4.0,
    "Utilities": 3.0,
    "Real Estate": 3.0,
    "Materials": 2.0,
}

BENCHMARK_FACTORS: dict[str, float] = {
    "Growth": 61.0,
    "Value": 52.0,
    "Quality": 58.0,
    "Momentum": 48.0,
    "Low Vol": 44.0,
    "Size": 37.0,
}

# Known sector lookup for top 200 US stocks + ETFs/MFs
# Used as fallback when FMP enrichment hasn't populated sector yet
KNOWN_SECTOR_MAP: dict[str, str] = {
    # Technology
    "AAPL": "Technology", "MSFT": "Technology", "NVDA": "Technology",
    "GOOGL": "Technology", "GOOG": "Technology", "META": "Technology",
    "AVGO": "Technology", "ORCL": "Technology", "CRM": "Technology",
    "ADBE": "Technology", "AMD": "Technology", "INTC": "Technology",
    "QCOM": "Technology", "TXN": "Technology", "MU": "Technology",
    "AMAT": "Technology", "LRCX": "Technology", "KLAC": "Technology",
    "CSCO": "Technology", "IBM": "Technology", "HPQ": "Technology",
    "NOW": "Technology", "SNOW": "Technology", "PANW": "Technology",
    "CRWD": "Technology", "ZS": "Technology", "FTNT": "Technology",
    "NET": "Technology", "DDOG": "Technology", "MDB": "Technology",
    # Communication Services
    "NFLX": "Communication Services", "DIS": "Communication Services",
    "CMCSA": "Communication Services", "T": "Communication Services",
    "VZ": "Communication Services", "TMUS": "Communication Services",
    "CHTR": "Communication Services", "EA": "Communication Services",
    "TTWO": "Communication Services", "WBD": "Communication Services",
    # Consumer Discretionary
    "AMZN": "Consumer Discretionary", "TSLA": "Consumer Discretionary",
    "HD": "Consumer Discretionary", "MCD": "Consumer Discretionary",
    "NKE": "Consumer Discretionary", "TGT": "Consumer Discretionary",
    "SBUX": "Consumer Discretionary", "LOW": "Consumer Discretionary",
    "GM": "Consumer Discretionary", "F": "Consumer Discretionary",
    "BKNG": "Consumer Discretionary", "ABNB": "Consumer Discretionary",
    "UBER": "Consumer Discretionary", "DASH": "Consumer Discretionary",
    # Consumer Staples
    "WMT": "Consumer Staples", "PG": "Consumer Staples", "KO": "Consumer Staples",
    "PEP": "Consumer Staples", "COST": "Consumer Staples", "PM": "Consumer Staples",
    "MO": "Consumer Staples", "CL": "Consumer Staples", "MDLZ": "Consumer Staples",
    # Financials
    "JPM": "Financials", "BAC": "Financials", "WFC": "Financials",
    "GS": "Financials", "MS": "Financials", "BLK": "Financials",
    "C": "Financials", "BRK-B": "Financials", "BRK.B": "Financials",
    "AXP": "Financials", "V": "Financials", "MA": "Financials",
    "PYPL": "Financials", "SPGI": "Financials", "MCO": "Financials",
    "USB": "Financials", "PNC": "Financials", "TFC": "Financials",
    "SCHW": "Financials", "COF": "Financials", "DFS": "Financials",
    "SBSI": "Financials",
    # Healthcare
    "JNJ": "Healthcare", "LLY": "Healthcare", "UNH": "Healthcare",
    "ABBV": "Healthcare", "MRK": "Healthcare", "PFE": "Healthcare",
    "ABT": "Healthcare", "TMO": "Healthcare", "DHR": "Healthcare",
    "CVS": "Healthcare", "CI": "Healthcare", "HUM": "Healthcare",
    "MDT": "Healthcare", "SYK": "Healthcare", "BSX": "Healthcare",
    "BMY": "Healthcare", "AMGN": "Healthcare", "GILD": "Healthcare",
    "ISRG": "Healthcare", "VRTX": "Healthcare", "REGN": "Healthcare",
    "MRNA": "Healthcare", "ZTS": "Healthcare", "BIIB": "Healthcare",
    # Energy
    "XOM": "Energy", "CVX": "Energy", "COP": "Energy",
    "EOG": "Energy", "SLB": "Energy", "PSX": "Energy",
    "MPC": "Energy", "VLO": "Energy", "OXY": "Energy",
    "PXD": "Energy", "DVN": "Energy", "HAL": "Energy",
    # Industrials
    "CAT": "Industrials", "BA": "Industrials", "HON": "Industrials",
    "UPS": "Industrials", "RTX": "Industrials", "GE": "Industrials",
    "LMT": "Industrials", "NOC": "Industrials", "DE": "Industrials",
    "MMM": "Industrials", "EMR": "Industrials", "ETN": "Industrials",
    "FDX": "Industrials", "CSX": "Industrials", "UNP": "Industrials",
    # Materials
    "LIN": "Materials", "APD": "Materials", "SHW": "Materials",
    "ECL": "Materials", "NEM": "Materials", "FCX": "Materials",
    # Real Estate
    "AMT": "Real Estate", "PLD": "Real Estate", "EQIX": "Real Estate",
    "CCI": "Real Estate", "PSA": "Real Estate", "O": "Real Estate",
    # Utilities
    "NEE": "Utilities", "DUK": "Utilities", "SO": "Utilities",
    "D": "Utilities", "AEP": "Utilities", "EXC": "Utilities",
    # ETFs
    "VOO": "Funds/ETFs", "SPY": "Funds/ETFs", "IVV": "Funds/ETFs",
    "QQQ": "Funds/ETFs", "VTI": "Funds/ETFs", "VT": "Funds/ETFs",
    "SCHD": "Funds/ETFs", "VUG": "Funds/ETFs", "VTV": "Funds/ETFs",
    "AGG": "Funds/ETFs", "BND": "Funds/ETFs", "GLD": "Funds/ETFs",
    "IWM": "Funds/ETFs", "DIA": "Funds/ETFs", "ARKK": "Funds/ETFs",
    "XLK": "Funds/ETFs", "XLF": "Funds/ETFs", "VXUS": "Funds/ETFs",
    "EWZ": "Funds/ETFs", "IEMG": "Funds/ETFs", "MCHI": "Funds/ETFs",
    # Mutual Funds
    "FXAIX": "Funds/ETFs", "VFIAX": "Funds/ETFs", "PRGFX": "Funds/ETFs",
    "VTSAX": "Funds/ETFs", "FCNTX": "Funds/ETFs", "FGRTX": "Funds/ETFs",
    "VWINX": "Funds/ETFs", "DBLTX": "Funds/ETFs", "CAMYX": "Funds/ETFs",
    "MIPTX": "Funds/ETFs",
    # Crypto
    "BTC": "Crypto", "ETH": "Crypto", "SOL": "Crypto",
    "BNB": "Crypto", "XRP": "Crypto", "ADA": "Crypto",
    "AVAX": "Crypto", "DOT": "Crypto", "MATIC": "Crypto",
}

METHODOLOGY_DISCLAIMER = (
    "ETF look-through and overlap are calculated from FMP constituent data when available. "
    "When constituent data is unavailable, estimated figures are labeled as estimates. "
    "This is educational analysis and does not constitute investment advice."
)


def _overlap_label_from_exposure(delta_pct: float, row_max_overlap: float) -> str:
    if delta_pct >= 4.0 or row_max_overlap >= 18.0:
        return "High"
    if delta_pct >= 2.0 or row_max_overlap >= 10.0:
        return "Med"
    return "Low"


def _concentration_score(hhi: float, top3_pct: float) -> float:
    hhi_component = min(hhi / 3500.0, 1.0) * 5.0
    top3_component = min(top3_pct / 80.0, 1.0) * 5.0
    return round(min(10.0, hhi_component + top3_component), 1)


def _is_etf(symbol: str, display_name: str) -> bool:
    symbol = symbol.upper()
    if symbol in KNOWN_ETFS:
        return True
    name = display_name.lower()
    return "etf" in name or "trust" in name or "index" in name


def _pair_overlap(
    left: dict[str, Any],
    right: dict[str, Any],
) -> float:
    """
    Heuristic pairwise overlap — used ONLY when FMP constituent data is unavailable.

    Two directly-held stocks have zero look-through overlap with each other
    (holding AAPL and MSFT doesn't cause duplication; they are separate positions).
    Overlap only arises when one or both positions are ETFs/funds that may share
    underlying stocks.
    """
    if left["symbol"] == right["symbol"]:
        return 0.0

    # Direct stock vs direct stock → no look-through overlap without constituent data
    if not left["is_etf"] and not right["is_etf"]:
        return 0.0

    # At least one side is an ETF — estimate based on weight and sector alignment
    overlap = min(left["weight_pct"], right["weight_pct"])
    if left["sector"] and left["sector"] == right["sector"]:
        overlap *= 0.55
    else:
        overlap *= 0.25
    if left["is_etf"] and right["is_etf"]:
        overlap *= 1.3   # two broad ETFs share many constituents
    else:
        overlap *= 1.0   # ETF vs single stock: modest contribution
    return round(min(overlap, 99.0), 1)


def _real_pair_overlap(
    left: dict[str, Any],
    right: dict[str, Any],
    constituents_map: dict[str, list[dict]],
) -> float:
    """Actual look-through overlap as portfolio percentage points.

    Direct stock vs stock is 0 because two separate stocks do not literally
    overlap. Stock vs ETF is the stock exposure contributed by that ETF.
    ETF vs ETF is the portfolio-scaled intersection of their constituent
    weights.
    """
    if left["symbol"] == right["symbol"]:
        return 0.0

    def _constituents(etf_symbol: str) -> dict[str, float]:
        return {
            row["symbol"].upper(): float(row.get("weight_pct") or 0.0)
            for row in constituents_map.get(etf_symbol) or []
        }

    if left["is_etf"] and right["is_etf"]:
        left_weights = _constituents(left["symbol"])
        right_weights = _constituents(right["symbol"])
        if not left_weights or not right_weights:
            return 0.0
        shared_inside_funds = sum(
            min(left_weights[sym], right_weights[sym])
            for sym in set(left_weights) & set(right_weights)
        )
        portfolio_overlap = min(left["weight_pct"], right["weight_pct"]) * shared_inside_funds / 100.0
        return round(portfolio_overlap, 2)

    etf = left if left["is_etf"] else right if right["is_etf"] else None
    stock = right if left["is_etf"] else left if right["is_etf"] else None
    if etf and stock and stock["bucket"] == "stocks":
        weight_inside_etf = _constituents(etf["symbol"]).get(stock["symbol"].upper(), 0.0)
        return round(etf["weight_pct"] * weight_inside_etf / 100.0, 2)

    return 0.0


def _estimate_true_exposure(
    asset: dict[str, Any],
    peers: list[dict[str, Any]],
) -> tuple[float, float]:
    stated = float(asset["weight_pct"])
    addon = 0.0
    for peer in peers:
        if peer["symbol"] == asset["symbol"]:
            continue
        if peer["sector"] and peer["sector"] == asset["sector"]:
            addon += peer["weight_pct"] * (0.18 if peer["is_etf"] else 0.08)
        elif peer["is_etf"] and asset["bucket"] == "stocks":
            addon += peer["weight_pct"] * 0.05
    addon = min(addon, max(0.0, 25.0 - stated))
    return round(stated + addon, 2), round(addon, 2)


def _fundamentals_from_metadata(metadata: Any, is_etf: bool) -> dict[str, Any]:
    if is_etf:
        return {
            "valuation_label": "Index",
            "valuation_pe": None,
            "analyst_rating": None,
            "insider_activity": None,
        }

    raw = metadata.raw_payload_json if metadata and metadata.raw_payload_json else {}
    if not isinstance(raw, dict):
        raw = {}

    # Try PE ratio from stored FMP fields
    pe_raw = raw.get("pe") or raw.get("peRatio")
    valuation_pe = None
    valuation_label = None
    if pe_raw is not None:
        try:
            pe_val = float(pe_raw)
            # Filter nonsensical values (negative or extreme PE)
            if 0 < pe_val < 1000:
                valuation_pe = round(pe_val, 1)
                valuation_label = f"{valuation_pe:.1f}x P/E"
        except (TypeError, ValueError):
            pass

    # Fallback: estimate from market_cap if no PE (but requires earnings — skip for now)
    # Try DCF intrinsic value comparison
    dcf_raw = raw.get("dcf")
    price_raw = raw.get("price")
    if valuation_label is None and dcf_raw and price_raw:
        try:
            dcf_val = float(dcf_raw)
            price_val = float(price_raw)
            if dcf_val > 0 and price_val > 0:
                discount = (dcf_val - price_val) / price_val * 100
                if discount > 15:
                    valuation_label = f"DCF +{discount:.0f}%"
                elif discount < -15:
                    valuation_label = f"DCF {discount:.0f}%"
                else:
                    valuation_label = f"Fair (~DCF)"
        except (TypeError, ValueError):
            pass

    if valuation_label is None:
        valuation_label = "—"

    beta_val = None
    if metadata and metadata.beta is not None:
        try:
            bv = float(metadata.beta)
            if 0.1 < bv < 5.0:
                beta_val = round(bv, 2)
        except (TypeError, ValueError):
            pass

    return {
        "valuation_label": valuation_label,
        "valuation_pe": valuation_pe,
        "pe_val": valuation_pe,
        "beta_val": beta_val,
        "analyst_rating": None,
        "insider_activity": None,
    }


def _portfolio_factors(
    assets: list[dict[str, Any]], metrics: dict[str, Any]
) -> tuple[dict[str, float], float | None]:
    """Returns (factor_scores, portfolio_beta).  portfolio_beta is None when no direct stocks have beta data."""
    stocks_pct = float(metrics.get("stocks_pct") or 0.0)
    crypto_pct = float(metrics.get("crypto_pct") or 0.0)
    cash_pct = float(metrics.get("cash_pct") or 0.0)
    tech_weight = sum(asset["weight_pct"] for asset in assets if asset.get("sector") == "Technology")
    energy_weight = sum(asset["weight_pct"] for asset in assets if asset.get("sector") == "Energy")

    # Weighted beta and PE from real fundamentals (direct stocks only)
    w_beta_sum = 0.0
    w_pe_sum = 0.0
    w_sum_beta = 0.0
    w_sum_pe = 0.0
    for asset in assets:
        if asset.get("is_etf") or asset.get("bucket") in ("crypto", "cash"):
            continue
        w = float(asset.get("weight_pct", 0.0))
        if w <= 0:
            continue
        beta = asset.get("beta_val")
        if beta:
            w_beta_sum += beta * w
            w_sum_beta += w
        pe = asset.get("pe_val")
        if pe and 0 < pe < 200:
            w_pe_sum += pe * w
            w_sum_pe += w

    avg_beta = w_beta_sum / w_sum_beta if w_sum_beta > 0 else 1.0
    avg_pe = w_pe_sum / w_sum_pe if w_sum_pe > 0 else 0.0

    # Growth: high PE → growth tilt. PE=15→50, PE=25→65, PE=40→80, PE=60→90
    growth = round(min(94.0, max(38.0, 40.0 + (avg_pe - 10) * 1.4 + crypto_pct * 0.3)), 1) if avg_pe > 0 else round(min(94.0, 40.0 + tech_weight * 1.1 + crypto_pct * 0.35), 1)

    # Value: low PE → value tilt. PE=10→82, PE=20→65, PE=30→50
    value = round(min(88.0, max(18.0, 88.0 - avg_pe * 1.3)), 1) if avg_pe > 0 else round(min(88.0, 25.0 + energy_weight * 1.4 + cash_pct * 0.2), 1)

    # Low Vol: low beta → low volatility. beta=0.6→82, beta=1.0→62, beta=1.5→42
    low_vol = round(min(90.0, max(10.0, 82.0 - (avg_beta - 0.5) * 40.0)), 1) if w_sum_beta > 0 else round(max(10.0, 55.0 - crypto_pct * 0.8 - tech_weight * 0.25), 1)

    portfolio_beta: float | None = round(avg_beta, 2) if w_sum_beta > 0 else None

    return {
        "Growth": growth,
        "Value": value,
        "Quality": round(min(90.0, 45.0 + stocks_pct * 0.35), 1),
        "Momentum": round(min(90.0, 35.0 + tech_weight * 0.8 + crypto_pct * 0.5), 1),
        "Low Vol": low_vol,
        "Size": round(max(10.0, 30.0 + stocks_pct * 0.15 - crypto_pct * 0.2), 1),
    }, portfolio_beta


def _portfolio_health_grade(
    concentration_score: float,
    etf_overlap_pct: float,
    international_pct: float,
) -> tuple[str, str]:
    """Return (letter_grade, one_line_description) for a simple portfolio health summary."""
    pts = 0

    # Concentration component (0–10 scale; higher = riskier)
    if concentration_score <= 2.0:
        pts += 4
    elif concentration_score <= 4.0:
        pts += 3
    elif concentration_score <= 6.0:
        pts += 2
    elif concentration_score <= 7.5:
        pts += 1

    # Overlap component — thresholds calibrated for _etf_overlap_sum (sum of ETF pairs,
    # not the old diluted mean). A single large ETF with direct-stock overlap typically
    # scores 5–15%; two overlapping ETFs (VOO + QQQ) score 10–25%.
    if etf_overlap_pct < 5.0:
        pts += 3
    elif etf_overlap_pct < 15.0:
        pts += 2
    elif etf_overlap_pct < 25.0:
        pts += 1

    # Geographic diversification
    if international_pct >= 15.0:
        pts += 3
    elif international_pct >= 5.0:
        pts += 2
    elif international_pct >= 1.0:
        pts += 1

    if pts >= 8:
        return "A", "Well diversified"
    if pts >= 6:
        return "B", "Reasonably diversified"
    if pts >= 4:
        return "C", "Moderate concentration risk"
    if pts >= 2:
        return "D", "Concentrated — needs attention"
    return "F", "High concentration risk"


# Known international ETF geography map
_INTL_ETF_GEO: dict[str, tuple[float, float]] = {
    # symbol: (intl_developed_fraction, emerging_fraction)  — rest goes to US
    "VXUS": (0.60, 0.40),
    "VEA":  (1.00, 0.00),
    "EFA":  (1.00, 0.00),
    "VWO":  (0.00, 1.00),
    "IEMG": (0.00, 1.00),
    "MCHI": (0.00, 1.00),
    "EWZ":  (0.00, 1.00),
    "VT":   (0.27, 0.13),  # ~40 % international; rest (~60 %) is US
    "VXUS_PARTIAL": (0.60, 0.40),
}
# Fully US domestic ETFs (no international allocation)
_US_ETFS = {
    "VOO", "SPY", "IVV", "QQQ", "VTI", "DIA", "IWM",
    "SCHD", "VUG", "VTV", "ARKK", "XLK", "XLF", "XLE",
    "BND", "AGG", "FXAIX", "VFIAX", "VTSAX", "FCNTX",
}


def _etf_overlap_sum(
    matrix: list[list[float]],
    assets: list[dict[str, Any]],
) -> float:
    """
    Total portfolio overlap attributable to ETF positions.

    Sums the upper-triangle of the overlap matrix but ONLY for pairs where
    at least one side is an ETF.  Stock↔stock pairs are always 0 and should
    not dilute the metric — the old _mean_pairwise_overlap divided by *all*
    pairs (105 for 15 holdings), reducing a real 10% ETF overlap to ~0.3%
    which rounded to "0.0" on the KPI tile.

    Returns 0.0 for portfolios with no ETFs (correct — no overlap to report).
    """
    total = 0.0
    for row_idx in range(len(assets)):
        for col_idx in range(row_idx + 1, len(assets)):
            if assets[row_idx]["is_etf"] or assets[col_idx]["is_etf"]:
                total += matrix[row_idx][col_idx]
    return round(total, 1)


def _row_max_overlap(matrix: list[list[float]]) -> dict[int, float]:
    row_max: dict[int, float] = {}
    for row_idx, row in enumerate(matrix):
        off_diagonal = [value for col_idx, value in enumerate(row) if col_idx != row_idx]
        row_max[row_idx] = max(off_diagonal) if off_diagonal else 0.0
    return row_max


def _severity_from_pct(value: float, *, high: float, medium: float) -> str:
    if value >= high:
        return "high"
    if value >= medium:
        return "medium"
    return "low"


def _build_xray_summary(
    *,
    enriched: list[dict[str, Any]],
    treemap: list[dict[str, Any]],
    geographic: list[dict[str, Any]],
    concentration: dict[str, Any],
    real_look_through: dict[str, Any] | None,
    data_quality: dict[str, Any],
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    """Return the product-level X-Ray story: what is owned, duplicated, and risky."""
    top_holding = max(enriched, key=lambda item: item["weight_pct"], default=None)
    top_sector = treemap[0] if treemap else None
    international_pct = sum(
        row["weight_pct"]
        for row in geographic
        if row["label"] in {"International Developed", "Emerging Markets"}
    )
    duplicated_entries = (
        [
            row
            for row in real_look_through.get("entries", [])
            if row.get("is_direct") and row.get("etf_contribution_pct", 0) > 0
        ]
        if real_look_through
        else []
    )
    largest_duplication = max(
        duplicated_entries,
        key=lambda row: row.get("etf_contribution_pct", 0),
        default=None,
    )

    cards: list[dict[str, Any]] = []
    if top_holding:
        top_weight = float(top_holding["weight_pct"])
        cards.append({
            "id": "largest_position",
            "title": "Largest position",
            "severity": _severity_from_pct(top_weight, high=20.0, medium=10.0),
            "metric_label": top_holding["symbol"],
            "metric_value": round(top_weight, 1),
            "unit": "%",
            "message": (
                f"{top_holding['symbol']} is the largest stated holding at {top_weight:.1f}% "
                "of the portfolio."
            ),
            "confidence": "real",
        })

    if top_sector:
        sector_weight = float(top_sector["weight_pct"])
        cards.append({
            "id": "sector_concentration",
            "title": "Largest sector exposure",
            "severity": _severity_from_pct(sector_weight, high=35.0, medium=25.0),
            "metric_label": top_sector["label"],
            "metric_value": round(sector_weight, 1),
            "unit": "%",
            "message": (
                f"{top_sector['label']} is the largest sector bucket at {sector_weight:.1f}% "
                "after available ETF look-through."
            ),
            "confidence": data_quality["sector_confidence"],
        })

    if largest_duplication:
        uplift = float(largest_duplication.get("etf_contribution_pct") or 0.0)
        cards.append({
            "id": "hidden_duplication",
            "title": "Hidden ETF duplication",
            "severity": _severity_from_pct(uplift, high=5.0, medium=2.0),
            "metric_label": largest_duplication["symbol"],
            "metric_value": round(uplift, 1),
            "unit": "%",
            "message": (
                f"{largest_duplication['symbol']} has +{uplift:.1f}% additional exposure "
                "through ETFs on top of the direct position."
            ),
            "confidence": data_quality["lookthrough_confidence"],
        })
    else:
        cards.append({
            "id": "hidden_duplication",
            "title": "Hidden ETF duplication",
            "severity": "low" if data_quality["lookthrough_confidence"] in {"real", "partial"} else "medium",
            "metric_label": "Duplication",
            "metric_value": float(real_look_through.get("double_counted_stocks", 0)) if real_look_through else 0.0,
            "unit": "holdings",
            "message": (
                "No direct stock duplication was found inside analyzed ETFs."
                if data_quality["lookthrough_confidence"] in {"real", "partial"}
                else "ETF constituent data is not available yet, so hidden duplication cannot be confirmed."
            ),
            "confidence": data_quality["lookthrough_confidence"],
        })

    cards.append({
        "id": "global_diversification",
        "title": "Global diversification",
        "severity": "medium" if international_pct < 10 else "low",
        "metric_label": "International",
        "metric_value": round(international_pct, 1),
        "unit": "%",
        "message": (
            f"International equity exposure is about {international_pct:.1f}% based on the current "
            "portfolio geography model."
        ),
        "confidence": "estimated",
    })

    actions: list[dict[str, Any]] = []
    top3_pct = float(concentration.get("top3_pct") or 0.0)
    if top3_pct >= 35:
        actions.append({
            "priority": "high" if top3_pct >= 50 else "medium",
            "title": "Review top-position concentration",
            "message": f"The top three holdings represent {top3_pct:.1f}% of the portfolio.",
        })
    if top_sector and float(top_sector["weight_pct"]) >= 30:
        actions.append({
            "priority": "medium",
            "title": "Stress test sector exposure",
            "message": f"{top_sector['label']} exposure is {float(top_sector['weight_pct']):.1f}% after available look-through.",
        })
    if largest_duplication:
        actions.append({
            "priority": "medium",
            "title": "Check ETF/direct-stock duplication",
            "message": (
                f"{largest_duplication['symbol']} receives +{float(largest_duplication['etf_contribution_pct']):.1f}% "
                "from ETFs in addition to the direct position."
            ),
        })
    if data_quality["lookthrough_confidence"] in {"partial", "unavailable"}:
        actions.append({
            "priority": "low",
            "title": "Improve look-through coverage",
            "message": "Some ETF constituents were unavailable, so overlap confidence is limited.",
        })

    return cards[:4], actions[:4]


async def build_portfolio_xray(
    allocation: dict[str, Any],
    metadata_service: AssetMetadataService,
    lookthrough_service: "ETFLookthroughService | None" = None,
) -> dict[str, Any]:
    assets = allocation.get("assets") or []
    if not assets:
        return {
            "status": allocation.get("status", "degraded"),
            "warnings": allocation.get("warnings") or ["No holdings available for analysis."],
            "error": "No holdings available for analysis.",
        }

    metadata_map = await metadata_service.get_many(assets)
    enriched: list[dict[str, Any]] = []
    for asset in assets:
        metadata = metadata_map[asset["asset_key"]]
        display_name = metadata.display_name or asset["canonical_symbol"]
        is_etf = _is_etf(asset["canonical_symbol"], display_name)
        sym_upper = asset["canonical_symbol"].upper()
        raw_sector = metadata.sector if metadata and metadata.sector not in (None, "", "Unknown") else None
        sector = (
            raw_sector
            or KNOWN_SECTOR_MAP.get(sym_upper)
            or ("Crypto currency" if asset["bucket"] == "crypto" else ("Funds/ETFs" if is_etf else "Unknown"))
        )
        fundamentals = _fundamentals_from_metadata(metadata, is_etf)
        enriched.append(
            {
                "symbol": asset["canonical_symbol"],
                "name": display_name,
                "bucket": asset["bucket"],
                "sector": sector,
                "asset_class": asset.get("asset_class") or asset["bucket"],
                "weight_pct": round(float(asset["weight_pct"]), 2),
                "value_usd": round(float(asset["value_usd"]), 2),
                "is_etf": is_etf,
                "metadata_status": metadata.metadata_status,
                **fundamentals,
            }
        )

    enriched.sort(key=lambda item: item["weight_pct"], reverse=True)
    total_value = round(sum(item["value_usd"] for item in enriched), 2)
    metrics = allocation.get("metrics") or {}
    breakdowns = allocation.get("breakdowns") or {}

    positions = [
        {
            "ticker": item["symbol"],
            "asset_name": item["name"],
            "asset_class": item["asset_class"],
            "quantity": 1.0,
            "price": item["value_usd"],
            "sector": item["sector"],
        }
        for item in enriched
        if item["value_usd"] > 0
    ]
    concentration = analyze_concentration(positions)
    if concentration.get("error"):
        return {
            "status": allocation.get("status", "degraded"),
            "warnings": allocation.get("warnings") or [concentration["error"]],
            "error": concentration["error"],
        }

    # ── True exposure — real look-through if ETFs present, heuristic fallback ─
    etf_holdings = [item for item in enriched if item["is_etf"]]
    etf_symbols = [item["symbol"] for item in etf_holdings]

    real_exposure_map: dict[str, Any] = {}
    constituents_map: dict[str, list[dict]] = {}

    etf_sector_weights: dict[str, dict[str, float]] = {}
    if lookthrough_service and etf_symbols:
        try:
            import asyncio as _asyncio
            # 12-second budget: session setup (≤8s) + at least one ETF fetch.
            # If the cache is cold and Yahoo Finance is slow, fall back to
            # heuristic overlap rather than blocking the whole response.
            lookthrough_result = await _asyncio.wait_for(
                lookthrough_service.get_many(etf_symbols), timeout=12.0
            )
            if isinstance(lookthrough_result, tuple):
                constituents_map, etf_sector_weights = lookthrough_result
            else:
                constituents_map = lookthrough_result or {}
                etf_sector_weights = {}
            real_exposure_map = lookthrough_service.compute_true_exposure(enriched, constituents_map)
        except Exception as _lt_exc:
            from app.core.logging import get_logger
            get_logger().warning("lookthrough_failed", error=str(_lt_exc))

    for item in enriched:
        sym = item["symbol"]
        if sym in real_exposure_map:
            real_data = real_exposure_map[sym]
            item["true_exposure_pct"] = round(real_data["total_pct"], 2)
            item["etf_addon_pct"] = round(real_data["etf_contribution_pct"], 2)
        else:
            # Do not invent hidden exposure. If constituent data is missing,
            # stated position weight is the only confirmed exposure.
            item["true_exposure_pct"] = item["weight_pct"]
            item["etf_addon_pct"] = 0.0

    # Include every holding with ≥ 0.5 % weight, up to 15 — gives a meaningful
    # pairwise matrix even for diversified portfolios while keeping the grid size sane.
    overlap_assets = [item for item in enriched if item["weight_pct"] >= 0.5][:15]
    overlap_labels = [item["symbol"] for item in overlap_assets]
    overlap_matrix = [
        [
            (
                0.0
                if row_idx == col_idx
                else (
                    _real_pair_overlap(overlap_assets[row_idx], overlap_assets[col_idx], constituents_map)
                    if any(constituents_map.values())
                    else _pair_overlap(overlap_assets[row_idx], overlap_assets[col_idx])
                )
            )
            for col_idx in range(len(overlap_assets))
        ]
        for row_idx in range(len(overlap_assets))
    ]
    row_max_by_index = _row_max_overlap(overlap_matrix)
    overlap_max_by_symbol = {
        overlap_assets[row_idx]["symbol"]: row_max_by_index.get(row_idx, 0.0)
        for row_idx in range(len(overlap_assets))
    }

    for item in enriched:
        delta_pct = round(item["true_exposure_pct"] - item["weight_pct"], 2)
        row_max_overlap = overlap_max_by_symbol.get(item["symbol"], 0.0)
        item["overlap_risk"] = _overlap_label_from_exposure(delta_pct, row_max_overlap)

    etf_overlap_pct = _etf_overlap_sum(overlap_matrix, overlap_assets)

    # ── Sector weights: seed from direct holdings ─────────────────────────────
    from collections import defaultdict as _defaultdict
    _sector_weights: dict[str, float] = _defaultdict(float)
    for _item in enriched:
        if _item["value_usd"] > 0:
            # Normalise crypto: any crypto asset → "Crypto currency" bucket
            _item_sector = "Crypto currency" if _item["bucket"] == "crypto" else _item["sector"]
            _sector_weights[_item_sector] += _item["weight_pct"]

    # ── ETF look-through: distribute ETF weight across real sectors ───────────
    # Priority: Yahoo Finance sectorWeightings (full 100% accuracy) →
    #           KNOWN_SECTOR_MAP approximation from top-10 constituents.
    for _etf_sym, _etf_sw in etf_sector_weights.items():
        _etf_item = next((i for i in enriched if i["symbol"] == _etf_sym), None)
        if not _etf_item:
            continue
        _etf_w = _etf_item["weight_pct"]

        if _etf_sw:
            # Full redistribution using Yahoo sector weights (sum ≈ 100%)
            for _sector, _sw_pct in _etf_sw.items():
                _sector_weights[_sector] += _etf_w * _sw_pct / 100.0
            # Remove the ETF's own "Funds/ETFs" weight (now fully distributed)
            _sector_weights["Funds/ETFs"] = max(
                0.0, _sector_weights.get("Funds/ETFs", 0.0) - _etf_w
            )
        else:
            # Fallback: partial resolution via KNOWN_SECTOR_MAP for known constituents
            _constituents = constituents_map.get(_etf_sym) or []
            _resolved = 0.0
            for _c in _constituents:
                _c_sector = KNOWN_SECTOR_MAP.get(_c["symbol"].upper())
                if not _c_sector or _c_sector in ("Funds/ETFs", "Unknown"):
                    continue
                _contrib = _etf_w * float(_c.get("weight_pct", 0.0)) / 100.0
                if _contrib > 0.01:
                    _sector_weights[_c_sector] += _contrib
                    _resolved += _contrib
            _sector_weights["Funds/ETFs"] = max(
                0.0, _sector_weights.get("Funds/ETFs", 0.0) - _resolved
            )

    # ── Sector treemap — top 8 non-trivial sectors (exclude residual Funds/ETFs) ─
    _TREEMAP_EXCLUDE = {"Unknown", "Funds/ETFs"}
    treemap = sorted(
        [
            {"label": s, "weight_pct": round(w, 2)}
            for s, w in _sector_weights.items()
            if w > 0.3 and s not in _TREEMAP_EXCLUDE
        ],
        key=lambda x: x["weight_pct"],
        reverse=True,
    )[:8]

    # Fall back to crypto categories if no equity sectors
    if not treemap:
        treemap = [
            {"label": row["label"], "weight_pct": round(float(row["weight_pct"]), 2)}
            for row in (breakdowns.get("by_crypto_category") or [])[:8]
        ]

    # Active sector exposure vs S&P 500 — exclude non-equity sectors
    BENCHMARK_SKIP = {"Unknown", "Funds/ETFs", "Crypto currency", "Cash"}
    sector_rows = []
    for _label, _portfolio_pct in sorted(_sector_weights.items(), key=lambda x: -x[1]):
        if _label in BENCHMARK_SKIP:
            continue
        _benchmark_pct = BENCHMARK_SECTOR_WEIGHTS.get(_label, 0.0)
        if _portfolio_pct < 0.4 and _benchmark_pct < 0.4:
            continue
        sector_rows.append({
            "label": _label,
            "portfolio_pct": round(_portfolio_pct, 2),
            "benchmark_pct": _benchmark_pct,
            "active_pct": round(_portfolio_pct - _benchmark_pct, 2),
        })

    look_through = sorted(
        [
            {
                "symbol": item["symbol"],
                "name": item["name"],
                "stated_pct": item["weight_pct"],
                "etf_addon_pct": item["etf_addon_pct"],
                "true_exposure_pct": item["true_exposure_pct"],
                "delta_pct": round(item["true_exposure_pct"] - item["weight_pct"], 2),
                "overlap_risk": item["overlap_risk"],
            }
            for item in enriched
        ],
        key=lambda row: row["true_exposure_pct"],
        reverse=True,
    )[:12]

    stocks_pct = float(metrics.get("stocks_pct") or 0.0)
    crypto_pct = float(metrics.get("crypto_pct") or 0.0)
    cash_pct = float(metrics.get("cash_pct") or 0.0)

    # ── Improved geographic allocation — use known ETF geography ─────────────
    _us_w = 0.0
    _intl_dev_w = 0.0
    _em_w = 0.0
    _other_w = 0.0
    for _item in enriched:
        _w = _item["weight_pct"]
        _sym = _item["symbol"].upper()
        if _item["bucket"] == "crypto":
            _us_w += _w * 0.35
            _other_w += _w * 0.65
        elif _item["bucket"] in ("cash", "stablecoin"):
            pass  # tracked separately as Cash & Stablecoins
        elif _item["is_etf"]:
            if _sym in _US_ETFS:
                _us_w += _w
            elif _sym in _INTL_ETF_GEO:
                _id_frac, _em_frac = _INTL_ETF_GEO[_sym]
                _us_frac = max(0.0, 1.0 - _id_frac - _em_frac)
                _us_w += _w * _us_frac
                _intl_dev_w += _w * _id_frac
                _em_w += _w * _em_frac
            else:
                # Unknown ETF: apply typical US-heavy index split
                _us_w += _w * 0.82
                _intl_dev_w += _w * 0.11
                _em_w += _w * 0.07
        else:
            # Direct stock — assume US-listed company is primarily US
            _us_w += _w

    _cash_geo_pct = round(cash_pct + float(metrics.get("stablecoin_pct") or 0.0), 1)
    geographic = [
        {"label": "United States", "weight_pct": round(_us_w, 1)},
        {"label": "International Developed", "weight_pct": round(_intl_dev_w, 1)},
        {"label": "Emerging Markets", "weight_pct": round(_em_w, 1)},
        {"label": "Cash & Stablecoins", "weight_pct": _cash_geo_pct},
    ]

    # ── Asset class breakdown from actual enriched buckets ────────────────────
    _direct_stocks_w = sum(_i["weight_pct"] for _i in enriched if not _i["is_etf"] and _i["bucket"] == "stocks")
    _etf_w = sum(_i["weight_pct"] for _i in enriched if _i["is_etf"])
    _crypto_w = sum(_i["weight_pct"] for _i in enriched if _i["bucket"] == "crypto")
    _cash_w = sum(_i["weight_pct"] for _i in enriched if _i["bucket"] in ("cash", "stablecoin"))
    asset_classes = [
        ac for ac in [
            {"label": "Direct Stocks", "weight_pct": round(_direct_stocks_w, 1)},
            {"label": "ETFs / Funds", "weight_pct": round(_etf_w, 1)},
            {"label": "Crypto", "weight_pct": round(_crypto_w, 1)},
            {"label": "Cash", "weight_pct": round(_cash_w, 1)},
        ]
        if ac["weight_pct"] >= 0.1
    ]

    largest_hidden = max(look_through, key=lambda row: row["delta_pct"], default=None)
    factors, portfolio_beta = _portfolio_factors(enriched, metrics)
    findings = [
        {
            "severity": flag["severity"],
            "message": flag["description"],
        }
        for flag in concentration.get("summary_flags") or []
    ]
    for warning in allocation.get("warnings") or []:
        findings.append({"severity": "YELLOW", "message": warning})

    international_equity_pct = round(
        (geographic[1]["weight_pct"] if len(geographic) > 1 else 0.0)
        + (geographic[2]["weight_pct"] if len(geographic) > 2 else 0.0),
        1,
    )
    active_sector_tilt_pct = round(
        max((abs(row["active_pct"]) for row in sector_rows), default=0.0),
        1,
    )
    largest_uplift_pct = round(largest_hidden["delta_pct"], 1) if largest_hidden else 0.0

    _concentration_score_val = _concentration_score(
        float(concentration.get("hhi_score") or 0.0),
        float(concentration.get("top3_pct") or 0.0),
    )
    _health_grade, _health_desc = _portfolio_health_grade(
        _concentration_score_val,
        etf_overlap_pct,
        international_equity_pct,
    )
    _est_vol_pct: float | None = round((portfolio_beta or 1.0) * 15.5, 1) if portfolio_beta is not None else None

    kpis = {
        "portfolio_value": total_value,
        "true_equity_exposure_pct": round(stocks_pct, 1),
        "etf_overlap_pct": etf_overlap_pct,
        "concentration_score": _concentration_score_val,
        "overall_severity": concentration.get("overall_severity"),
        "hhi_label": concentration.get("hhi_label"),
        "top3_pct": concentration.get("top3_pct"),
        "metadata_coverage_pct": metrics.get("metadata_coverage_pct"),
        "portfolio_beta": portfolio_beta,
        "estimated_volatility_pct": _est_vol_pct,
        "health_grade": _health_grade,
        "health_description": _health_desc,
    }
    secondary_kpis = {
        "largest_lookthrough_uplift_pct": largest_uplift_pct,
        "largest_lookthrough_symbol": largest_hidden["symbol"] if largest_hidden else None,
        "international_equity_pct": international_equity_pct,
        "active_sector_tilt_pct": active_sector_tilt_pct,
    }
    # ── Build real_look_through section ───────────────────────────────────────
    real_look_through = None
    lookthrough_model = "sector_etf_heuristic"

    if real_exposure_map:
        lookthrough_model = "fmp_etf_holder"
        # Only include stocks with at least one ETF contribution
        lt_entries = sorted(
            [
                {
                    "symbol": d["symbol"],
                    "name": d["name"],
                    "direct_pct": round(d["direct_pct"], 3),
                    "via_etfs": d["via_etfs"],
                    "etf_contribution_pct": round(d["etf_contribution_pct"], 3),
                    "total_pct": round(d["total_pct"], 3),
                    "is_direct": d["is_direct"],
                    "duplication_count": len(d["via_etfs"]) + (1 if d["is_direct"] else 0),
                }
                for d in real_exposure_map.values()
                if d["etf_contribution_pct"] > 0 or d["is_direct"]
            ],
            key=lambda x: x["total_pct"],
            reverse=True,
        )  # no cap — all stocks with any ETF contribution are returned so the frontend can look up any searched symbol

        # Summary: count directly-held stocks that also appear inside ETFs
        double_counted = sum(
            1 for e in lt_entries
            if e["is_direct"] and e["etf_contribution_pct"] > 0
        )
        total_etf_contrib = round(
            sum(e["etf_contribution_pct"] for e in lt_entries if e["is_direct"]), 2
        )

        real_look_through = {
            "entries": lt_entries,
            "etf_symbols_analyzed": etf_symbols,
            "double_counted_stocks": double_counted,
            "avg_hidden_exposure_pct": round(
                total_etf_contrib / double_counted if double_counted else 0.0, 2
            ),
            "model": "fmp_etf_holder",
            "note": (
                f"Real constituent data from FMP for {len(etf_symbols)} ETF(s). "
                f"{double_counted} direct holding(s) also appear inside your ETFs."
            ),
        }

    # ── Build per-ETF sector breakdown ────────────────────────────────────────
    # For each ETF in the portfolio, distribute its constituent weights across
    # sectors using KNOWN_SECTOR_MAP.  Weights are expressed as a percentage of
    # the *covered* constituents (top-100 from FMP), so they roughly sum to 100.
    from collections import defaultdict as _dd2
    etf_sector_breakdown: dict[str, list[dict]] = {}
    if constituents_map:
        for _etf_sym, _constituents in constituents_map.items():
            _sec_weights: dict[str, float] = _dd2(float)
            _other_pct = 0.0
            for _c in _constituents:
                _sym = _c["symbol"].upper()
                _w = float(_c.get("weight_pct") or 0.0)
                if _w <= 0:
                    continue
                _sector = KNOWN_SECTOR_MAP.get(_sym)
                if _sector and _sector not in ("Funds/ETFs", "Unknown"):
                    _sec_weights[_sector] += _w
                else:
                    _other_pct += _w
            _covered = sum(_sec_weights.values()) + _other_pct
            if _covered > 0:
                _breakdown = [
                    {"label": _s, "weight_pct": round(_w / _covered * 100, 1)}
                    for _s, _w in sorted(_sec_weights.items(), key=lambda x: -x[1])
                    if _w / _covered * 100 >= 0.5
                ]
                if _other_pct / _covered * 100 >= 1.0:
                    _breakdown.append({
                        "label": "Other",
                        "weight_pct": round(_other_pct / _covered * 100, 1),
                    })
                if _breakdown:
                    etf_sector_breakdown[_etf_sym] = _breakdown

    etfs_with_data = [sym for sym in etf_symbols if constituents_map.get(sym)]
    etfs_missing_data = [sym for sym in etf_symbols if sym not in etfs_with_data]
    covered_etf_weight_pct = round(
        sum(item["weight_pct"] for item in etf_holdings if item["symbol"] in etfs_with_data),
        2,
    )
    unresolved_etf_weight_pct = round(
        sum(item["weight_pct"] for item in etf_holdings if item["symbol"] in etfs_missing_data),
        2,
    )
    if not etf_symbols:
        lookthrough_confidence = "not_applicable"
    elif etfs_with_data and not etfs_missing_data:
        lookthrough_confidence = "real"
    elif etfs_with_data:
        lookthrough_confidence = "partial"
    else:
        lookthrough_confidence = "unavailable"

    data_quality = {
        "lookthrough_confidence": lookthrough_confidence,
        "overlap_confidence": lookthrough_confidence if etf_symbols else "not_applicable",
        "sector_confidence": "partial" if etfs_with_data else "estimated",
        "etfs_requested": etf_symbols,
        "etfs_analyzed": etfs_with_data,
        "etfs_missing": etfs_missing_data,
        "covered_etf_weight_pct": covered_etf_weight_pct,
        "unresolved_etf_weight_pct": unresolved_etf_weight_pct,
        "metadata_coverage_pct": metrics.get("metadata_coverage_pct"),
    }
    xray_summary, action_items = _build_xray_summary(
        enriched=enriched,
        treemap=treemap,
        geographic=geographic,
        concentration=concentration,
        real_look_through=real_look_through,
        data_quality=data_quality,
    )

    methodology = {
        "overlap_model": "fmp_constituent_intersection" if etfs_with_data else "estimated_pairwise",
        "lookthrough_model": lookthrough_model,
        "metadata_coverage_pct": metrics.get("metadata_coverage_pct"),
        "status": allocation.get("status", "ok"),
        "disclaimer": METHODOLOGY_DISCLAIMER,
        "data_quality": data_quality,
    }
    # Hard 5-second budget for macro data (live Yahoo Finance + BLS calls).
    # If the external APIs are slow or unreliable, fall back to static values
    # immediately so the X-Ray page never hangs waiting for macro indicators.
    try:
        import asyncio as _asyncio
        macro_snapshot = await _asyncio.wait_for(
            build_macro_snapshot(enriched), timeout=5.0
        )
    except _asyncio.TimeoutError:
        from app.services.financial_analysis.macro_snapshot import _STATIC, _join_tickers, _pick_symbols
        macro_snapshot = {
            "regime_label": "Mixed Macro",
            "indicators": [],
            "impact_cards": [],
            "source": "static_fallback",
        }
        get_logger().warning("macro_snapshot_timeout", timeout_s=5.0)

    return {
        "status": allocation.get("status", "ok"),
        "warnings": allocation.get("warnings") or [],
        "computed_at": None,
        "kpis": kpis,
        "secondary_kpis": secondary_kpis,
        "methodology": methodology,
        "macro_snapshot": macro_snapshot,
        "overlap_heatmap": {
            "labels": overlap_labels,
            "matrix": overlap_matrix,
        },
        "sector_treemap": treemap,
        "sector_active": sector_rows,
        "factor_footprint": {
            "portfolio": factors,
            "benchmark": BENCHMARK_FACTORS,
        },
        "key_findings": findings[:4],
        "xray_summary": xray_summary,
        "action_items": action_items,
        "data_quality": data_quality,
        "holdings": enriched,
        "look_through": look_through,
        "real_look_through": real_look_through,
        "etf_sector_breakdown": etf_sector_breakdown,
        "true_sector_exposure": treemap,
        "geographic_allocation": geographic,
        "asset_class_allocation": asset_classes,
        "underlying_holdings": look_through[:8],
        "largest_hidden_overlap": largest_hidden,
        "concentration": {
            "overall_severity": concentration.get("overall_severity"),
            "hhi_score": concentration.get("hhi_score"),
            "hhi_label": concentration.get("hhi_label"),
            "top3_pct": concentration.get("top3_pct"),
            "summary_flags": concentration.get("summary_flags") or [],
        },
    }
