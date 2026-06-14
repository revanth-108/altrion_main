"""
Altrion Financial Health Score (AFHS) Engine
Implements the AFHS scoring formula from the engineering document.
Scores D1, D2, D3, D4, D5 (DeFi via Moralis), D6, D7.
"""
import math
from decimal import Decimal
from typing import Optional

from app.services.portfolio_classification import STABLECOINS


# ─── Asset Classification ────────────────────────────────────────────────────

BLUE_CHIP_CRYPTO = {"BTC", "ETH", "WBTC", "WETH"}

LARGE_CAP_CRYPTO = {
    "BTC", "ETH", "BNB", "SOL", "XRP", "ADA", "AVAX", "DOT", "MATIC", "LINK",
    "LTC", "BCH", "ATOM", "UNI", "ALGO", "VET", "FIL", "ICP", "THETA", "XLM",
    "WBTC", "WETH", "NEAR", "AAVE", "CRV", "MKR", "COMP", "SNX", "SUSHI",
}

STABLECOIN_ISSUER_WEIGHTS = {
    "USDC": 1.00,
    "DAI":  0.95,
    "USDT": 0.85,
    "BUSD": 0.85,
    "TUSD": 0.80,
    "GUSD": 0.80,
    "LUSD": 0.75,
    "FRAX": 0.70,
}

MEME_COINS = {
    "DOGE", "SHIB", "PEPE", "FLOKI", "BONK", "WIF", "MEME", "BABYDOGE",
    "SAFEMOON", "ELON", "SAMO",
}

# Custody type by known exchange sources
REGULATED_EXCHANGES = {"coinbase", "coinbase_advanced", "kraken", "gemini", "binance_us"}
UNREGULATED_EXCHANGES = {"binance", "kucoin", "bybit", "okx", "gate"}

# ─── Life-Stage Weights ───────────────────────────────────────────────────────

# V1: D5 inactive — D5 weight redistributed proportionally to D2 and D4
V1_WEIGHTS = {
    "early": {"d1": 0.18, "d2": 0.26, "d3": 0.16, "d4": 0.21, "d6": 0.12, "d7": 0.07},
    "mid":   {"d1": 0.18, "d2": 0.26, "d3": 0.20, "d4": 0.18, "d6": 0.12, "d7": 0.06},
    "pre_retirement": {"d1": 0.21, "d2": 0.24, "d3": 0.24, "d4": 0.15, "d6": 0.11, "d7": 0.05},
    "retirement":     {"d1": 0.25, "d2": 0.24, "d3": 0.26, "d4": 0.11, "d6": 0.10, "d7": 0.04},
}

# V2: D5 active — ~5-6% carved from D2 and D4
V2_WEIGHTS = {
    "early": {"d1": 0.17, "d2": 0.24, "d3": 0.15, "d4": 0.19, "d5": 0.06, "d6": 0.12, "d7": 0.07},
    "mid":   {"d1": 0.17, "d2": 0.24, "d3": 0.19, "d4": 0.16, "d5": 0.06, "d6": 0.12, "d7": 0.06},
    "pre_retirement": {"d1": 0.20, "d2": 0.23, "d3": 0.23, "d4": 0.13, "d5": 0.05, "d6": 0.11, "d7": 0.05},
    "retirement":     {"d1": 0.24, "d2": 0.23, "d3": 0.25, "d4": 0.10, "d5": 0.04, "d6": 0.10, "d7": 0.04},
}

# Weights when D4 (crypto) is inactive (no non-stablecoin crypto held)
NO_CRYPTO_WEIGHTS = {
    "early": {"d1": 0.227, "d2": 0.318, "d3": 0.216, "d6": 0.159, "d7": 0.080},
    "mid":   {"d1": 0.222, "d2": 0.318, "d3": 0.247, "d6": 0.148, "d7": 0.064},
    "pre_retirement": {"d1": 0.247, "d2": 0.282, "d3": 0.282, "d6": 0.129, "d7": 0.059},
    "retirement":     {"d1": 0.278, "d2": 0.267, "d3": 0.289, "d6": 0.111, "d7": 0.056},
}

# No-crypto + D5 active
NO_CRYPTO_V2_WEIGHTS = {
    "early": {"d1": 0.214, "d2": 0.295, "d3": 0.201, "d5": 0.075, "d6": 0.148, "d7": 0.067},
    "mid":   {"d1": 0.208, "d2": 0.295, "d3": 0.230, "d5": 0.075, "d6": 0.138, "d7": 0.054},
    "pre_retirement": {"d1": 0.233, "d2": 0.266, "d3": 0.266, "d5": 0.062, "d6": 0.121, "d7": 0.052},
    "retirement":     {"d1": 0.261, "d2": 0.250, "d3": 0.272, "d5": 0.050, "d6": 0.106, "d7": 0.061},
}

# Life-stage midpoints for interpolation (Section 4.2)
STAGE_MIDPOINTS = [("early", 27), ("mid", 43), ("pre_retirement", 58), ("retirement", 70)]


def _get_life_stage(age: float) -> str:
    if age < 35:
        return "early"
    elif age < 55:
        return "mid"
    elif age < 63:
        return "pre_retirement"
    return "retirement"


