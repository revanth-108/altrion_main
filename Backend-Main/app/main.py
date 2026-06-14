"""
Main FastAPI application
"""
from fastapi import FastAPI, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from starlette.middleware.trustedhost import TrustedHostMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import text

from app.core.config import settings
from app.core.logging import setup_logging, get_logger
from app.controllers.router import api_router
from app.core.exceptions import setup_exception_handlers

import os

# Initialize structured logging BEFORE anything else
setup_logging()

logger = get_logger()

# Create FastAPI app
app = FastAPI(
    title="Altrion API",
    description="Crypto-collateralized portfolio aggregation backend",
    version="1.0.0",
    docs_url="/docs" if settings.ENVIRONMENT == "development" else None,
    redoc_url="/redoc" if settings.ENVIRONMENT == "development" else None,
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Request context middleware (adds request_id, user context, timing to all logs)
from app.core.middleware import RequestContextMiddleware
app.add_middleware(RequestContextMiddleware)

app.add_middleware(
    TrustedHostMiddleware,
    allowed_hosts=settings.allowed_hosts_list,
)

app.add_middleware(GZipMiddleware, minimum_size=1000)

# Setup exception handlers
setup_exception_handlers(app)

# Include API routes
app.include_router(api_router, prefix="/api")

@app.on_event("startup")
async def startup_event():
    """Initialize services on startup"""
    from app.core.redis_client import init_redis
    from app.core.supabase_client import init_supabase

    try:
        await init_redis()
        logger.info("Redis initialized successfully")
    except Exception as e:
        logger.warning("Redis unavailable, continuing without cache", error=str(e))

    try:
        init_supabase()
        logger.info("Supabase initialized successfully")
    except Exception as e:
        logger.warning("Supabase unavailable, continuing without it", error=str(e))

    # Initialize database — registers all SQLAlchemy models and resolves
    # foreign key relationships. Uses checkfirst=True so existing tables
    # are never dropped or recreated.
    try:
        from app.core.database import get_db, init_db
        from app.models.user import User
        from app.models.account import Account
        from app.models.holding import Holding
        from app.models.provider_token import ProviderToken
        from app.models.asset_mapping import AssetMapping
        from app.models.price import Price
        from app.models.subscription import Subscription
        from app.models.subscription_plan import SubscriptionPlan
        from app.models.subscription_history import SubscriptionHistory
        from app.models.subscription_override import SubscriptionOverride
        from app.models.payment_method import PaymentMethod
        from app.models.promo_code import PromoCode
        from app.models.transaction import Transaction
        from app.models.security import Security
        from app.models.investment_transaction import InvestmentTransaction
        try:
            from app.models.loan_calculation import LoanCalculation
            from app.models.loan_calculation_asset import LoanCalculationAsset
        except ImportError:
            pass
        # Worth It feature tables
        from app.models.worth_it_session import WorthItSession
        from app.models.worth_it_session_transaction import WorthItSessionTransaction
        from app.models.worth_it_rating import WorthItRating
        from app.models.worth_it_streak import WorthItStreak
        if get_db in app.dependency_overrides:
            logger.info("Database initialization skipped because get_db is overridden")
        else:
            await init_db()
            logger.info("Database initialized successfully")
    except Exception as e:
        logger.warning("Database initialization warning", error=str(e))

    # Pre-warm the macro snapshot in-memory cache (VIX, 10Y, Fed, CPI, unemployment).
    # Without this, the first Portfolio X-Ray load after every server restart pays
    # the full ~3-5s external API cost. Warming here means it's paid once at startup,
    # not on the first user request.
    try:
        from app.services.financial_analysis.macro_snapshot import fetch_live_macro_data
        await fetch_live_macro_data()
        logger.info("Macro snapshot cache warmed on startup")
    except Exception as e:
        logger.warning("Macro snapshot warm-up failed, will fetch on first request", error=str(e))

    logger.info("Application startup complete")

@app.on_event("shutdown")
async def shutdown_event():
    """Cleanup on shutdown"""
    from app.core.redis_client import close_redis
    from app.core.database import close_db

    await close_redis()
    await close_db()
    logger.info("Services shut down successfully")

@app.get("/")
async def root():
    """Health check endpoint"""
    return {
        "message": "Altrion API Server",
        "version": os.getenv("API_VERSION", "1.0.0"),
        "status": "running",
        "environment": settings.ENVIRONMENT,
    }

@app.get("/health")
async def health():
    """Detailed health check"""
    return {
        "status": "healthy",
        "version": os.getenv("API_VERSION","1.0.0"),
    }

@app.get("/health/ready")
async def readiness():
    """Readiness check for dependencies"""
    checks = {}
    status_code = status.HTTP_200_OK

    try:
        from app.core.database import engine
        async with engine.connect() as conn:
            await conn.execute(text("SELECT 1"))
        checks["database"] = "ok"
    except Exception as exc:
        checks["database"] = f"error: {exc}"
        status_code = status.HTTP_503_SERVICE_UNAVAILABLE

    try:
        from app.core.redis_client import get_redis
        redis = await get_redis()
        await redis.ping()
        checks["redis"] = "ok"
    except Exception as exc:
        checks["redis"] = f"error: {exc}"
        status_code = status.HTTP_503_SERVICE_UNAVAILABLE

    return JSONResponse(
        status_code=status_code,
        content={
            "status": "ready" if status_code == status.HTTP_200_OK else "degraded",
            "checks": checks,
        },
    )

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "app.main:app",
        host="0.0.0.0",
        port=settings.PORT,
        reload=settings.ENVIRONMENT == "development",
    )
