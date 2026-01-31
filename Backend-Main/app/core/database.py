"""
Database connection and session management
"""
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.orm import declarative_base
from app.core.config import settings
import structlog

logger = structlog.get_logger()

# Create async engine
# Configure for pgbouncer compatibility by disabling prepared statements
from sqlalchemy.pool import NullPool

engine = create_async_engine(
    settings.DATABASE_URL.replace("postgresql://", "postgresql+asyncpg://"),
    echo=settings.ENVIRONMENT == "development",
    future=True,
    poolclass=NullPool,
    connect_args={
        "statement_cache_size": 0,
        "prepared_statement_cache_size": 0,
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
    from app.models.price import Price
    from app.models.provider_token import ProviderToken
    
    async with engine.begin() as conn:
        # Use create_all which handles foreign key dependencies automatically
        await conn.run_sync(Base.metadata.create_all, checkfirst=True)
    logger.info("Database initialized")


async def close_db():
    """Close database connections"""
    await engine.dispose()
    logger.info("Database connections closed")
