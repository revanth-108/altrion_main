import uuid

from sqlalchemy import Column, Date, DateTime, ForeignKey, Index, Integer, Numeric, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func

from app.core.database import Base


class WorthItSessionTransaction(Base):
    """
    Immutable snapshot of a transaction shown in a Worth It session.

    Snapshotted at session-creation time so ratings are never broken by
    Plaid corrections or merchant-name updates after the fact.
    """
    __tablename__ = "worth_it_session_transactions"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    session_id = Column(
        UUID(as_uuid=True),
        ForeignKey("public.worth_it_sessions.id", ondelete="CASCADE"),
        nullable=False,
    )
    user_id = Column(
        UUID(as_uuid=True),
        ForeignKey("public.users.id", ondelete="CASCADE"),
        nullable=False,
    )
    # Plaid transaction_id or mock sentinel (e.g. "wi-1").
    # Ratings reference this ID — must match what the frontend uses as tx.id.
    transaction_ref_id = Column(String(255), nullable=False)
    merchant = Column(String(255), nullable=False)
    description = Column(String(500), nullable=False, default="")
    # Always positive — debit/outflow amount in USD
    amount = Column(Numeric(20, 8), nullable=False)
    # Friendly display category, e.g. "Food & Drink" (mapped from Plaid's ALL_CAPS)
    category = Column(String(100), nullable=False, default="Other")
    # The actual calendar date — formatted to a string in the service layer
    tx_date = Column(Date, nullable=False)
    # First letter of merchant name, upper-cased, used for the logo avatar
    initial = Column(String(4), nullable=False, default="?")
    # Zero-based display order within the session
    position = Column(Integer, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    __table_args__ = (
        UniqueConstraint("session_id", "transaction_ref_id", name="uq_worth_it_session_tx_ref"),
        UniqueConstraint("user_id", "transaction_ref_id", name="uq_worth_it_session_tx_user_ref"),
        Index("idx_worth_it_session_txs_session", "session_id"),
        Index("idx_worth_it_session_txs_user", "user_id"),
        {"schema": "public"},
    )

    def __repr__(self) -> str:
        return f"<WorthItSessionTransaction session={self.session_id} ref={self.transaction_ref_id}>"
