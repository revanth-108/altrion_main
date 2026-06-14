"""
RecurringStream model — maps to public.recurring_streams table.
Populated by the Plaid /transactions/recurring/get endpoint via the plaid controller.
Do NOT alter the table definition here; the schema is owned by add_recurring_streams_table.sql.
"""
from sqlalchemy import Column, Index, String, DateTime, ForeignKey, Boolean, Numeric, Date
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func
from app.core.database import Base
import uuid


class RecurringStream(Base):
    """
    One row per Plaid recurring transaction stream per user.

    stream_type is either 'inflow' (income) or 'outflow' (expense/bill).
    The budget controller uses this table to populate income_sources and
    outflow_categories in the BudgetResponse.
    """
    __tablename__ = "recurring_streams"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)

    # User who owns this stream — cascade-delete so orphan rows are cleaned up
    user_id = Column(
        UUID(as_uuid=True),
        ForeignKey("public.users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    # Account this stream belongs to — SET NULL if the account row is deleted
    account_id = Column(
        UUID(as_uuid=True),
        ForeignKey("public.accounts.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    # Plaid account_id string — used as the join key when syncing before
    # our internal account_id is resolved
    provider_account_id = Column(String(255), nullable=True)

    # Plaid's stable stream identifier — used as the upsert key with user_id
    stream_id = Column(String(255), nullable=False)

    # 'inflow' or 'outflow' — drives which bucket this stream lands in
    stream_type = Column(String(10), nullable=False, index=True)

    # Human-readable description e.g. 'Netflix', 'Direct Deposit'
    description = Column(String, nullable=True)

    # Cleaned merchant name e.g. 'Spotify'
    merchant_name = Column(String(255), nullable=True)

    # WEEKLY, BIWEEKLY, SEMI_MONTHLY, MONTHLY, UNKNOWN
    frequency = Column(String(30), nullable=True)

    # Average dollar amount per occurrence (negative = inflow/income in Plaid's convention)
    average_amount = Column(Numeric(20, 8), nullable=True)

    # Most recent occurrence amount
    last_amount = Column(Numeric(20, 8), nullable=True)

    # Earliest and most recent known occurrence dates
    first_date = Column(Date, nullable=True)
    last_date = Column(Date, nullable=True)

    # Plaid's predicted next occurrence date — useful for due-date display
    predicted_next_date = Column(Date, nullable=True)

    # MATURE | EARLY_DETECTION | TOMBSTONED
    status = Column(String(30), nullable=True)

    # Soft-delete: tombstoned or manually disabled streams set this to False
    is_active = Column(Boolean, default=True, nullable=False)

    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    __table_args__ = (
        # Hot path: budget canvas fetches active streams by user (budget controller line 76)
        Index("idx_recurring_streams_user_active", "user_id", "is_active"),
        # Contract: status='TOMBSTONED' must always have is_active=False.
        # Enforced at the app layer in plaid sync; status is Plaid's classification,
        # is_active is the authoritative control flag for filtering.
        {"schema": "public"},
    )
