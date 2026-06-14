"""
Wallet provider adapter (read-only, public address based)
"""
from typing import List, Dict, Any
from decimal import Decimal
import httpx

from app.services.providers.base import BaseProviderAdapter
from app.core.config import settings
from app.core.logging import get_logger

logger = get_logger()


class WalletAdapter(BaseProviderAdapter):
    """Wallet adapter for read-only public address tracking"""
    
    async def authenticate(self, credentials: dict) -> Dict[str, Any]:
        """
        Wallet authentication - just stores public address
        
        Args:
            credentials: Should contain 'address' and optionally 'chain'
            
        Returns:
            Token data (address, chain)
        """
        address = credentials.get("address") or credentials.get("username")
        chain = credentials.get("chain") or credentials.get("password") or "ethereum"  # Default to ethereum
        chain = self._normalize_chain(chain)
        
        if not address:
            raise ValueError("address required for wallet connection")
        
        return {
            "address": address,
            "chain": chain,
        }
    
    async def fetch_accounts(self, token_data: dict) -> List[Dict[str, Any]]:
        """Wallet accounts - one account per address"""
        address = token_data.get("address")
        
        return [{
            "id": address,
            "name": f"Wallet {address[:8]}...{address[-6:]}",
            "type": "wallet",
        }]
    
    async def fetch_holdings(self, account_id: str, token_data: dict) -> Dict[str, Any]:
        """
        Fetch holdings for a wallet address
        
        This would typically use a blockchain explorer API or RPC node
        """
        address = token_data.get("address") or token_data.get("username")
        chain = token_data.get("chain") or token_data.get("password") or "ethereum"
        chain = self._normalize_chain(chain)
        
        if not address:
            raise ValueError("wallet address not found for holdings fetch")

        if chain.lower() == "bitcoin":
            return await self._fetch_bitcoin_holdings(account_id, address, chain)

        if chain.lower() == "solana":
            return await self._fetch_solana_holdings(account_id, address, chain)

        if chain.lower() != "ethereum":
            logger.warning("Unsupported chain for wallet holdings", chain=chain, address=address)
            return {
                "account_id": account_id,
                "address": address,
                "chain": chain,
                "balances": [],
            }

        balances: list[dict[str, str]] = []
        ethplorer_failed = False
        try:
            if settings.MORALIS_API_KEY:
                balances = await self._fetch_moralis_erc20_balances(address, "eth")
            if balances:
                return {
                    "account_id": account_id,
                    "address": address,
                    "chain": chain,
                    "balances": balances,
                }
            async with httpx.AsyncClient() as client:
                response = await client.get(
                    f"https://api.ethplorer.io/getAddressInfo/{address}",
                    params={"apiKey": "freekey"},
                    timeout=10.0,
                )
                if response.status_code != 200:
                    ethplorer_failed = True
                    logger.warning(
                        "Ethplorer returned non-200",
                        status=response.status_code,
                        address=address,
                    )
                else:
                    data = response.json()
                    eth_balance = data.get("ETH", {}).get("balance")
                    if eth_balance:
                        balances.append({
                            "symbol": "ETH",
                            "quantity": str(eth_balance),
                        })

                    tokens = data.get("tokens") or []
                    for token in tokens:
                        token_info = token.get("tokenInfo", {})
                        symbol = token_info.get("symbol")
                        raw_balance = token.get("balance")
                        decimals = token_info.get("decimals")
                        quantity = self._normalize_token_balance(raw_balance, decimals)

                        if symbol and quantity > 0:
                            balances.append({
                                "symbol": symbol,
                                "quantity": str(quantity),
                            })
        except Exception as e:
            ethplorer_failed = True
            logger.error("Failed to fetch wallet holdings", error=str(e), address=address)

        if ethplorer_failed or not balances:
            rpc_balance = await self._fetch_eth_balance(address)
            if rpc_balance and rpc_balance > 0:
                balances.append({
                    "symbol": "ETH",
                    "quantity": str(rpc_balance),
                })

        return {
            "account_id": account_id,
            "address": address,
            "chain": chain,
            "balances": balances,
        }

    @staticmethod
    def _normalize_token_balance(raw_balance: Any, decimals: Any) -> Decimal:
        """Normalize token balance to decimal units."""
        if raw_balance is None:
            return Decimal("0")
        try:
            decimals_int = int(decimals) if decimals is not None else 0
        except (ValueError, TypeError):
            decimals_int = 0

        try:
            balance = Decimal(str(raw_balance))
        except Exception:
            return Decimal("0")

        if decimals_int <= 0:
            return balance

        return balance / (Decimal("10") ** decimals_int)

    @staticmethod
    def _normalize_chain(chain: Any) -> str:
        if chain is None:
            return "ethereum"
        chain_value = str(chain).strip().lower()
        if chain_value in {"bitcoin", "btc"}:
            return "bitcoin"
        if chain_value in {"solana", "sol"}:
            return "solana"
        if chain_value in {"1", "0x1", "ethereum", "eth"}:
            return "ethereum"
        if chain_value in {"137", "0x89", "polygon", "matic"}:
            return "polygon"
        if chain_value in {"56", "0x38", "bsc", "binance"}:
            return "bsc"
        if chain_value in {"10", "0xa", "optimism", "op"}:
            return "optimism"
        if chain_value in {"42161", "0xa4b1", "arbitrum"}:
            return "arbitrum"
        return chain_value

    async def _fetch_moralis_erc20_balances(self, address: str, chain: str) -> list[dict[str, str]]:
        if not settings.MORALIS_API_KEY:
            return []
        balances: list[dict[str, str]] = []
        headers = {"X-API-Key": settings.MORALIS_API_KEY}
        async with httpx.AsyncClient() as client:
            # Native balance
            native_resp = await client.get(
                f"https://deep-index.moralis.io/api/v2.2/{address}/balance",
                params={"chain": chain},
                headers=headers,
                timeout=15.0,
            )
            if native_resp.status_code == 200:
                native = native_resp.json()
                balance_wei = native.get("balance")
                if balance_wei:
                    eth_balance = Decimal(balance_wei) / Decimal(10 ** 18)
                    if eth_balance > 0:
                        balances.append({
                            "symbol": "ETH",
                            "quantity": str(eth_balance),
                        })

            # ERC20 balances
            erc20_resp = await client.get(
                f"https://deep-index.moralis.io/api/v2.2/{address}/erc20",
                params={"chain": chain},
                headers=headers,
                timeout=15.0,
            )
            if erc20_resp.status_code == 200:
                tokens = erc20_resp.json()
                for token in tokens:
                    symbol = token.get("symbol")
                    balance = token.get("balance")
                    decimals = token.get("decimals")
                    quantity = self._normalize_token_balance(balance, decimals)
                    if symbol and quantity > 0:
                        balances.append({
                            "symbol": symbol,
                            "quantity": str(quantity),
                        })
        return balances

    async def _fetch_bitcoin_holdings(self, account_id: str, address: str, chain: str) -> Dict[str, Any]:
        balances: list[dict[str, str]] = []
        try:
            async with httpx.AsyncClient() as client:
                response = await client.get(
                    f"https://blockstream.info/api/address/{address}",
                    timeout=15.0,
                )
                if response.status_code == 200:
                    data = response.json()
                    funded = data.get("chain_stats", {}).get("funded_txo_sum", 0)
                    spent = data.get("chain_stats", {}).get("spent_txo_sum", 0)
                    balance_sats = Decimal(funded) - Decimal(spent)
                    if balance_sats > 0:
                        balances.append({
                            "symbol": "BTC",
                            "quantity": str(balance_sats / Decimal(10 ** 8)),
                        })
                else:
                    logger.warning("Bitcoin API returned non-200", status=response.status_code, address=address)
        except Exception as e:
            logger.error("Failed to fetch BTC holdings", error=str(e), address=address)

        return {
            "account_id": account_id,
            "address": address,
            "chain": chain,
            "balances": balances,
        }

    async def _fetch_solana_holdings(self, account_id: str, address: str, chain: str) -> Dict[str, Any]:
        balances: list[dict[str, str]] = []
        try:
            async with httpx.AsyncClient() as client:
                # SOL balance
                sol_resp = await client.post(
                    "https://api.mainnet-beta.solana.com",
                    json={
                        "jsonrpc": "2.0",
                        "id": 1,
                        "method": "getBalance",
                        "params": [address],
                    },
                    timeout=15.0,
                )
                if sol_resp.status_code == 200:
                    sol_data = sol_resp.json()
                    lamports = sol_data.get("result", {}).get("value")
                    if lamports:
                        balances.append({
                            "symbol": "SOL",
                            "quantity": str(Decimal(lamports) / Decimal(10 ** 9)),
                        })

                # SPL tokens
                tokens_resp = await client.post(
                    "https://api.mainnet-beta.solana.com",
                    json={
                        "jsonrpc": "2.0",
                        "id": 1,
                        "method": "getTokenAccountsByOwner",
                        "params": [
                            address,
                            {"programId": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"},
                            {"encoding": "jsonParsed"},
                        ],
                    },
                    timeout=15.0,
                )
                if tokens_resp.status_code == 200:
                    token_data = tokens_resp.json()
                    for account in token_data.get("result", {}).get("value", []):
                        info = account.get("account", {}).get("data", {}).get("parsed", {}).get("info", {})
                        token_amount = info.get("tokenAmount", {})
                        amount = token_amount.get("uiAmount")
                        mint = info.get("mint")
                        if amount and amount > 0 and mint:
                            balances.append({
                                "symbol": mint,
                                "quantity": str(amount),
                            })
        except Exception as e:
            logger.error("Failed to fetch SOL holdings", error=str(e), address=address)

        return {
            "account_id": account_id,
            "address": address,
            "chain": chain,
            "balances": balances,
        }

    @staticmethod
    async def _fetch_eth_balance(address: str) -> Decimal:
        """Fetch ETH balance via public JSON-RPC."""
        try:
            async with httpx.AsyncClient() as client:
                response = await client.post(
                    "https://cloudflare-eth.com",
                    json={
                        "jsonrpc": "2.0",
                        "id": 1,
                        "method": "eth_getBalance",
                        "params": [address, "latest"],
                    },
                    timeout=10.0,
                )
                if response.status_code != 200:
                    logger.warning("ETH RPC returned non-200", status=response.status_code, address=address)
                    return Decimal("0")
                data = response.json()
                result = data.get("result")
                if not result:
                    return Decimal("0")
                wei = Decimal(int(result, 16))
                return wei / Decimal(10 ** 18)
        except Exception as e:
            logger.error("ETH RPC balance fetch failed", error=str(e), address=address)
            return Decimal("0")
    
    async def extract_holdings(self, raw_data: Dict[str, Any]) -> List[Dict[str, Any]]:
        """
        Extract holdings from wallet raw data
        
        Wallet format:
        {
            "address": "...",
            "balances": [
                {"symbol": "ETH", "quantity": "1.5"},
                {"symbol": "USDC", "quantity": "1000"},
            ]
        }
        """
        holdings = []
        
        balances = raw_data.get("balances", [])
        for balance in balances:
            symbol = balance.get("symbol", "").upper()
            quantity = balance.get("quantity", "0")
            
            if symbol and float(quantity) > 0:
                holdings.append({
                    "symbol": symbol,
                    "quantity": quantity,
                })
        
        return holdings
