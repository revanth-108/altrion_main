"""
Goal Fit Scoring Engine
-----------------------
Evaluates whether a portfolio's risk profile (volatility, drawdown exposure)
is appropriate for a given financial goal's time horizon and risk comfort.

Returns a Green / Yellow / Red tier and educational commentary.
All numbers are deterministic — Claude narrates only.

Based on: Action Plan Section 3b — Goal Fit Summary
"""

from __future__ import annotations

import math
from typing import Optional

# ── Volatility estimates by asset class (annualised %) ──────────────
ASSET_CLASS_VOL: dict[str, float] = {
    "US Equity":     16.0,
    "Intl Equity":   18.0,
    "Fixed Income":   5.0,
    "Municipal Bond": 4.5,
    "Real Estate":   14.0,
    "Commodities":   20.0,
    "Crypto":        85.0,   # BTC/ETH blend
    "Cash":           0.5,
    "Other":         12.0,
}

# ── Expected return estimates by asset class (annualised %, nominal) ─
ASSET_CLASS_RETURN: dict[str, float] = {
    "US Equity":     10.0,   # S&P 500 long-run average
    "Intl Equity":    8.0,   # MSCI EAFE long-run
    "Fixed Income":   4.0,   # Aggregate bond index
    "Municipal Bond": 3.5,   # Muni bond index
    "Real Estate":    8.0,   # REIT total return
    "Commodities":    5.0,   # Bloomberg Commodity Index
    "Crypto":        20.0,   # BTC/ETH blend — speculative, wide range
    "Cash":           2.0,   # T-bills / money market
    "Other":          7.0,   # Blended assumption
}

# ── Historical max-drawdown estimates by asset class (%) ────────────
ASSET_CLASS_DRAWDOWN: dict[str, float] = {
    "US Equity":     -50.0,   # 2008–09 S&P 500
    "Intl Equity":   -55.0,
    "Fixed Income":  -17.0,   # 2022 bond selloff
    "Municipal Bond": -14.0,
    "Real Estate":   -68.0,   # 2008 REITs
    "Commodities":   -65.0,
    "Crypto":        -80.0,   # BTC 2022
    "Cash":            0.0,
    "Other":         -35.0,
}

# ── Goal horizon risk bands ──────────────────────────────────────────
# (max_acceptable_portfolio_vol_pct, goal_type_hint)
GOAL_HORIZON_BANDS: list[tuple[int, float, str]] = [
    (2,  8.0,  "Short-term goals (< 2 years) call for low-volatility, capital-preservation portfolios."),
    (5,  12.0, "Medium-term goals (2–5 years) are generally suited to moderate-volatility portfolios."),
    (10, 18.0, "Goals with 5–10 year horizons can typically absorb moderate-to-high portfolio volatility."),
    (20, 25.0, "Long-term goals (10–20 years) historically accommodate higher-volatility portfolios."),
    (99, 35.0, "Very long-term goals (20+ years) have historically tolerated high-volatility allocations."),
]

# ── Required return feasibility (historical S&P 500 annualised ~10%) ─
HISTORICAL_BASE_RETURN = 0.10   # 10% nominal annualised, S&P 500 long-run average
HISTORICAL_BOND_RETURN = 0.04   # ~4% nominal bonds


def _portfolio_expected_return(allocation: dict[str, float]) -> float:
    """Weighted average expected return across asset classes (annualised %)."""
    total_ret = 0.0
    total_pct = sum(allocation.values())
    if total_pct == 0:
        return 7.0
    for cls, pct in allocation.items():
        ret = ASSET_CLASS_RETURN.get(cls, ASSET_CLASS_RETURN["Other"])
        total_ret += (pct / total_pct) * ret
    return round(total_ret, 2)


def _portfolio_vol(allocation: dict[str, float]) -> float:
    """Weighted average volatility across asset classes (simplified)."""
    total_vol = 0.0
    total_pct = sum(allocation.values())
    if total_pct == 0:
        return 12.0
    for cls, pct in allocation.items():
        vol = ASSET_CLASS_VOL.get(cls, ASSET_CLASS_VOL["Other"])
        total_vol += (pct / total_pct) * vol
    return round(total_vol, 2)


def _portfolio_max_drawdown(allocation: dict[str, float]) -> float:
    """Weighted worst-case drawdown across asset classes."""
    total_dd = 0.0
    total_pct = sum(allocation.values())
    if total_pct == 0:
        return -35.0
    for cls, pct in allocation.items():
        dd = ASSET_CLASS_DRAWDOWN.get(cls, ASSET_CLASS_DRAWDOWN["Other"])
        total_dd += (pct / total_pct) * dd
    return round(total_dd, 2)


