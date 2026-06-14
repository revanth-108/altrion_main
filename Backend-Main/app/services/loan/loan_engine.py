"""
Core loan calculation engine.
Per-asset breakdown, portfolio aggregation, and amortization integration.
"""
from typing import List, Dict, Optional
from decimal import Decimal, ROUND_HALF_UP
from app.core.logging import get_logger
from app.domain.risk_tiers import tier_info
from app.utils.amortization import amortization_schedule, sum_schedules

logger = get_logger()

BASE_RATE = 0.0633


def fmt(x: float, places: str = "0.01") -> float:
    """Round to given decimal places using HALF_UP."""
    return float(Decimal(str(x)).quantize(Decimal(places), rounding=ROUND_HALF_UP))


def _get_pct_change_30d(metrics: Dict) -> Optional[float]:
    v = (
        metrics.get("pct_change_30d")
        or metrics.get("pct_change_30")
        or metrics.get("30dChange(%)")
    )
    try:
        return float(v)
    except Exception:
        return None


def volatility_premium_from_metrics(metrics: Dict) -> float:
    """
    Volatility premium based on absolute 30-day % change.
      |30d| < 10%  -> +1.0%
      10%-<20%     -> +1.5%
      >=20%        -> +2.0%
    """
    ch30 = _get_pct_change_30d(metrics)
    if ch30 is None:
        return 0.01
    ch30 = abs(ch30)
    if ch30 < 10:
        return 0.01
    if ch30 < 20:
        return 0.015
    return 0.02


def interest_components_for_asset(tier: str, metrics: Dict) -> Dict[str, float]:
    info = tier_info(tier)
    base = BASE_RATE
    risk = info["risk_premium"]
    vol = volatility_premium_from_metrics(metrics)
    total = base + risk + vol

    logger.debug(
        "loan_engine_interest_components",
        tier=tier,
        base_rate=fmt(base, "0.0001"),
        risk_premium=fmt(risk, "0.0001"),
        volatility_premium=fmt(vol, "0.0001"),
        total_rate=fmt(total, "0.0001"),
    )

    return {
        "base_rate": fmt(base, "0.0001"),
        "risk_premium": fmt(risk, "0.0001"),
        "volatility_premium": fmt(vol, "0.0001"),
        "interest_rate": fmt(total, "0.0001"),
    }


def per_asset_breakdown(alloc_usd: float, tier: str, metrics: Dict, symbol: str) -> Dict:
    """Build the per-asset view used by the UI and portfolio aggregation."""
    ltv = tier_info(tier)["ltv"]
    ic = interest_components_for_asset(tier, metrics)
    loan_amount = alloc_usd * ltv

    return {
        "symbol": symbol,
        "tier": tier,
        "ltv": ltv,
        "base_rate": ic["base_rate"],
        "risk_premium": ic["risk_premium"],
        "volatility_premium": ic["volatility_premium"],
        "interest_rate": ic["interest_rate"],
        "collateral_usd": fmt(alloc_usd),
        "loan_usd": fmt(loan_amount),
        "pct_change_30d": _get_pct_change_30d(metrics),
    }


def portfolio_aggregate(rows: List[Dict], months: int) -> Dict:
    """
    Aggregate per-asset rows into portfolio summary.
    LTV and interest_rate are returned as PERCENT values.
    """
    total_collateral = sum(r["collateral_usd"] for r in rows)
    total_loan = sum(r["loan_usd"] for r in rows)

    weighted_ltv = (total_loan / total_collateral) if total_collateral else 0.0

    weighted_ir = 0.0
    for r in rows:
        weight = r["loan_usd"] / total_loan if total_loan else 0.0
        weighted_ir += float(r["interest_rate"]) * weight

    liquidation_ltv = min(weighted_ltv * 1.2, 0.95)
    margin_call_pct = ((weighted_ltv * 100.0) + (liquidation_ltv * 100.0)) / 2.0

    r_month = weighted_ir / 12.0
    n = int(months)
    P = float(total_loan)
    if n > 0:
        if r_month > 0:
            emi = P * r_month / (1 - (1 + r_month) ** (-n))
        else:
            emi = P / n
    else:
        emi = 0.0

    logger.info(
        "loan_engine_portfolio_aggregated",
        asset_count=len(rows),
        total_collateral=fmt(total_collateral),
        total_loan=fmt(total_loan),
        weighted_ltv_pct=fmt(weighted_ltv * 100),
        weighted_ir_pct=fmt(weighted_ir * 100),
        liquidation_ltv_pct=fmt(liquidation_ltv * 100),
        margin_call_ltv_pct=fmt(margin_call_pct),
        monthly_emi=fmt(emi),
        months=n,
    )

    return {
        "total_collateral": fmt(total_collateral),
        "total_loan": fmt(total_loan),
        "portfolio_ltv": fmt(weighted_ltv * 100),
        "liquidation_ltv": fmt(liquidation_ltv * 100),
        "margin_call_ltv": fmt(margin_call_pct),
        "interest_rate": fmt(weighted_ir * 100),
        "monthly_emi": fmt(emi),
        "months": n,
    }


def attach_amortization(out: Dict) -> Dict:
    """
    Adds amortization schedule and sets the definitive monthly_emi.
    """
    if not out or "assets" not in out or "summary" not in out:
        logger.warning("loan_engine_amortization_skipped", reason="missing assets or summary")
        return out

    months = int(out["summary"].get("months", 0))
    if months <= 0:
        logger.warning("loan_engine_amortization_skipped", reason="months <= 0", months=months)
        out["schedule"] = {"portfolio": [], "assets": {}, "payments": {}}
        out["summary"]["monthly_emi"] = 0.0
        return out

    per_asset_sched: Dict[str, list] = {}
    per_asset_payment: Dict[str, float] = {}
    for a in out["assets"]:
        sched = amortization_schedule(
            principal_usd=float(a["loan_usd"]),
            annual_rate_frac=float(a["interest_rate"]),
            months=months,
        )
        per_asset_sched[a["symbol"]] = sched["schedule"]
        per_asset_payment[a["symbol"]] = float(sched["payment"])

        logger.debug(
            "loan_engine_asset_amortization",
            symbol=a["symbol"],
            principal_usd=a["loan_usd"],
            annual_rate=a["interest_rate"],
            monthly_payment=float(sched["payment"]),
            schedule_rows=len(sched["schedule"]),
        )

    portfolio_sched = sum_schedules(per_asset_sched)

    monthly_emi = sum(per_asset_payment.values())
    out["summary"]["monthly_emi"] = fmt(monthly_emi)

    logger.info(
        "loan_engine_amortization_complete",
        months=months,
        asset_count=len(per_asset_sched),
        portfolio_monthly_emi=fmt(monthly_emi),
        schedule_rows=len(portfolio_sched),
    )

    out["schedule"] = {
        "portfolio": portfolio_sched,
        "assets": per_asset_sched,
        "payments": per_asset_payment,
    }
    return out
