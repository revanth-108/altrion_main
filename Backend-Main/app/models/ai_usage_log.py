"""
AI usage log — tracks Claude API token usage and estimated cost per user per call.
"""
import uuid
from decimal import Decimal

from sqlalchemy import Column, String, Integer, DateTime, Numeric
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func

from app.core.database import Base


class AiUsageLog(Base):
    __tablename__ = "ai_usage_logs"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    # Supabase auth UUID — denormalised to avoid a JOIN on every insert
    supabase_user_id = Column(String(255), nullable=False, index=True)
    # Which feature triggered the call: research_lab | explain | portfolio_xray
    feature = Column(String(100), nullable=False)
    model = Column(String(255), nullable=False)
    input_tokens = Column(Integer, nullable=False, default=0)
    output_tokens = Column(Integer, nullable=False, default=0)
    # Prompt-caching token buckets (0 when caching not used)
    cache_write_tokens = Column(Integer, nullable=False, default=0)
    cache_read_tokens = Column(Integer, nullable=False, default=0)
    cost_usd = Column(Numeric(12, 8), nullable=False, default=Decimal("0"))
    created_at = Column(
        DateTime(timezone=True), server_default=func.now(), nullable=False, index=True
    )

    __table_args__ = ({"schema": "public"},)
