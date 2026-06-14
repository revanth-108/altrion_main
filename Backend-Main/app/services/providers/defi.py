"""
DeFi position fetcher — uses Moralis DeFi API to retrieve on-chain positions
across multiple EVM chains for D5 scoring.
"""
from __future__ import annotations

import asyncio
from typing import Optional
import httpx

from app.core.config import settings
from app.core.logging import get_logger

logger = get_logger()

# ─── Supported chains ─────────────────────────────────────────────────────────
DEFI_CHAINS = ["eth", "polygon", "arbitrum", "optimism", "bsc"]

# ─── Protocol risk tiers (0.0 – 1.0, higher = safer) ─────────────────────────
PROTOCOL_RISK_TIERS: dict[str, float] = {
    "aave": 0.95,
    "aave-v2": 0.95,
    "aave-v3": 0.95,
    "compound": 0.90,
    "compound-v2": 0.90,
    "compound-v3": 0.90,
    "lido": 0.90,
    "makerdao": 0.90,
    "maker": 0.90,
    "uniswap": 0.85,
    "uniswap-v2": 0.85,
    "uniswap-v3": 0.85,
    "curve": 0.85,
    "curve-finance": 0.85,
    "convex": 0.80,
    "convex-finance": 0.80,
    "yearn": 0.80,
    "yearn-finance": 0.80,
    "balancer": 0.80,
    "sushiswap": 0.70,
    "sushi": 0.70,
    "pancakeswap": 0.70,
    "pancakeswap-v2": 0.70,
    "pancakeswap-v3": 0.70,
    "quickswap": 0.65,
    "trader-joe": 0.65,
    # Default for unknown protocols handled in scoring function
}

MORALIS_BASE = "https://deep-index.moralis.io/api/v2.2"


async def fetch_defi_positions(address: str) -> list[dict]:
    """
    Fetch all DeFi positions for an EVM address across supported chains.
    Returns a flat list of position dicts — one entry per position.
    Returns empty list if MORALIS_API_KEY not set or on any error.
    """
    if not settings.MORALIS_API_KEY:
        return []

    headers = {
        "accept": "application/json",
        "X-API-Key": settings.MORALIS_API_KEY,
    }

    async def _fetch_chain(chain: str) -> list[dict]:
        url = f"{MORALIS_BASE}/wallets/{address}/defi/positions"
        params = {"chain": chain}
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                resp = await client.get(url, headers=headers, params=params)
                if resp.status_code == 200:
                    data = resp.json()
                    # Moralis returns {"result": [...]} or a list directly
                    positions = data.get("result", data) if isinstance(data, dict) else data
                    # Tag each position with its chain
                    for p in positions:
                        p["_chain"] = chain
                    return positions
                elif resp.status_code == 400:
                    # Chain not supported or no positions — not an error
                    return []
                else:
                    logger.warning(
                        "Moralis DeFi fetch non-200",
                        chain=chain,
                        status=resp.status_code,
                        address=address[:8],
                    )
                    return []
        except Exception as e:
            logger.warning("Moralis DeFi fetch failed", chain=chain, error=str(e))
            return []

    results = await asyncio.gather(*[_fetch_chain(c) for c in DEFI_CHAINS])
    all_positions: list[dict] = []
    for chain_positions in results:
        all_positions.extend(chain_positions)

    return all_positions
