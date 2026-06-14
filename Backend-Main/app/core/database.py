"""
Database connection and session management
"""
from uuid import uuid4

from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.orm import declarative_base
from sqlalchemy.pool import NullPool
from app.core.config import settings
from app.core.logging import get_logger

logger = get_logger()

# Create async engine.
# Supabase pooler (PgBouncer) is sensitive to prepared statements across reused
# asyncpg connections, so prefer a NullPool and disable statement caching.
engine = create_async_engine(
    settings.DATABASE_URL.replace("postgresql://", "postgresql+asyncpg://"),
    echo=settings.ENVIRONMENT == "development",
    future=True,
    pool_pre_ping=True,
    poolclass=NullPool,
    connect_args={
        "statement_cache_size": 0,
        "prepared_statement_cache_size": 0,
        "prepared_statement_name_func": lambda: f"__asyncpg_{uuid4()}__",
        "ssl": "require",
    },
    execution_options={
        "postgresql_prepared_statements": False
    },
)


# Create async session factory
AsyncSessionLocal = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autocommit=False,
    autoflush=False,
)

# Base class for models
Base = declarative_base()


async def get_db() -> AsyncSession:
    """Dependency for getting database session"""
    async with AsyncSessionLocal() as session:
        try:
            yield session
            # Only commit if no exception occurred and session wasn't already committed
            if session.in_transaction():
                await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()


async def init_db():
    """Initialize database (create tables)"""
    # Import all models to ensure they're registered with Base.metadata
    # This must happen before create_all is called
    from app.models.user import User
    from app.models.account import Account
    from app.models.holding import Holding
    from app.models.asset_mapping import AssetMapping
    from app.models.asset_metadata import AssetMetadata
    from app.models.price import Price
    from app.models.provider_token import ProviderToken
    from app.models.transaction import Transaction
    from app.models.security import Security
    from app.models.investment_transaction import InvestmentTransaction
    from app.models.payment_event_log import PaymentEventLog
    from app.models.etf_constituent import EtfConstituent  # noqa: F401
    from app.models.page_view_event import PageViewEvent
    try:
        from app.models.loan_calculation import LoanCalculation
        from app.models.loan_calculation_asset import LoanCalculationAsset
    except ImportError:
        pass
    # Worth It feature tables
    from app.models.worth_it_session import WorthItSession
    from app.models.worth_it_session_transaction import WorthItSessionTransaction
    from app.models.worth_it_rating import WorthItRating
    from app.models.worth_it_streak import WorthItStreak

    async with engine.begin() as conn:
        # Use create_all which handles foreign key dependencies automatically
        await conn.run_sync(Base.metadata.create_all, checkfirst=True)

    # Run idempotent column-level migrations (ADD COLUMN IF NOT EXISTS, etc.)
    from app.core.migrations import run_migrations
    await run_migrations(engine)

    logger.info("Database initialized")


async def close_db():
    """Close database connections"""
    await engine.dispose()
    logger.info("Database connections closed")
