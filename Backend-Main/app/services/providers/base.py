"""
Base provider adapter interface

All provider adapters must implement this interface.
"""
from abc import ABC, abstractmethod
from typing import List, Dict, Any


class BaseProviderAdapter(ABC):
    """Base class for all provider adapters"""
    
    @abstractmethod
    async def fetch_accounts(self, token_data: dict) -> List[Dict[str, Any]]:
        """
        Fetch accounts from provider
        
        Args:
            token_data: Provider authentication token data
            
        Returns:
            List of account dictionaries
        """
        pass
    
    @abstractmethod
    async def fetch_holdings(self, account_id: str, token_data: dict) -> Dict[str, Any]:
        """
        Fetch holdings for an account
        
        Args:
            account_id: Provider account ID
            token_data: Provider authentication token data
            
        Returns:
            Raw JSON data from provider
        """
        pass
    
    @abstractmethod
    async def extract_holdings(self, raw_data: Dict[str, Any]) -> List[Dict[str, Any]]:
        """
        Extract holdings from raw provider data
        
        Args:
            raw_data: Raw JSON from provider
            
        Returns:
            List of holding dictionaries with 'symbol' and 'quantity'
        """
        pass
    
    @abstractmethod
    async def authenticate(self, credentials: dict) -> Dict[str, Any]:
        """
        Authenticate with provider and return token data
        
        Args:
            credentials: Provider-specific credentials
            
        Returns:
            Token data to be stored encrypted
        """
        pass
