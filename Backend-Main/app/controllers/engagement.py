"""User engagement tracking endpoints."""
from datetime import datetime, timezone
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import get_current_user
from app.core.database import get_db
from app.core.logging import get_logger
from app.models.page_view_event import PageViewEvent
from app.models.user import User

logger = get_logger()

router = APIRouter(prefix="/engagement", tags=["engagement"])


class PageViewEventCreate(BaseModel):
    path: str = Field(..., max_length=500)
    title: Optional[str] = Field(None, max_length=255)
    duration_ms: int = Field(..., ge=0, le=3_600_000)
    referrer: Optional[str] = Field(None, max_length=500)
    started_at: Optional[datetime] = None
    metadata: dict = {}


@router.post("/page-view")
async def record_page_view(
    data: PageViewEventCreate,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """Record authenticated route dwell time."""
    result = await db.execute(select(User).where(User.supabase_user_id == user["user_id"]))
    db_user = result.scalar_one_or_none()
    if not db_user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    event = PageViewEvent(
        user_id=db_user.id,
        path=data.path,
        title=data.title,
        duration_ms=data.duration_ms,
        referrer=data.referrer,
        metadata_json={
            **(data.metadata or {}),
            "started_at": data.started_at.isoformat() if data.started_at else None,
            "recorded_at": datetime.now(timezone.utc).isoformat(),
        },
    )
    db.add(event)
    await db.commit()

    logger.info("page_view_recorded", user_id=str(db_user.id), path=data.path, duration_ms=data.duration_ms)
    return {"success": True}
