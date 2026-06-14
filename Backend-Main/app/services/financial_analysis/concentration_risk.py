"""
Concentration Risk Engine
-------------------------
Identifies single-asset concentration, top-3 exposure, sector/asset-class
concentration, and assigns a severity tier (GREEN / YELLOW / RED / CRITICAL).

All numbers are deterministic — Claude only narrates the results.
"""

from __future__ import annotations

from collections import defaultdict
from typing import Optional

# Thresholds (from thresholds.json concept in the action plan)
THRESHOLDS = {
    "CRITICAL_SINGLE_ASSET": 30.0,   # one holding > 30% → CRITICAL
    "HIGH_SINGLE_ASSET":     20.0,   # one holding > 20% → RED
    "WARN_SINGLE_ASSET":     10.0,   # one holding > 10% → YELLOW
    "CRITICAL_TOP3":         70.0,   # top-3 > 70% → CRITICAL
    "HIGH_TOP3":             55.0,   # top-3 > 55% → RED
    "WARN_TOP3":             40.0,   # top-3 > 40% → YELLOW
    "CRITICAL_SECTOR":       60.0,   # one sector > 60% → CRITICAL
    "HIGH_SECTOR":           45.0,   # one sector > 45% → RED
    "WARN_SECTOR":           30.0,   # one sector > 30% → YELLOW
}

SEVERITY_ORDER = {"CRITICAL": 3, "RED": 2, "YELLOW": 1, "GREEN": 0}


def _severity(value: float, crit: float, high: float, warn: float) -> str:
    if value >= crit:
        return "CRITICAL"
    if value >= high:
        return "RED"
    if value >= warn:
        return "YELLOW"
    return "GREEN"


