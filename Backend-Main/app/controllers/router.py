"""
API v1 router
"""
from fastapi import APIRouter

from app.controllers import auth, platforms, portfolio, plaid

api_router = APIRouter()

api_router.include_router(auth.router, prefix="/auth", tags=["auth"])
api_router.include_router(platforms.router, prefix="/platforms", tags=["platforms"])
api_router.include_router(portfolio.router, prefix="/portfolio", tags=["portfolio"])
api_router.include_router(plaid.router, prefix="/plaid", tags=["plaid"])
