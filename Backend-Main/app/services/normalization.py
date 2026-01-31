"""
Normalization Service - CORE REQUIREMENT

This service is responsible for:
1. Fetching raw data from providers
2. Resolving provider symbols via manual mapping table
3. Converting data into canonical internal shape
4. Preserving source and account origin
5. Writing normalized holdings to database
6. Emitting warnings on failure

This service MUST NOT:
- Calculate totals
- Apply pricing
- Generate dashboard JSON
"""
from typing import List, Dict, Any
from decimal import Decimal
from datetime import datetime
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
import structlog

from app.schemas.normalization import CanonicalHolding
from app.models.holding import Holding
from app.models.account import Account
from app.services.asset_mapping import AssetMappingService
from app.services.providers.base import BaseProviderAdapter

logger = structlog.get_logger()


class NormalizationService:
    """Core normalization service"""
    
    def __init__(self, db: AsyncSession):
        self.db = db
        self.mapping_service = AssetMappingService(db)
    
    async def normalize_provider_data(
        self,
        user_id: str,
        account_id: str,
        provider: str,
        raw_data: Dict[str, Any],
        adapter: BaseProviderAdapter,
    ) -> tuple[List[CanonicalHolding], List[Dict[str, Any]]]:
        """
        Normalize raw provider data into canonical holdings
        
        Args:
            user_id: User UUID
            account_id: Account UUID
            provider: Provider name
            raw_data: Raw JSON from provider
            adapter: Provider adapter instance
            
        Returns:
            Tuple of (normalized_holdings, warnings)
        """
        warnings = []
        normalized_holdings = []
        
        try:
            # Extract raw holdings from provider data
            raw_holdings = await adapter.extract_holdings(raw_data)
            
            for raw_holding in raw_holdings:
                try:
                    # Resolve symbol via mapping table
                    mapping = await self.mapping_service.resolve_symbol(
                        provider=provider,
                        provider_symbol=raw_holding.get("symbol"),
                    )
                    
                    if not mapping:
                        warnings.append({
                            "type": "unmapped_symbol",
                            "provider": provider,
                            "symbol": raw_holding.get("symbol"),
                            "account_id": account_id,
                            "message": f"Symbol '{raw_holding.get('symbol')}' not found in mapping table",
                        })
                        continue
                    
                    # Create canonical holding
                    canonical_holding = CanonicalHolding(
                        schema_version="v1",
                        user_id=user_id,
                        account_id=account_id,
                        canonical_symbol=mapping["canonical_symbol"],
                        asset_class=mapping["asset_class"],
                        quantity=Decimal(str(raw_holding.get("quantity", 0))),
                        source=provider,
                        retrieved_at=datetime.utcnow(),
                    )
                    
                    normalized_holdings.append(canonical_holding)
                    
                except Exception as e:
                    logger.error(
                        "Failed to normalize holding",
                        error=str(e),
                        provider=provider,
                        raw_holding=raw_holding,
                    )
                    warnings.append({
                        "type": "normalization_error",
                        "provider": provider,
                        "account_id": account_id,
                        "message": f"Failed to normalize holding: {str(e)}",
                    })
            
            # Write normalized holdings to database
            await self._write_holdings(normalized_holdings)
            
        except Exception as e:
            logger.error(
                "Normalization failed",
                error=str(e),
                provider=provider,
                account_id=account_id,
            )
            warnings.append({
                "type": "normalization_failure",
                "provider": provider,
                "account_id": account_id,
                "message": f"Normalization failed: {str(e)}",
            })
        
        return normalized_holdings, warnings
    
    async def _write_holdings(self, holdings: List[CanonicalHolding]):
        """
        Write normalized holdings to database (upsert)
        
        Rules:
        - Upsert on success (one row per asset per account)
        - Do NOT delete on failure
        - Preserve last known data
        """
        from uuid import UUID
        
        for holding in holdings:
            try:
                # Convert string UUIDs to UUID objects
                account_id_uuid = UUID(holding.account_id) if isinstance(holding.account_id, str) else holding.account_id
                user_id_uuid = UUID(holding.user_id) if isinstance(holding.user_id, str) else holding.user_id
                
                # Check if holding exists
                stmt = select(Holding).where(
                    Holding.account_id == account_id_uuid,
                    Holding.canonical_symbol == holding.canonical_symbol,
                )
                result = await self.db.execute(stmt)
                existing = result.scalar_one_or_none()
                
                if existing:
                    # Update existing holding
                    existing.quantity = holding.quantity
                    existing.asset_class = holding.asset_class
                    existing.retrieved_at = holding.retrieved_at
                    existing.last_updated = datetime.utcnow()
                else:
                    # Create new holding
                    new_holding = Holding(
                        user_id=user_id_uuid,
                        account_id=account_id_uuid,
                        canonical_symbol=holding.canonical_symbol,
                        asset_class=holding.asset_class,
                        quantity=holding.quantity,
                        source=holding.source,
                        retrieved_at=holding.retrieved_at,
                    )
                    self.db.add(new_holding)
                
            except Exception as e:
                logger.error(
                    "Failed to write holding",
                    error=str(e),
                    holding=holding.dict(),
                )
                # Continue with other holdings even if one fails
        
        await self.db.commit()
