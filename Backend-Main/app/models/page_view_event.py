"""Page engagement event model."""
from sqlalchemy import Column, String, DateTime, Integer, ForeignKey
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.sql import func
from app.core.database import Base
import uuid


class PageViewEvent(Base):
    """Tracks authenticated user dwell time by route."""

    __tablename__ = "page_view_events"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("public.users.id", ondelete="CASCADE"), nullable=False, index=True)
    path = Column(String(500), nullable=False, index=True)
    title = Column(String(255))
    duration_ms = Column(Integer, nullable=False, default=0)
    referrer = Column(String(500))
    metadata_json = Column(JSONB, default={})
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False, index=True)

    __table_args__ = ({"schema": "public"},)
