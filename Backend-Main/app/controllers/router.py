"""
API v1 router
"""
from fastapi import APIRouter

from app.controllers import analysis, auth, budget, engagement, loan, payments, plaid, platforms, portfolio, subscription, webhooks
from app.controllers import worth_it

api_router = APIRouter()

api_router.include_router(auth.router, prefix="/auth", tags=["auth"])
api_router.include_router(platforms.router, prefix="/platforms", tags=["platforms"])
api_router.include_router(portfolio.router, prefix="/portfolio", tags=["portfolio"])
api_router.include_router(plaid.router, prefix="/plaid", tags=["plaid"])
api_router.include_router(subscription.router, tags=["subscriptions"])
api_router.include_router(webhooks.router, tags=["webhooks"])
api_router.include_router(loan.router, tags=["loan"])
api_router.include_router(payments.router, tags=["payments"])
api_router.include_router(budget.router, prefix="/budget", tags=["budget"])
api_router.include_router(analysis.router, prefix="/analysis", tags=["analysis"])
api_router.include_router(engagement.router, tags=["engagement"])
api_router.include_router(worth_it.router, prefix="/worth-it", tags=["worth-it"])
