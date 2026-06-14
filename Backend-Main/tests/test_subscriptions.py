"""
Pytest test suite for subscription system
Run with: pytest tests/test_subscriptions.py -v
"""
import pytest
from datetime import datetime, timedelta, timezone
from decimal import Decimal

from app.models.user import User
from app.models.subscription import Subscription, SubscriptionStatusEnum
from app.models.subscription_plan import SubscriptionPlan, BillingCycleEnum
from app.models.promo_code import PromoCode, DiscountTypeEnum
from app.services.subscription_service import subscription_service


@pytest.fixture
async def test_user(db_session):
    """Create a test user"""
    user = User(
        supabase_user_id="test-user-123",
        email="test@example.com",
        name="Test User"
    )
    db_session.add(user)
    await db_session.commit()
    await db_session.refresh(user)
    return user


@pytest.fixture
async def test_plan(db_session):
    """Create a test subscription plan"""
    plan = SubscriptionPlan(
        name="Test Plan",
        billing_cycle=BillingCycleEnum.MONTHLY,
        base_price=Decimal("29.99"),
        currency="usd",
        is_active=True
    )
    db_session.add(plan)
    await db_session.commit()
    await db_session.refresh(plan)
    return plan


class TestSubscriptionService:
    """Tests for subscription service"""
    
    @pytest.mark.asyncio
    async def test_create_trial_subscription(self, db_session, test_user):
        """Test creating a trial subscription"""
        subscription = await subscription_service.create_trial_subscription(
            db_session, str(test_user.id)
        )
        
        assert subscription is not None
        assert subscription.user_id == test_user.id
        assert subscription.status == SubscriptionStatusEnum.TRIALING
        assert subscription.trial_start is not None
        assert subscription.trial_end is not None
        
        # Trial should be 14 days by default
        trial_duration = subscription.trial_end - subscription.trial_start
        assert trial_duration.days == 14
    
    @pytest.mark.asyncio
    async def test_get_user_subscription(self, db_session, test_user):
        """Test retrieving user subscription"""
        # Create subscription
        created = await subscription_service.create_trial_subscription(
            db_session, str(test_user.id)
        )
        
        # Retrieve it
        retrieved = await subscription_service.get_user_subscription(
            db_session, str(test_user.id)
        )
        
        assert retrieved is not None
        assert retrieved.id == created.id
        assert retrieved.user_id == test_user.id
    
    @pytest.mark.asyncio
    async def test_check_subscription_access_trialing(self, db_session, test_user):
        """Test access check for trialing user"""
        await subscription_service.create_trial_subscription(
            db_session, str(test_user.id)
        )
        
        has_access, reason = await subscription_service.check_subscription_access(
            db_session, str(test_user.id)
        )
        
        assert has_access is True
        assert reason == "trialing"
    
    @pytest.mark.asyncio
    async def test_check_subscription_access_expired(self, db_session, test_user):
        """Test access check for expired trial"""
        # Create subscription with expired trial
        past_date = datetime.now(timezone.utc) - timedelta(days=20)
        subscription = Subscription(
            user_id=test_user.id,
            status=SubscriptionStatusEnum.TRIALING,
            current_period_start=past_date,
            current_period_end=past_date + timedelta(days=14),
            trial_start=past_date,
            trial_end=past_date + timedelta(days=14)
        )
        db_session.add(subscription)
        await db_session.commit()
        
        has_access, reason = await subscription_service.check_subscription_access(
            db_session, str(test_user.id)
        )
        
        assert has_access is False
        assert "expired" in reason
    
    @pytest.mark.asyncio
    async def test_get_effective_price_no_override(self, db_session, test_user, test_plan):
        """Test effective price without override"""
        effective_price = await subscription_service.get_effective_price(
            db_session, str(test_user.id), str(test_plan.id)
        )
        
        assert effective_price == test_plan.base_price
    
    @pytest.mark.asyncio
    async def test_cancel_subscription(self, db_session, test_user):
        """Test canceling a subscription"""
        subscription = await subscription_service.create_trial_subscription(
            db_session, str(test_user.id)
        )
        
        canceled = await subscription_service.cancel_subscription(
            db_session, str(test_user.id), immediately=True
        )
        
        assert canceled.status == SubscriptionStatusEnum.CANCELED
        assert canceled.canceled_at is not None


class TestPromoCode:
    """Tests for promo code functionality"""
    
    @pytest.mark.asyncio
    async def test_create_promo_code(self, db_session):
        """Test creating a promo code"""
        promo = PromoCode(
            code="TEST20",
            discount_type=DiscountTypeEnum.PERCENTAGE,
            discount_value=Decimal("20"),
            is_active=True,
        )
        db_session.add(promo)
        await db_session.commit()
        await db_session.refresh(promo)
        
        assert promo.code == "TEST20"
        assert promo.discount_type == DiscountTypeEnum.PERCENTAGE
        assert promo.discount_value == Decimal("20")
        assert promo.is_active is True
    
    @pytest.mark.asyncio
    async def test_promo_code_validation(self, db_session, test_user):
        """Test promo code validation"""
        promo = PromoCode(
            code="VALID20",
            discount_type=DiscountTypeEnum.PERCENTAGE,
            discount_value=Decimal("20"),
            is_active=True,
        )
        db_session.add(promo)
        await db_session.commit()
        await db_session.refresh(promo)
        
        # Validate it
        validated = await subscription_service.apply_promo_code(
            db_session, str(test_user.id), "VALID20"
        )
        
        assert validated.code == "VALID20"
        assert validated.is_valid() is True
    
    @pytest.mark.asyncio
    async def test_invalid_promo_code(self, db_session, test_user):
        """Test invalid promo code"""
        with pytest.raises(ValueError, match="Invalid promo code"):
            await subscription_service.apply_promo_code(
                db_session, str(test_user.id), "INVALID"
            )


class TestSubscriptionModel:
    """Tests for subscription model methods"""
    
    def test_is_active_trialing(self):
        """Test is_active for trialing subscription"""
        sub = Subscription(
            user_id="test",
            status=SubscriptionStatusEnum.TRIALING,
            current_period_start=datetime.now(timezone.utc),
            current_period_end=datetime.now(timezone.utc) + timedelta(days=14)
        )
        assert sub.is_active() is True
    
    def test_is_active_canceled(self):
        """Test is_active for canceled subscription"""
        sub = Subscription(
            user_id="test",
            status=SubscriptionStatusEnum.CANCELED,
            current_period_start=datetime.now(timezone.utc),
            current_period_end=datetime.now(timezone.utc)
        )
        assert sub.is_active() is False
    
    def test_is_active_lifetime(self):
        """Test is_active for lifetime subscription"""
        sub = Subscription(
            user_id="test",
            status=SubscriptionStatusEnum.LIFETIME,
            current_period_start=datetime.now(timezone.utc),
            current_period_end=datetime.now(timezone.utc) + timedelta(days=365)
        )
        assert sub.is_active() is True
