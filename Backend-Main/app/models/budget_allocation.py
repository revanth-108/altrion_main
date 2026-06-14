"""
BudgetAllocation model — stores user-defined flow allocations for the budget canvas.

This is a new application table (not from Plaid). It records how a user wants
to allocate money from one node (source_id) to another (target_id) on the
budget canvas — e.g. "route $2,000 of my Direct Deposit to my Checking account".

Schema is created by migrations/add_budget_allocations_table.sql.
"""
from sqlalchemy import Column, String, DateTime, ForeignKey, Boolean, Numeric, Integer, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func
from app.core.database import Base
import uuid


class BudgetAllocation(Base):
    """
    One row per (user, source_id, target_id) allocation edge on the budget canvas.

    source_id and target_id are frontend node identifiers, not DB foreign keys.
    They follow a naming convention:
        income-<stream_id>      — a recurring inflow stream
        bank-<account.id>       — a depository account
        outflow-<stream_id>     — a recurring outflow stream
    """
    __tablename__ = "budget_allocations"

    id = Column(Integer, primary_key=True, autoincrement=True)

    # User who owns this allocation edge
    user_id = Column(
        UUID(as_uuid=True),
        ForeignKey("public.users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    # Frontend node ID of the money source (e.g. "income-abc123", "bank-<uuid>")
    source_id = Column(String(255), nullable=False)

    # Frontend node ID of the money target (e.g. "bank-<uuid>", "outflow-xyz789")
    target_id = Column(String(255), nullable=False)

    # Semantic type of the allocation edge — used by the frontend to style arrows:
    #   'income-bank'   — recurring inflow → checking/savings account
    #   'bank-outflow'  — checking/savings → recurring expense
    #   'bank-bank'     — transfer between accounts (e.g. checking → savings)
    allocation_type = Column(String(50), nullable=False)

    # Dollar amount of the allocation (e.g. 2000.00)
    amount = Column(Numeric(12, 2), nullable=False)

    # Optional user note (e.g. "rent money")
    note = Column(Text, nullable=True)

    # Optional plain-text due date (e.g. "15th", "end of month")
    # Stored as a string because due dates are often informal
    due_date = Column(String(50), nullable=True)

    # Soft-delete: allows removing without destroying history
    is_active = Column(Boolean, default=True, nullable=False)

    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    __table_args__ = (
        # Upsert guard: enforce at most one allocation per (user, source→target) edge.
        # The POST /budget/allocations handler relies on this constraint to detect
        # existing rows and update them rather than insert duplicates.
        __import__('sqlalchemy').UniqueConstraint(
            "user_id", "source_id", "target_id",
            name="uq_budget_allocations_user_source_target"
        ),
        {"schema": "public"},
    )
