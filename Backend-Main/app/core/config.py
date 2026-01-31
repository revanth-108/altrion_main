"""
Application configuration
"""
from pydantic_settings import BaseSettings, SettingsConfigDict
from typing import List
from pathlib import Path


class Settings(BaseSettings):
    """Application settings"""
    
    # Server
    PORT: int = 8000
    ENVIRONMENT: str = "development"
    FRONTEND_URL: str = "http://localhost:5173"
    API_BASE_URL: str = "http://localhost:8000/api"
    
    # Supabase (only anon key required)
    SUPABASE_URL: str
    SUPABASE_KEY: str  # Anon/public key
    
    # Database
    DATABASE_URL: str
    
    # Redis
    REDIS_URL: str = "redis://localhost:6379"
    REDIS_TTL_RAW_DATA: int = 86400  # 24 hours
    
    # Plaid (optional - only needed if using Plaid integration)
    PLAID_CLIENT_ID: str = "your-plaid-client-id"
    PLAID_SECRET: str = "your-plaid-secret"
    PLAID_ENVIRONMENT: str = "sandbox"
    PLAID_REDIRECT_URI: str = "http://localhost:5173"
    
    # Coinbase (optional - only needed if using Coinbase integration)
    COINBASE_CLIENT_ID: str = "your-coinbase-client-id"
    COINBASE_CLIENT_SECRET: str = "your-coinbase-client-secret"
    COINBASE_REDIRECT_URI: str = "http://localhost:8000/api/platforms/coinbase/callback"
    
    # CoinMarketCap (optional - only needed for live price data)
    COINMARKETCAP_API_KEY: str = "your-coinmarketcap-api-key"

    # Moralis (optional - wallet holdings across EVM chains)
    MORALIS_API_KEY: str = ""
    
    # Rate Limiting
    REFRESH_RATE_LIMIT_MINUTES: int = 5
    
    # Security
    ALLOWED_ORIGINS: str = "http://localhost:5173,http://localhost:3000"
    JWT_ALGORITHM: str = "HS256"
    
    # Logging
    LOG_LEVEL: str = "INFO"
    
    @property
    def allowed_origins_list(self) -> List[str]:
        """Parse allowed origins from comma-separated string"""
        return [origin.strip() for origin in self.ALLOWED_ORIGINS.split(",")]
    
    model_config = SettingsConfigDict(
        env_file=str(Path(__file__).resolve().parents[2] / ".env"),
        case_sensitive=True,
    )


settings = Settings()
