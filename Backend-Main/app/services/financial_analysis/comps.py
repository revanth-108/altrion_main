"""
Investment Comparison Analysis Engine.

Helps users compare a target investment against similar investments using
common valuation metrics and multiples.
Deterministic engine — no LLM, no numpy. Uses only the standard library.
"""

from __future__ import annotations

import statistics
from typing import Any, Optional


def _safe_float(value: Any) -> Optional[float]:
    """Convert a value to float, returning None if invalid or zero."""
    if value is None:
        return None
    try:
        f = float(value)
        return f if f != 0.0 else None
    except (TypeError, ValueError):
        return None


def _clean_multiples(values: list[Any]) -> list[float]:
    """Filter a list down to valid, non-zero floats."""
    return [v for v in (_safe_float(x) for x in values) if v is not None]


def _compute_stats(values: list[float]) -> dict[str, Optional[float]]:
    """Compute median, mean, q1, q3 for a list of floats."""
    if not values:
        return {"median": None, "mean": None, "q1": None, "q3": None}

    sorted_vals = sorted(values)
    n = len(sorted_vals)
    med = statistics.median(sorted_vals)
    mean = statistics.mean(sorted_vals)

    # Quartiles: use the lower and upper halves
    if n < 2:
        q1 = sorted_vals[0]
        q3 = sorted_vals[0]
    else:
        mid = n // 2
        lower = sorted_vals[:mid]
        upper = sorted_vals[mid:] if n % 2 == 0 else sorted_vals[mid + 1:]
        q1 = statistics.median(lower) if lower else med
        q3 = statistics.median(upper) if upper else med

    return {
        "median": round(med, 4),
        "mean": round(mean, 4),
        "q1": round(q1, 4),
        "q3": round(q3, 4),
    }


def _implied_ev(
    target: dict[str, Any],
    multiple_name: str,
    multiple_value: float,
) -> Optional[float]:
    """
    Compute the implied enterprise value for the target given a multiple.

    EV/Revenue multiple  -> EV = revenue * multiple
    EV/EBITDA multiple   -> EV = ebitda * multiple
    P/E multiple         -> EV = (market_cap from P/E) treated as equity value
                            We approximate: equity_value = ebitda * pe (rough proxy
                            when we lack net income; if net_income is provided we use it).
    """
    if multiple_name == "ev_revenue":
        revenue = _safe_float(target.get("revenue"))
        if revenue is None:
            return None
        return revenue * multiple_value

    if multiple_name == "ev_ebitda":
        ebitda = _safe_float(target.get("ebitda"))
        if ebitda is None:
            return None
        return ebitda * multiple_value

    if multiple_name == "pe":
        # Prefer net_income if available; otherwise fall back to ebitda as proxy
        net_income = _safe_float(target.get("net_income"))
        if net_income is None:
            net_income = _safe_float(target.get("ebitda"))
        if net_income is None:
            return None
        return net_income * multiple_value

    return None


def _format_currency(value: float) -> str:
    """Format a number into a human-readable currency string."""
    abs_val = abs(value)
    if abs_val >= 1_000_000_000:
        return f"${value / 1_000_000_000:,.2f}B"
    if abs_val >= 1_000_000:
        return f"${value / 1_000_000:,.2f}M"
    if abs_val >= 1_000:
        return f"${value / 1_000:,.2f}K"
    return f"${value:,.2f}"


_MULTIPLE_DISPLAY_NAMES: dict[str, str] = {
    "ev_revenue": "EV/Revenue",
    "ev_ebitda": "EV/EBITDA",
    "pe": "P/E",
}