def _interpolate_weights(age: float, has_crypto: bool, has_defi: bool = False) -> dict:
    """Smoothly interpolate dimension weights based on user age (Section 4.2)."""
    if has_defi:
        weight_table = V2_WEIGHTS if has_crypto else NO_CRYPTO_V2_WEIGHTS
    else:
        weight_table = V1_WEIGHTS if has_crypto else NO_CRYPTO_WEIGHTS

    # Clamp to known midpoint range
    if age <= STAGE_MIDPOINTS[0][1]:
        return weight_table[STAGE_MIDPOINTS[0][0]]
    if age >= STAGE_MIDPOINTS[-1][1]:
        return weight_table[STAGE_MIDPOINTS[-1][0]]

    for i in range(len(STAGE_MIDPOINTS) - 1):
        stage_low, age_low = STAGE_MIDPOINTS[i]
        stage_high, age_high = STAGE_MIDPOINTS[i + 1]
        if age_low <= age <= age_high:
            t = (age - age_low) / (age_high - age_low)
            w_low = weight_table[stage_low]
            w_high = weight_table[stage_high]
            dims = list(w_low.keys())
            return {d: w_low[d] + t * (w_high.get(d, 0) - w_low[d]) for d in dims}

    return weight_table["early"]


# ─── Completeness Scalar (Section 6.1) ───────────────────────────────────────

def _completeness_scalar(n: int) -> float:
    """n = number of active dimensions (max 7 with D5 active)."""
    n = max(2, min(n, 7))
    return 0.5 + (0.5 * math.log(1 + n) / math.log(8))


# ─── D1: Liquidity Foundation ─────────────────────────────────────────────────

def score_d1_liquidity(
    total_cash: float,
    total_stablecoins: float,
    stablecoin_breakdown: dict,  # {symbol: value}
    avg_monthly_expenses: Optional[float],
    life_stage: str,
) -> tuple[float, dict]:
    """
    D1 = (CashReserve × 0.50) + (StablecoinQuality × 0.25) + (LiquidBufferTrend × 0.25)
    Buffer trend defaults to 50 (neutral) when history unavailable.
    """
    targets = {"early": 3, "mid": 5, "pre_retirement": 8, "retirement": 18}
    target = targets.get(life_stage, 3)

    # Sub-A: Cash Reserve Ratio
    if avg_monthly_expenses and avg_monthly_expenses > 0:
        months_covered = (total_cash + total_stablecoins) / avg_monthly_expenses
        cash_score = min(100.0, math.log(1 + months_covered) / math.log(1 + target) * 100)
    else:
        # No expense data — estimate conservatively at 50
        cash_score = 50.0

    # Sub-B: Stablecoin Quality
    if total_stablecoins > 0 and stablecoin_breakdown:
        weighted = sum(
            v * STABLECOIN_ISSUER_WEIGHTS.get(sym.upper(), 0.70)
            for sym, v in stablecoin_breakdown.items()
        )
        stable_score = (weighted / total_stablecoins) * 100
    else:
        stable_score = 100.0  # No stablecoins → neutral, not penalized

    # Sub-C: Buffer Trend — neutral (no 60-day history in V1)
    trend_score = 50.0

    d1 = (cash_score * 0.50) + (stable_score * 0.25) + (trend_score * 0.25)
    return round(d1, 2), {
        "cash_reserve_score": round(cash_score, 2),
        "stablecoin_quality_score": round(stable_score, 2),
        "buffer_trend_score": round(trend_score, 2),
        "months_covered": round((total_cash + total_stablecoins) / avg_monthly_expenses, 2)
        if avg_monthly_expenses and avg_monthly_expenses > 0 else None,
    }


# ─── D2: Traditional Investment Health ───────────────────────────────────────

