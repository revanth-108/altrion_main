"""
Monte Carlo Retirement Simulation Engine
-----------------------------------------
Vectorised NumPy implementation as specified in the Altrion engineering doc.

Two phases per simulation run:
  • Accumulation  — current age → retirement age (log-normal returns, contributions)
  • Retirement    — retirement age → planning age (conservative allocation, inflation-adjusted withdrawals)

Returns year-by-year percentile bands (p10/p25/p50/p75/p90) plus summary stats.
"""

from __future__ import annotations

import copy
import hashlib
import json
import uuid
from datetime import datetime, timezone
from time import time
from typing import Optional

import numpy as np


# ── Defaults from Altrion engineering doc ────────────────────────────────────
DEFAULTS = {
    "mean_return":            0.07,   # pre-retirement equity portfolio
    "return_std":             0.15,
    "retirement_mean_return": 0.05,   # conservative allocation in retirement
    "retirement_return_std":  0.10,
    "mean_inflation":         0.025,
    "inflation_std":          0.01,
    "n_iterations":           1000,
}

CACHE_TTL_SECONDS = 3600
_SIMULATION_CACHE: dict[str, tuple[float, dict]] = {}


def _derive_seed(params: dict) -> int:
    param_string = json.dumps(params, sort_keys=True, default=str)
    hash_bytes = hashlib.sha256(param_string.encode()).digest()
    return int.from_bytes(hash_bytes[:8], "big")


def _to_int_seed(seed: int) -> int:
    # numpy requires seed in [0, 2**32)
    return seed % (2**32)


def _cache_key(params: dict) -> str:
    param_string = json.dumps(params, sort_keys=True, default=str)
    return hashlib.sha256(param_string.encode()).hexdigest()


def _maybe_get_cached_result(params: dict) -> dict | None:
    now = time()
    key = _cache_key(params)
    cached = _SIMULATION_CACHE.get(key)
    if not cached:
        return None

    cached_at, cached_result = cached
    if now - cached_at > CACHE_TTL_SECONDS:
        _SIMULATION_CACHE.pop(key, None)
        return None

    return copy.deepcopy(cached_result)


def _store_cached_result(params: dict, result: dict) -> dict:
    key = _cache_key(params)
    _SIMULATION_CACHE[key] = (time(), copy.deepcopy(result))
    return result


def _exhaustion_age(balance_matrix: np.ndarray, start_age: int) -> list[Optional[int]]:
    """For each simulation path, find the first age where balance goes negative."""
    N, T = balance_matrix.shape
    ages = []
    for i in range(N):
        gone = np.where(balance_matrix[i] < 0)[0]
        ages.append(int(start_age + gone[0]) if len(gone) else None)
    return ages


def _build_event_effects(events: list[dict] | None, current_age: int, total_years: int) -> dict[str, np.ndarray]:
    effects = {
        "income": np.zeros(total_years),
        "expense": np.zeros(total_years),
        "savings": np.zeros(total_years),
        "withdrawal": np.zeros(total_years),
        "lump_sum": np.zeros(total_years),
    }

    if total_years <= 0 or not events:
        return effects

    for raw_event in events:
        try:
            kind = str(raw_event.get("kind", "")).strip().lower()
            age = int(raw_event.get("age", current_age))
            amount = float(raw_event.get("amount", 0.0))
        except (TypeError, ValueError):
            continue

        if kind not in effects:
            continue

        year_index = age - current_age
        if year_index >= total_years:
            year_index = total_years - 1
        if year_index < 0:
            year_index = 0

        if kind == "lump_sum":
            effects["lump_sum"][year_index] += amount
            continue

        effects[kind][year_index:] += amount

    return effects


