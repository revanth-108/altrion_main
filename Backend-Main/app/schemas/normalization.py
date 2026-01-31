"""
Normalization schemas - canonical internal shape
"""
from pydantic import BaseModel
from datetime import datetime
from decimal import Decimal
from typing import Literal


class CanonicalHolding(BaseModel):
    """
    Canonical normalized shape - the ONLY truth layer for assets
    
    Every provider adapter MUST output this shape.
    """
    schema_version: Literal["v1"] = "v1"
    user_id: str
    account_id: str
    canonical_symbol: str  # BTC, ETH, USDC
    asset_class: Literal["crypto", "cash_equivalent", "equity"]
    quantity: Decimal  # Full precision decimal
    source: Literal["coinbase", "plaid", "wallet"]
    retrieved_at: datetime
    
    class Config:
        json_encoders = {
            Decimal: str,
            datetime: lambda v: v.isoformat(),
        }
