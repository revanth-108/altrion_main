"""
Deterministic Leveraged Investment Scenario Builder Engine.

Models a user's leveraged investment position — e.g. margin investing,
leveraged real estate, or any asset purchased partly with borrowed capital.
Pure Python math — no LLM dependencies.
All monetary values are in the same unit as the input (e.g. thousands or millions).
"""

from __future__ import annotations

from typing import Optional


def _safe_div(numerator: float, denominator: float, default: float = 0.0) -> float:
    """Return numerator / denominator, or *default* when denominator is zero."""
    if denominator == 0.0:
        return default
    return numerator / denominator


def _compute_moic(exit_equity: float, user_equity_invested: float) -> float:
    if user_equity_invested <= 0.0:
        return 0.0
    if exit_equity <= 0.0:
        return 0.0
    return exit_equity / user_equity_invested


def _compute_irr(moic: float, hold_period: int) -> float:
    if moic <= 0.0 or hold_period <= 0:
        return 0.0
    return moic ** (1.0 / hold_period) - 1.0


def _build_debt_paydown_table(
    initial_debt: float,
    initial_annual_income: float,
    income_growth: float,
    interest_rate: float,
    hold_period: int,
) -> list[dict]:
    """
    Build a year-by-year debt schedule for a leveraged investment.

    Assumptions:
      - 50 % of each year's investment income is available for debt service
        (interest + principal repayment).
      - Interest is paid first; remainder goes to principal paydown.
      - Debt cannot go below zero.
    """
    table: list[dict] = []
    debt = initial_debt

    for year in range(1, hold_period + 1):
        annual_income = initial_annual_income * ((1.0 + income_growth) ** year)
        beginning_debt = debt
        interest = beginning_debt * interest_rate

        cash_for_debt_service = annual_income * 0.5
        principal_paydown = max(cash_for_debt_service - interest, 0.0)
        principal_paydown = min(principal_paydown, beginning_debt)

        ending_debt = beginning_debt - principal_paydown

        table.append(
            {
                "year": year,
                "annual_income": round(annual_income, 4),
                "beginning_debt": round(beginning_debt, 4),
                "interest": round(interest, 4),
                "income_for_debt_paydown": round(principal_paydown, 4),
                "ending_debt": round(ending_debt, 4),
            }
        )
        debt = ending_debt

    return table


def _build_scenario_grid(
    user_equity_invested: float,
    initial_debt: float,
    initial_annual_income: float,
    base_income_growth: float,
    base_exit_multiple: float,
    interest_rate: float,
    hold_period: int,
) -> dict[str, list | dict]:
    """
    Sensitivity table: vary exit_multiple (+/-2 in 0.5x steps) and
    income_growth (+/-5 pp in 2.5 pp steps), returning MOIC for each combo.
    """
    exit_multiples: list[float] = [
        round(base_exit_multiple + offset, 1)
        for offset in _frange(-2.0, 2.0, 0.5)
    ]
    growth_rates: list[float] = [
        round(base_income_growth + offset, 4)
        for offset in _frange(-0.05, 0.05, 0.025)
    ]

    grid: dict[str, dict[str, float]] = {}
    for gr in growth_rates:
        growth_label = f"{gr:.2%}"
        grid[growth_label] = {}
        for em in exit_multiples:
            if em <= 0.0:
                grid[growth_label][f"{em:.1f}x"] = 0.0
                continue
            table = _build_debt_paydown_table(
                initial_debt, initial_annual_income, gr, interest_rate, hold_period
            )
            remaining_debt = table[-1]["ending_debt"] if table else initial_debt
            exit_income = initial_annual_income * ((1.0 + gr) ** hold_period)
            exit_value = exit_income * em
            exit_eq = exit_value - remaining_debt
            moic = _compute_moic(exit_eq, user_equity_invested)
            grid[growth_label][f"{em:.1f}x"] = round(moic, 2)

    return {
        "exit_multiples": [f"{em:.1f}x" for em in exit_multiples],
        "income_growth_rates": [f"{gr:.2%}" for gr in growth_rates],
        "moic_matrix": grid,
    }


def _frange(start: float, stop: float, step: float) -> list[float]:
    """Inclusive float range helper."""
    results: list[float] = []
    val = start
    while val <= stop + step * 0.01:  # small epsilon for float rounding
        results.append(val)
        val += step
    return results