def _required_annual_return(current_assets: float, target: float, years: int, annual_savings: float) -> float:
    """
    Solve for the annual return rate r such that:
    FV = current_assets*(1+r)^n + annual_savings * [((1+r)^n - 1) / r] = target.

    Uses binary search (Newton's method alternative).
    """
    if years <= 0:
        return 0.0
    if current_assets >= target:
        return 0.0

    def fv(r: float) -> float:
        if abs(r) < 1e-9:
            return current_assets + annual_savings * years
        compound = (1.0 + r) ** years
        return current_assets * compound + annual_savings * ((compound - 1.0) / r)

    lo, hi = -0.20, 2.0
    for _ in range(80):
        mid = (lo + hi) / 2.0
        if fv(mid) < target:
            lo = mid
        else:
            hi = mid
    return round((lo + hi) / 2.0, 6)


def _probability_of_reaching_goal(
    required_return: float,
    portfolio_vol: float,
    years: int,
    portfolio_expected_return: float = 0.07,
) -> float:
    """
    Simplified Monte Carlo approximation using log-normal distribution.
    P(reaching goal) ≈ P(log-normal FV >= target) using normal CDF approximation.

    Drift (mu) = portfolio's actual expected return - 0.5 * sigma^2
    Standard deviation of log return = portfolio_vol / 100

    Returns probability as a percentage (0–100).
    """
    sigma = portfolio_vol / 100.0
    if sigma < 1e-6 or years <= 0:
        return 100.0 if required_return <= 0.0 else 50.0

    # Use portfolio's actual expected return as the drift, not the required return.
    # required_return is the hurdle; portfolio_expected_return is what we actually expect to earn.
    mu_log = (portfolio_expected_return / 100.0) - 0.5 * sigma ** 2
    # Over 'years', the cumulative log return is N(mu_log*years, sigma*sqrt(years))
    # We want P(actual >= required), i.e., P(z >= (required_log - mu_log*years) / (sigma*sqrt(years)))
    required_log = math.log(1.0 + required_return) * years
    mean_log = mu_log * years
    std_log  = sigma * math.sqrt(years)

    if std_log < 1e-9:
        return 100.0 if required_log <= mean_log else 0.0

    z = (required_log - mean_log) / std_log
    # Standard normal CDF via error function: P(Z <= z) = 0.5 * (1 + erf(z/sqrt(2)))
    prob_exceed = 0.5 * (1.0 - math.erf(z / math.sqrt(2.0)))
    return round(min(max(prob_exceed * 100.0, 0.0), 100.0), 1)


