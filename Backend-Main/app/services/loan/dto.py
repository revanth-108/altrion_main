"""
DTOs for loan calculation API.
"""
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field


class LoanAssetRequestDTO(BaseModel):
    symbol: str
    allocation_usd: float
    tier: Optional[str] = None


class LoanCalculateRequestDTO(BaseModel):
    assets: List[LoanAssetRequestDTO]
    months: int = Field(default=6, ge=1, le=36)
    payout_currency: Optional[str] = "USD"
    payout_method: Optional[str] = "bank_transfer"
    # Deprecated: kept only so older clients do not fail validation. User-facing
    # bank selection is no longer accepted as the payment rail source of truth.
    bank: Optional[str] = None


class LoanCalculateResponseDTO(BaseModel):
    calculation_id: Optional[str] = None
    summary: Dict[str, Any]
    schedule: Dict[str, Any]
    assets: List[Dict[str, Any]]


class LoanUsageSymbolDTO(BaseModel):
    symbol: str
    requests: int
    total_collateral_usd: float
    total_loan_usd: float
    avg_ltv_frac: float


class LoanUsageTierDTO(BaseModel):
    tier: str
    rows: int
    total_loan_usd: float


class LoanAnalyticsSummaryDTO(BaseModel):
    days: int
    total_requests: int
    total_collateral_usd: float
    total_loan_usd: float
    avg_interest_rate_pct: float
    avg_monthly_emi_usd: float
    top_symbols: List[LoanUsageSymbolDTO]
    tier_breakdown: List[LoanUsageTierDTO]
