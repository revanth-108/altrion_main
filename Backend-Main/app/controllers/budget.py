"""
Budget controller — handles GET /budget, POST /budget/allocations, and DELETE /budget/allocations/{id}.

Follows the exact patterns of portfolio.py:
  - router = APIRouter() at module level (prefix applied in router.py)
  - Depends(get_authenticated_user) + Depends(get_db) on every endpoint
  - Async SQLAlchemy selects: select(Model).where(...) → await db.execute(...)
  - get_logger() for structured logging
  - HTTPException for user-facing errors
  - await db.commit() called explicitly after mutations
"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from decimal import Decimal

from app.core.database import get_db
from app.core.auth import get_current_user as get_authenticated_user
from app.core.logging import get_logger
from app.models.user import User
from app.models.account import Account
from app.models.recurring_stream import RecurringStream
from app.models.budget_allocation import BudgetAllocation
from app.schemas.budget import (
    BudgetResponse,
    IncomeSourceSchema,
    BankAccountSchema,
    OutflowCategorySchema,
    AllocationSchema,
    AllocationCreateSchema,
)

logger = get_logger()

router = APIRouter()


# ---------------------------------------------------------------------------
# Helper — resolve the internal User row from the Supabase auth token.
# Same pattern used in portfolio.py and every other controller.
# ---------------------------------------------------------------------------
async def _get_user(current_user: dict, db: AsyncSession) -> User:
    user_id = current_user["user_id"]
    stmt = select(User).where(User.supabase_user_id == user_id)
    result = await db.execute(stmt)
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user


# ---------------------------------------------------------------------------
# GET /budget
# Returns all data needed to render the budget canvas:
#   - income_sources   — active inflow streams (recurring income)
#   - bank_accounts    — active depository accounts (checking/savings)
#   - outflow_categories — active outflow streams (recurring bills)
#   - allocations      — user-saved allocation edges between nodes
# ---------------------------------------------------------------------------

@router.get("", response_model=BudgetResponse)
async def get_budget(
    current_user: dict = Depends(get_authenticated_user),
    db: AsyncSession = Depends(get_db),
):
    """Return all budget canvas data for the authenticated user."""
    user = await _get_user(current_user, db)

    # ------------------------------------------------------------------
    # 1. Fetch active recurring streams.
    #    Both inflow and outflow are loaded in one query and split below.
    #    is_active=True excludes tombstoned or manually disabled streams.
    # ------------------------------------------------------------------
    streams_stmt = (
        select(RecurringStream)
        .where(RecurringStream.user_id == user.id, RecurringStream.is_active == True)
    )
    streams_result = await db.execute(streams_stmt)
    streams = streams_result.scalars().all()

    income_sources = []
    outflow_categories = []

    for s in streams:
        # Use description first; fall back to merchant_name for the label
        label = s.description or s.merchant_name or s.stream_id

        # Plaid returns inflow amounts as negative numbers; take abs() so
        # the UI always shows positive dollar values regardless of direction.
        amount = abs(s.average_amount) if s.average_amount is not None else Decimal("0")

        if s.stream_type == "inflow":
            # Income node — canvas ID convention: "income-<stream_id>"
            income_sources.append(IncomeSourceSchema(
                id=f"income-{s.stream_id}",
                label=label,
                amount=amount,
                frequency=s.frequency,
                stream_id=s.stream_id,
            ))
        elif s.stream_type == "outflow":
            # Outflow node — canvas ID convention: "outflow-<stream_id>"
            outflow_categories.append(OutflowCategorySchema(
                id=f"outflow-{s.stream_id}",
                label=label,
                due=amount,
                frequency=s.frequency,
                stream_id=s.stream_id,
            ))

    logger.debug(
        "budget_streams_loaded",
        user_id=str(user.id),
        inflow_count=len(income_sources),
        outflow_count=len(outflow_categories),
    )

    # ------------------------------------------------------------------
    # 2. Fetch active depository accounts (checking + savings).
    #    These are the "bank node" middle layer in the budget canvas.
    #    account_type == 'depository' covers both checking and savings.
    #    balance_current is the posted balance; fall back to 0 if not yet synced.
    # ------------------------------------------------------------------
    accounts_stmt = (
        select(Account)
        .where(
            Account.user_id == user.id,
            Account.is_active == True,
            Account.account_type == "depository",
        )
    )
    accounts_result = await db.execute(accounts_stmt)
    accounts = accounts_result.scalars().all()

    bank_accounts = []
    for acct in accounts:
        # Build a readable label: account name + masked number if available
        label = acct.name or "Account"
        if acct.mask:
            label = f"{label} ••{acct.mask}"

        # Bank node — canvas ID convention: "bank-<account.id>"
        bank_accounts.append(BankAccountSchema(
            id=f"bank-{acct.id}",
            label=label,
            institution=acct.institution_name,
            balance=acct.balance_current if acct.balance_current is not None else Decimal("0"),
            subtype=acct.subtype,
        ))

    logger.debug(
        "budget_accounts_loaded",
        user_id=str(user.id),
        account_count=len(bank_accounts),
    )

    # ------------------------------------------------------------------
    # 3. Fetch active allocation edges saved by the user.
    #    These are the arrows drawn on the budget canvas connecting
    #    income → bank → outflow nodes.
    # ------------------------------------------------------------------
    alloc_stmt = (
        select(BudgetAllocation)
        .where(
            BudgetAllocation.user_id == user.id,
            BudgetAllocation.is_active == True,
        )
    )
    alloc_result = await db.execute(alloc_stmt)
    allocations_rows = alloc_result.scalars().all()

    allocations = [
        AllocationSchema(
            id=a.id,
            source_id=a.source_id,
            target_id=a.target_id,
            allocation_type=a.allocation_type,
            amount=a.amount,
            note=a.note,
            due_date=a.due_date,
        )
        for a in allocations_rows
    ]

    return BudgetResponse(
        income_sources=income_sources,
        bank_accounts=bank_accounts,
        outflow_categories=outflow_categories,
        allocations=allocations,
    )


# ---------------------------------------------------------------------------
# POST /budget/allocations
# Upsert a single allocation edge between two canvas nodes.
#
# Upsert logic:
#   1. Query budget_allocations for an existing row matching
#      (user_id, source_id, target_id).
#   2. If found: update amount, note, due_date, allocation_type, is_active=True.
#   3. If not found: insert a new row.
#   4. Commit and return the saved AllocationSchema.
#
# We do not use Postgres ON CONFLICT here because SQLAlchemy async doesn't
# expose dialect-specific upsert in a portable way. The explicit select+update
# pattern is easier to read, test, and reason about.
# ---------------------------------------------------------------------------

@router.post("/allocations", response_model=AllocationSchema, status_code=status.HTTP_200_OK)
async def upsert_allocation(
    body: AllocationCreateSchema,
    current_user: dict = Depends(get_authenticated_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Create or update a budget allocation edge.
    If an allocation between the same (source_id, target_id) already exists
    for this user, its amount, note, due_date, and type are updated in place.
    """
    user = await _get_user(current_user, db)

    # Step 1: Check for an existing allocation on this (user, source→target) edge
    existing_stmt = (
        select(BudgetAllocation)
        .where(
            BudgetAllocation.user_id == user.id,
            BudgetAllocation.source_id == body.source_id,
            BudgetAllocation.target_id == body.target_id,
        )
    )
    existing_result = await db.execute(existing_stmt)
    existing = existing_result.scalar_one_or_none()

    if existing:
        # Step 2a: Row found — update it in place
        existing.allocation_type = body.allocation_type
        existing.amount = body.amount
        existing.note = body.note
        existing.due_date = body.due_date
        existing.is_active = True  # Re-activate if it was soft-deleted
        allocation = existing
        logger.info(
            "budget_allocation_updated",
            user_id=str(user.id),
            allocation_id=allocation.id,
            source_id=body.source_id,
            target_id=body.target_id,
        )
    else:
        # Step 2b: No existing row — insert a new allocation edge
        allocation = BudgetAllocation(
            user_id=user.id,
            source_id=body.source_id,
            target_id=body.target_id,
            allocation_type=body.allocation_type,
            amount=body.amount,
            note=body.note,
            due_date=body.due_date,
        )
        db.add(allocation)
        # Flush so the DB assigns the autoincrement id before we read it back
        await db.flush()
        logger.info(
            "budget_allocation_created",
            user_id=str(user.id),
            allocation_id=allocation.id,
            source_id=body.source_id,
            target_id=body.target_id,
        )

    # Step 3: Persist — explicit commit follows portfolio.py convention
    await db.commit()

    return AllocationSchema(
        id=allocation.id,
        source_id=allocation.source_id,
        target_id=allocation.target_id,
        allocation_type=allocation.allocation_type,
        amount=allocation.amount,
        note=allocation.note,
        due_date=allocation.due_date,
    )