def score_d2_investment(
    assets: list,
    total_invested: float,
    non_crypto_investable: Optional[float] = None,
) -> tuple[float, dict]:
    """
    D2 = (DeploymentRate × 0.40) + (Diversification × 0.35) + (Concentration × 0.25)
    Works on equity assets from portfolio.
    non_crypto_investable: equity + cash + stablecoins — used as deployment rate base
    so crypto-heavy users aren't penalized for their intentional crypto allocation.
    """
    if total_invested <= 0 and (non_crypto_investable is None or non_crypto_investable <= 0):
        return 50.0, {"deployment_rate_score": 50, "diversification_score": 50, "concentration_score": 50}

    equity_assets = [a for a in assets if a.get("asset_class") == "equity"]
    total_equity_value = sum(a["value_usd"] for a in equity_assets)

    # Sub-A: Deployment Rate — judge equity allocation against non-crypto capital only
    # (crypto concentration is handled by D4; don't penalize crypto investors in D2)
    if non_crypto_investable is not None and non_crypto_investable > 0:
        # Has non-crypto capital: score how much of it is in equities
        deployed_pct = total_equity_value / non_crypto_investable
        deployment_score = min(100.0, deployed_pct * 120)
    elif non_crypto_investable == 0:
        # Pure crypto portfolio: can't evaluate equity deployment → neutral
        deployment_score = 50.0
    else:
        # Fallback (non_crypto_investable not provided)
        deploy_base = total_invested if total_invested > 0 else 1
        deployed_pct = total_equity_value / deploy_base
        deployment_score = min(100.0, deployed_pct * 120)

    # Sub-B: Diversification — count distinct asset classes from the 5 spec-defined categories
    # (Section 5.2): Equities, Bonds, REITs, International, Alternatives
    # Map Plaid/exchange asset_class and ticker patterns to these 5 buckets.
    BOND_TICKERS = {"AGG", "BND", "TLT", "IEF", "SHY", "LQD", "HYG", "MUB", "BNDX", "VCIT", "VCLT"}
    REIT_TICKERS = {"VNQ", "SCHH", "IYR", "REM", "XLRE", "USRT", "ICF", "REET"}
    INTL_TICKERS = {"VXUS", "VEU", "EFA", "EEM", "IEFA", "IEMG", "VWO", "ACWX", "SCHF", "SCHE"}
    ALT_TICKERS = {"GLD", "IAU", "SLV", "GSG", "DJP", "PDBC", "COMT", "USO", "GDX", "GDXJ"}

    present_classes: set[str] = set()
    for a in assets:
        cls = a.get("asset_class", "")
        sym = a.get("symbol", "").upper()
        if sym in STABLECOINS or cls == "cash_equivalent":
            continue  # Cash/stablecoins don't count toward investment diversification
        if cls == "equity":
            if sym in BOND_TICKERS:
                present_classes.add("bonds")
            elif sym in REIT_TICKERS:
                present_classes.add("reits")
            elif sym in INTL_TICKERS:
                present_classes.add("international")
            elif sym in ALT_TICKERS:
                present_classes.add("alternatives")
            else:
                present_classes.add("equity")  # Domestic equity is the default
        elif cls == "bond":
            present_classes.add("bonds")
        elif cls == "reit":
            present_classes.add("reits")
        elif cls == "international":
            present_classes.add("international")

    # Score = min(100, classes × 22) per spec Section 5.2
    diversification_score = min(100.0, len(present_classes) * 22)

    # Sub-C: Concentration — largest single equity position as % of total equity
    # Spec Section 5.2: ≤20%→100, ≤35%→75, ≤50%→45, >50%→20
    if equity_assets and total_equity_value > 0:
        largest_equity = max(a["value_usd"] for a in equity_assets)
        max_pct = largest_equity / total_equity_value
        if max_pct <= 0.20:
            concentration_score = 100.0
        elif max_pct <= 0.35:
            concentration_score = 75.0
        elif max_pct <= 0.50:
            concentration_score = 45.0
        else:
            concentration_score = 20.0
    elif not equity_assets:
        # No equity at all — neutral, not penalized (D4 handles crypto concentration)
        concentration_score = 75.0
    else:
        concentration_score = 75.0

    d2 = (deployment_score * 0.40) + (diversification_score * 0.35) + (concentration_score * 0.25)
    return round(d2, 2), {
        "deployment_rate_score": round(deployment_score, 2),
        "diversification_score": round(diversification_score, 2),
        "concentration_score": round(concentration_score, 2),
        "asset_classes_present": sorted(present_classes),
    }


# ─── D4: Crypto Portfolio Health ─────────────────────────────────────────────

