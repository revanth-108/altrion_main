import enum
import uuid

from sqlalchemy import Column, Date, DateTime, Enum as SQLEnum, ForeignKey, Index, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func

from app.core.database import Base


class WorthItSessionStatus(str, enum.Enum):
    ACTIVE = "active"
    COMPLETED = "completed"
    SKIPPED = "skipped"


class WorthItSession(Base):
    __tablename__ = "worth_it_sessions"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(
        UUID(as_uuid=True),
        ForeignKey("public.users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    # Always the Monday (ISO week start) — canonical week key
    week_start = Column(Date, nullable=False)
    # Pre-computed display label, e.g. "MAY 12–18"
    week_label = Column(String(30), nullable=False)
    status = Column(
        SQLEnum(WorthItSessionStatus, name="worth_it_session_status"),
        nullable=False,
        default=WorthItSessionStatus.ACTIVE,
    )
    completed_at = Column(DateTime(timezone=True), nullable=True)
    skipped_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    __table_args__ = (
        Index("idx_worth_it_sessions_user_id", "user_id"),
        {"schema": "public"},
    )

    def __repr__(self) -> str:
        return f"<WorthItSession user={self.user_id} week={self.week_start} status={self.status}>"