# ---------------------------------------------------------------------------
# DELETE /budget/allocations/{allocation_id}
# Soft-delete a single allocation edge by setting is_active = False.
#
# We deliberately do NOT hard-delete the row so that:
#   - Audit history is preserved (the row still exists in the DB).
#   - A future re-draw of the same edge will hit the upsert path in POST
#     and reactivate the row rather than creating a duplicate.
# ---------------------------------------------------------------------------

@router.delete("/allocations/{allocation_id}", status_code=status.HTTP_200_OK)
async def delete_allocation(
    allocation_id: int,
    current_user: dict = Depends(get_authenticated_user),
    db: AsyncSession = Depends(get_db),
):
    """Soft-delete a budget allocation edge (sets is_active = False)."""
    user = await _get_user(current_user, db)

    # Fetch the allocation, ensuring it belongs to the current user.
    stmt = (
        select(BudgetAllocation)
        .where(
            BudgetAllocation.id == allocation_id,
            BudgetAllocation.user_id == user.id,
        )
    )
    result = await db.execute(stmt)
    allocation = result.scalar_one_or_none()

    if not allocation:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Allocation not found",
        )

    # Soft delete: mark inactive rather than removing the row.
    allocation.is_active = False
    await db.commit()

    logger.info(
        "budget_allocation_deleted",
        user_id=str(user.id),
        allocation_id=allocation_id,
    )

    return {"success": True}
