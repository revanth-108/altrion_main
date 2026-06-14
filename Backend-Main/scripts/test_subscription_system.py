"""
Manual test script to verify subscription system functionality
Run this to test the subscription system without the frontend
"""
import asyncio
import sys
import os
from datetime import datetime, timezone

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
from sqlalchemy import select

from app.core.config import settings
from app.models.user import User
from app.models.promo_code import PromoCode, DiscountTypeEnum
from app.services.subscription_service import subscription_service
import structlog

logger = structlog.get_logger()


async def test_subscription_system():
    """Test all major subscription functionality"""
    
    print("=" * 80)
    print("SUBSCRIPTION SYSTEM TEST SUITE")
    print("=" * 80)
    print()
    
    # Create async engine
    engine = create_async_engine(settings.DATABASE_URL, echo=False)
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    
    async with async_session() as db:
        # Test 1: Check subscription plans exist
        print("✓ TEST 1: Checking subscription plans...")
        plans = await subscription_service.get_all_plans(db)
        print(f"  Found {len(plans)} subscription plan(s)")
        for plan in plans:
            print(f"    - {plan.name}: ${plan.base_price} ({plan.billing_cycle.value})")
        print()
        
        # Test 2: Find a test user
        print("✓ TEST 2: Finding test user...")
        query = select(User).limit(1)
        result = await db.execute(query)
        test_user = result.scalar_one_or_none()
        
        if not test_user:
            print("  ❌ No users found. Please create a user first.")
            return
        
        print(f"  Using user: {test_user.email} (ID: {test_user.id})")
        print()
        
        # Test 3: Check user's subscription
        print("✓ TEST 3: Checking user subscription...")
        subscription = await subscription_service.get_user_subscription(db, str(test_user.id))
        
        if subscription:
            print(f"  Status: {subscription.status.value}")
            print(f"  Trial start: {subscription.trial_start}")
            print(f"  Trial end: {subscription.trial_end}")
            print(f"  Current period end: {subscription.current_period_end}")
            print(f"  Is active: {subscription.is_active()}")
        else:
            print("  No subscription found - creating trial...")
            subscription = await subscription_service.create_trial_subscription(
                db, str(test_user.id)
            )
            print(f"  ✓ Trial created! Status: {subscription.status.value}")
        print()
        
        # Test 4: Check subscription access
        print("✓ TEST 4: Checking subscription access...")
        has_access, reason = await subscription_service.check_subscription_access(
            db, str(test_user.id)
        )
        print(f"  Has access: {has_access}")
        print(f"  Reason: {reason}")
        print()
        
        # Test 5: Test effective pricing (with no overrides)
        print("✓ TEST 5: Testing effective pricing...")
        if plans:
            plan = plans[0]
            effective_price = await subscription_service.get_effective_price(
                db, str(test_user.id), str(plan.id)
            )
            print(f"  Base price: ${plan.base_price}")
            print(f"  Effective price: ${effective_price}")
        print()
        
        # Test 6: Create and validate a promo code
        print("✓ TEST 6: Creating and validating promo code...")
        promo = PromoCode(
            code="TEST20",
            discount_type=DiscountTypeEnum.PERCENTAGE,
            discount_value=20,
            is_active=True,
        )
        db.add(promo)
        await db.commit()
        await db.refresh(promo)

        validated = await subscription_service.apply_promo_code(
            db, str(test_user.id), "TEST20"
        )
        print(f"  Promo code validated: {validated.code}")
        print()

        print("=" * 80)
        print("USER SUBSCRIPTION TESTS COMPLETED SUCCESSFULLY! ✓")
        print("=" * 80)
    
    await engine.dispose()


if __name__ == "__main__":
    print("\nStarting subscription system tests...\n")
    asyncio.run(test_subscription_system())
    print("\nTest run complete!")
