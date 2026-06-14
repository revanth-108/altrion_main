"""
Schemas for portfolio allocation insights.
"""
from typing import List, Optional, Literal

from pydantic import BaseModel, Field


class AllocationBreakdownItem(BaseModel):
    label: str
    weight_pct: float
    value_usd: float


class PositionBreakdownItem(BaseModel):
    asset: str
    name: str
    bucket: Literal["crypto", "stocks", "cash"]
    weight_pct: float
    value_usd: float


class AllocationSummary(BaseModel):
    stance: str
    confidence: float = Field(ge=0.0, le=1.0)
    text: str
    caution: Optional[str] = None
    used_llm: bool = False


class AllocationMetrics(BaseModel):
    cash_pct: float
    stocks_pct: float
    crypto_pct: float
    stablecoin_pct: float
    top_position_pct: float
    top_sector: str
    top_crypto_category: str
    metadata_coverage_pct: float
    unknown_allocations_pct: float


class AllocationBreakdowns(BaseModel):
    top_positions: List[PositionBreakdownItem]
    by_sector: List[AllocationBreakdownItem]
    by_crypto_category: List[AllocationBreakdownItem]


class AllocationInsightsResponse(BaseModel):
    summary: AllocationSummary
    metrics: AllocationMetrics
    breakdowns: AllocationBreakdowns
    status: Literal["ok", "partial", "degraded"]
    warnings: List[str]


class AssetInsightAccountBreakdown(BaseModel):
    account_id: str
    account_name: Optional[str] = None
    provider: str
    value_usd: float
    quantity: float
    weight_pct: float


class AssetInsightDetails(BaseModel):
    symbol: str
    bucket: Literal["crypto", "stocks", "cash"]
    display_name: str
    portfolio_weight_pct: float
    value_usd: float
    quantity: float
    sector: Optional[str] = None
    category: Optional[str] = None
    metadata_status: str


class AssetInsightResponse(BaseModel):
    summary: AllocationSummary
    asset: AssetInsightDetails
    accounts: List[AssetInsightAccountBreakdown]
    status: Literal["ok", "partial", "degraded"]
    warnings: List[str]
