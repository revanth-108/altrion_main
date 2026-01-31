"""
Asset Symbol Mapping Service

Manual mapping table - no heuristic guessing.
Maps provider-specific symbols to canonical symbols.
"""
from typing import Optional, Dict
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
import structlog

from app.models.asset_mapping import AssetMapping

logger = structlog.get_logger()


class AssetMappingService:
    """Service for resolving provider symbols to canonical symbols"""

    DEFAULT_MAPPINGS = {
        "coinbase": {
            "BTC": {"canonical_symbol": "BTC", "asset_class": "crypto"},
            "ETH": {"canonical_symbol": "ETH", "asset_class": "crypto"},
            "USDC": {"canonical_symbol": "USDC", "asset_class": "cash_equivalent"},
            "USDT": {"canonical_symbol": "USDT", "asset_class": "cash_equivalent"},
        },
        "plaid": {
            "USD": {"canonical_symbol": "USDC", "asset_class": "cash_equivalent"},
            "US DOLLAR": {"canonical_symbol": "USDC", "asset_class": "cash_equivalent"},
            "BITCOIN": {"canonical_symbol": "BTC", "asset_class": "crypto"},
            "ETHEREUM": {"canonical_symbol": "ETH", "asset_class": "crypto"},
        },
        "wallet": {
            "BTC": {"canonical_symbol": "BTC", "asset_class": "crypto"},
            "ETH": {"canonical_symbol": "ETH", "asset_class": "crypto"},
            "USDC": {"canonical_symbol": "USDC", "asset_class": "cash_equivalent"},
            "USDT": {"canonical_symbol": "USDT", "asset_class": "cash_equivalent"},
            "WETH": {"canonical_symbol": "ETH", "asset_class": "crypto"},
            "WBTC": {"canonical_symbol": "BTC", "asset_class": "crypto"},
        },
    }
    
    def __init__(self, db: AsyncSession):
        self.db = db
    
    async def resolve_symbol(
        self,
        provider: str,
        provider_symbol: str,
    ) -> Optional[Dict[str, str]]:
        """
        Resolve provider symbol to canonical symbol
        
        Args:
            provider: Provider name (e.g., 'coinbase', 'plaid')
            provider_symbol: Symbol as provider uses it (e.g., 'BTC', 'Bitcoin')
            
        Returns:
            Dict with canonical_symbol and asset_class, or None if not found
        """
        if not provider_symbol:
            return None
        
        stmt = select(AssetMapping).where(
            AssetMapping.provider == provider,
            AssetMapping.provider_symbol == provider_symbol.upper(),
            AssetMapping.is_active == True,
        )
        
        result = await self.db.execute(stmt)
        mapping = result.scalar_one_or_none()
        
        if mapping:
            return {
                "canonical_symbol": mapping.canonical_symbol,
                "asset_class": mapping.asset_class,
            }

        default_mapping = self.DEFAULT_MAPPINGS.get(provider, {}).get(provider_symbol.upper())
        if default_mapping:
            created = await self.create_mapping(
                provider=provider,
                provider_symbol=provider_symbol,
                canonical_symbol=default_mapping["canonical_symbol"],
                asset_class=default_mapping["asset_class"],
            )
            return {
                "canonical_symbol": created.canonical_symbol,
                "asset_class": created.asset_class,
            }
        
        logger.warning(
            "Symbol not found in mapping",
            provider=provider,
            provider_symbol=provider_symbol,
        )
        return None
    
    async def create_mapping(
        self,
        provider: str,
        provider_symbol: str,
        canonical_symbol: str,
        asset_class: str,
    ) -> AssetMapping:
        """Create a new symbol mapping"""
        mapping_id = f"{provider_symbol.upper()}_{provider}"
        
        mapping = AssetMapping(
            id=mapping_id,
            provider=provider,
            provider_symbol=provider_symbol.upper(),
            canonical_symbol=canonical_symbol.upper(),
            asset_class=asset_class,
            is_active=True,
        )
        
        self.db.add(mapping)
        await self.db.commit()
        await self.db.refresh(mapping)
        
        return mapping
