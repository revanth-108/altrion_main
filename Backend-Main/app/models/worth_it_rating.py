import enum
import uuid

from sqlalchemy import Column, DateTime, Enum as SQLEnum, ForeignKey, Index, Numeric, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func

from app.core.database import Base


class WorthItRatingValue(str, enum.Enum):
    KEEP = "keep"
    CUT = "cut"
    SKIP = "skip"


class WorthItRating(Base):
    """
    One row per (session, transaction) — upserted on re-rate.

    merchant / category / amount are denormalized from the session snapshot
    so preference and insight queries never need to join back to the snapshot.
    """
    __tablename__ = "worth_it_ratings"

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
    # Must match worth_it_session_transactions.transaction_ref_id for this session
    transaction_ref_id = Column(String(255), nullable=False)
    rating = Column(
        SQLEnum(WorthItRatingValue, name="worth_it_rating_value"),
        nullable=False,
    )
    # Denormalized from snapshot — avoids joins in preference/insight queries
    merchant = Column(String(255), nullable=True)
    category = Column(String(100), nullable=True)
    amount = Column(Numeric(20, 8), nullable=True)
    # Wall-clock time the user actually swiped/clicked
    rated_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    __table_args__ = (
        # Enforces one rating per transaction per session; enables clean upsert
        UniqueConstraint("session_id", "transaction_ref_id", name="uq_worth_it_rating_session_tx"),
        # Canonical review-once guard across all rolling sessions for this user
        UniqueConstraint("user_id", "transaction_ref_id", name="uq_worth_it_rating_user_tx"),
        Index("idx_worth_it_ratings_user_rating", "user_id", "rating"),
        Index("idx_worth_it_ratings_user_merchant", "user_id", "merchant"),
        Index("idx_worth_it_ratings_session", "session_id"),
        {"schema": "public"},
    )

    def __repr__(self) -> str:
        return f"<WorthItRating session={self.session_id} tx={self.transaction_ref_id} rating={self.rating}>"
