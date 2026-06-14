"""
Portfolio valuation snapshots for historical performance calculations.
"""
import uuid
from sqlalchemy import Column, DateTime, ForeignKey, Numeric
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.sql import func
from app.core.database import Base


class PortfolioValuationSnapshot(Base):
    __tablename__ = "portfolio_valuation_snapshots"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(
        UUID(as_uuid=True),
        ForeignKey("public.users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    total_value = Column(Numeric(20, 8), nullable=False)
    categories = Column(JSONB, nullable=True)
    computed_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
        index=True,
    )

    __table_args__ = ({"schema": "public"},)
