"""
Pytest configuration and fixtures for subscription tests
"""
import pytest
import pytest_asyncio
import asyncio
from typing import AsyncGenerator
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import NullPool

from app.core.config import settings
from app.core.database import Base


@pytest.fixture(scope="session")
def event_loop():
    """Create an instance of the default event loop for the test session."""
    loop = asyncio.get_event_loop_policy().new_event_loop()
    yield loop
    loop.close()


@pytest_asyncio.fixture(scope="session")
async def engine():
    """Create async engine for tests"""
    # Match app/core/database.py: asyncpg driver, not psycopg2
    database_url = settings.DATABASE_URL.replace("postgresql://", "postgresql+asyncpg://")
    database_url = database_url.replace("postgres://", "postgresql+asyncpg://")

    engine = create_async_engine(
        database_url,
        echo=False,
        poolclass=NullPool,  # Disable connection pooling for tests
        connect_args={
            "statement_cache_size": 0,
            "prepared_statement_cache_size": 0,
            "ssl": "require",
        },
        execution_options={
            "postgresql_prepared_statements": False,
        },
    )
    
    yield engine
    
    await engine.dispose()


@pytest_asyncio.fixture
async def db_session(engine) -> AsyncGenerator[AsyncSession, None]:
    """Create a new database session for each test"""
    async_session = sessionmaker(
        engine,
        class_=AsyncSession,
        expire_on_commit=False,
    )
    
    async with async_session() as session:
        async with session.begin():
            yield session
            # Rollback after each test
            await session.rollback()


@pytest_asyncio.fixture
async def pricing_session(engine) -> AsyncGenerator[AsyncSession, None]:
    """
    Session without an outer transaction wrapper. Use when tests patch commit() to flush()
    and rely on rollback() for isolation (e.g. pricing/metadata unit tests).
    """
    async_session = sessionmaker(
        engine,
        class_=AsyncSession,
        expire_on_commit=False,
    )
    async with async_session() as session:
        try:
            yield session
        finally:
            await session.rollback()