def score_d4_crypto(
    crypto_assets: list,
    total_crypto_value: float,
    total_investable: float,
    life_stage: str,
) -> tuple[float, dict]:
    """
    D4 = (AssetQuality×0.30) + (Concentration×0.25) + (Custody×0.20)
       + (WithinCryptoDiversification×0.15) + (VolatilityProfile×0.10)
    Uses 30-day EWMA prices when available, else spot (change_24h as volatility proxy).
    """
    if not crypto_assets or total_crypto_value <= 0:
        return 0.0, {"active": False}

    # Sub-A: Asset Quality Score
    btc_eth_value = sum(
        a["value_usd"] for a in crypto_assets
        if a["symbol"].upper() in BLUE_CHIP_CRYPTO
    )
    large_cap_value = sum(
        a["value_usd"] for a in crypto_assets
        if a["symbol"].upper() in LARGE_CAP_CRYPTO
    )
    meme_value = sum(
        a["value_usd"] for a in crypto_assets
        if a["symbol"].upper() in MEME_COINS
    )

    btc_eth_weight = btc_eth_value / total_crypto_value
    large_cap_weight = large_cap_value / total_crypto_value
    meme_penalty = (meme_value / total_crypto_value) * 50

    asset_quality_score = min(100.0, max(0.0,
        (btc_eth_weight * 60) + (large_cap_weight * 40) - meme_penalty
    ))

    # Sub-B: Concentration Score (crypto % of total investable)
    stage_targets = {
        "early": (0.35, 0.55),
        "mid":   (0.25, 0.40),
        "pre_retirement": (0.18, 0.28),
        "retirement":     (0.12, 0.20),
    }
    target, ceiling = stage_targets.get(life_stage, (0.35, 0.55))
    p = total_crypto_value / total_investable if total_investable > 0 else 0

    if p <= target:
        concentration_score = 70 + (p / target * 30) if target > 0 else 70
    elif p <= ceiling:
        concentration_score = 70 - ((p - target) / (ceiling - target) * 40)
    elif p <= 0.80:
        concentration_score = max(10.0, 30 - ((p - ceiling) * 100))
    else:
        concentration_score = 5.0

    # Sub-C: Custody Health Score
    total_value_check = sum(a["value_usd"] for a in crypto_assets)
    if total_value_check > 0:
        regulated_pct = sum(
            a["value_usd"] for a in crypto_assets
            if any(src.get("source", "").lower() in REGULATED_EXCHANGES
                   for src in a.get("sources", []))
        ) / total_value_check

        hardware_pct = sum(
            a["value_usd"] for a in crypto_assets
            if any(src.get("source", "").lower() in {"wallet", "hardware_wallet"}
                   for src in a.get("sources", []))
        ) / total_value_check

        unregulated_pct = sum(
            a["value_usd"] for a in crypto_assets
            if any(src.get("source", "").lower() in UNREGULATED_EXCHANGES
                   for src in a.get("sources", []))
        ) / total_value_check

        software_pct = max(0.0, 1.0 - regulated_pct - hardware_pct - unregulated_pct)

        custody_score = min(100.0,
            (regulated_pct * 85) +
            (hardware_pct * 95) +
            (software_pct * 75) +
            (unregulated_pct * 30)
        )
    else:
        custody_score = 75.0

    # Sub-D: Within-Crypto Diversification
    non_stable_crypto = [
        a for a in crypto_assets if a["symbol"].upper() not in STABLECOINS
    ]
    distinct_crypto_count = len(set(a["symbol"].upper() for a in non_stable_crypto))
    diversification_score = min(100.0, distinct_crypto_count * 20)

    # Sub-E: Volatility Profile Score
    # Use |change_24h| as a volatility proxy — BTC baseline ≈ 3% daily
    btc_assets = [a for a in crypto_assets if a["symbol"].upper() in {"BTC", "WBTC"}]
    if btc_assets and total_crypto_value > 0:
        btc_vol = abs(btc_assets[0].get("change_24h") or 3.0)
    else:
        btc_vol = 3.0  # Default BTC daily move baseline

    portfolio_vol = sum(
        abs(a.get("change_24h") or 3.0) * (a["value_usd"] / total_crypto_value)
        for a in crypto_assets
    )

    ratio = portfolio_vol / btc_vol if btc_vol > 0 else 1.0
    if ratio > 1.0:
        volatility_score = max(0.0, 100 - ((ratio - 1.0) * 40))
    else:
        volatility_score = min(100.0, 100 + ((1.0 - ratio) * 20))

    d4 = (
        (asset_quality_score * 0.30) +
        (concentration_score * 0.25) +
        (custody_score * 0.20) +
        (diversification_score * 0.15) +
        (volatility_score * 0.10)
    )

    return round(d4, 2), {
        "asset_quality_score": round(asset_quality_score, 2),
        "concentration_score": round(concentration_score, 2),
        "custody_score": round(custody_score, 2),
        "diversification_score": round(diversification_score, 2),
        "volatility_score": round(volatility_score, 2),
        "btc_eth_pct": round(btc_eth_weight * 100, 1),
        "large_cap_pct": round(large_cap_weight * 100, 1),
        "meme_pct": round(meme_value / total_crypto_value * 100, 1),
        "crypto_concentration_pct": round(p * 100, 1),
    }


# ─── D5: DeFi Position Health ────────────────────────────────────────────────

from app.services.providers.defi import PROTOCOL_RISK_TIERS as _PROTOCOL_RISK_TIERS  # noqa: E402


def score_d5_defi(
    positions: list[dict],
    total_defi_value: float,
) -> tuple[float, dict]:
    """
    D5 = (ProtocolRisk × 0.35) + (YieldSustainability × 0.30)
       + (PositionHealth × 0.20) + (ChainDiversification × 0.15)

    positions: list of position dicts from Moralis DeFi API.
    total_defi_value: sum of all position USD values.
    """
    if not positions or total_defi_value <= 0:
        return 0.0, {"active": False}

    # ── Sub-A: Protocol Risk Score (0.35) ─────────────────────────────────────
    # Value-weighted average of protocol safety scores
    weighted_risk = 0.0
    for p in positions:
        protocol = (p.get("protocol_name") or p.get("protocol") or "").lower().strip()
        risk_score = _PROTOCOL_RISK_TIERS.get(protocol, 0.50)
        val = float(p.get("usd_value") or p.get("value_usd") or 0)
        weighted_risk += risk_score * (val / total_defi_value)
    protocol_score = weighted_risk * 100  # 0–100

    # ── Sub-B: Yield Sustainability Score (0.30) ──────────────────────────────
    # Penalize positions with APY > 50% as unsustainable
    safe_value = 0.0
    moderate_value = 0.0
    risky_value = 0.0
    for p in positions:
        apy = float(p.get("apy") or p.get("apr") or 0)
        val = float(p.get("usd_value") or p.get("value_usd") or 0)
        if apy <= 20:
            safe_value += val
        elif apy <= 50:
            moderate_value += val
        else:
            risky_value += val
    # Safe=100, moderate=65, risky=15 weighted average
    yield_score = (
        (safe_value * 100) + (moderate_value * 65) + (risky_value * 15)
    ) / total_defi_value

    # ── Sub-C: Position Health Score (0.20) ───────────────────────────────────
    # Healthy = not at risk of liquidation (health_factor > 1.5 or N/A)
    healthy_value = 0.0
    at_risk_value = 0.0
    for p in positions:
        val = float(p.get("usd_value") or p.get("value_usd") or 0)
        health_factor = p.get("health_factor")
        position_type = (p.get("position_type") or p.get("type") or "").lower()
        if health_factor is not None:
            try:
                hf = float(health_factor)
                if hf >= 1.5:
                    healthy_value += val
                elif hf >= 1.1:
                    at_risk_value += val * 0.5  # partial penalty
                else:
                    at_risk_value += val
            except (TypeError, ValueError):
                healthy_value += val  # Unknown health factor → neutral
        elif "lp" in position_type or "liquidity" in position_type:
            # LP positions carry impermanent loss risk — score at 80%
            healthy_value += val * 0.80
            at_risk_value += val * 0.20
        else:
            healthy_value += val  # Staking, yield, etc. — healthy by default

    position_health_score = (
        ((healthy_value * 100) + (at_risk_value * 20)) / total_defi_value
        if total_defi_value > 0 else 50.0
    )

    # ── Sub-D: Chain Diversification Score (0.15) ─────────────────────────────
    chains = {p.get("_chain") or p.get("chain") or "unknown" for p in positions}
    chain_count = len(chains)
    if chain_count >= 4:
        chain_score = 100.0
    elif chain_count == 3:
        chain_score = 80.0
    elif chain_count == 2:
        chain_score = 60.0
    else:
        chain_score = 30.0

    d5 = (
        (protocol_score * 0.35) +
        (yield_score * 0.30) +
        (position_health_score * 0.20) +
        (chain_score * 0.15)
    )

    return round(d5, 2), {
        "protocol_risk_score": round(protocol_score, 2),
        "yield_sustainability_score": round(yield_score, 2),
        "position_health_score": round(position_health_score, 2),
        "chain_diversification_score": round(chain_score, 2),
        "chains_active": sorted(chains),
        "position_count": len(positions),
        "total_defi_value": round(total_defi_value, 2),
    }