def run_lbo_scenario(
    investment_name: str,
    investment_amount: float,
    entry_multiple: float,
    leverage_ratio: float,
    interest_rate: float,
    income_growth: float,
    exit_multiple: float,
    hold_period: int = 5,
    initial_annual_income: Optional[float] = None,
) -> dict:
    """
    Run a deterministic leveraged investment scenario and return a comprehensive
    results dict.

    Parameters
    ----------
    investment_name : str
        Name or label for the investment (e.g. "Real Estate Fund", "Tech ETF").
    investment_amount : float
        Total capital deployed (user's own equity + borrowed capital).
    entry_multiple : float
        Valuation multiple at entry (e.g. income multiple or price-to-earnings).
    leverage_ratio : float
        Borrowed capital as a fraction of investment_amount (e.g. 0.6 = 60% debt).
    interest_rate : float
        Annual interest rate on borrowed capital (e.g. 0.07 = 7%).
    income_growth : float
        Annual growth rate of investment income (e.g. 0.05 = 5%).
    exit_multiple : float
        Target valuation multiple at exit.
    hold_period : int
        Investment horizon in years (default 5).
    initial_annual_income : float or None
        Starting annual income from the investment. Derived from
        investment_amount / entry_multiple when not supplied.

    Returns
    -------
    dict  with keys documented in the module docstring.
    """

    # ---- Input validation / edge cases ----------------------------------- #
    if investment_amount <= 0.0:
        raise ValueError("investment_amount must be positive.")
    if entry_multiple <= 0.0 and initial_annual_income is None:
        raise ValueError(
            "entry_multiple must be positive when initial_annual_income is not provided."
        )
    if hold_period <= 0:
        raise ValueError("hold_period must be a positive integer.")
    leverage_ratio = max(0.0, min(leverage_ratio, 1.0))

    # ---- Derived inputs -------------------------------------------------- #
    entry_annual_income: float = (
        initial_annual_income
        if initial_annual_income is not None
        else _safe_div(investment_amount, entry_multiple, default=0.0)
    )

    if entry_annual_income <= 0.0:
        return {
            "investment_name": investment_name,
            "error": "Computed annual income is zero or negative — cannot run scenario.",
            "entry_annual_income": entry_annual_income,
            "exit_annual_income": 0.0,
            "initial_debt": 0.0,
            "user_equity_invested": 0.0,
            "debt_paydown_table": [],
            "exit_investment_value": 0.0,
            "exit_equity": 0.0,
            "moic": 0.0,
            "irr": 0.0,
            "scenario_grid": {},
        }

    initial_debt: float = investment_amount * leverage_ratio
    user_equity_invested: float = investment_amount - initial_debt

    if user_equity_invested <= 0.0:
        return {
            "investment_name": investment_name,
            "error": "User equity is zero or negative — leverage_ratio too high.",
            "entry_annual_income": round(entry_annual_income, 4),
            "exit_annual_income": 0.0,
            "initial_debt": round(initial_debt, 4),
            "user_equity_invested": round(user_equity_invested, 4),
            "debt_paydown_table": [],
            "exit_investment_value": 0.0,
            "exit_equity": 0.0,
            "moic": 0.0,
            "irr": 0.0,
            "scenario_grid": {},
        }

    # ---- Debt paydown schedule ------------------------------------------- #
    debt_table = _build_debt_paydown_table(
        initial_debt, entry_annual_income, income_growth, interest_rate, hold_period
    )

    remaining_debt: float = (
        debt_table[-1]["ending_debt"] if debt_table else initial_debt
    )

    # ---- Exit calculations ----------------------------------------------- #
    exit_annual_income: float = entry_annual_income * ((1.0 + income_growth) ** hold_period)
    exit_investment_value: float = exit_annual_income * exit_multiple
    exit_equity: float = exit_investment_value - remaining_debt

    moic: float = _compute_moic(exit_equity, user_equity_invested)
    irr: float = _compute_irr(moic, hold_period)

    # ---- Scenario sensitivity grid --------------------------------------- #
    scenario_grid = _build_scenario_grid(
        user_equity_invested=user_equity_invested,
        initial_debt=initial_debt,
        initial_annual_income=entry_annual_income,
        base_income_growth=income_growth,
        base_exit_multiple=exit_multiple,
        interest_rate=interest_rate,
        hold_period=hold_period,
    )

    return {
        "investment_name": investment_name,
        "entry_annual_income": round(entry_annual_income, 4),
        "exit_annual_income": round(exit_annual_income, 4),
        "initial_debt": round(initial_debt, 4),
        "user_equity_invested": round(user_equity_invested, 4),
        "debt_paydown_table": debt_table,
        "exit_investment_value": round(exit_investment_value, 4),
        "exit_equity": round(exit_equity, 4),
        "moic": round(moic, 4),
        "irr": round(irr, 4),
        "scenario_grid": scenario_grid,
    }
