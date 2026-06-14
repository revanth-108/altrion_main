"""
Supabase client for authentication and encrypted storage
"""
from supabase import create_client, Client
from app.core.config import settings
from app.core.database import AsyncSessionLocal
from app.models.provider_token import ProviderToken
from sqlalchemy import select
from uuid import UUID
from app.core.logging import get_logger
from app.services.plaid_safe import ensure_dict

logger = get_logger()

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
                if hasattr(existing, "is_active"):
                    existing.is_active = True
            else:
                session.add(ProviderToken(
                    user_id=user_id_uuid,
                    provider=provider,
                    token_data=token_data,
                    is_active=True,
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


async def get_encrypted_token(user_id: str, provider: str, item_id: str | None = None) -> dict | None:
    """Retrieve encrypted provider token from database"""
    async with AsyncSessionLocal() as session:
        try:
            user_id_uuid = UUID(user_id) if isinstance(user_id, str) else user_id
            stmt = select(ProviderToken).where(
                ProviderToken.user_id == user_id_uuid,
                ProviderToken.provider == provider,
            )
            result = await session.execute(stmt)
            rows = result.scalars().all()
            if not rows:
                return None

            if item_id:
                exact = next((row for row in rows if row.item_id == item_id), None)
                if exact:
                    return ensure_dict(exact.token_data)
                legacy = next((row for row in rows if row.item_id is None), None)
                if legacy:
                    return ensure_dict(legacy.token_data)
                logger.warning("No provider token matched requested item", user_id=user_id, provider=provider, item_id=item_id)
                return None

            if len(rows) == 1:
                return ensure_dict(rows[0].token_data)

            legacy = next((row for row in rows if row.item_id is None), None)
            if legacy:
                return ensure_dict(legacy.token_data)

            logger.warning("Multiple provider tokens found; item_id required", user_id=user_id, provider=provider, token_count=len(rows))
            return None
        except Exception as e:
            logger.error("Failed to retrieve encrypted token", error=str(e), user_id=user_id, provider=provider)
            if "relation" in str(e).lower() or "does not exist" in str(e).lower():
                logger.warning("provider_tokens table may not exist. Run create_provider_tokens_table.sql")
            return None


async def delete_encrypted_token(user_id: str, provider: str, item_id: str | None = None):
    """Delete encrypted provider token."""
    async with AsyncSessionLocal() as session:
        try:
            user_id_uuid = UUID(user_id) if isinstance(user_id, str) else user_id
            stmt = select(ProviderToken).where(
                ProviderToken.user_id == user_id_uuid,
                ProviderToken.provider == provider,
            )
            if item_id is not None:
                stmt = stmt.where(ProviderToken.item_id == item_id)
            result = await session.execute(stmt)
            existing_rows = result.scalars().all()
            for existing in existing_rows:
                await session.delete(existing)
            if existing_rows:
                await session.commit()
            logger.info(
                "Deleted encrypted token",
                user_id=user_id,
                provider=provider,
                item_id=item_id,
                deleted_count=len(existing_rows),
            )
        except Exception as e:
            await session.rollback()
            logger.error("Failed to delete encrypted token", error=str(e), user_id=user_id, provider=provider, item_id=item_id)
            raise
