"""
Migration script to create trial subscriptions for existing users
Run this once after deploying the subscription system
"""
import asyncio
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
from sqlalchemy import select
from datetime import datetime, timedelta, timezone
import sys
import os

# Add parent directory to path
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.core.config import settings
from app.models.user import User
from app.models.subscription import Subscription, SubscriptionStatusEnum
import structlog

logger = structlog.get_logger()


async def migrate_existing_users():
    """Create trial subscriptions for all existing users without subscriptions"""
    
    # Create async engine
    engine = create_async_engine(settings.DATABASE_URL, echo=True)
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    
    async with async_session() as session:
        # Get all users
        query = select(User)
        result = await session.execute(query)
        users = list(result.scalars().all())
        
        logger.info("found_users", count=len(users))
        
        migrated = 0
        skipped = 0
        
        for user in users:
            # Check if user already has a subscription
            sub_query = select(Subscription).where(Subscription.user_id == user.id)
            sub_result = await session.execute(sub_query)
            existing_sub = sub_result.scalar_one_or_none()
            
            if existing_sub:
                logger.info("user_already_has_subscription", user_id=str(user.id), email=user.email)
                skipped += 1
                continue
            
            # Calculate trial period based on when user was created
            user_created = user.created_at
            trial_days = settings.DEFAULT_TRIAL_DAYS
            trial_end = user_created + timedelta(days=trial_days)
            now = datetime.now(timezone.utc)
            
            # Determine status based on current date
            if now < trial_end:
                status = SubscriptionStatusEnum.TRIALING
            else:
                # Trial has expired
                status = SubscriptionStatusEnum.UNPAID
            
            # Create trial subscription
            subscription = Subscription(
                user_id=user.id,
                status=status,
                current_period_start=user_created,
                current_period_end=trial_end,
                trial_start=user_created,
                trial_end=trial_end
            )
            
            session.add(subscription)
            migrated += 1
            
            logger.info("created_trial_subscription",
                       user_id=str(user.id),
                       email=user.email,
                       status=status.value,
                       trial_end=trial_end.isoformat())
        
        # Commit all changes
        await session.commit()
        
        logger.info("migration_complete",
                   total_users=len(users),
                   migrated=migrated,
                   skipped=skipped)
        
        print(f"\nMigration Summary:")
        print(f"Total users: {len(users)}")
        print(f"Subscriptions created: {migrated}")
        print(f"Users skipped (already have subscription): {skipped}")
    
    await engine.dispose()


if __name__ == "__main__":
    print("Starting subscription migration for existing users...")
    print("This will create trial subscriptions for all users without subscriptions.")
    print("")
    
    # Confirm before running
    confirm = input("Do you want to proceed? (yes/no): ")
    if confirm.lower() != "yes":
        print("Migration cancelled.")
        sys.exit(0)
    
    asyncio.run(migrate_existing_users())
    print("\nMigration complete!")
