"""
Plaid Link endpoints
"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
import structlog

from app.core.auth import get_current_user as get_authenticated_user
from app.core.database import get_db
from app.models.user import User
from app.services.providers.plaid import PlaidAdapter

logger = structlog.get_logger()

router = APIRouter()


@router.post("/link-token")
async def create_link_token(
    current_user: dict = Depends(get_authenticated_user),
    db: AsyncSession = Depends(get_db),
):
    """Create Plaid Link token for the current user"""
    user_id = current_user["user_id"]

    stmt = select(User).where(User.supabase_user_id == user_id)
    result = await db.execute(stmt)
    user = result.scalar_one_or_none()

    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    adapter = PlaidAdapter()
    try:
        link_token = await adapter.create_link_token(str(user.id))
        return {"success": True, "link_token": link_token}
    except Exception as e:
        logger.error("Failed to create Plaid link token", error=str(e), user_id=str(user.id))
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Failed to create link token",
        )
