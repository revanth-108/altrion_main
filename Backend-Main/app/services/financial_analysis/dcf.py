"""
Deterministic Discounted Cash Flow (DCF) valuation engine.

Helps users estimate the intrinsic value of an investment based on projected
future earnings and a personal required return rate.
Pure Python math — no LLM dependencies. All monetary values are expressed
in the same unit as the input ``current_value`` (typically millions).
"""

from __future__ import annotations

from typing import Union


def _expand_growth_rates(
    revenue_growth: Union[float, list[float]],
    projection_years: int,
) -> list[float]:
    """Normalise *revenue_growth* into a list of length *projection_years*."""
    if isinstance(revenue_growth, (int, float)):
        return [float(revenue_growth)] * projection_years
    rates = list(revenue_growth)
    if len(rates) >= projection_years:
        return rates[:projection_years]
    # Pad with the last supplied rate when the list is too short.
    last = rates[-1] if rates else 0.0
    return rates + [last] * (projection_years - len(rates))


def _build_sensitivity_matrix(
    last_fcf: float,
    discount_rate: float,
    terminal_growth: float,
    discounted_fcf_sum: float,
    projection_years: int,
) -> dict[str, list[dict[str, float]]]:
    """Return estimated investment value sensitivity across discount rate and
    terminal-growth variations.

    Discount rate varies ±2 % in 0.5 % steps; terminal growth varies ±1 % in
    0.25 % steps. Each entry contains the discount_rate, terminal-growth rate,
    and the resulting estimated value.
    """
    dr_steps = [discount_rate + delta / 100.0 for delta in range(-200, 201, 50)]
    tg_steps = [terminal_growth + delta / 100.0 for delta in range(-100, 101, 25)]

    rows: list[dict[str, float]] = []
    for w in dr_steps:
        for tg in tg_steps:
            if w <= tg or w <= 0:
                ev = float("nan")
            else:
                tv = last_fcf * (1.0 + tg) / (w - tg)
                dtv = tv / ((1.0 + w) ** projection_years)
                ev = discounted_fcf_sum + dtv
            rows.append(
                {
                    "discount_rate": round(w, 6),
                    "terminal_growth": round(tg, 6),
                    "estimated_value": round(ev, 4) if ev == ev else None,  # NaN check
                }
            )

    return {
        "discount_rate_range": [round(w, 6) for w in dr_steps],
        "terminal_growth_range": [round(tg, 6) for tg in tg_steps],
        "results": rows,
    }


def build_dcf_model(
    investment_name: str,
    revenue: float,
    revenue_growth: Union[float, list[float]],
    profit_margin: float,
    tax_rate: float,
    capex_pct: float,
    working_capital_pct: float,
    discount_rate: float,
    terminal_growth: float,
    projection_years: int = 5,
) -> dict:
    """Build a full DCF valuation model for a user's investment and return
    the results as a dict.

    Parameters
    ----------
    investment_name:
        Label for the investment (e.g. ticker symbol, fund name, asset name).
    revenue:
        Base-year revenue or cash flow of the underlying investment
        (in millions or any consistent unit).
    revenue_growth:
        Annual revenue-growth rates.  A single float is broadcast to every
        projection year; a list shorter than *projection_years* is padded
        with its last element.
    profit_margin:
        Operating profit (earnings) as a fraction of revenue (e.g. 0.25 for 25%).
    tax_rate:
        Effective tax rate as a fraction (e.g. 0.21).
    capex_pct:
        Capital expenditures as a fraction of revenue.
    working_capital_pct:
        Net working-capital change as a fraction of revenue.
    discount_rate:
        The user's required annual return / discount rate as a decimal (e.g. 0.10).
    terminal_growth:
        Perpetual growth rate for the Gordon Growth terminal value.
    projection_years:
        Number of years to project (default 5).

    Returns
    -------
    dict  with keys documented in the module-level docstring.
    """

    # ---- input validation / edge-case guards --------------------------------
    if projection_years < 1:
        raise ValueError("projection_years must be >= 1")
    if discount_rate <= 0:
        raise ValueError("discount_rate must be positive")

    growth_rates = _expand_growth_rates(revenue_growth, projection_years)

    # ---- projections --------------------------------------------------------
    projected_revenue: list[float] = []
    projected_earnings: list[float] = []
    projected_fcf: list[float] = []
    discounted_fcf: list[float] = []

    prev_revenue = revenue
    prev_working_capital = revenue * working_capital_pct

    for year_idx in range(projection_years):
        # Revenue
        curr_revenue = prev_revenue * (1.0 + growth_rates[year_idx])
        projected_revenue.append(round(curr_revenue, 4))

        # Earnings (operating profit)
        earnings = curr_revenue * profit_margin
        projected_earnings.append(round(earnings, 4))

        # Free Cash Flow
        nopat = earnings * (1.0 - tax_rate)  # Net Operating Profit After Tax
        capex = curr_revenue * capex_pct
        curr_working_capital = curr_revenue * working_capital_pct
        delta_wc = curr_working_capital - prev_working_capital

        fcf = nopat - capex - delta_wc
        projected_fcf.append(round(fcf, 4))

        # Discount factor: 1 / (1 + discount_rate)^(year)
        discount_factor = 1.0 / ((1.0 + discount_rate) ** (year_idx + 1))
        discounted_fcf.append(round(fcf * discount_factor, 4))

        # Roll forward
        prev_revenue = curr_revenue
        prev_working_capital = curr_working_capital

    # ---- terminal value (Gordon Growth Model) --------------------------------
    last_fcf = projected_fcf[-1]

    if discount_rate <= terminal_growth:
        # Model is economically invalid — surface it explicitly.
        terminal_value = float("inf")
        discounted_terminal_value = float("inf")
        estimated_value = float("inf")
    else:
        terminal_value = round(
            last_fcf * (1.0 + terminal_growth) / (discount_rate - terminal_growth), 4
        )
        discounted_terminal_value = round(
            terminal_value / ((1.0 + discount_rate) ** projection_years), 4
        )
        estimated_value = round(
            sum(discounted_fcf) + discounted_terminal_value, 4
        )

    # ---- sensitivity matrix --------------------------------------------------
    dcf_sum = sum(discounted_fcf)
    sensitivity_matrix = _build_sensitivity_matrix(
        last_fcf=last_fcf,
        discount_rate=discount_rate,
        terminal_growth=terminal_growth,
        discounted_fcf_sum=dcf_sum,
        projection_years=projection_years,
    )

    # ---- assemble result -----------------------------------------------------
    return {
        "investment_name": investment_name,
        "projection_years": projection_years,
        "projected_revenue": projected_revenue,
        "projected_earnings": projected_earnings,
        "projected_fcf": projected_fcf,
        "discounted_fcf": discounted_fcf,
        "terminal_value": terminal_value,
        "discounted_terminal_value": discounted_terminal_value,
        "estimated_value": estimated_value,
        "sensitivity_matrix": sensitivity_matrix,
    }