# ─── D3: Retirement Readiness ────────────────────────────────────────────────

def _retirement_liquidity_weight(years_to_59_5: float) -> float:
    """Graduation factor for retirement accounts (Section 3.2)."""
    if years_to_59_5 >= 30:
        return 0.50
    elif years_to_59_5 >= 20:
        return 0.60
    elif years_to_59_5 >= 10:
        return 0.70
    elif years_to_59_5 >= 5:
        return 0.80
    elif years_to_59_5 > 0:
        return 0.90
    else:
        return 0.95  # Past age 59.5


def score_d3_retirement(
    retirement_balance: float,
    annual_income: Optional[float],
    user_age: float,
    actual_equity_pct: float,  # 0–100, equity % inside retirement account
) -> tuple[float, dict]:
    """
    D3 = (AccumulationBenchmark × 0.50) + (ContributionRate × 0.30) + (AllocationQuality × 0.20)
    Per AFHS doc Section 5.3.
    """
    # Guard: no income → neutral score with low confidence signalled by caller
    if not annual_income or annual_income <= 0:
        return 50.0, {
            "accumulation_score": 50,
            "contribution_score": 50,
            "allocation_score": 50,
            "note": "income_required",
        }

    # Sub-A: Accumulation Benchmark Score (50% of D3)
    years_to_59_5 = max(0.0, 59.5 - user_age)
    grad_factor = _retirement_liquidity_weight(years_to_59_5)
    adjusted_balance = retirement_balance * grad_factor

    # Income multiple benchmarks by age (Section 5.3)
    if user_age <= 30:
        target_mult = 0.50
    elif user_age <= 40:
        target_mult = 1.50
    elif user_age <= 50:
        target_mult = 4.00
    elif user_age <= 62:
        target_mult = 7.00
    else:
        target_mult = 10.00

    benchmark = annual_income * target_mult
    accum_score = 100.0 * min(1.0, adjusted_balance / benchmark) if benchmark > 0 else 50.0

    # Sub-B: Contribution Rate Score (30% of D3)
    # Without Plaid transaction data we default to neutral (50)
    # A contribution_rate of 11.25% on 15% target → 75
    contribution_score = 50.0  # neutral until transaction history available

    # Sub-C: Allocation Quality Score (20% of D3)
    equity_target = max(0.0, 110.0 - user_age)  # age-appropriate equity %
    deviation = abs(actual_equity_pct - equity_target)
    allocation_score = max(0.0, 100.0 - (deviation * 2))

    d3 = (accum_score * 0.50) + (contribution_score * 0.30) + (allocation_score * 0.20)
    return round(d3, 2), {
        "accumulation_score": round(accum_score, 2),
        "contribution_score": round(contribution_score, 2),
        "allocation_score": round(allocation_score, 2),
        "adjusted_balance": round(adjusted_balance, 2),
        "benchmark": round(benchmark, 2),
        "graduation_factor": round(grad_factor, 2),
        "target_multiple": target_mult,
        "equity_target_pct": round(equity_target, 1),
        "equity_actual_pct": round(actual_equity_pct, 1),
    }


# ─── D6: Liability & Debt Health ─────────────────────────────────────────────

def score_d6_debt(
    total_debt: float,
    high_interest_debt: float,
    total_liquid_assets: float,
) -> tuple[float, dict]:
    """
    D6 = (HighInterestDebt×0.40) + (DebtToLiquid×0.35) + (DebtTrajectory×0.25)
    Trajectory defaults to neutral (50) when history unavailable.
    """
    # Sub-A: High-Interest Debt Score
    if high_interest_debt == 0:
        hi_score = 100.0
    elif total_liquid_assets > 0:
        ratio = high_interest_debt / total_liquid_assets
        if ratio <= 0.05:
            hi_score = 80.0
        elif ratio <= 0.15:
            hi_score = 55.0
        elif ratio <= 0.30:
            hi_score = 30.0
        else:
            hi_score = 10.0
    else:
        hi_score = 10.0

    # Sub-B: Debt-to-Liquid Ratio
    if total_liquid_assets > 0:
        dtl = total_debt / total_liquid_assets
        dtl_score = max(0.0, 100 - (dtl * 50))
    else:
        dtl_score = 50.0 if total_debt == 0 else 10.0

    # Sub-C: Trajectory — neutral (no 90-day history in V1)
    trajectory_score = 50.0

    d6 = (hi_score * 0.40) + (dtl_score * 0.35) + (trajectory_score * 0.25)
    return round(d6, 2), {
        "high_interest_debt_score": round(hi_score, 2),
        "debt_to_liquid_score": round(dtl_score, 2),
        "debt_trajectory_score": round(trajectory_score, 2),
    }


