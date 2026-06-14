"""
Local-only volatility metrics provider.
No HTTP calls — keeps the pipeline intact while avoiding external API dependencies.
"""
from typing import Dict, Optional, Tuple
from app.core.logging import get_logger

logger = get_logger()

_LOCAL_METRICS: Dict[str, Dict] = {
    "BTC":  {"symbol": "BTC", "name": "Bitcoin",  "volatility_score": 8.0,  "pct_change_30d": 6.2,  "pct_change_90d": 12.3},
    "ETH":  {"symbol": "ETH", "name": "Ethereum", "volatility_score": 12.0, "pct_change_30d": 14.8, "pct_change_90d": 28.1},
    "XRP":  {"symbol": "XRP", "name": "XRP",      "volatility_score": 22.0, "pct_change_30d": 19.9, "pct_change_90d": 35.2},
    "USDT": {"symbol": "USDT", "name": "Tether",  "volatility_score": 2.0,  "pct_change_30d": 0.1,  "pct_change_90d": 0.3},
    "SOL":  {"symbol": "SOL", "name": "Solana",   "volatility_score": 30.0, "pct_change_30d": 26.5, "pct_change_90d": 52.4},
    "ADA":  {"symbol": "ADA", "name": "Cardano",  "volatility_score": 28.0, "pct_change_30d": 22.7, "pct_change_90d": 40.1},
}


def get_metrics(symbol: str) -> Dict:
    """
    Return local metrics for a symbol (case-insensitive).
    Contains at least: volatility_score, pct_change_30d
    """
    sym = (symbol or "").upper()
    data = _LOCAL_METRICS.get(sym, {})
    if not data:
        logger.warning("loan_volatility_no_local_metrics", symbol=sym)
    else:
        logger.debug(
            "loan_volatility_metrics_loaded",
            symbol=sym,
            volatility_score=data.get("volatility_score"),
            pct_change_30d=data.get("pct_change_30d"),
        )
    return dict(data)


def get_model_features(symbol: str) -> Tuple[Optional[float], Optional[float]]:
    """
    Returns (volatility_score, market_cap_usd).
    market_cap_usd is None in local mode.
    """
    m = get_metrics(symbol)
    vs = _to_float(m.get("volatility_score"))
    if vs is None:
        logger.warning("loan_volatility_missing_score", symbol=symbol)
    return vs, None


def _to_float(x) -> Optional[float]:
    try:
        return float(x)
    except Exception:
        return None
