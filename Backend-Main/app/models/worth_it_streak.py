import uuid

from sqlalchemy import Column, Date, DateTime, ForeignKey, Integer
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func

from app.core.database import Base


class WorthItStreak(Base):
    """
    Materialized streak counter — one row per user, upserted on session completion.

    Storing this separately avoids a costly window-function query over all sessions
    every time GET /worth-it/streak is called.

    Streak rules:
      - Session completed: increment if last_completed_week was exactly 7 days ago,
        otherwise reset to 1.
      - Session skipped: no change (streak neither grows nor resets).
    """
    __tablename__ = "worth_it_streaks"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(
        UUID(as_uuid=True),
        ForeignKey("public.users.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
    )
    current_streak = Column(Integer, nullable=False, default=0, server_default="0")
    longest_streak = Column(Integer, nullable=False, default=0, server_default="0")
    # week_start (Monday) of the most recently completed session
    last_completed_week = Column(Date, nullable=True)
    total_sessions_completed = Column(Integer, nullable=False, default=0, server_default="0")
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    __table_args__ = (
        {"schema": "public"},
    )

    def __repr__(self) -> str:
        return f"<WorthItStreak user={self.user_id} streak={self.current_streak}>"
