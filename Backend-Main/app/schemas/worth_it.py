from __future__ import annotations

from typing import Dict, List, Optional

from pydantic import BaseModel, field_validator


# ---------------------------------------------------------------------------
# Shared
# ---------------------------------------------------------------------------

class WorthItTransactionSchema(BaseModel):
    id: str
    merchant: str
    description: str
    amount: float
    category: str
    date: str       # Human-readable display string, e.g. "Sat, Apr 11"
    initial: str    # First letter of merchant for the logo avatar

    class Config:
        from_attributes = True


class InsightTransactionSchema(BaseModel):
    id: str
    merchant: str
    description: str
    amount: float
    category: str
    date: str
    initial: str
    rating: str

    class Config:
        from_attributes = True


# ---------------------------------------------------------------------------
# GET /worth-it/session
# ---------------------------------------------------------------------------

class SessionDataResponse(BaseModel):
    session_id: str
    week_label: str
    transactions: List[WorthItTransactionSchema]
    ratings: Dict[str, str]     # {transaction_ref_id: "keep"|"cut"|"skip"}
    streak: int
    session_complete: bool
    session_skipped: bool


# ---------------------------------------------------------------------------
# POST /worth-it/session/rate
# ---------------------------------------------------------------------------

class RateTransactionRequest(BaseModel):
    transaction_id: str
    rating: str             # "keep" | "cut" | "skip"
    merchant: str
    description: str = ""
    amount: float
    category: str
    date: str               # Display string from the frontend

    @field_validator("rating")
    @classmethod
    def validate_rating(cls, v: str) -> str:
        if v not in ("keep", "cut", "skip"):
            raise ValueError("rating must be 'keep', 'cut', or 'skip'")
        return v

    @field_validator("amount")
    @classmethod
    def validate_amount(cls, v: float) -> float:
        if v < 0:
            raise ValueError("amount must be non-negative")
        return v


class RateTransactionResponse(BaseModel):
    success: bool
    session_complete: bool
    ratings_count: int


# ---------------------------------------------------------------------------
# GET /worth-it/streak
# ---------------------------------------------------------------------------

class StreakDataResponse(BaseModel):
    streak: int
    longest_streak: int
    last_completed_week: Optional[str]   # ISO date string or null
    total_sessions_completed: int


# ---------------------------------------------------------------------------
# GET /worth-it/session/{id}/insights
# ---------------------------------------------------------------------------

class CategoryBreakdownSchema(BaseModel):
    keep_count: int
    cut_count: int
    skip_count: int
    total_amount: float


class InsightsDataResponse(BaseModel):
    total_reviewed_count: int
    keep_count: int
    cut_count: int
    skip_count: int
    keep_total_amount: float
    cut_total_amount: float
    skip_total_amount: float
    top_kept_categories: List[str]
    top_cut_categories: List[str]
    biggest_kept_transaction: Optional[InsightTransactionSchema]
    biggest_cut_transaction: Optional[InsightTransactionSchema]
    recent_happy_transactions: List[InsightTransactionSchema]
    recent_not_happy_transactions: List[InsightTransactionSchema]
    summary_message: str
    category_breakdown: Dict[str, CategoryBreakdownSchema]
    total_saved_estimate: float
    recurring_cuts: List[str]
    week_over_week_trend: str   # "improving" | "declining" | "stable"


# ---------------------------------------------------------------------------
# GET /worth-it/preferences
# ---------------------------------------------------------------------------

class PreferenceSummaryResponse(BaseModel):
    top_kept_categories: List[str]
    top_cut_categories: List[str]
    cut_subscriptions: List[str]
    total_ratings: int
    model_confidence: float     # 0.0–1.0


# ---------------------------------------------------------------------------
# GET /worth-it/history
# ---------------------------------------------------------------------------

class SessionHistoryItemSchema(BaseModel):
    session_id: str
    week_label: str
    status: str
    keep_count: int
    cut_count: int
    skip_count: int
    reviewed_count: int
    keep_total_amount: float
    cut_total_amount: float
    skip_total_amount: float
    summary_message: str
    completed_at: Optional[str]


class SessionHistoryDataResponse(BaseModel):
    sessions: List[SessionHistoryItemSchema]


# ---------------------------------------------------------------------------
# GET /worth-it/insights/last-30-days
# ---------------------------------------------------------------------------

class Last30DaysInsightsResponse(BaseModel):
    total_reviewed_count: int
    keep_count: int
    cut_count: int
    skip_count: int
    keep_total_amount: float
    cut_total_amount: float
    skip_total_amount: float
    top_kept_categories: List[str]
    top_cut_categories: List[str]
    recent_happy_transactions: List[InsightTransactionSchema]
    recent_not_happy_transactions: List[InsightTransactionSchema]
    biggest_kept_transaction: Optional[InsightTransactionSchema]
    biggest_cut_transaction: Optional[InsightTransactionSchema]
    summary_message: str
