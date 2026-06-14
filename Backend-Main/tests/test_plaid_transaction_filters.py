from datetime import date
from types import SimpleNamespace
from uuid import uuid4
from unittest.mock import AsyncMock

import pytest

from app.controllers.plaid import get_transactions


class _FakeUserResult:
    def __init__(self, user):
        self._user = user

    def scalar_one_or_none(self):
        return self._user


class _FakeCountResult:
    def scalar(self):
        return 1


class _FakeTransactionScalars:
    def __init__(self, rows):
        self._rows = rows

    def all(self):
        return self._rows


class _FakeTransactionResult:
    def __init__(self, rows):
        self._rows = rows

    def scalars(self):
        return _FakeTransactionScalars(self._rows)


class _FakeAccountResult:
    def __init__(self, rows):
        self._rows = rows

    def scalars(self):
        return self

    def all(self):
        return self._rows


class _FakeAccountIdsResult:
    def __init__(self, rows):
        self._rows = rows

    def all(self):
        return self._rows


@pytest.mark.asyncio
async def test_get_transactions_filters_out_inactive_accounts():
    user = SimpleNamespace(id=uuid4(), supabase_user_id="supabase-user-1")
    account_id = uuid4()
    transaction = SimpleNamespace(
        id=uuid4(),
        account_id=account_id,
        transaction_id="txn-1",
        amount=12.34,
        date=date(2026, 1, 1),
        authorized_date=None,
        name="Coffee Shop",
        merchant_name="Coffee Shop",
        pending=False,
        category_primary="FOOD_AND_DRINK",
        category_detailed="Coffee Shop",
        payment_channel="in store",
        logo_url=None,
    )
    account = SimpleNamespace(
        id=account_id,
        name="Checking",
        mask="1234",
        institution_name="Test Bank",
    )
    statements = []

    class _FakeDB:
        def __init__(self):
            self.execute = AsyncMock(side_effect=self._execute)

        async def _execute(self, stmt):
            statements.append(str(stmt).lower())
            if len(statements) == 1:
                return _FakeUserResult(user)
            if len(statements) == 2:
                return _FakeAccountIdsResult([(account_id,)])
            if len(statements) == 3:
                return _FakeCountResult()
            if len(statements) == 4:
                return _FakeTransactionResult([transaction])
            return _FakeAccountResult([account])

    db = _FakeDB()
    result = await get_transactions(
        item_id="item-a",
        account_id=None,
        start_date=None,
        end_date=None,
        count=100,
        offset=0,
        current_user={"user_id": "supabase-user-1"},
        db=db,
    )

    assert result["success"] is True
    assert result["total_transactions"] == 1
    assert any("accounts.is_active = true" in stmt for stmt in statements)
