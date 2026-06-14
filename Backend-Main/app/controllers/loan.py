"""
Loan calculation endpoints — crypto-backed loan calculator.
Merged from aetherum_v2_2 microservice.
"""
import time

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.logging import get_logger, timing_log
from app.core.database import get_db
from app.core.auth import get_current_user
from app.domain.errors import AppError
from app.models.user import User
from app.services.loan.dto import (
    LoanAnalyticsSummaryDTO,
    LoanCalculateRequestDTO,
    LoanCalculateResponseDTO,
)
from app.services.loan.service import loan_service

logger = get_logger()

router = APIRouter(prefix="/loan", tags=["loan"])


async def _get_local_user(db: AsyncSession, current_user: dict) -> User:
    stmt = select(User).where(User.supabase_user_id == current_user["user_id"])
    result = await db.execute(stmt)
    user = result.scalar_one_or_none()

    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        )

    return user


@router.post("/calculate", response_model=LoanCalculateResponseDTO)
async def loan_calculate(
    payload: LoanCalculateRequestDTO,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """
    Calculate crypto-backed loan terms.

    Takes a list of collateral assets with USD allocations,
    classifies risk tiers via AI, computes LTV/interest/amortization,
    and returns a full loan profile with analyst summary.
    """
    t0 = time.perf_counter()
    symbols = [a.symbol.upper() for a in payload.assets]
    total_collateral = sum(float(a.allocation_usd or 0) for a in payload.assets)
    request_id = getattr(request.state, "request_id", None)
    user = await _get_local_user(db, current_user)

    logger.info(
        "loan_calculate_request",
        symbols=symbols,
        asset_count=len(payload.assets),
        months=payload.months,
        total_collateral_usd=total_collateral,
        payout_currency=payload.payout_currency,
        payout_method=payload.payout_method,
        user_id=str(user.id),
        client_ip=request.client.host if request.client else None,
        request_id=request_id,
    )

    try:
        context = {
            "client_ip": request.client.host if request.client else None,
            "user_agent": request.headers.get("user-agent"),
            "request_id": request_id,
            "user_id": user.id,
            "metadata_json": {
                "path": str(request.url.path),
                "method": request.method,
                "supabase_user_id": current_user["user_id"],
            },
        }
        result = await loan_service.calculate(payload, db=db, context=context)

        elapsed_ms = int((time.perf_counter() - t0) * 1000)
        logger.info(
            "loan_calculate_success",
            symbols=symbols,
            asset_count=len(payload.assets),
            months=payload.months,
            total_collateral_usd=total_collateral,
            total_loan_usd=result.summary.get("total_loan"),
            portfolio_ltv=result.summary.get("portfolio_ltv"),
            interest_rate=result.summary.get("interest_rate"),
            monthly_emi=result.summary.get("monthly_emi"),
            calculation_id=result.calculation_id,
            duration_ms=elapsed_ms,
            request_id=request_id,
        )
        timing_log(
            endpoint="LOAN_CALCULATE",
            step="complete",
            duration_ms=elapsed_ms,
            module="controllers/loan.py",
            is_complete=True,
        )
        return result
    except AppError as exc:
        elapsed_ms = int((time.perf_counter() - t0) * 1000)
        logger.warning(
            "loan_calculate_app_error",
            error=exc.message,
            status_code=exc.status_code,
            symbols=symbols,
            duration_ms=elapsed_ms,
            request_id=request_id,
        )
        raise HTTPException(status_code=exc.status_code, detail=exc.message) from exc
    except Exception as exc:
        elapsed_ms = int((time.perf_counter() - t0) * 1000)
        logger.error(
            "loan_calculate_failed",
            error=str(exc),
            symbols=symbols,
            months=payload.months,
            duration_ms=elapsed_ms,
            request_id=request_id,
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Loan calculation failed",
        ) from exc


@router.get("/analytics/summary", response_model=LoanAnalyticsSummaryDTO)
async def loan_analytics_summary(
    days: int = Query(default=30, ge=1, le=365),
    db: AsyncSession = Depends(get_db),
):
    """
    Aggregate analytics over persisted loan calculation telemetry.
    """
    t0 = time.perf_counter()
    logger.info("loan_analytics_request", days=days)

    try:
        result = await loan_service.get_analytics_summary(db=db, days=days)

        elapsed_ms = int((time.perf_counter() - t0) * 1000)
        logger.info(
            "loan_analytics_success",
            days=days,
            total_requests=result.total_requests,
            total_collateral_usd=result.total_collateral_usd,
            total_loan_usd=result.total_loan_usd,
            top_symbols_count=len(result.top_symbols),
            duration_ms=elapsed_ms,
        )
        timing_log(
            endpoint="LOAN_ANALYTICS",
            step="complete",
            duration_ms=elapsed_ms,
            module="controllers/loan.py",
            is_complete=True,
        )
        return result
    except AppError as exc:
        elapsed_ms = int((time.perf_counter() - t0) * 1000)
        logger.warning(
            "loan_analytics_app_error",
            error=exc.message,
            days=days,
            duration_ms=elapsed_ms,
        )
        raise HTTPException(status_code=exc.status_code, detail=exc.message) from exc
    except Exception as exc:
        elapsed_ms = int((time.perf_counter() - t0) * 1000)
        logger.error(
            "loan_analytics_summary_failed",
            error=str(exc),
            days=days,
            duration_ms=elapsed_ms,
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Loan analytics summary failed",
        ) from exc
