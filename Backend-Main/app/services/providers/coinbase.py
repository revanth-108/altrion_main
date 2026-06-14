"""
Coinbase provider adapter
"""
from typing import List, Dict, Any
from coinbase.rest import RESTClient

from app.services.providers.base import BaseProviderAdapter
from app.core.logging import get_logger

logger = get_logger()


class CoinbaseAdapter(BaseProviderAdapter):
    """Coinbase exchange adapter"""
    
    def __init__(self, client_id: str, client_secret: str):
        self.client_id = client_id
        self.client_secret = client_secret
    
    async def authenticate(self, credentials: dict) -> Dict[str, Any]:
        """
        Authenticate with Coinbase OAuth
        
        Args:
            credentials: Should contain 'code' for OAuth callback
            
        Returns:
            Token data (access_token, refresh_token, etc.)
        """
        # TODO: Implement Coinbase OAuth flow
        # For now, return mock token data
        code = credentials.get("code")
        
        # In production, exchange code for tokens via Coinbase OAuth API
        return {
            "access_token": "mock_access_token",
            "refresh_token": "mock_refresh_token",
            "expires_in": 3600,
        }
    
    async def fetch_accounts(self, token_data: dict) -> List[Dict[str, Any]]:
        """Fetch Coinbase accounts"""
        access_token = token_data.get("access_token")
        
        # Initialize Coinbase client
        client = CoinbaseAdvancedAPIClient(
            api_key=access_token,  # Simplified - actual implementation may differ
            api_secret=self.client_secret,
        )
        
        try:
            # Fetch accounts
            request = GetAccountsRequest()
            response = client.get_accounts(request)
            
            accounts = []
            for account in response.accounts:
                accounts.append({
                    "id": account.uuid,
                    "name": account.name or "Coinbase Account",
                    "type": "exchange",
                })
            
            return accounts
        except Exception as e:
            logger.error("Failed to fetch Coinbase accounts", error=str(e))
            raise
    
    async def fetch_holdings(self, account_id: str, token_data: dict) -> Dict[str, Any]:
        """Fetch holdings for a Coinbase account"""
        access_token = token_data.get("access_token")
        
        client = CoinbaseAdvancedAPIClient(
            api_key=access_token,
            api_secret=self.client_secret,
        )
        
        try:
            # Fetch account details with balances
            # This is simplified - actual Coinbase API may differ
            request = GetAccountsRequest(account_uuid=account_id)
            response = client.get_accounts(request)
            
            account = next((acc for acc in response.accounts if acc.uuid == account_id), None)
            if not account:
                raise ValueError(f"Account {account_id} not found")
            
            # Return raw data
            return {
                "account_id": account_id,
                "balances": [
                    {
                        "currency": balance.currency,
                        "amount": balance.available_balance.value,
                    }
                    for balance in account.available_balance or []
                ],
            }
        except Exception as e:
            logger.error("Failed to fetch Coinbase holdings", error=str(e), account_id=account_id)
            raise
    
    async def extract_holdings(self, raw_data: Dict[str, Any]) -> List[Dict[str, Any]]:
        """
        Extract holdings from Coinbase raw data
        
        Coinbase format:
        {
            "account_id": "...",
            "balances": [
                {"currency": "BTC", "amount": "0.5"},
                {"currency": "ETH", "amount": "10.0"},
            ]
        }
        """
        holdings = []
        
        balances = raw_data.get("balances", [])
        for balance in balances:
            currency = balance.get("currency", "").upper()
            amount = balance.get("amount", "0")
            
            if currency and float(amount) > 0:
                holdings.append({
                    "symbol": currency,  # Coinbase uses standard symbols like BTC, ETH
                    "quantity": amount,
                })
        
        return holdings
