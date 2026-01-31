"""
Plaid provider adapter for bank accounts
"""
from typing import List, Dict, Any
from plaid.api import plaid_api
from plaid import Environment
from plaid.model.accounts_get_request import AccountsGetRequest
from plaid.model.accounts_get_request_options import AccountsGetRequestOptions
from plaid.model.item_public_token_exchange_request import ItemPublicTokenExchangeRequest
from plaid.model.link_token_create_request import LinkTokenCreateRequest
from plaid.model.link_token_create_request_user import LinkTokenCreateRequestUser
from plaid.model.products import Products
from plaid.model.country_code import CountryCode
from plaid.configuration import Configuration
from plaid.api_client import ApiClient
import structlog

from app.services.providers.base import BaseProviderAdapter
from app.core.config import settings

logger = structlog.get_logger()


class PlaidAdapter(BaseProviderAdapter):
    """Plaid adapter for bank/brokerage accounts"""
    
    def __init__(self):
        env = settings.PLAID_ENVIRONMENT.lower()
        host = Environment.Sandbox
        if env == "development":
            host = Environment.Development
        elif env == "production":
            host = Environment.Production

        configuration = Configuration(
            host=host,
            api_key={
                "clientId": settings.PLAID_CLIENT_ID,
                "secret": settings.PLAID_SECRET,
            },
        )
        self.api_client = ApiClient(configuration)
        self.plaid_client = plaid_api.PlaidApi(self.api_client)
    
    async def authenticate(self, credentials: dict) -> Dict[str, Any]:
        """
        Exchange Plaid public token for access token
        
        Args:
            credentials: Should contain 'public_token' from Plaid Link
            
        Returns:
            Token data (access_token, item_id)
        """
        public_token = credentials.get("public_token") or credentials.get("oauth_code")
        
        if not public_token:
            raise ValueError("public_token required for Plaid authentication")
        
        try:
            request = ItemPublicTokenExchangeRequest(public_token=public_token)
            response = self.plaid_client.item_public_token_exchange(request)
            
            return {
                "access_token": response["access_token"],
                "item_id": response["item_id"],
            }
        except Exception as e:
            logger.error("Failed to exchange Plaid token", error=str(e))
            raise

    async def create_link_token(self, user_id: str, client_name: str = "Altrion") -> str:
        """Create Plaid Link token"""
        try:
            request = LinkTokenCreateRequest(
                user=LinkTokenCreateRequestUser(client_user_id=user_id),
                client_name=client_name,
                products=[Products("auth")],
                country_codes=[CountryCode("US")],
                language="en",
                redirect_uri=settings.PLAID_REDIRECT_URI,
            )
            response = self.plaid_client.link_token_create(request)
            return response["link_token"]
        except Exception as e:
            logger.error("Failed to create Plaid link token", error=str(e))
            raise
    
    async def fetch_accounts(self, token_data: dict) -> List[Dict[str, Any]]:
        """Fetch Plaid accounts"""
        access_token = token_data.get("access_token")
        
        try:
            request = AccountsGetRequest(access_token=access_token)
            response = self.plaid_client.accounts_get(request)
            
            accounts = []
            for account in response["accounts"]:
                accounts.append({
                    "id": account["account_id"],
                    "name": account["name"],
                    "type": account["type"],  # 'depository', 'investment', etc.
                })
            
            return accounts
        except Exception as e:
            logger.error("Failed to fetch Plaid accounts", error=str(e))
            raise
    
    async def fetch_holdings(self, account_id: str, token_data: dict) -> Dict[str, Any]:
        """Fetch holdings for a Plaid account"""
        access_token = token_data.get("access_token")
        
        try:
            # For investment accounts, get holdings
            # For depository accounts, get balances
            request = AccountsGetRequest(
                access_token=access_token,
                options=AccountsGetRequestOptions(account_ids=[account_id]),
            )
            response = self.plaid_client.accounts_get(request)
            
            account = next((acc for acc in response["accounts"] if acc["account_id"] == account_id), None)
            if not account:
                raise ValueError(f"Account {account_id} not found")
            
            # Return raw data
            return {
                "account_id": account_id,
                "account": account,
                "balances": account.get("balances", {}),
            }
        except Exception as e:
            logger.error("Failed to fetch Plaid holdings", error=str(e), account_id=account_id)
            raise
    
    async def extract_holdings(self, raw_data: Dict[str, Any]) -> List[Dict[str, Any]]:
        """
        Extract holdings from Plaid raw data
        
        Plaid format varies by account type:
        - Investment accounts: securities holdings
        - Depository accounts: cash balances
        """
        holdings = []
        account = raw_data.get("account", {})
        account_type = account.get("type")
        
        if account_type == "investment":
            # Extract securities
            securities = account.get("securities", [])
            for security in securities:
                symbol = security.get("ticker_symbol") or security.get("name", "")
                quantity = security.get("quantity", 0)
                
                if symbol and quantity > 0:
                    holdings.append({
                        "symbol": symbol,
                        "quantity": str(quantity),
                    })
        elif account_type in ["depository", "credit"]:
            # Extract cash balance
            balances = raw_data.get("balances", {})
            available = balances.get("available", 0)
            
            if available > 0:
                holdings.append({
                    "symbol": "USD",  # Will be mapped to USDC or cash equivalent
                    "quantity": str(available),
                })
        
        return holdings
