"""
Budget schemas — Pydantic models for the /budget endpoints.

Follow the same style as schemas/portfolio.py:
  - BaseModel with typed fields
  - Optional fields default to None
  - Decimal amounts with json_encoders to preserve precision as strings
"""
from pydantic import BaseModel
from typing import List, Optional
from decimal import Decimal


# ---------------------------------------------------------------------------
# Income sources — mapped from recurring_streams where stream_type == 'inflow'
# ---------------------------------------------------------------------------

class IncomeSourceSchema(BaseModel):
    """One recurring income stream (paycheck, freelance deposit, etc.)"""
    # Frontend canvas node ID — convention: "income-<stream_id>"
    id: str
    # Human-readable label from description or merchant_name
    label: str
    # Average occurrence amount (absolute value — always positive in UI)
    amount: Decimal
    # Plaid frequency string e.g. MONTHLY, BIWEEKLY
    frequency: Optional[str] = None
    # Plaid's stable stream_id — used to link back to the DB row
    stream_id: str


# ---------------------------------------------------------------------------
# Bank accounts — mapped from accounts where account_type == 'depository'
# ---------------------------------------------------------------------------

class BankAccountSchema(BaseModel):
    """One depository account (checking or savings)"""
    # Frontend canvas node ID — convention: "bank-<account.id>"
    id: str
    # Account name from the provider (e.g. "Chase Checking ••4567")
    label: str
    # Institution name for grouping/logo display
    institution: Optional[str] = None
    # Current posted balance — 0 if not yet synced
    balance: Decimal
    # 'checking' or 'savings'
    subtype: Optional[str] = None


# ---------------------------------------------------------------------------
# Outflow categories — mapped from recurring_streams where stream_type == 'outflow'
# ---------------------------------------------------------------------------

class OutflowCategorySchema(BaseModel):
    """One recurring outflow (bill, subscription, rent, etc.)"""
    # Frontend canvas node ID — convention: "outflow-<stream_id>"
    id: str
    # Human-readable label from description or merchant_name
    label: str
    # Average occurrence amount (absolute value — always positive in UI)
    due: Decimal
    frequency: Optional[str] = None
    stream_id: str


# ---------------------------------------------------------------------------
# Allocations — rows from budget_allocations
# ---------------------------------------------------------------------------

class AllocationSchema(BaseModel):
    """A saved allocation edge between two budget canvas nodes"""
    id: int
    source_id: str
    target_id: str
    allocation_type: str
    amount: Decimal
    note: Optional[str] = None
    due_date: Optional[str] = None


class AllocationCreateSchema(BaseModel):
    """Request body for POST /budget/allocations"""
    source_id: str
    target_id: str
    allocation_type: str
    amount: Decimal
    note: Optional[str] = None
    due_date: Optional[str] = None


# ---------------------------------------------------------------------------
# Top-level budget response
# ---------------------------------------------------------------------------

class BudgetResponse(BaseModel):
    """Full budget canvas data — returned by GET /budget"""
    income_sources: List[IncomeSourceSchema]
    bank_accounts: List[BankAccountSchema]
    outflow_categories: List[OutflowCategorySchema]
    allocations: List[AllocationSchema]

    class Config:
        # Serialize Decimal as string to preserve precision (same as portfolio.py)
        json_encoders = {
            Decimal: str,
        }
