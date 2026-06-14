"""
Application configuration
"""
from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict
from typing import List, Optional
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
    SUPABASE_JWT_SECRET: Optional[str] = None

    # Database
    DATABASE_URL: str

    # Redis
    REDIS_URL: str = "redis://localhost:6379"
    REDIS_TTL_RAW_DATA: int = 86400  # 24 hours
    LIVE_PRICES_CACHE_TTL: int = 30  # 30 seconds for live price updates

    # Plaid (optional - only needed if using Plaid integration)
    PLAID_CLIENT_ID: str = "your-plaid-client-id"
    PLAID_SECRET: str = "your-plaid-secret"
    PLAID_ENVIRONMENT: str = "sandbox"
    PLAID_REDIRECT_URI: str = "http://localhost:5173"
    PLAID_WEBHOOK_URL: str = ""

    # solving backend runtime error
    ANTHROPIC_API_KEY: str = ""
    CLAUDE_API_URL: str = "https://api.anthropic.com"

    # Coinbase (optional - only needed if using Coinbase integration)
    COINBASE_CLIENT_ID: str = "your-coinbase-client-id"
    COINBASE_CLIENT_SECRET: str = "your-coinbase-client-secret"
    COINBASE_REDIRECT_URI: str = "http://localhost:8000/api/platforms/coinbase/callback"

    # CoinMarketCap (optional - only needed for live price data)
    COINMARKETCAP_API_KEY: str = "your-coinmarketcap-api-key"

    # CoinGecko (optional - free tier works without API key)
    COINGECKO_API_KEY: str = ""

    # Alpha Vantage (optional - for stock pricing, free tier available)
    ALPHA_VANTAGE_API_KEY: str = ""

    # Moralis (optional - wallet holdings across EVM chains)
    MORALIS_API_KEY: str = ""

    # Financial Modeling Prep (optional)
    FMP_API_KEY: str = ""

    # Asset metadata TTLs (hours)
    ASSET_METADATA_EQUITY_TTL_HOURS: int = 24
    ASSET_METADATA_CRYPTO_TTL_HOURS: int = 6
    ASSET_METADATA_MISSING_TTL_HOURS: int = 1

    # Groq AI (optional - for loan risk tier classification)
    GROQ_API_KEY: str = ""
    AI_PROVIDER: str = "groq"
    AI_MODEL_NAME: str = "llama-3.3-70b-versatile"

    # Claude / Anthropic (optional - allocation insight narration)
    CLAUDE_API_KEY: str = ""
    CLAUDE_MODEL: str = "claude-haiku-4-5-20251001"  # Haiku 4.5 — cheapest model with good structured-analysis quality
    USE_CLAUDE_ALLOCATION_SUMMARY: bool = False
    CLAUDE_TIMEOUT_SECONDS: int = 12

    # Loan module (optional)
    USE_LLM_SUMMARY: bool = False
    CONTRACT_ADDRESS: str = ""
    EXPLORER_BASE_URL: str = ""
    CHAIN_NAME: str = "Ethereum"

    # Payment gateway abstraction
    PAYMENT_GATEWAY: str = "hosted_payments_page"
    PAYMENT_WEBHOOK_SECRET: str = ""
    PAYMENT_MERCHANT_ID: str = ""
    PAYMENT_PUBLIC_KEY: str = ""
    HPP_API_URL: str = ""
    HPP_API_KEY: str = ""
    HPP_ACCOUNT_ID: str = ""
    HPP_PROFILE_ID: str = ""
    HPP_ACCESS_KEY: str = ""
    HPP_SECRET_KEY: str = ""
    HPP_WEBHOOK_SECRET: str = ""
    HPP_RETURN_URL: str = ""
    HPP_CANCEL_URL: str = ""
    HPP_LOCALE: str = "en"
    HPP_CURRENCY: str = "USD"
    HPP_TRANSACTION_TYPE: str = "sale"

    # Bank of America Secure Acceptance (BofA SA)
    BOFA_SA_PROFILE_ID: str = ""
    BOFA_SA_ACCESS_KEY: str = ""
    BOFA_SA_SECRET_KEY: str = ""
    BOFA_SA_DEV_MOCK: bool = False
    BOFA_SA_PAYMENT_URL: str = ""
    BOFA_SA_LOCALE: str = "en-us"
    BOFA_SA_MERCHANT_ID: str = ""
    BOFA_SA_TRANSACTION_TYPE: str = "sale"
    BOFA_SA_CLIENT_NAME: str = ""

    # Subscription
    DEFAULT_TRIAL_DAYS: int = 14

    # Email (SMTP)
    RESEND_API_KEY: str = ""
    SMTP_HOST: str = "smtp.gmail.com"
    SMTP_PORT: int = 587
    SMTP_USER: str = ""
    SMTP_PASSWORD: str = ""
    EMAIL_FROM: str = "noreply@altrion.ai"
    EMAIL_FROM_NAME: str = "Altrion"

    # Rate Limiting
    REFRESH_RATE_LIMIT_MINUTES: int = 5

    # Field-level encryption (AES-256-GCM)
    # Generate: python -c "import os,base64; print(base64.urlsafe_b64encode(os.urandom(32)).decode())"
    ENCRYPTION_KEY: str = ""

    # Security
    ALLOWED_ORIGINS: str = "http://localhost:5173,http://localhost:3000"
    ALLOWED_HOSTS: str = "localhost,127.0.0.1,0.0.0.0,testserver"
    JWT_ALGORITHM: str = "HS256"
    SECURE_HEADERS: bool = True

    # Logging
    LOG_LEVEL: str = "INFO"            # Console log level
    LOG_LEVEL_FILE: str = "INFO"       # File log level (set CRITICAL to disable)
    LOG_DIR: str = "logs"
    LOG_FILE: str = "altrion.log"
    LOG_MAX_BYTES: int = 10_485_760       # 10MB per log file
    LOG_BACKUP_COUNT: int = 5             # 5 rotated backups (~60MB total)

    @field_validator(
        "FMP_API_KEY",
        "ANTHROPIC_API_KEY",
        "CLAUDE_API_KEY",
        "CLAUDE_API_URL",
        "CLAUDE_MODEL",
        mode="before",
    )
    @classmethod
    def _strip_secret_settings(cls, value):
        if isinstance(value, str):
            return value.strip()
        return value

    @property
    def allowed_origins_list(self) -> List[str]:
        """Parse allowed origins from comma-separated string"""
        return [origin.strip() for origin in self.ALLOWED_ORIGINS.split(",")]

    @property
    def allowed_hosts_list(self) -> List[str]:
        """Parse allowed hosts from comma-separated string"""
        return [host.strip() for host in self.ALLOWED_HOSTS.split(",")]

    model_config = SettingsConfigDict(
        env_file=str(Path(__file__).resolve().parents[2] / ".env"),
        case_sensitive=True,
        extra="ignore",
    )



settings = Settings()