def simulate_retirement(
    initial_balance: float,
    monthly_contribution: float,
    current_age: int,
    retirement_age: int,
    planning_age: int,
    target_annual_income: float,
    annual_income: Optional[float] = None,
    annual_expenses: Optional[float] = None,
    use_cash_flow_contribution: bool = False,
    income_growth_rate: float = 0.03,
    expense_growth_rate: float = 0.03,
    events: Optional[list[dict]] = None,
    social_security_income: float = 0.0,
    mean_return: float = DEFAULTS["mean_return"],
    return_std: float = DEFAULTS["return_std"],
    retirement_mean_return: float = DEFAULTS["retirement_mean_return"],
    retirement_return_std: float = DEFAULTS["retirement_return_std"],
    mean_inflation: float = DEFAULTS["mean_inflation"],
    inflation_std: float = DEFAULTS["inflation_std"],
    n_iterations: int = DEFAULTS["n_iterations"],
    random_salt: int = 0,
) -> dict:
    """
    Run a vectorised Monte Carlo retirement simulation.

    Returns a dict with:
      - success_probability (0–1)
      - summary: median/p10/p90 final balance, exhaustion ages
      - timeline: list of {age, year, p10, p25, p50, p75, p90} dicts
      - inputs_used: echo of the parameters
      - metadata: simulation_id, seed, n_iterations, computed_at
    """

    years_to_retirement = max(retirement_age - current_age, 0)
    retirement_duration = max(planning_age - retirement_age, 0)
    total_years = years_to_retirement + retirement_duration

    if total_years == 0:
        return _empty_result(current_age, initial_balance)

    N = n_iterations
    normalized_events = []
    for event in events or []:
        normalized_events.append({
            "age": int(event.get("age", current_age)),
            "label": str(event.get("label", "Event")),
            "kind": str(event.get("kind", "")).lower(),
            "amount": round(float(event.get("amount", 0.0)), 2),
        })
    normalized_events.sort(key=lambda event: (event["age"], event["kind"], event["label"], event["amount"]))

    request_params = {
        "initial_balance": round(initial_balance, 2),
        "monthly_contribution": round(monthly_contribution, 2),
        "annual_income": round(annual_income, 2) if annual_income is not None else None,
        "annual_expenses": round(annual_expenses, 2) if annual_expenses is not None else None,
        "use_cash_flow_contribution": use_cash_flow_contribution,
        "income_growth_rate": income_growth_rate,
        "expense_growth_rate": expense_growth_rate,
        "events": normalized_events,
        "current_age": current_age,
        "retirement_age": retirement_age,
        "planning_age": planning_age,
        "target_annual_income": round(target_annual_income, 2),
        "social_security_income": round(social_security_income, 2),
        "mean_return": mean_return,
        "return_std": return_std,
        "retirement_mean_return": retirement_mean_return,
        "retirement_return_std": retirement_return_std,
        "mean_inflation": mean_inflation,
        "inflation_std": inflation_std,
        "n_iterations": N,
        "random_salt": random_salt,
    }

    cached_result = _maybe_get_cached_result(request_params)
    if cached_result is not None:
        return cached_result

    # ── Deterministic seed ────────────────────────────────────────────────────
    seed = _to_int_seed(_derive_seed(request_params))
    rng = np.random.default_rng(seed)

    # ── Generate all random draws up front ───────────────────────────────────
    # shape (N, years_to_retirement) — accumulation returns
    if years_to_retirement > 0:
        accum_returns = rng.lognormal(
            mean=np.log(1.0 + mean_return),
            sigma=return_std,
            size=(N, years_to_retirement),
        )
    else:
        accum_returns = np.ones((N, 0))

    # shape (N, retirement_duration) — retirement returns
    if retirement_duration > 0:
        retir_returns = rng.lognormal(
            mean=np.log(1.0 + retirement_mean_return),
            sigma=retirement_return_std,
            size=(N, retirement_duration),
        )
        # Inflation for each retirement year — truncated at 0
        raw_inflation = rng.normal(mean_inflation, inflation_std, size=(N, retirement_duration))
        inflation_draws = np.maximum(0.0, raw_inflation)
    else:
        retir_returns = np.ones((N, 0))
        inflation_draws = np.zeros((N, 0))

    # ── Storage: balance at every year for all N paths ────────────────────────
    # Row = simulation path, Column = year index (0 = current age)
    balance_matrix = np.zeros((N, total_years + 1))
    balance_matrix[:, 0] = initial_balance

    annual_contribution = monthly_contribution * 12.0
    event_effects = _build_event_effects(normalized_events, current_age, total_years)

    # ── Accumulation phase ────────────────────────────────────────────────────
    for yr in range(years_to_retirement):
        col = yr + 1
        projected_income = (annual_income * ((1.0 + income_growth_rate) ** yr)) if annual_income is not None else None
        projected_expenses = (annual_expenses * ((1.0 + expense_growth_rate) ** yr)) if annual_expenses is not None else None

        if use_cash_flow_contribution and projected_income is not None and projected_expenses is not None:
            surplus = (
                projected_income
                + event_effects["income"][yr]
                - projected_expenses
                - event_effects["expense"][yr]
            )
            this_year_contribution = max(0.0, surplus)
        else:
            this_year_contribution = annual_contribution

        this_year_contribution = max(0.0, this_year_contribution + event_effects["savings"][yr])
        this_year_lump_sum = event_effects["lump_sum"][yr]
        balance_matrix[:, col] = (
            balance_matrix[:, col - 1] * accum_returns[:, yr] + this_year_contribution + this_year_lump_sum
        )

    # ── Retirement phase ──────────────────────────────────────────────────────
    inflation_cumulative = np.ones(N)
    for yr in range(retirement_duration):
        col = years_to_retirement + yr + 1
        event_index = years_to_retirement + yr
        inflation_cumulative *= (1.0 + inflation_draws[:, yr])
        this_year_withdrawal = (
            target_annual_income * inflation_cumulative
            - social_security_income
            + event_effects["withdrawal"][event_index]
        )
        this_year_withdrawal = np.maximum(0.0, this_year_withdrawal)
        this_year_lump_sum = event_effects["lump_sum"][event_index]
        balance_matrix[:, col] = (
            balance_matrix[:, col - 1] * retir_returns[:, yr] - this_year_withdrawal + this_year_lump_sum
        )

    # ── Compute percentile bands ──────────────────────────────────────────────
    pcts = np.percentile(balance_matrix, [10, 25, 50, 75, 90], axis=0)  # (5, T+1)

    timeline = []
    for t in range(total_years + 1):
        timeline.append({
            "age":  current_age + t,
            "year": t,
            "p10":  int(round(float(pcts[0, t]))),
            "p25":  int(round(float(pcts[1, t]))),
            "p50":  int(round(float(pcts[2, t]))),
            "p75":  int(round(float(pcts[3, t]))),
            "p90":  int(round(float(pcts[4, t]))),
        })

    # ── Success probability ───────────────────────────────────────────────────
    final_balances = balance_matrix[:, -1]
    success_probability = float(np.mean(final_balances > 0))

    # ── Exhaustion ages by percentile ─────────────────────────────────────────
    if retirement_duration > 0:
        retire_col = years_to_retirement
        retire_matrix = balance_matrix[:, retire_col:]
        exhaust_ages_all = _exhaustion_age(retire_matrix, retirement_age)

        numeric_ages = [a for a in exhaust_ages_all if a is not None]
        p10_exhaust = int(np.percentile(numeric_ages, 10)) if numeric_ages else None
        p25_exhaust = int(np.percentile(numeric_ages, 25)) if numeric_ages else None
        p50_exhaust = int(np.percentile(numeric_ages, 50)) if numeric_ages else None
    else:
        p10_exhaust = p25_exhaust = p50_exhaust = None

    summary = {
        "success_probability": round(success_probability, 4),
        "median_final_balance": int(round(float(np.median(final_balances)))),
        "p10_final_balance":    int(round(float(np.percentile(final_balances, 10)))),
        "p90_final_balance":    int(round(float(np.percentile(final_balances, 90)))),
        "exhaustion_by_percentile": {
            "p10_exhaustion_age": p10_exhaust,
            "p25_exhaustion_age": p25_exhaust,
            "p50_exhaustion_age": p50_exhaust,
        },
    }

    inputs_used = {
        "initial_balance": initial_balance,
        "monthly_contribution": monthly_contribution,
        "annual_income": annual_income,
        "annual_expenses": annual_expenses,
        "use_cash_flow_contribution": use_cash_flow_contribution,
        "income_growth_rate": income_growth_rate,
        "expense_growth_rate": expense_growth_rate,
        "events": normalized_events,
        "current_age": current_age,
        "retirement_age": retirement_age,
        "planning_age": planning_age,
        "target_annual_income": target_annual_income,
        "social_security_income": social_security_income,
        "mean_return": mean_return,
        "return_std": return_std,
        "retirement_mean_return": retirement_mean_return,
        "retirement_return_std": retirement_return_std,
        "mean_inflation": mean_inflation,
        "n_iterations": N,
    }

    result = {
        "simulation_id": f"sim_{uuid.uuid4().hex[:8]}",
        "computed_at": datetime.now(timezone.utc).isoformat(),
        "n_iterations": N,
        "seed": seed,
        "inputs": inputs_used,
        "inputs_used": inputs_used,
        "success_probability": summary["success_probability"],
        "year_bands": timeline,
        "exhaustion_age": {
            "p10": p10_exhaust,
            "p25": p25_exhaust,
            "p50": p50_exhaust,
        },
        "summary": summary,
        "timeline": timeline,
    }
    return _store_cached_result(request_params, result)


def _empty_result(current_age: int, balance: float) -> dict:
    timeline = [{"age": current_age, "year": 0, "p10": int(balance), "p25": int(balance), "p50": int(balance), "p75": int(balance), "p90": int(balance)}]
    return {
        "simulation_id": "sim_empty",
        "computed_at": datetime.now(timezone.utc).isoformat(),
        "n_iterations": 0,
        "seed": 0,
        "inputs": {},
        "inputs_used": {},
        "success_probability": 1.0,
        "year_bands": timeline,
        "exhaustion_age": {"p10": None, "p25": None, "p50": None},
        "summary": {
            "success_probability": 1.0,
            "median_final_balance": int(balance),
            "p10_final_balance": int(balance),
            "p90_final_balance": int(balance),
            "exhaustion_by_percentile": {"p10_exhaustion_age": None, "p25_exhaustion_age": None, "p50_exhaustion_age": None},
        },
        "timeline": timeline,
    }
