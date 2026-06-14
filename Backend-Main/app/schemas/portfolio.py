"""
Portfolio schemas
"""
from pydantic import BaseModel
from typing import List, Optional
from decimal import Decimal


class AssetSourceBreakdown(BaseModel):
    """Per-source breakdown for an asset"""
    source: str
    account_id: str
    account_name: Optional[str]
    quantity: Decimal
    value_usd: Decimal


class AssetResponse(BaseModel):
    """Asset in portfolio response"""
    symbol: str
    name: str
    quantity: Decimal
    value_usd: Decimal
    price_usd: Decimal
    change_24h: Optional[float] = None
    asset_class: str
    sources: List[AssetSourceBreakdown]  # Expandable breakdown

    class Config:
        from_attributes = True


class PortfolioResponse(BaseModel):
    """Portfolio response"""
    schema_version: str = "v1"
    # total_value is retained for backward compatibility and means assets only.
    total_value: Decimal
    portfolio_value: Decimal
    total_assets: Decimal
    total_liabilities: Decimal
    liabilities_total: Decimal
    net_worth: Decimal
    change_type: str = "tracking_started"
    change_value: Optional[float] = None
    change_pct: Optional[float] = None
    change_since_last_value: Optional[float] = None
    change_since_last_pct: Optional[float] = None
    change_24h: Optional[float] = None
    change_24h_pct: Optional[float] = None
    change_24h_value: Optional[float] = None
    assets: List[AssetResponse]
    categories: dict  # { "crypto": Decimal, "equity": Decimal, "cash_equivalent": Decimal }
    warnings: List[dict]  # Global warnings
    
    class Config:
        json_encoders = {
            Decimal: str,
        }


class RefreshPortfolioResponse(BaseModel):
    """Refresh portfolio response"""
    schema_version: str = "v1"
    success: bool
    message: str
    refreshed_at: str
    warnings: List[dict]
