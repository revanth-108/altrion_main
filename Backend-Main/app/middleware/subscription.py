"""
Subscription middleware for protecting routes
"""
from fastapi import Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.auth import get_current_user
from app.services.subscription_service import subscription_service
from app.core.logging import get_logger

logger = get_logger()


async def require_active_subscription(
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user)
):
    """
    Dependency to require an active subscription
    
    Raises:
        HTTPException: 402 Payment Required if subscription is not active
    """
    has_access, reason = await subscription_service.check_subscription_access(db, user["user_id"])
    
    if not has_access:
        logger.warning("subscription_access_denied",
                      user_id=user["user_id"],
                      reason=reason)
        
        error_messages = {
            "no_subscription": "No subscription found. Please subscribe to continue.",
            "trial_expired": "Your trial period has ended. Please subscribe to continue.",
            "expired": "Your subscription has expired. Please renew to continue.",
        }
        
        message = error_messages.get(reason, f"Subscription required: {reason}")
        
        raise HTTPException(
            status_code=status.HTTP_402_PAYMENT_REQUIRED,
            detail={
                "message": message,
                "reason": reason,
                "requires_payment": True
            }
        )
    
    logger.debug("subscription_access_granted",
                user_id=user["user_id"],
                reason=reason)
    
    return user


