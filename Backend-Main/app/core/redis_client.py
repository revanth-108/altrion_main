"""
Redis client for temporary data storage
"""
import redis.asyncio as redis
from app.core.config import settings
import json
from app.core.logging import get_logger
from app.core.logging import get_logger

logger = get_logger()
logger = get_logger()

# Global redis client
redis_client: redis.Redis = None


async def init_redis():
    """Initialize Redis connection"""
    global redis_client
    try:
        redis_client = await redis.from_url(
            settings.REDIS_URL,
            encoding="utf-8",
            decode_responses=True,
        )
        # Test connection
        await redis_client.ping()
        logger.info("Redis connected successfully")
    except Exception as e:
        logger.error("Failed to connect to Redis", error=str(e))
        raise


async def close_redis():
    """Close Redis connection"""
    global redis_client
    if redis_client:
        await redis_client.close()
        logger.info("Redis connection closed")


async def get_redis() -> redis.Redis:
    """Get Redis client"""
    if redis_client is None:
        await init_redis()
    return redis_client


async def store_raw_data(key: str, data: dict, ttl: int = None):
    """Store raw provider data in Redis"""
    redis = await get_redis()
    ttl = ttl or settings.REDIS_TTL_RAW_DATA
    await redis.setex(
        f"raw_data:{key}",
        ttl,
        json.dumps(data),
    )
    logger.debug("Stored raw data in Redis", key=key, ttl=ttl)


async def get_raw_data(key: str) -> dict | None:
    """Retrieve raw provider data from Redis"""
    redis = await get_redis()
    data = await redis.get(f"raw_data:{key}")
    if data:
        return json.loads(data)
    return None


async def delete_raw_data(key: str):
    """Delete raw provider data from Redis"""
    redis = await get_redis()
    await redis.delete(f"raw_data:{key}")