# ─── D7: Wealth Velocity ──────────────────────────────────────────────────────

def score_d7_velocity(assets: list, total_value: float) -> tuple[float, dict]:
    """
    D7 = (ContributionConsistency×0.40) + (NetAssetTrajectory×0.35) + (RatioImprovement×0.25)
    Uses 24h change as a short-term trajectory proxy.
    Consistency and ratio improvement default to neutral without history.
    """
    # Sub-A: Contribution Consistency — neutral (no 12-month transaction history)
    consistency_score = 50.0

    # Sub-B: Net Asset Trajectory — use portfolio-weighted 24h change as proxy
    if assets and total_value > 0:
        weighted_change = sum(
            (a.get("change_24h") or 0) * (a["value_usd"] / total_value)
            for a in assets
        )
        # Annualize 24h change and compare to ~7% benchmark
        # market_adj_growth proxy: (weighted_change / 100) vs 0.07/365
        daily_adj = weighted_change / 100  # convert % to decimal
        benchmark_daily = 0.07 / 365
        market_adj = daily_adj - benchmark_daily
        trajectory_score = min(100.0, max(0.0, 50 + (market_adj * 400 * 365)))
        # Scale back — 24h is noisy; cap at 75 to avoid wild swings
        trajectory_score = min(75.0, max(25.0, trajectory_score))
    else:
        trajectory_score = 50.0

    # Sub-C: Ratio Improvement — neutral
    ratio_improvement_score = 50.0

    d7 = (consistency_score * 0.40) + (trajectory_score * 0.35) + (ratio_improvement_score * 0.25)
    return round(d7, 2), {
        "consistency_score": round(consistency_score, 2),
        "trajectory_score": round(trajectory_score, 2),
        "ratio_improvement_score": round(ratio_improvement_score, 2),
    }


# ─── Label Helpers ────────────────────────────────────────────────────────────

def _score_to_label(score: float, thresholds: list) -> tuple[str, str]:
    """Map a 0-100 score to a label and CSS color class."""
    for threshold, label, color in thresholds:
        if score >= threshold:
            return label, color
    return thresholds[-1][1], thresholds[-1][2]


DIVERSIFICATION_THRESHOLDS = [
    (80, "Excellent", "text-green-400"),
    (60, "Good",      "text-green-400"),
    (40, "Fair",      "text-amber-400"),
    (0,  "Poor",      "text-red-400"),
]

RISK_THRESHOLDS = [
    (80, "Low",      "text-green-400"),
    (60, "Moderate", "text-amber-400"),
    (35, "High",     "text-orange-400"),
    (0,  "Extreme",  "text-red-400"),
]

PERFORMANCE_THRESHOLDS = [
    (75, "Strong",   "text-green-400"),
    (55, "Moderate", "text-amber-400"),
    (35, "Weak",     "text-orange-400"),
    (0,  "Poor",     "text-red-400"),
]

OVERALL_THRESHOLDS = [
    (80, "Excellent", "text-green-400"),
    (65, "Good",      "text-green-400"),
    (45, "Fair",      "text-amber-400"),
    (0,  "Poor",      "text-red-400"),
]


# ─── Structural Solvency Multiplier (Section 6.5) ────────────────────────────

def _compute_ssm(total_laav: float, total_liabilities: float) -> tuple[float, str]:
    """
    SSM = 1.0 if liabilities ≤ LAAV (solvent).
    SSM = max(0.2, 1.0 - (liabilities/LAAV - 1.0)) otherwise.
    Returns (ssm_value, solvency_tier).
    """
    if total_liabilities <= 0 or total_laav <= 0:
        return 1.0, "solvent"

    solvency_ratio = total_laav / total_liabilities

    if solvency_ratio >= 1.0:
        tier = "solvent"
    elif solvency_ratio >= 0.75:
        tier = "watch"
    elif solvency_ratio >= 0.50:
        tier = "stressed"
    elif solvency_ratio >= 0.25:
        tier = "severe"
    else:
        tier = "critical"

    if total_liabilities <= total_laav:
        return 1.0, tier

    ssm = max(0.20, 1.0 - (total_liabilities / total_laav - 1.0))
    return ssm, tier


# ─── Main Entry Point ─────────────────────────────────────────────────────────