def _build_narrative(
    target_name: str,
    valuation_range: dict[str, dict[str, Optional[float]]],
    stats: dict[str, dict[str, Optional[float]]],
    peer_count: int,
) -> str:
    """Auto-generate a plain-text summary of the investment comparison."""
    lines: list[str] = []
    lines.append(
        f"Investment Comparison Analysis for {target_name} "
        f"based on {peer_count} comparable investment(s)."
    )

    for mult_key, range_data in valuation_range.items():
        display = _MULTIPLE_DISPLAY_NAMES.get(mult_key, mult_key)
        low = range_data.get("low")
        high = range_data.get("high")
        median = range_data.get("median")

        if median is None:
            lines.append(f"  {display}: Insufficient data to compute valuation.")
            continue

        low_str = _format_currency(low) if low is not None else "N/A"
        high_str = _format_currency(high) if high is not None else "N/A"
        med_str = _format_currency(median)

        mult_stats = stats.get(mult_key, {})
        mult_median = mult_stats.get("median")
        mult_mean = mult_stats.get("mean")

        lines.append(
            f"  {display}: Implied EV ranges from {low_str} to {high_str} "
            f"(median {med_str}). "
            f"Peer median multiple: {mult_median:.2f}x, mean: {mult_mean:.2f}x."
            if mult_median is not None and mult_mean is not None
            else f"  {display}: Implied EV median is {med_str}."
        )

    # Overall range across all multiples
    all_medians = [
        v["median"]
        for v in valuation_range.values()
        if v.get("median") is not None
    ]
    if all_medians:
        overall_low = min(all_medians)
        overall_high = max(all_medians)
        lines.append(
            f"  Across all multiples, the median implied EV ranges from "
            f"{_format_currency(overall_low)} to {_format_currency(overall_high)}."
        )

    return "\n".join(lines)


def run_comps_analysis(
    target_investment: dict[str, Any],
    comparison_investments: list[dict[str, Any]],
    multiples_to_use: Optional[list[str]] = None,
) -> dict[str, Any]:
    """
    Run a deterministic Investment Comparison Analysis.

    Helps a user understand how a target investment is valued relative to
    comparable investments using common multiples.

    Parameters
    ----------
    target_investment : dict
        Must contain at minimum: name, sector, revenue, ebitda.
        Optional: ebitda_margin, revenue_growth, market_cap, enterprise_value,
        net_income.
    comparison_investments : list[dict]
        Each comparable investment dict should have: name, sector, ev_revenue,
        ev_ebitda, pe, revenue_growth, ebitda_margin.
    multiples_to_use : list[str], optional
        Which multiples to apply. Defaults to ["ev_revenue", "ev_ebitda", "pe"].

    Returns
    -------
    dict with keys: target_investment, comps_table, valuation_range, statistics,
    narrative_summary.
    """
    if multiples_to_use is None:
        multiples_to_use = ["ev_revenue", "ev_ebitda", "pe"]

    # Support legacy callers passing target_company / peers
    target_company = target_investment
    peers = comparison_investments

    target_name: str = target_company.get("name", "Unknown")

    # ── Build comps table ────────────────────────────────────────────
    comps_table: list[dict[str, Any]] = []
    for peer in peers:
        row: dict[str, Any] = {
            "name": peer.get("name", "Unknown"),
            "sector": peer.get("sector"),
            "revenue_growth": peer.get("revenue_growth"),
            "ebitda_margin": peer.get("ebitda_margin"),
        }
        for mult in multiples_to_use:
            row[mult] = _safe_float(peer.get(mult))
        comps_table.append(row)

    # ── Compute statistics per multiple ──────────────────────────────
    mult_statistics: dict[str, dict[str, Optional[float]]] = {}
    for mult in multiples_to_use:
        raw_values = [peer.get(mult) for peer in peers]
        clean = _clean_multiples(raw_values)
        mult_statistics[mult] = _compute_stats(clean)

    # ── Compute implied valuation range ──────────────────────────────
    valuation_range: dict[str, dict[str, Optional[float]]] = {}
    for mult in multiples_to_use:
        raw_values = [peer.get(mult) for peer in peers]
        clean = _clean_multiples(raw_values)

        if not clean:
            valuation_range[mult] = {
                "low": None,
                "median": None,
                "high": None,
                "mean": None,
            }
            continue

        implied_values = []
        for mv in clean:
            iv = _implied_ev(target_company, mult, mv)
            if iv is not None:
                implied_values.append(iv)

        if not implied_values:
            valuation_range[mult] = {
                "low": None,
                "median": None,
                "high": None,
                "mean": None,
            }
            continue

        valuation_range[mult] = {
            "low": round(min(implied_values), 2),
            "median": round(statistics.median(implied_values), 2),
            "high": round(max(implied_values), 2),
            "mean": round(statistics.mean(implied_values), 2),
        }

    # ── Narrative ────────────────────────────────────────────────────
    narrative = _build_narrative(
        target_name,
        valuation_range,
        mult_statistics,
        len(peers),
    )

    return {
        "target_investment": target_name,
        "comps_table": comps_table,
        "valuation_range": valuation_range,
        "statistics": mult_statistics,
        "narrative_summary": narrative,
    }
