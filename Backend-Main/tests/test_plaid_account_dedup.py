from asyncio import gather
from datetime import datetime, timezone
from uuid import uuid4

import pytest
from sqlalchemy import func, select, text
from sqlalchemy.dialects import postgresql
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import sessionmaker

from app.models.account import Account
from app.models.holding import Holding
from app.models.transaction import Transaction
from app.models.user import User
from app.services.plaid_persist import upsert_accounts, upsert_plaid_account
from app.core.migrations import _collapse_duplicate_plaid_accounts


def test_plaid_upsert_conflict_predicate_uses_literal_provider():
    insert_stmt = pg_insert(Account).values(
        user_id=uuid4(),
        provider="plaid",
        item_id="item-1",
        provider_account_id="acc-1",
    )
    stmt = insert_stmt.on_conflict_do_update(
        index_elements=[
            Account.user_id,
            Account.provider,
            Account.item_id,
            Account.provider_account_id,
        ],
        index_where=text(
            "provider = 'plaid' AND is_active = TRUE AND item_id IS NOT NULL"
        ),
        set_={"name": insert_stmt.excluded.name},
    )

    compiled = str(stmt.compile(dialect=postgresql.dialect()))

    assert (
        "WHERE provider = 'plaid' AND is_active = TRUE AND item_id IS NOT NULL"
        in compiled
    )
    assert "provider_1" not in compiled


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("item_id", "provider_account_id", "message"),
    [
        ("", "acc-1", "non-empty item_id"),
        ("item-1", "", "non-empty provider_account_id"),
    ],
)
async def test_plaid_account_upsert_rejects_incomplete_identity(
    item_id, provider_account_id, message
):
    with pytest.raises(ValueError, match=message):
        await upsert_plaid_account(
            db=None,
            user_id=uuid4(),
            item_id=item_id,
            provider_account_id=provider_account_id,
            pa={},
        )


def _plaid_payload(name: str, balance: int, *, account_type: str = "depository") -> dict:
    return {
        "account_id": "acc-1",
        "name": name,
        "type": account_type,
        "subtype": "checking",
        "mask": "1234",
        "balances": {
            "available": balance,
            "current": balance,
            "limit": None,
            "iso_currency_code": "USD",
        },
    }


async def _create_user(db_session, *, suffix: str) -> User:
    user = User(
        supabase_user_id=f"supabase-user-{suffix}",
        email=f"{suffix}@example.com",
        name="Test User",
    )
    db_session.add(user)
    await db_session.commit()
    await db_session.refresh(user)
    return user


async def _count_accounts(db_session, *, user_id, provider="plaid"):
    stmt = select(func.count()).select_from(Account).where(
        Account.user_id == user_id,
        Account.provider == provider,
    )
    return int(await db_session.scalar(stmt))


@pytest.mark.asyncio
async def test_upsert_accounts_is_idempotent_for_same_plaid_item(db_session):
    user = await _create_user(db_session, suffix="same-item")

    first = await upsert_accounts(
        db=db_session,
        user_id=user.id,
        item_id="item-1",
        plaid_accounts=[_plaid_payload("Checking", 10)],
    )
    second = await upsert_accounts(
        db=db_session,
        user_id=user.id,
        item_id="item-1",
        plaid_accounts=[_plaid_payload("Checking", 20)],
    )

    assert len(first) == 1
    assert len(second) == 1
    assert await _count_accounts(db_session, user_id=user.id) == 1

    row = (
        await db_session.execute(
            select(Account).where(
                Account.user_id == user.id,
                Account.provider == "plaid",
                Account.item_id == "item-1",
                Account.provider_account_id == "acc-1",
            )
        )
    ).scalar_one()
    assert row.balance_current == 20
    assert row.balance_available == 20
    assert row.is_active is True


@pytest.mark.asyncio
async def test_upsert_accounts_allows_same_provider_account_id_across_items(db_session):
    user = await _create_user(db_session, suffix="across-items")

    await upsert_accounts(
        db=db_session,
        user_id=user.id,
        item_id="item-a",
        plaid_accounts=[_plaid_payload("Checking A", 10)],
    )
    await upsert_accounts(
        db=db_session,
        user_id=user.id,
        item_id="item-b",
        plaid_accounts=[_plaid_payload("Checking B", 25)],
    )

    assert await _count_accounts(db_session, user_id=user.id) == 2

    rows = (
        await db_session.execute(
            select(Account).where(
                Account.user_id == user.id,
                Account.provider == "plaid",
                Account.provider_account_id == "acc-1",
            )
        )
    ).scalars().all()
    assert {row.item_id for row in rows} == {"item-a", "item-b"}


