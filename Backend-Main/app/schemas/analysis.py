"""
Pydantic schemas for the financial-analysis module:
Monte Carlo retirement simulation, DCF valuation, comparable multiples, and LBO scenario.
"""
from __future__ import annotations

from typing import Any, Literal, Optional, Union

from pydantic import BaseModel, Field


# ---------------------------------------------------------------------------
# Monte Carlo
# ---------------------------------------------------------------------------
class MonteCarloEvent(BaseModel):
    age: int
    label: str
    kind: Literal["income", "expense", "savings", "withdrawal", "lump_sum"]
    amount: float


class MonteCarloRequest(BaseModel):
    initial_balance: float
    monthly_contribution: float
    annual_income: Optional[float] = None
    annual_expenses: Optional[float] = None
    use_cash_flow_contribution: bool = False
    income_growth_rate: float = 0.03
    expense_growth_rate: float = 0.03
    events: list[MonteCarloEvent] = Field(default_factory=list)
    current_age: int
    retirement_age: int
    planning_age: int = 90
    target_annual_income: float
    social_security_income: float = 0.0
    mean_return: float = 0.07
    return_std: float = 0.15
    retirement_mean_return: float = 0.05
    retirement_return_std: float = 0.10
    mean_inflation: float = 0.025
    inflation_std: float = 0.01
    n_iterations: int = 1000
    random_salt: int = 0


# ---------------------------------------------------------------------------
# DCF
# ---------------------------------------------------------------------------
class DCFRequest(BaseModel):
    investment_name: str
    revenue: float
    revenue_growth: Union[float, list[float]]
    profit_margin: float
    tax_rate: float
    capex_pct: float
    working_capital_pct: float
    discount_rate: float
    terminal_growth: float
    projection_years: int = 5


# ---------------------------------------------------------------------------
# Comps
# ---------------------------------------------------------------------------
class CompsRequest(BaseModel):
    target_investment: dict[str, Any]
    comparison_investments: list[dict[str, Any]]
    multiples_to_use: Optional[list[str]] = None


# ---------------------------------------------------------------------------
# LBO
# ---------------------------------------------------------------------------
class LBORequest(BaseModel):
    investment_name: str
    investment_amount: float
    entry_multiple: float
    leverage_ratio: float
    interest_rate: float
    income_growth: float
    exit_multiple: float
    hold_period: int = 5
    initial_annual_income: Optional[float] = None


# ---------------------------------------------------------------------------
# Goal Fit (form-driven, no portfolio dependency)
# ---------------------------------------------------------------------------
class GoalFitRequest(BaseModel):
    current_assets: float
    target_amount: float
    years_to_goal: int
    annual_savings: float
    allocation: dict[str, float]
    goal_type: str = "Custom"
    risk_comfort: str = "moderate"


# ---------------------------------------------------------------------------
# Research Lab
# ---------------------------------------------------------------------------
class ResearchLabRequest(BaseModel):
    symbol: str
    mode: Literal[
        "investment_thesis",
        "earnings_analysis",
        "comps_valuation",
        "bull_bear_memo",
        "catalyst_tracker",
        "insider_activity_analysis",
        "protocol_deep_dive",
    ]
    asset_type: str = "stock"


class ExplainRequest(BaseModel):
    kind: Literal["monte_carlo", "financial_analysis"]
    title: Optional[str] = None
    context: Any = Field(default_factory=dict)
    api_key: Optional[str] = None


class ExplainResponse(BaseModel):
    explanation: str
    model: str
    used_user_key: bool


class PortfolioXRayInsightFinding(BaseModel):
    severity: str
    message: str


class PortfolioXRayInsightPayload(BaseModel):
    holdings: list[dict[str, Any]] = Field(default_factory=list)
    sector_totals: list[dict[str, Any]] = Field(default_factory=list)
    geographic_totals: list[dict[str, Any]] = Field(default_factory=list)
    top_overlaps: list[dict[str, Any]] = Field(default_factory=list)
    xray_summary: list[dict[str, Any]] = Field(default_factory=list)
    action_items: list[dict[str, Any]] = Field(default_factory=list)
    data_quality: dict[str, Any] = Field(default_factory=dict)
    fallback_findings: list[PortfolioXRayInsightFinding] = Field(default_factory=list)
