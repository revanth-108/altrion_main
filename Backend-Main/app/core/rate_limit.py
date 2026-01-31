"""
Rate limiting middleware
"""
from fastapi import Request, HTTPException, status
from datetime import datetime, timedelta
from typing import Dict
import structlog

from app.core.redis_client import get_redis

logger = structlog.get_logger()

# In-memory rate limit store (for simplicity - Redis would be better for production)
_rate_limit_store: Dict[str, datetime] = {}


async def check_rate_limit(user_id: str, action: str, limit_minutes: int = 5) -> bool:
    """
    Check if user has exceeded rate limit for an action
    
    Args:
        user_id: User UUID
        action: Action name (e.g., 'refresh_portfolio')
        limit_minutes: Rate limit in minutes
        
    Returns:
        True if allowed, False if rate limited
    """
    key = f"{user_id}:{action}"
    
    try:
        redis = await get_redis()
        last_action = await redis.get(key)
        
        if last_action:
            last_action_time = datetime.fromisoformat(last_action)
            if datetime.utcnow() - last_action_time < timedelta(minutes=limit_minutes):
                return False
        
        # Update last action time
        await redis.setex(
            key,
            limit_minutes * 60,
            datetime.utcnow().isoformat(),
        )
        return True
    except Exception as e:
        logger.error("Rate limit check failed", error=str(e), user_id=user_id, action=action)
        # Fail open - allow request if Redis fails
        return True


async def rate_limit_middleware(request: Request, call_next):
    """Rate limiting middleware"""
    # Skip rate limiting for non-API routes
    if not request.url.path.startswith("/api"):
        return await call_next(request)
    
    # Rate limit refresh portfolio endpoint
    if request.url.path == "/api/v1/portfolio/refresh" and request.method == "POST":
        user_id = getattr(request.state, "user_id", None)
        if user_id:
            from app.core.config import settings
            allowed = await check_rate_limit(
                user_id,
                "refresh_portfolio",
                settings.REFRESH_RATE_LIMIT_MINUTES,
            )
            if not allowed:
                raise HTTPException(
                    status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                    detail=f"Rate limit exceeded. Please wait {settings.REFRESH_RATE_LIMIT_MINUTES} minutes between refreshes.",
                )
    
    return await call_next(request)
