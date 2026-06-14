"""
Shared portfolio asset classification.

Normalizes legacy Plaid cash rows and applies one bucket policy across
aggregation, allocation insights, and health scoring.
"""
from __future__ import annotations

from dataclasses import dataclass

from app.models.holding import Holding

STABLECOINS = {"USDC", "USDT", "DAI", "PYUSD", "BUSD", "TUSD", "GUSD", "LUSD", "FRAX"}

# Symbols that are always crypto regardless of how the institution classifies them
KNOWN_CRYPTO = {
    "BTC", "ETH", "SOL", "ADA", "DOT", "AVAX", "LINK", "MATIC", "BNB",
    "XRP", "DOGE", "LTC", "ALGO", "ATOM", "UNI", "AAVE", "CRV", "MKR",
    "COMP", "SNX", "YFI", "SUSHI", "FTM", "NEAR", "ICP", "FIL", "TRX",
    "XLM", "ETC", "BCH", "SHIB", "APE", "SAND", "MANA", "AXS",
}


@dataclass(frozen=True)
class HoldingClassification:
    normalized_symbol: str
    effective_asset_class: str
    bucket: str
    is_stablecoin: bool
    is_legacy_plaid_cash: bool


def classify_holding(holding: Holding) -> HoldingClassification:
    symbol = (holding.canonical_symbol or "").upper()

    # Known crypto symbols always go to crypto bucket regardless of institution classification
    if symbol in KNOWN_CRYPTO:
        return HoldingClassification(
            normalized_symbol=symbol,
            effective_asset_class="crypto",
            bucket="crypto",
            is_stablecoin=False,
            is_legacy_plaid_cash=False,
        )

    is_plain_plaid_cash = (
        holding.source == "plaid"
        and holding.asset_class == "cash_equivalent"
        and holding.security_id is None
    )
    if is_plain_plaid_cash:
        return HoldingClassification(
            normalized_symbol="USD",
            effective_asset_class="cash_equivalent",
            bucket="cash",
            is_stablecoin=False,
            is_legacy_plaid_cash=symbol in STABLECOINS,
        )

    if symbol in STABLECOINS:
        return HoldingClassification(
            normalized_symbol=symbol,
            effective_asset_class="cash_equivalent",
            bucket="cash",
            is_stablecoin=True,
            is_legacy_plaid_cash=False,
        )

    if holding.asset_class == "crypto":
        return HoldingClassification(
            normalized_symbol=symbol,
            effective_asset_class="crypto",
            bucket="crypto",
            is_stablecoin=False,
            is_legacy_plaid_cash=False,
        )

    if holding.asset_class == "cash_equivalent":
        return HoldingClassification(
            normalized_symbol=symbol or "USD",
            effective_asset_class="cash_equivalent",
            bucket="cash",
            is_stablecoin=False,
            is_legacy_plaid_cash=False,
        )

    return HoldingClassification(
        normalized_symbol=symbol,
        effective_asset_class="equity",
        bucket="stocks",
        is_stablecoin=False,
        is_legacy_plaid_cash=False,
    )