def analyze_concentration(positions: list[dict]) -> dict:
    """
    Analyze portfolio concentration across individual holdings,
    top-3, asset class, and sector.

    Parameters
    ----------
    positions : list[dict]
        Each position needs: ticker, asset_name, quantity, price,
        asset_class (optional), sector (optional).

    Returns
    -------
    dict with:
        total_value, holdings_sorted, top3_pct, hhi_score,
        asset_class_concentration, individual_flags,
        overall_severity, risk_metadata, summary_flags
    """

    if not positions:
        return {"error": "No positions provided"}

    # ── 1. Compute per-holding market value ───────────────────────────
    enriched = []
    total_value = 0.0
    for pos in positions:
        mv = float(pos["quantity"]) * float(pos["price"])
        total_value += mv
        enriched.append({
            "ticker":      pos.get("ticker", "?"),
            "asset_name":  pos.get("asset_name", pos.get("ticker", "?")),
            "asset_class": pos.get("asset_class", "Other"),
            "account_type": pos.get("account_type", "Unknown"),
            "market_value": mv,
        })

    if total_value == 0:
        return {"error": "Total portfolio value is zero"}

    # ── 2. Sort by weight descending (for sorted bar chart) ──────────
    for h in enriched:
        h["weight_pct"] = round(h["market_value"] / total_value * 100, 2)
    holdings_sorted = sorted(enriched, key=lambda x: x["weight_pct"], reverse=True)

    # ── 3. Top-3 concentration ────────────────────────────────────────
    top3 = holdings_sorted[:3]
    top3_pct = round(sum(h["weight_pct"] for h in top3), 2)
    top3_severity = _severity(
        top3_pct,
        THRESHOLDS["CRITICAL_TOP3"],
        THRESHOLDS["HIGH_TOP3"],
        THRESHOLDS["WARN_TOP3"],
    )

    # ── 4. Herfindahl-Hirschman Index (HHI) ──────────────────────────
    hhi = round(sum((h["weight_pct"] / 100) ** 2 for h in enriched) * 10000, 1)
    # HHI < 1500 = diversified, 1500-2500 = moderate, > 2500 = concentrated
    if hhi >= 2500:
        hhi_label = "Highly Concentrated"
    elif hhi >= 1500:
        hhi_label = "Moderately Concentrated"
    else:
        hhi_label = "Diversified"

    # ── 5. Individual holding flags ───────────────────────────────────
    individual_flags = []
    for h in holdings_sorted:
        sev = _severity(
            h["weight_pct"],
            THRESHOLDS["CRITICAL_SINGLE_ASSET"],
            THRESHOLDS["HIGH_SINGLE_ASSET"],
            THRESHOLDS["WARN_SINGLE_ASSET"],
        )
        if sev != "GREEN":
            individual_flags.append({
                "ticker":     h["ticker"],
                "asset_name": h["asset_name"],
                "weight_pct": h["weight_pct"],
                "severity":   sev,
                "flag_code":  "CRITICAL_CONCENTRATION" if sev == "CRITICAL" else "HIGH_CONCENTRATION" if sev == "RED" else "WARN_CONCENTRATION",
                "message": (
                    f"{h['ticker']} is {h['weight_pct']:.1f}% of the portfolio — "
                    + ("one bad earnings report could meaningfully hurt returns." if sev == "CRITICAL" else
                       "watch for further drift if conviction weakens."          if sev == "RED" else
                       "keep an eye on it as the portfolio evolves.")
                ),
            })

    # ── 6. Asset-class concentration ─────────────────────────────────
    class_buckets: dict[str, float] = defaultdict(float)
    for h in enriched:
        class_buckets[h["asset_class"]] += h["market_value"]

    asset_class_concentration = []
    for cls, mv in sorted(class_buckets.items(), key=lambda x: -x[1]):
        w = round(mv / total_value * 100, 2)
        sev = _severity(
            w,
            THRESHOLDS["CRITICAL_SECTOR"],
            THRESHOLDS["HIGH_SECTOR"],
            THRESHOLDS["WARN_SECTOR"],
        )
        asset_class_concentration.append({
            "asset_class": cls,
            "market_value": round(mv, 2),
            "weight_pct": w,
            "severity": sev,
        })

    # ── 7. Overall severity (worst of all signals) ────────────────────
    all_severities = [top3_severity] + [f["severity"] for f in individual_flags] + \
                     [c["severity"] for c in asset_class_concentration]
    overall_severity = max(all_severities, key=lambda s: SEVERITY_ORDER[s])

    # ── 8. Risk metadata (passed to Claude) ──────────────────────────
    risk_metadata = {
        "severity":       overall_severity,
        "hhi_score":      hhi,
        "hhi_label":      hhi_label,
        "top3_pct":       top3_pct,
        "top3_severity":  top3_severity,
        "holding_count":  len(enriched),
        "flagged_count":  len(individual_flags),
    }

    # ── 9. Summary flags (educational descriptions for Claude) ────────
    summary_flags = []
    if top3_severity != "GREEN":
        summary_flags.append({
            "severity": top3_severity,
            "flag_code": "TOP3_CONCENTRATION",
            "title": f"Top 3 holdings represent {top3_pct:.1f}% of portfolio",
            "description": (
                f"{', '.join(h['ticker'] for h in top3)} make up {top3_pct:.1f}% of the portfolio. "
                f"When three names carry this much weight, a bad quarter for any of them moves the whole portfolio."
            ),
        })
    for f in individual_flags:
        summary_flags.append({
            "severity": f["severity"],
            "flag_code": f["flag_code"],
            "title": f"{f['ticker']}: {f['weight_pct']:.1f}% of portfolio",
            "description": f["message"],
        })
    top_class = asset_class_concentration[0] if asset_class_concentration else None
    if top_class and top_class["severity"] != "GREEN":
        summary_flags.append({
            "severity": top_class["severity"],
            "flag_code": "ASSET_CLASS_CONCENTRATION",
            "title": f"{top_class['asset_class']} is {top_class['weight_pct']:.1f}% of portfolio",
            "description": (
                f"{top_class['asset_class']} is {top_class['weight_pct']:.1f}% of the portfolio. "
                f"A stress event specific to this asset class would disproportionately hit your returns."
            ),
        })

    return {
        "total_value":              round(total_value, 2),
        "holdings_sorted":          holdings_sorted,
        "top3_pct":                 top3_pct,
        "top3_holdings":            [{"ticker": h["ticker"], "weight_pct": h["weight_pct"]} for h in top3],
        "hhi_score":                hhi,
        "hhi_label":                hhi_label,
        "asset_class_concentration": asset_class_concentration,
        "individual_flags":          individual_flags,
        "overall_severity":          overall_severity,
        "risk_metadata":             risk_metadata,
        "summary_flags":             summary_flags,
    }
