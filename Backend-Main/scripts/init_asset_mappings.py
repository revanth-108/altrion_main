"""
Initialize asset symbol mappings

This script populates the asset_mappings table with initial mappings.
Manual mapping table - no heuristic guessing.
"""
import os
import sys

# Add project root to path
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import asyncio
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from app.models.asset_mapping import AssetMapping
from app.core.config import settings

# Create async engine
engine = create_async_engine(
    settings.DATABASE_URL.replace("postgresql://", "postgresql+asyncpg://"),
    echo=True,
)

AsyncSessionLocal = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
)


# Initial mappings
MAPPINGS = [
    # Coinbase mappings
    {"provider": "coinbase", "provider_symbol": "BTC", "canonical_symbol": "BTC", "asset_class": "crypto"},
    {"provider": "coinbase", "provider_symbol": "ETH", "canonical_symbol": "ETH", "asset_class": "crypto"},
    {"provider": "coinbase", "provider_symbol": "USDC", "canonical_symbol": "USDC", "asset_class": "cash_equivalent"},
    {"provider": "coinbase", "provider_symbol": "USDT", "canonical_symbol": "USDT", "asset_class": "cash_equivalent"},
    {"provider": "coinbase", "provider_symbol": "SOL", "canonical_symbol": "SOL", "asset_class": "crypto"},
    {"provider": "coinbase", "provider_symbol": "ADA", "canonical_symbol": "ADA", "asset_class": "crypto"},
    {"provider": "coinbase", "provider_symbol": "DOT", "canonical_symbol": "DOT", "asset_class": "crypto"},
    {"provider": "coinbase", "provider_symbol": "MATIC", "canonical_symbol": "MATIC", "asset_class": "crypto"},
    {"provider": "coinbase", "provider_symbol": "AVAX", "canonical_symbol": "AVAX", "asset_class": "crypto"},
    {"provider": "coinbase", "provider_symbol": "LINK", "canonical_symbol": "LINK", "asset_class": "crypto"},
    
    # Plaid mappings
    {"provider": "plaid", "provider_symbol": "USD", "canonical_symbol": "USDC", "asset_class": "cash_equivalent"},
    {"provider": "plaid", "provider_symbol": "US Dollar", "canonical_symbol": "USDC", "asset_class": "cash_equivalent"},
    {"provider": "plaid", "provider_symbol": "Bitcoin", "canonical_symbol": "BTC", "asset_class": "crypto"},
    {"provider": "plaid", "provider_symbol": "Ethereum", "canonical_symbol": "ETH", "asset_class": "crypto"},
    
    # Wallet mappings (typically same as Coinbase)
    {"provider": "wallet", "provider_symbol": "BTC", "canonical_symbol": "BTC", "asset_class": "crypto"},
    {"provider": "wallet", "provider_symbol": "ETH", "canonical_symbol": "ETH", "asset_class": "crypto"},
    {"provider": "wallet", "provider_symbol": "USDC", "canonical_symbol": "USDC", "asset_class": "cash_equivalent"},
    {"provider": "wallet", "provider_symbol": "USDT", "canonical_symbol": "USDT", "asset_class": "cash_equivalent"},
    {"provider": "wallet", "provider_symbol": "SOL", "canonical_symbol": "SOL", "asset_class": "crypto"},
    {"provider": "wallet", "provider_symbol": "WETH", "canonical_symbol": "ETH", "asset_class": "crypto"},
    {"provider": "wallet", "provider_symbol": "WBTC", "canonical_symbol": "BTC", "asset_class": "crypto"},
]


async def init_mappings():
    """Initialize asset mappings"""
    async with AsyncSessionLocal() as session:
        for mapping_data in MAPPINGS:
            mapping_id = f"{mapping_data['provider_symbol'].upper()}_{mapping_data['provider']}"
            
            # Check if mapping exists
            from sqlalchemy import select
            stmt = select(AssetMapping).where(AssetMapping.id == mapping_id)
            result = await session.execute(stmt)
            existing = result.scalar_one_or_none()
            
            if existing:
                print(f"Mapping {mapping_id} already exists, skipping")
                continue
            
            mapping = AssetMapping(
                id=mapping_id,
                provider=mapping_data["provider"],
                provider_symbol=mapping_data["provider_symbol"].upper(),
                canonical_symbol=mapping_data["canonical_symbol"].upper(),
                asset_class=mapping_data["asset_class"],
                is_active=True,
            )
            
            session.add(mapping)
            print(f"Created mapping: {mapping_id}")
        
        await session.commit()
        print("Asset mappings initialized successfully")


if __name__ == "__main__":
    asyncio.run(init_mappings())
