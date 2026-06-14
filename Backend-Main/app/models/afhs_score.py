"""
AfhsScore model — maps to the afhs_scores table created by add_afhs_scores_table.sql
"""
import uuid
from sqlalchemy import Column, ForeignKey, Index, SmallInteger, Numeric, String, DateTime, func
from sqlalchemy.dialects.postgresql import UUID, JSONB
from app.core.database import Base


class AfhsScore(Base):
    __tablename__ = "afhs_scores"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("public.users.id", ondelete="CASCADE"), nullable=False, index=True)

    # Composite
    overall_score = Column(SmallInteger, nullable=False)
    completeness_pct = Column(SmallInteger, nullable=False, default=50)
    life_stage = Column(String(20), nullable=False)
    solvency_tier = Column(String(20), nullable=False, default="solvent")

    # Dimension scores
    d1_liquidity = Column(Numeric(5, 2), nullable=True)
    d2_investment = Column(Numeric(5, 2), nullable=True)
    d3_retirement = Column(Numeric(5, 2), nullable=True)
    d4_crypto = Column(Numeric(5, 2), nullable=True)
    d5_defi = Column(Numeric(5, 2), nullable=True)
    d6_debt = Column(Numeric(5, 2), nullable=True)
    d7_velocity = Column(Numeric(5, 2), nullable=True)

    # Confidence factors (0.0 – 1.0)
    d1_confidence = Column(Numeric(3, 2), nullable=True)
    d2_confidence = Column(Numeric(3, 2), nullable=True)
    d3_confidence = Column(Numeric(3, 2), nullable=True)
    d4_confidence = Column(Numeric(3, 2), nullable=True)
    d5_confidence = Column(Numeric(3, 2), nullable=True)
    d6_confidence = Column(Numeric(3, 2), nullable=True)
    d7_confidence = Column(Numeric(3, 2), nullable=True)

    # Full breakdown for audit / debug
    breakdown = Column(JSONB, nullable=True)

    computed_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    __table_args__ = (
        Index("idx_afhs_scores_user_computed_at", "user_id", "computed_at"),
        {"schema": "public"},
    )
