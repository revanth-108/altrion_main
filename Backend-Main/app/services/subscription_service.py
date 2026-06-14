"""
Subscription service for user-facing subscription operations
"""
from uuid import UUID
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_, or_
from sqlalchemy.orm import selectinload
from typing import Optional, Tuple
from datetime import datetime, timedelta, timezone
from decimal import Decimal

from app.models.subscription import Subscription, SubscriptionStatusEnum
from app.models.subscription_plan import SubscriptionPlan
from app.models.subscription_override import SubscriptionOverride
from app.models.promo_code import PromoCode
from app.models.subscription_history import SubscriptionHistory
from app.models.user import User
from app.integrations.payment_gateway_client import payment_gateway_client
from app.core.config import settings
from app.core.logging import get_logger

logger = get_logger()


class SubscriptionService:
    """Service for managing user subscriptions"""
    
    @staticmethod
    async def get_user_subscription(
        db: AsyncSession,
        user_id: str
    ) -> Optional[Subscription]:
        """
        Get active subscription for a user
        
        Args:
            db: Database session
            user_id: User ID
            
        Returns:
            Subscription object or None
        """
        resolved_user_id = await SubscriptionService._resolve_user_id(db, user_id)
        if not resolved_user_id:
            return None

        query = select(Subscription).where(
            Subscription.user_id == resolved_user_id
        ).options(selectinload(Subscription.plan))
        
        result = await db.execute(query)
        return result.scalar_one_or_none()
    
    @staticmethod
    async def create_trial_subscription(
        db: AsyncSession,
        user_id: str,
        trial_days: int = None
    ) -> Subscription:
        """
        Create a trial subscription for a new user
        
        Args:
            db: Database session
            user_id: User ID
            trial_days: Number of trial days (default from settings)
            
        Returns:
            Created Subscription object
        """
        if trial_days is None:
            trial_days = settings.DEFAULT_TRIAL_DAYS

        resolved_user_id = await SubscriptionService._resolve_user_id(db, user_id)
        if not resolved_user_id:
            raise ValueError("User not found")
        
        now = datetime.now(timezone.utc)
        trial_end = now + timedelta(days=trial_days)
        
        subscription = Subscription(
            user_id=resolved_user_id,
            status=SubscriptionStatusEnum.TRIALING,
            current_period_start=now,
            current_period_end=trial_end,
            trial_start=now,
            trial_end=trial_end
        )
        
        db.add(subscription)
        await db.commit()
        await db.refresh(subscription)
        
        # Log history
        await SubscriptionService._log_history(
            db,
            subscription.id,
            "created",
            None,
            {
                "status": subscription.status.value,
                "trial_days": trial_days
            }
        )
        
        logger.info("trial_subscription_created", 
                   user_id=user_id,
                   trial_days=trial_days,
                   trial_end=trial_end.isoformat())
        
        return subscription
    
    @staticmethod
    async def check_subscription_access(
        db: AsyncSession,
        user_id: str
    ) -> Tuple[bool, Optional[str]]:
        """
        Check if user has valid subscription access
        
        Args:
            db: Database session
            user_id: User ID
            
        Returns:
            Tuple of (has_access: bool, reason: str)
        """
        subscription = await SubscriptionService.get_user_subscription(db, user_id)
        
        if not subscription:
            return False, "no_subscription"
        
        # Check for waived subscription
        override = await SubscriptionService._get_override(db, user_id)
        if override and override.is_waived:
            return True, "waived"
        
        # Check status
        if subscription.status == SubscriptionStatusEnum.LIFETIME:
            return True, "lifetime"
        
        if subscription.status == SubscriptionStatusEnum.ACTIVE:
            return True, "active"
        
        if subscription.status == SubscriptionStatusEnum.TRIALING:
            now = datetime.now(timezone.utc)
            if subscription.trial_end and now <= subscription.trial_end:
                return True, "trialing"
            else:
                # Trial expired, update status
                await SubscriptionService._update_status(
                    db, subscription, SubscriptionStatusEnum.UNPAID
                )
                return False, "trial_expired"
        
        return False, f"invalid_status_{subscription.status.value}"
    
    @staticmethod
    async def get_effective_price(
        db: AsyncSession,
        user_id: str,
        plan_id: str
    ) -> Decimal:
        """
        Calculate effective price for a user considering overrides and discounts
        
        Args:
            db: Database session
            user_id: User ID
            plan_id: Plan ID
            
        Returns:
            Effective price as Decimal
        """
        # Get base plan price
        plan = await db.get(SubscriptionPlan, plan_id)
        if not plan:
            raise ValueError("Plan not found")
        
        base_price = plan.base_price
        
        # Check for overrides
        override = await SubscriptionService._get_override(db, user_id)
        if not override:
            return base_price
        
        # Waived subscription
        if override.is_waived:
            return Decimal("0.00")
        
        # Custom override price
        if override.override_price is not None:
            return override.override_price
        
        # Apply percentage discount
        if override.discount_percentage:
            discount_amount = base_price * (override.discount_percentage / 100)
            return base_price - discount_amount
        
        # Apply fixed discount
        if override.discount_fixed:
            return max(Decimal("0.00"), base_price - override.discount_fixed)
        
        return base_price
    
    @staticmethod
    async def apply_promo_code(
        db: AsyncSession,
        user_id: str,
        code: str
    ) -> PromoCode:
        """
        Validate and apply a promo code
        
        Args:
            db: Database session
            user_id: User ID
            code: Promo code string
            
        Returns:
            PromoCode object
            
        Raises:
            ValueError: If code is invalid
        """
        query = select(PromoCode).where(
            PromoCode.code == code.upper()
        )
        result = await db.execute(query)
        promo = result.scalar_one_or_none()
        
        if not promo:
            raise ValueError("Invalid promo code")
        
        if not promo.is_valid():
            raise ValueError("Promo code is no longer valid")
        
        logger.info("promo_code_validated", user_id=user_id, code=code)
        return promo
    
    @staticmethod
    async def cancel_subscription(
        db: AsyncSession,
        user_id: str,
        immediately: bool = False,
        reason: Optional[str] = None
    ) -> Subscription:
        """
        Cancel a user's subscription
        
        Args:
            db: Database session
            user_id: User ID
            immediately: Cancel immediately or at period end
            reason: Cancellation reason
            
        Returns:
            Updated Subscription object
        """
        subscription = await SubscriptionService.get_user_subscription(db, user_id)
        if not subscription:
            raise ValueError("No active subscription found")
        
        previous_state = {
            "status": subscription.status.value,
            "cancel_at_period_end": subscription.cancel_at_period_end
        }
        
        gateway_subscription_id = subscription.gateway_subscription_id
        if gateway_subscription_id:
            try:
                payment_gateway_client.cancel_subscription(
                    gateway_subscription_id,
                    immediately=immediately
                )
            except NotImplementedError as exc:
                if payment_gateway_client.gateway != "hosted_payments_page":
                    raise
                logger.warning(
                    "gateway_cancel_not_supported_marking_local",
                    user_id=user_id,
                    subscription_id=str(subscription.id),
                    gateway_subscription_id=gateway_subscription_id,
                    error=str(exc),
                )
        
        now = datetime.now(timezone.utc)
        
        if immediately:
            subscription.status = SubscriptionStatusEnum.CANCELED
            subscription.canceled_at = now
            subscription.current_period_end = now
        else:
            subscription.cancel_at_period_end = True
        
        await db.commit()
        await db.refresh(subscription)
        
        # Log history
        await SubscriptionService._log_history(
            db,
            subscription.id,
            "canceled",
            previous_state,
            {
                "status": subscription.status.value,
                "canceled_at": now.isoformat(),
                "immediately": immediately,
                "reason": reason
            }
        )
        
        logger.info("subscription_canceled",
                   user_id=user_id,
                   immediately=immediately,
                   reason=reason)
        
        return subscription
    
    @staticmethod
    async def reactivate_subscription(
        db: AsyncSession,
        user_id: str
    ) -> Subscription:
        """
        Reactivate a canceled subscription
        
        Args:
            db: Database session
            user_id: User ID
            
        Returns:
            Updated Subscription object
        """
        subscription = await SubscriptionService.get_user_subscription(db, user_id)
        if not subscription:
            raise ValueError("No subscription found")
        
        if not subscription.cancel_at_period_end:
            raise ValueError("Subscription is not scheduled for cancellation")
        
        previous_state = {
            "cancel_at_period_end": subscription.cancel_at_period_end
        }
        
        gateway_subscription_id = subscription.gateway_subscription_id
        if gateway_subscription_id:
            payment_gateway_client.reactivate_subscription(gateway_subscription_id)
        
        subscription.cancel_at_period_end = False
        
        await db.commit()
        await db.refresh(subscription)
        
        # Log history
        await SubscriptionService._log_history(
            db,
            subscription.id,
            "reactivated",
            previous_state,
            {"cancel_at_period_end": False}
        )
        
        logger.info("subscription_reactivated", user_id=user_id)
        
        return subscription
    
    @staticmethod
    async def get_all_plans(
        db: AsyncSession,
        active_only: bool = True
    ) -> list[SubscriptionPlan]:
        """Get all subscription plans"""
        query = select(SubscriptionPlan)
        if active_only:
            query = query.where(SubscriptionPlan.is_active == True)
        
        result = await db.execute(query)
        return list(result.scalars().all())
    
    # Private helper methods
    
    @staticmethod
    async def _get_override(
        db: AsyncSession,
        user_id: str
    ) -> Optional[SubscriptionOverride]:
        """Get subscription override for user"""
        query = select(SubscriptionOverride).where(
            SubscriptionOverride.user_id == await SubscriptionService._resolve_user_id(db, user_id)
        )
        result = await db.execute(query)
        return result.scalar_one_or_none()

    @staticmethod
    async def _resolve_user_id(
        db: AsyncSession,
        user_id: str,
    ):
        """Resolve either a Supabase auth ID or internal user UUID to the internal UUID."""
        query_conditions = [User.supabase_user_id == user_id]
        try:
            query_conditions.append(User.id == UUID(str(user_id)))
        except (TypeError, ValueError):
            pass

        result = await db.execute(
            select(User.id).where(or_(*query_conditions))
        )
        return result.scalar_one_or_none()
    
    @staticmethod
    async def _update_status(
        db: AsyncSession,
        subscription: Subscription,
        new_status: SubscriptionStatusEnum
    ):
        """Update subscription status"""
        old_status = subscription.status
        subscription.status = new_status
        await db.commit()
        
        await SubscriptionService._log_history(
            db,
            subscription.id,
            "status_changed",
            {"status": old_status.value},
            {"status": new_status.value}
        )
    
    @staticmethod
    async def _log_history(
        db: AsyncSession,
        subscription_id: str,
        action: str,
        previous_state: Optional[dict],
        new_state: dict,
        performed_by: Optional[str] = None
    ):
        """Log subscription history"""
        history = SubscriptionHistory(
            subscription_id=subscription_id,
            action=action,
            previous_state=previous_state,
            new_state=new_state,
            performed_by=performed_by
        )
        db.add(history)
        await db.commit()


subscription_service = SubscriptionService()
