"""
Supabase client for authentication and encrypted storage
"""
from supabase import create_client, Client
from app.core.config import settings
from app.core.database import AsyncSessionLocal
from app.models.provider_token import ProviderToken
from sqlalchemy import select
from uuid import UUID
import structlog

logger = structlog.get_logger()

# Supabase client (using anon key)
supabase: Client = None


def init_supabase():
    """Initialize Supabase client"""
    global supabase
    
    try:
        supabase = create_client(
            settings.SUPABASE_URL,
            settings.SUPABASE_KEY,
        )
        
        logger.info("Supabase client initialized")
    except Exception as e:
        logger.error("Failed to initialize Supabase", error=str(e))
        raise


def get_supabase() -> Client:
    """Get Supabase client (anon key)"""
    if supabase is None:
        init_supabase()
    return supabase


async def store_encrypted_token(user_id: str, provider: str, token_data: dict):
    """
    Store encrypted provider token in database
    
    Args:
        user_id: User UUID (string)
        provider: Provider name (e.g., 'coinbase', 'plaid')
        token_data: Token data to encrypt and store
    
    Note: Uses anon key with RLS policies to ensure users can only access their own tokens
    """
    async with AsyncSessionLocal() as session:
        try:
            user_id_uuid = UUID(user_id) if isinstance(user_id, str) else user_id
            stmt = select(ProviderToken).where(
                ProviderToken.user_id == user_id_uuid,
                ProviderToken.provider == provider,
            )
            result = await session.execute(stmt)
            existing = result.scalar_one_or_none()

            if existing:
                existing.token_data = token_data
            else:
                session.add(ProviderToken(
                    user_id=user_id_uuid,
                    provider=provider,
                    token_data=token_data,
                ))

            await session.commit()
            logger.info("Stored encrypted token", user_id=user_id, provider=provider)
            return {"success": True}
        except Exception as e:
            await session.rollback()
            logger.error("Failed to store encrypted token", error=str(e), user_id=user_id, provider=provider)
            if "relation" in str(e).lower() or "does not exist" in str(e).lower():
                logger.warning("provider_tokens table may not exist. Run create_provider_tokens_table.sql")
            raise


async def get_encrypted_token(user_id: str, provider: str) -> dict | None:
    """Retrieve encrypted provider token from database"""
    async with AsyncSessionLocal() as session:
        try:
            user_id_uuid = UUID(user_id) if isinstance(user_id, str) else user_id
            stmt = select(ProviderToken).where(
                ProviderToken.user_id == user_id_uuid,
                ProviderToken.provider == provider,
            )
            result = await session.execute(stmt)
            existing = result.scalar_one_or_none()
            if existing:
                return existing.token_data
            return None
        except Exception as e:
            logger.error("Failed to retrieve encrypted token", error=str(e), user_id=user_id, provider=provider)
            if "relation" in str(e).lower() or "does not exist" in str(e).lower():
                logger.warning("provider_tokens table may not exist. Run create_provider_tokens_table.sql")
            return None


async def delete_encrypted_token(user_id: str, provider: str):
    """Delete encrypted provider token"""
    async with AsyncSessionLocal() as session:
        try:
            user_id_uuid = UUID(user_id) if isinstance(user_id, str) else user_id
            stmt = select(ProviderToken).where(
                ProviderToken.user_id == user_id_uuid,
                ProviderToken.provider == provider,
            )
            result = await session.execute(stmt)
            existing = result.scalar_one_or_none()
            if existing:
                await session.delete(existing)
                await session.commit()
            logger.info("Deleted encrypted token", user_id=user_id, provider=provider)
        except Exception as e:
            await session.rollback()
            logger.error("Failed to delete encrypted token", error=str(e), user_id=user_id, provider=provider)
            raise