def score_goal_fit(
    current_assets: float,
    target_amount: float,
    years_to_goal: int,
    annual_savings: float,
    allocation: dict[str, float],
    goal_type: str = "Custom",
    risk_comfort: str = "moderate",
) -> dict:
    """
    Score how well the portfolio's risk profile fits a specific goal.

    Parameters
    ----------
    current_assets  : Current investable assets ($)
    target_amount   : Goal target ($)
    years_to_goal   : Years until goal deadline
    annual_savings  : Annual contribution toward goal ($)
    allocation      : {asset_class: weight_pct} — should sum to 100
    goal_type       : "Retirement" | "Purchase" | "Major Expense" | "Custom"
    risk_comfort    : "low" | "moderate" | "high"

    Returns
    -------
    dict with tier (GREEN/YELLOW/RED), portfolio_vol, max_drawdown,
    required_return, probability_pct, risk_band_max_vol,
    allocation_scenarios, summary_commentary
    """

    portfolio_vol  = _portfolio_vol(allocation)
    portfolio_ret  = _portfolio_expected_return(allocation)
    max_drawdown   = _portfolio_max_drawdown(allocation)
    required_return = _required_annual_return(current_assets, target_amount, years_to_goal, annual_savings)

    # ── Find risk band for this horizon ──────────────────────────────
    risk_band_max_vol = 35.0
    risk_band_desc    = ""
    for max_years, max_vol, desc in GOAL_HORIZON_BANDS:
        if years_to_goal <= max_years:
            risk_band_max_vol = max_vol
            risk_band_desc    = desc
            break

    # Adjust risk band for risk comfort
    comfort_adj = {"low": -4.0, "moderate": 0.0, "high": +4.0}.get(risk_comfort.lower(), 0.0)
    adjusted_max_vol = risk_band_max_vol + comfort_adj

    # ── Probability of reaching goal at current allocation ───────────
    probability_pct = _probability_of_reaching_goal(required_return, portfolio_vol, years_to_goal, portfolio_ret)

    # ── Tier logic ───────────────────────────────────────────────────
    vol_excess = portfolio_vol - adjusted_max_vol
    if required_return > 0.25:
        tier = "RED"
        tier_reason = f"A {required_return*100:.1f}% annual return is needed — historically very difficult to achieve consistently."
    elif vol_excess > 5.0:
        tier = "RED"
        tier_reason = f"Portfolio volatility ({portfolio_vol:.1f}%) significantly exceeds the {adjusted_max_vol:.1f}% band for a {years_to_goal}-year goal."
    elif vol_excess > 0.0 or required_return > 0.15:
        tier = "YELLOW"
        tier_reason = f"Portfolio volatility ({portfolio_vol:.1f}%) is slightly above the {adjusted_max_vol:.1f}% band for this goal horizon."
    elif probability_pct < 50.0:
        tier = "YELLOW"
        tier_reason = f"Estimated probability of reaching goal is {probability_pct:.0f}% — below the 50% historical threshold."
    else:
        tier = "GREEN"
        tier_reason = f"Portfolio volatility ({portfolio_vol:.1f}%) fits within the {adjusted_max_vol:.1f}% band for a {years_to_goal}-year goal."

    # ── Allocation scenarios (Current / Growth / Conservative) ───────
    # "Growth" = 1.5× equity weight, "Conservative" = 0.5× equity + Cash
    equity_classes = {"US Equity", "Intl Equity"}
    current_equity = sum(v for k, v in allocation.items() if k in equity_classes)

    growth_alloc = {}
    for k, v in allocation.items():
        if k in equity_classes:
            growth_alloc[k] = min(v * 1.5, 80.0)
        elif k == "Fixed Income":
            growth_alloc[k] = max(v * 0.5, 0.0)
        else:
            growth_alloc[k] = v
    # Normalise to 100
    g_sum = sum(growth_alloc.values())
    if g_sum > 0:
        growth_alloc = {k: round(v / g_sum * 100, 1) for k, v in growth_alloc.items()}

    conservative_alloc = {}
    for k, v in allocation.items():
        if k in equity_classes:
            conservative_alloc[k] = v * 0.5
        elif k == "Fixed Income":
            conservative_alloc[k] = v * 1.5
        elif k == "Cash":
            conservative_alloc[k] = v + 10.0
        else:
            conservative_alloc[k] = v
    c_sum = sum(conservative_alloc.values())
    if c_sum > 0:
        conservative_alloc = {k: round(v / c_sum * 100, 1) for k, v in conservative_alloc.items()}

    scenarios = [
        {
            "name": "Current Allocation",
            "allocation": allocation,
            "portfolio_vol": portfolio_vol,
            "max_drawdown": max_drawdown,
            "probability_pct": probability_pct,
            "tier": tier,
        },
        {
            "name": "Growth Tilt (+50% equity)",
            "allocation": growth_alloc,
            "portfolio_vol": _portfolio_vol(growth_alloc),
            "max_drawdown": _portfolio_max_drawdown(growth_alloc),
            "probability_pct": _probability_of_reaching_goal(
                required_return,
                _portfolio_vol(growth_alloc),
                years_to_goal,
                _portfolio_expected_return(growth_alloc),
            ),
            "tier": None,   # computed below
        },
        {
            "name": "Conservative Tilt (−50% equity)",
            "allocation": conservative_alloc,
            "portfolio_vol": _portfolio_vol(conservative_alloc),
            "max_drawdown": _portfolio_max_drawdown(conservative_alloc),
            "probability_pct": _probability_of_reaching_goal(
                required_return,
                _portfolio_vol(conservative_alloc),
                years_to_goal,
                _portfolio_expected_return(conservative_alloc),
            ),
            "tier": None,
        },
    ]

    # Assign tiers to scenarios
    for sc in scenarios[1:]:
        ve = sc["portfolio_vol"] - adjusted_max_vol
        if required_return > 0.25 or ve > 5.0:
            sc["tier"] = "RED"
        elif ve > 0.0 or required_return > 0.15:
            sc["tier"] = "YELLOW"
        elif sc["probability_pct"] < 50.0:
            sc["tier"] = "YELLOW"
        else:
            sc["tier"] = "GREEN"

    # ── Summary commentary (educational framing) ─────────────────────
    commentary_parts = [
        f"Goal type: {goal_type} | Horizon: {years_to_goal} years | Risk comfort: {risk_comfort}.",
        risk_band_desc,
        f"Your current portfolio has an estimated annual volatility of {portfolio_vol:.1f}% "
        f"and a simulated worst-case drawdown of {abs(max_drawdown):.0f}%.",
    ]
    if required_return > 0:
        commentary_parts.append(
            f"To reach your ${target_amount:,.0f} goal in {years_to_goal} years from "
            f"${current_assets:,.0f} with ${annual_savings:,.0f}/year contributions, "
            f"a {required_return*100:.1f}% annualised return would be needed. "
            f"Historically, a balanced 60/40 portfolio has returned approximately "
            f"{(HISTORICAL_BASE_RETURN*0.6+HISTORICAL_BOND_RETURN*0.4)*100:.1f}% annually."
        )
    commentary_parts.append(
        f"Simulation: Based on historical return distributions, this portfolio reaches its "
        f"target approximately {probability_pct:.0f}% of the time over {years_to_goal} years."
    )
    commentary_parts.append(tier_reason)

    return {
        "tier":              tier,
        "tier_reason":       tier_reason,
        "portfolio_vol":     portfolio_vol,
        "max_drawdown_pct":  max_drawdown,
        "required_return":   round(required_return * 100, 2),
        "probability_pct":   probability_pct,
        "risk_band_max_vol": adjusted_max_vol,
        "risk_band_desc":    risk_band_desc,
        "goal_type":         goal_type,
        "years_to_goal":     years_to_goal,
        "scenarios":         scenarios,
        "summary_commentary": " ".join(commentary_parts),
    }
