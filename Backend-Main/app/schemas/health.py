"""
Portfolio Health Score schemas
"""
from pydantic import BaseModel
from typing import Any, Optional


class HealthMetric(BaseModel):
    score: float
    label: str
    color: str


class HealthMetrics(BaseModel):
    diversification: HealthMetric
    risk_exposure: HealthMetric
    performance: HealthMetric


class DimensionScores(BaseModel):
    d1_liquidity: Optional[float] = None
    d2_investment: Optional[float] = None
    d3_retirement: Optional[float] = None
    d4_crypto: Optional[float] = None
    d5_defi: Optional[float] = None
    d6_debt: Optional[float] = None
    d7_velocity: Optional[float] = None


class PortfolioHealthResponse(BaseModel):
    overall_score: int
    overall_label: str
    overall_color: str
    completeness_pct: int
    active_dimensions: int
    life_stage: str
    solvency_tier: str
    structural_solvency_mult: Optional[float] = None
    total_laav: Optional[float] = None
    total_liabilities: Optional[float] = None
    metrics: HealthMetrics
    dimension_scores: DimensionScores
    breakdown: Optional[dict[str, Any]] = None

    class Config:
        from_attributes = True


class HealthHistoryPoint(BaseModel):
    computed_at: str
    overall_score: int
    d1_liquidity: Optional[float] = None
    d2_investment: Optional[float] = None
    d3_retirement: Optional[float] = None
    d4_crypto: Optional[float] = None
    d5_defi: Optional[float] = None
    d6_debt: Optional[float] = None
    d7_velocity: Optional[float] = None
    life_stage: Optional[str] = None
    solvency_tier: Optional[str] = None


class HealthHistoryResponse(BaseModel):
    days: int
    data: list[HealthHistoryPoint]