def compute_portfolio_health(
    assets: list,
    categories: dict,
    total_value: float,
    user_age: Optional[float] = None,
    annual_income: Optional[float] = None,
    defi_positions: Optional[list] = None,
    total_debt: float = 0.0,
    high_interest_debt: float = 0.0,
    retirement_balance: Optional[float] = None,
) -> dict:
    """
    Compute the AFHS Portfolio Health Score from available portfolio data.

    Args:
        assets: List of asset dicts from aggregation service
        categories: {crypto, equity, cash_equivalent} totals
        total_value: Total portfolio value in USD
        user_age: User age in years (defaults to 30 / early stage)
        annual_income: Gross annual income in USD (improves D1 expense estimation)

    Returns:
        Health score dict with overall score, sub-scores, and labels
    """
    # Guard: clamp age to [18, 100] range
    if user_age is not None:
        age = max(18.0, min(100.0, float(user_age)))
    else:
        age = 30.0
    life_stage = _get_life_stage(age)

    # ── Categorize assets ────────────────────────────────────────────────────
    crypto_assets = []
    equity_assets = []
    cash_assets = []
    stablecoin_breakdown = {}

    for asset in assets:
        sym = asset["symbol"].upper()
        cls = asset.get("asset_class", "")
        val = float(asset.get("value_usd", 0))

        if sym in STABLECOINS:
            stablecoin_breakdown[sym] = stablecoin_breakdown.get(sym, 0) + val
            cash_assets.append({**asset, "value_usd": val})
        elif cls == "crypto":
            crypto_assets.append({**asset, "value_usd": val})
        elif cls == "equity":
            equity_assets.append({**asset, "value_usd": val})
        elif cls == "cash_equivalent":
            cash_assets.append({**asset, "value_usd": val})

    total_crypto_value = float(categories.get("crypto", Decimal("0")))
    total_equity_value = float(categories.get("equity", Decimal("0")))
    total_cash_value = float(categories.get("cash_equivalent", Decimal("0")))

    # Add stablecoin value to cash
    total_stablecoins = sum(stablecoin_breakdown.values())
    total_cash_liquid = total_cash_value + total_stablecoins

    # Separate non-stablecoin crypto value
    non_stable_crypto_value = sum(a["value_usd"] for a in crypto_assets)
    has_crypto = non_stable_crypto_value > 0

    # ── Estimate monthly expenses from annual_income if no Plaid data ─────────
    # Conservative heuristic: 60% of gross monthly income → expenses
    est_monthly_expenses: Optional[float] = None
    if annual_income and annual_income > 0:
        est_monthly_expenses = (annual_income / 12) * 0.60

    # ── Compute LAAV (Liquidity-Adjusted Asset Value) for D6 ─────────────────
    # Weights: cash=1.0, stablecoins=avg_issuer_weight, equity=0.90,
    #          BTC/ETH=0.75, large-cap altcoin=0.55, unknown crypto=0.40
    laav = total_cash_liquid  # cash + stablecoins already at ~1.0 weight
    laav += total_equity_value * 0.90
    for a in crypto_assets:
        sym = a["symbol"].upper()
        val = a["value_usd"]
        if sym in BLUE_CHIP_CRYPTO:
            laav += val * 0.75
        elif sym in LARGE_CAP_CRYPTO:
            laav += val * 0.55
        elif sym in MEME_COINS:
            laav += val * 0.15
        else:
            laav += val * 0.40  # unknown altcoin

    # Retirement balance: use real 401k/IRA balance if provided by controller,
    # otherwise fall back to total equity as a low-confidence proxy.
    if retirement_balance is None:
        retirement_balance = total_equity_value
    # Equity % inside retirement account: assume 100% equity allocation as proxy
    # (no per-holding breakdown available for retirement accounts without Plaid Investments)
    actual_equity_pct = 100.0 if retirement_balance > 0 else 0.0

    # ── Score each dimension ─────────────────────────────────────────────────
    # D1: Liquidity Foundation
    d1_score, d1_detail = score_d1_liquidity(
        total_cash=total_cash_value,
        total_stablecoins=total_stablecoins,
        stablecoin_breakdown=stablecoin_breakdown,
        avg_monthly_expenses=est_monthly_expenses,
        life_stage=life_stage,
    )

    # D2: Traditional Investment Health
    # non_crypto_investable = equity + cash + stablecoins (excludes volatile crypto)
    non_crypto_investable = total_value - non_stable_crypto_value
    d2_score, d2_detail = score_d2_investment(
        assets=[{"asset_class": a.get("asset_class"), "value_usd": float(a.get("value_usd", 0)),
                 "symbol": a.get("symbol", "")} for a in assets],
        total_invested=total_value,
        non_crypto_investable=max(0.0, non_crypto_investable),
    )

    # D3: Retirement Readiness
    d3_score, d3_detail = score_d3_retirement(
        retirement_balance=retirement_balance,
        annual_income=annual_income,
        user_age=age,
        actual_equity_pct=actual_equity_pct,
    )
    # D3 confidence: 0.60 without real Plaid retirement data; 0.80 if income confirmed
    d3_confidence = 0.80 if annual_income and annual_income > 0 else 0.60

    # D4: Crypto Portfolio Health
    if has_crypto and non_stable_crypto_value > 0:
        d4_score, d4_detail = score_d4_crypto(
            crypto_assets=[
                {
                    "symbol": a["symbol"],
                    "value_usd": a["value_usd"],
                    "change_24h": a.get("change_24h"),
                    "sources": [{"source": s.get("source", "")} for s in a.get("sources", [])],
                }
                for a in crypto_assets
            ],
            total_crypto_value=non_stable_crypto_value,
            total_investable=max(total_value, non_stable_crypto_value),  # Guard against zero
            life_stage=life_stage,
        )
    else:
        d4_score, d4_detail = 0.0, {"active": False}
        has_crypto = False  # Normalize so composite weights don't include D4

    # D5: DeFi Position Health
    has_defi = False
    d5_score, d5_detail = 0.0, {"active": False}
    if defi_positions:
        total_defi_value = sum(
            float(p.get("usd_value") or p.get("value_usd") or 0)
            for p in defi_positions
        )
        if total_defi_value > 0:
            d5_score, d5_detail = score_d5_defi(defi_positions, total_defi_value)
            has_defi = True

    # D6: Liability & Debt Health — use real debt from controller when available
    d6_score, d6_detail = score_d6_debt(
        total_debt=total_debt,
        high_interest_debt=high_interest_debt,
        total_liquid_assets=laav,
    )

    # D7: Wealth Velocity
    d7_score, d7_detail = score_d7_velocity(
        assets=[{"value_usd": float(a.get("value_usd", 0)), "change_24h": a.get("change_24h")} for a in assets],
        total_value=total_value,
    )

    # ── Composite Score ──────────────────────────────────────────────────────
    weights = _interpolate_weights(age, has_crypto, has_defi)

    dimension_scores = {
        "d1": (d1_score, 1.0),  # (score, confidence_Ci)
        "d2": (d2_score, 0.85 if total_value > 0 else 0.60),
        "d3": (d3_score, d3_confidence),
        "d6": (d6_score, 0.70),  # Low confidence — no liability data
        "d7": (d7_score, 0.75),
    }
    if has_crypto:
        dimension_scores["d4"] = (d4_score, 0.90)
    if has_defi:
        dimension_scores["d5"] = (d5_score, 0.85)

    active_count = len(dimension_scores)

    # Fix: denominator must also include ci so that perfect scores yield 100
    # afhs_personal = Σ(score_i × w_i × ci) / Σ(w_i × ci)
    weighted_sum = sum(
        score * weights.get(dim, 0) * ci
        for dim, (score, ci) in dimension_scores.items()
    )
    weight_ci_sum = sum(
        weights.get(dim, 0) * ci
        for dim, (score, ci) in dimension_scores.items()
    )

    afhs_personal = (weighted_sum / weight_ci_sum) if weight_ci_sum > 0 else 50.0

    # Completeness scalar
    scalar = _completeness_scalar(active_count)
    afhs_personal_scaled = afhs_personal * scalar

    # Structural Solvency Multiplier (Section 6.5)
    ssm, solvency_tier = _compute_ssm(laav, total_debt)
    afhs_displayed = round(afhs_personal_scaled * ssm)
    afhs_displayed = max(0, min(100, afhs_displayed))

    # ── Build UI sub-metrics ─────────────────────────────────────────────────
    # Diversification: blend D2 diversification + D4 within-crypto diversification
    d2_div = d2_detail.get("diversification_score", 50)
    d4_div = d4_detail.get("diversification_score", 50) if has_crypto else 50
    diversification_score = (d2_div * 0.6 + d4_div * 0.4) if has_crypto else d2_div
    div_label, div_color = _score_to_label(diversification_score, DIVERSIFICATION_THRESHOLDS)

    # Risk Exposure: invert D4 concentration + volatility (higher score = lower risk)
    if has_crypto:
        risk_raw = (
            d4_detail.get("concentration_score", 50) * 0.50 +
            d4_detail.get("volatility_score", 50) * 0.30 +
            d4_detail.get("asset_quality_score", 50) * 0.20
        )
    else:
        # No crypto → risk from debt exposure
        risk_raw = d6_detail.get("debt_to_liquid_score", 75)

    risk_label, risk_color = _score_to_label(risk_raw, RISK_THRESHOLDS)

    # Performance: D7 trajectory + portfolio 24h
    perf_score = d7_detail.get("trajectory_score", 50)
    perf_label, perf_color = _score_to_label(perf_score, PERFORMANCE_THRESHOLDS)

    overall_label, overall_color = _score_to_label(afhs_displayed, OVERALL_THRESHOLDS)

    return {
        "overall_score": afhs_displayed,
        "overall_label": overall_label,
        "overall_color": overall_color,
        "completeness_pct": round(scalar * 100),
        "active_dimensions": active_count,
        "life_stage": life_stage,
        "solvency_tier": solvency_tier,
        "structural_solvency_mult": round(ssm, 3),
        "total_laav": round(laav, 2),
        "total_liabilities": round(total_debt, 2),
        "metrics": {
            "diversification": {
                "score": round(diversification_score, 1),
                "label": div_label,
                "color": div_color,
            },
            "risk_exposure": {
                "score": round(risk_raw, 1),
                "label": risk_label,
                "color": risk_color,
            },
            "performance": {
                "score": round(perf_score, 1),
                "label": perf_label,
                "color": perf_color,
            },
        },
        "dimension_scores": {
            "d1_liquidity": round(d1_score, 1),
            "d2_investment": round(d2_score, 1),
            "d3_retirement": round(d3_score, 1),
            "d4_crypto": round(d4_score, 1) if has_crypto else None,
            "d5_defi": round(d5_score, 1) if has_defi else None,
            "d6_debt": round(d6_score, 1),
            "d7_velocity": round(d7_score, 1),
        },
        "breakdown": {
            "d1": d1_detail,
            "d2": d2_detail,
            "d3": d3_detail,
            "d4": d4_detail if has_crypto else {"active": False},
            "d5": d5_detail,
            "d6": d6_detail,
            "d7": d7_detail,
        },
    }