@pytest.mark.asyncio
async def test_upsert_accounts_allows_same_provider_account_id_for_different_users(db_session):
    user_a = await _create_user(db_session, suffix="user-a")
    user_b = await _create_user(db_session, suffix="user-b")

    await upsert_accounts(
        db=db_session,
        user_id=user_a.id,
        item_id="item-shared",
        plaid_accounts=[_plaid_payload("Checking A", 10)],
    )
    await upsert_accounts(
        db=db_session,
        user_id=user_b.id,
        item_id="item-shared",
        plaid_accounts=[_plaid_payload("Checking B", 25)],
    )

    assert await _count_accounts(db_session, user_id=user_a.id) == 1
    assert await _count_accounts(db_session, user_id=user_b.id) == 1


@pytest.mark.asyncio
async def test_concurrent_plaid_upserts_do_not_create_duplicates(db_session, engine):
    user = await _create_user(db_session, suffix="concurrent")

    session_factory = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async def _worker(balance: int):
        async with session_factory() as session:
            await upsert_accounts(
                db=session,
                user_id=user.id,
                item_id="item-race",
                plaid_accounts=[_plaid_payload("Checking", balance)],
            )
            await session.commit()

    await gather(_worker(10), _worker(20))

    async with session_factory() as session:
        count = await session.scalar(
            select(func.count()).select_from(Account).where(
                Account.user_id == user.id,
                Account.provider == "plaid",
                Account.item_id == "item-race",
                Account.provider_account_id == "acc-1",
            )
        )
        row = (
            await session.execute(
                select(Account).where(
                    Account.user_id == user.id,
                    Account.provider == "plaid",
                    Account.item_id == "item-race",
                    Account.provider_account_id == "acc-1",
                )
            )
        ).scalar_one()

    assert int(count) == 1
    assert float(row.balance_current) in {10.0, 20.0}


@pytest.mark.asyncio
async def test_duplicate_legacy_plaid_accounts_are_collapsed_without_deleting_rows(db_session):
    user = await _create_user(db_session, suffix="legacy-dup")
    keeper_id = uuid4()
    duplicate_id = uuid4()
    now = datetime.now(timezone.utc)

    keeper = Account(
        id=keeper_id,
        user_id=user.id,
        provider="plaid",
        provider_account_id="legacy-acc",
        item_id=None,
        name="Keeper Checking",
        account_type="depository",
        subtype="checking",
        is_active=True,
        balance_current=100,
        balance_available=95,
        institution_id="inst-1",
        last_synced_at=now,
        updated_at=now,
    )
    duplicate = Account(
        id=duplicate_id,
        user_id=user.id,
        provider="plaid",
        provider_account_id="legacy-acc",
        item_id=None,
        name="Duplicate Checking",
        account_type="depository",
        subtype="checking",
        is_active=True,
        balance_current=None,
        balance_available=None,
        institution_id=None,
        last_synced_at=None,
        updated_at=now.replace(microsecond=0),
    )

    db_session.add_all(
        [
            keeper,
            duplicate,
            Transaction(
                user_id=user.id,
                account_id=duplicate_id,
                transaction_id="txn-1",
                amount=10,
                date=now.date(),
                name="Test Transaction",
                pending=False,
            ),
            Holding(
                user_id=user.id,
                account_id=duplicate_id,
                canonical_symbol="BTC",
                asset_class="crypto",
                quantity=1,
                source="plaid",
                retrieved_at=now,
            ),
        ]
    )
    await db_session.commit()

    conn = await db_session.connection()
    await _collapse_duplicate_plaid_accounts(conn)
    await db_session.commit()

    accounts = (
        await db_session.execute(
            select(Account).where(
                Account.user_id == user.id,
                Account.provider == "plaid",
                Account.provider_account_id == "legacy-acc",
            )
        )
    ).scalars().all()
    assert len(accounts) == 2
    assert sum(1 for account in accounts if account.is_active) == 1

    transaction = (
        await db_session.execute(
            select(Transaction).where(Transaction.transaction_id == "txn-1")
        )
    ).scalar_one()
    holding = (
        await db_session.execute(
            select(Holding).where(Holding.canonical_symbol == "BTC")
        )
    ).scalar_one()

    assert transaction.account_id == keeper_id
    assert holding.account_id == keeper_id
