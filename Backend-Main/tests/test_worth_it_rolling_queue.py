from datetime import date, datetime, timezone
from decimal import Decimal
from types import SimpleNamespace
from uuid import uuid4
from unittest.mock import AsyncMock

import pytest
from sqlalchemy import select

from app.services.worth_it import session_service
from app.services.worth_it import rating_service
from app.models.worth_it_rating import WorthItRatingValue
from app.models.worth_it_session import WorthItSessionStatus


class _FakeScalars:
    def __init__(self, rows):
        self._rows = rows

    def all(self):
        return self._rows


class _FakeResult:
    def __init__(self, rows):
        self._rows = rows

    def scalars(self):
        return _FakeScalars(self._rows)

    def scalar_one_or_none(self):
        if isinstance(self._rows, list):
            return self._rows[0] if self._rows else None
        return self._rows

    def scalar_one(self):
        return self._rows[0] if isinstance(self._rows, list) else self._rows


@pytest.mark.asyncio
async def test_load_reviewable_transactions_orders_newest_first_and_excludes_reviewed_ids():
    tx_newest = SimpleNamespace(
        transaction_id="tx-newest",
        merchant_name="Cafe Luna",
        name="Cafe Luna Latte",
        amount=Decimal("6.50"),
        date=date(2026, 6, 10),
        category_primary="FOOD_AND_DRINK",
        category_detailed=None,
        pending=False,
        created_at=datetime(2026, 6, 10, 12, 0, tzinfo=timezone.utc),
    )
    tx_next = SimpleNamespace(
        transaction_id="tx-next",
        merchant_name="Bookstore",
        name="Bookstore Purchase",
        amount=Decimal("22.00"),
        date=date(2026, 6, 9),
        category_primary="SHOPPING",
        category_detailed=None,
        pending=False,
        created_at=datetime(2026, 6, 9, 12, 0, tzinfo=timezone.utc),
    )
    captured_sql = {}

    async def _execute(stmt):
        captured_sql["sql"] = str(stmt.compile(compile_kwargs={"literal_binds": True}))
        return _FakeResult([tx_newest, tx_next])

    db = SimpleNamespace(execute=AsyncMock(side_effect=_execute))

    rows = await session_service._load_reviewable_transactions(
        uuid4(),
        db,
        reviewed_transaction_ids={"tx-reviewed"},
        limit=15,
    )

    sql = captured_sql["sql"].upper()
    assert "NOT IN" in sql
    assert "TX-REVIEWED" in sql
    assert [row["transaction_ref_id"] for row in rows] == ["tx-newest", "tx-next"]


@pytest.mark.asyncio
async def test_get_or_create_session_returns_empty_queue_when_no_new_transactions(monkeypatch):
    user = SimpleNamespace(id=uuid4())
    latest_session = SimpleNamespace(id=uuid4(), week_label="JUN 9-15")
    db = SimpleNamespace()

    monkeypatch.setattr(session_service, "_get_latest_session", AsyncMock(side_effect=[None, latest_session]))
    monkeypatch.setattr(session_service, "_load_reviewed_transaction_ids", AsyncMock(return_value=set()))
    monkeypatch.setattr(session_service, "_load_reviewable_transactions", AsyncMock(return_value=[]))
    monkeypatch.setattr(session_service, "_load_streak", AsyncMock(return_value=4))

    payload = await session_service.get_or_create_session(user, db)

    assert payload["session_id"] == str(latest_session.id)
    assert payload["transactions"] == []
    assert payload["ratings"] == {}
    assert payload["session_complete"] is True
    assert payload["session_skipped"] is False


@pytest.mark.asyncio
async def test_update_streak_keeps_same_week_streak_stable():
    streak_row = SimpleNamespace(
        user_id=uuid4(),
        current_streak=3,
        longest_streak=5,
        last_completed_week=date(2026, 6, 8),
        total_sessions_completed=8,
    )
    db = SimpleNamespace(execute=AsyncMock(return_value=_FakeResult(streak_row)), add=AsyncMock(), flush=AsyncMock())

    await rating_service._update_streak(streak_row.user_id, date(2026, 6, 8), db)

    assert streak_row.current_streak == 3
    assert streak_row.longest_streak == 5
    assert streak_row.last_completed_week == date(2026, 6, 8)
    assert streak_row.total_sessions_completed == 9
    db.flush.assert_awaited_once()


class _WorthItState:
    def __init__(self):
        self.session = SimpleNamespace(
            id=uuid4(),
            user_id=uuid4(),
            week_label="JUN 9-15",
            status=WorthItSessionStatus.ACTIVE,
            created_at=datetime(2026, 6, 10, 12, 0, tzinfo=timezone.utc),
            week_start=date(2026, 6, 9),
        )
        self.source_transactions = [
            {
                "transaction_ref_id": "tx-1",
                "merchant": "Merchant 1",
                "description": "Merchant 1 purchase",
                "amount": Decimal("10.00"),
                "category": "Food & Drink",
                "tx_date": date(2026, 6, 10),
                "initial": "M",
            },
            {
                "transaction_ref_id": "tx-2",
                "merchant": "Merchant 2",
                "description": "Merchant 2 purchase",
                "amount": Decimal("11.00"),
                "category": "Food & Drink",
                "tx_date": date(2026, 6, 11),
                "initial": "M",
            },
            {
                "transaction_ref_id": "tx-3",
                "merchant": "Merchant 3",
                "description": "Merchant 3 purchase",
                "amount": Decimal("12.00"),
                "category": "Food & Drink",
                "tx_date": date(2026, 6, 12),
                "initial": "M",
            },
        ]
        self.snapshot_transactions = []
        self.ratings = {}
        self.rating_rows = []
        self.streak = 4


class _WorthItDb:
    def __init__(self, state: _WorthItState):
        self.state = state
        self.execute = AsyncMock(side_effect=self._execute)
        self.added = []

    def add(self, obj):
        self.added.append(obj)
        if obj.__class__.__name__ == "WorthItSession":
            if getattr(obj, "id", None) is None:
                obj.id = uuid4()
            self.state.session = obj
        elif obj.__class__.__name__ == "WorthItSessionTransaction":
            if getattr(obj, "id", None) is None:
                obj.id = uuid4()
            self.state.snapshot_transactions.append(obj)
        elif obj.__class__.__name__ == "WorthItRating":
            if getattr(obj, "id", None) is None:
                obj.id = uuid4()
            self.state.rating_rows.append(obj)
            self.state.ratings[obj.transaction_ref_id] = obj.rating.value
        elif obj.__class__.__name__ == "WorthItStreak":
            if getattr(obj, "id", None) is None:
                obj.id = uuid4()
            self.state.streak = obj.current_streak

    async def flush(self):
        return None

    async def commit(self):
        return None

    async def _execute(self, stmt):
        sql = str(stmt.compile(compile_kwargs={"literal_binds": True})).lower()
        if "from public.worth_it_ratings" in sql and "transaction_ref_id" in sql and "count" not in sql:
            match = next((row for row in self.state.rating_rows if row.session_id == self.state.session.id and row.transaction_ref_id == "tx-1"), None)
            return _FakeResult(match)
        if "from public.worth_it_session_transactions" in sql and "count" in sql:
            return _FakeResult(len(self.state.snapshot_transactions))
        if "from public.worth_it_ratings" in sql and "count" in sql:
            return _FakeResult(len(self.state.rating_rows))
        if "from public.worth_it_streak" in sql:
            streak = SimpleNamespace(
                user_id=self.state.session.user_id,
                current_streak=self.state.streak,
                longest_streak=max(self.state.streak, 4),
                last_completed_week=self.state.session.week_start,
                total_sessions_completed=9,
            )
            return _FakeResult(streak)
        return _FakeResult(None)


def _build_stateful_test_context():
    state = _WorthItState()
    user = SimpleNamespace(id=state.session.user_id)
    db = _WorthItDb(state)
    state.session.user_id = user.id
    return state, user, db


@pytest.mark.asyncio
async def test_rating_persists_and_reload_excludes_reviewed_transaction(monkeypatch):
    state, user, db = _build_stateful_test_context()
    get_latest_calls = {"count": 0}

    async def _fake_get_latest_session(user_id, _db, status=None):
        get_latest_calls["count"] += 1
        return None if get_latest_calls["count"] == 1 else state.session

    async def _fake_load_reviewed_transaction_ids(_user_id, _db):
        return set(state.ratings.keys())

    async def _fake_load_reviewable_transactions(_user_id, _db, reviewed_transaction_ids, limit):
        return [row for row in state.source_transactions if row["transaction_ref_id"] not in reviewed_transaction_ids][:limit]

    async def _fake_load_streak(_user_id, _db):
        return state.streak

    async def _fake_serialize_session(session, user_id, _db):
        visible = [tx for tx in state.snapshot_transactions if tx.transaction_ref_id not in state.ratings]
        return {
            "session_id": str(session.id),
            "week_label": session.week_label,
            "transactions": [
                {
                    "id": tx.transaction_ref_id,
                    "merchant": tx.merchant,
                    "description": tx.description,
                    "amount": float(tx.amount),
                    "category": tx.category,
                    "date": tx.tx_date.strftime("%b %d, %Y"),
                    "initial": tx.initial,
                }
                for tx in visible
            ],
            "ratings": dict(state.ratings),
            "streak": state.streak,
            "session_complete": len(state.ratings) >= len(state.snapshot_transactions),
            "session_skipped": False,
        }

    monkeypatch.setattr(session_service, "_get_latest_session", _fake_get_latest_session)
    monkeypatch.setattr(session_service, "_load_reviewed_transaction_ids", _fake_load_reviewed_transaction_ids)
    monkeypatch.setattr(session_service, "_load_reviewable_transactions", _fake_load_reviewable_transactions)
    monkeypatch.setattr(session_service, "_load_streak", _fake_load_streak)
    monkeypatch.setattr(session_service, "_serialize_session", _fake_serialize_session)
    monkeypatch.setattr(rating_service, "_get_active_session", AsyncMock(return_value=state.session))
    monkeypatch.setattr(rating_service, "_update_streak", AsyncMock())

    session_payload = await session_service.get_or_create_session(user, db)
    assert [tx["id"] for tx in session_payload["transactions"]] == ["tx-1", "tx-2", "tx-3"]

    first = session_payload["transactions"][0]
    result = await rating_service.rate_transaction(
        user=user,
        transaction_id=first["id"],
        rating="keep",
        merchant=first["merchant"],
        description=first["description"],
        amount=first["amount"],
        category=first["category"],
        db=db,
    )

    assert result["success"] is True
    assert state.ratings[first["id"]] == WorthItRatingValue.KEEP.value
    assert db.added[-1].transaction_ref_id == first["id"]

    reload_payload = await session_service.get_or_create_session(user, db)
    assert first["id"] not in [tx["id"] for tx in reload_payload["transactions"]]
    assert reload_payload["ratings"][first["id"]] == WorthItRatingValue.KEEP.value


@pytest.mark.asyncio
async def test_skip_rating_persists_and_excludes_transaction_on_reload(monkeypatch):
    state, user, db = _build_stateful_test_context()
    get_latest_calls = {"count": 0}

    async def _fake_get_latest_session(user_id, _db, status=None):
        get_latest_calls["count"] += 1
        return None if get_latest_calls["count"] == 1 else state.session

    async def _fake_load_reviewed_transaction_ids(_user_id, _db):
        return set(state.ratings.keys())

    async def _fake_load_reviewable_transactions(_user_id, _db, reviewed_transaction_ids, limit):
        return [row for row in state.source_transactions if row["transaction_ref_id"] not in reviewed_transaction_ids][:limit]

    async def _fake_load_streak(_user_id, _db):
        return state.streak

    async def _fake_serialize_session(session, user_id, _db):
        visible = [tx for tx in state.snapshot_transactions if tx.transaction_ref_id not in state.ratings]
        return {
            "session_id": str(session.id),
            "week_label": session.week_label,
            "transactions": [
                {
                    "id": tx.transaction_ref_id,
                    "merchant": tx.merchant,
                    "description": tx.description,
                    "amount": float(tx.amount),
                    "category": tx.category,
                    "date": tx.tx_date.strftime("%b %d, %Y"),
                    "initial": tx.initial,
                }
                for tx in visible
            ],
            "ratings": dict(state.ratings),
            "streak": state.streak,
            "session_complete": len(state.ratings) >= len(state.snapshot_transactions),
            "session_skipped": False,
        }

    monkeypatch.setattr(session_service, "_get_latest_session", _fake_get_latest_session)
    monkeypatch.setattr(session_service, "_load_reviewed_transaction_ids", _fake_load_reviewed_transaction_ids)
    monkeypatch.setattr(session_service, "_load_reviewable_transactions", _fake_load_reviewable_transactions)
    monkeypatch.setattr(session_service, "_load_streak", _fake_load_streak)
    monkeypatch.setattr(session_service, "_serialize_session", _fake_serialize_session)
    monkeypatch.setattr(rating_service, "_get_active_session", AsyncMock(return_value=state.session))
    monkeypatch.setattr(rating_service, "_update_streak", AsyncMock())

    session_payload = await session_service.get_or_create_session(user, db)
    first = session_payload["transactions"][0]

    await rating_service.rate_transaction(
        user=user,
        transaction_id=first["id"],
        rating="skip",
        merchant=first["merchant"],
        description=first["description"],
        amount=first["amount"],
        category=first["category"],
        db=db,
    )

    reload_payload = await session_service.get_or_create_session(user, db)
    assert first["id"] not in [tx["id"] for tx in reload_payload["transactions"]]
    assert reload_payload["ratings"][first["id"]] == WorthItRatingValue.SKIP.value


@pytest.mark.asyncio
async def test_rating_transaction_id_matches_snapshot_transaction_ref_id(monkeypatch):
    state, user, db = _build_stateful_test_context()
    get_latest_calls = {"count": 0}

    async def _fake_get_latest_session(user_id, _db, status=None):
        get_latest_calls["count"] += 1
        return None if get_latest_calls["count"] == 1 else state.session

    async def _fake_load_reviewed_transaction_ids(_user_id, _db):
        return set(state.ratings.keys())

    async def _fake_load_reviewable_transactions(_user_id, _db, reviewed_transaction_ids, limit):
        return [row for row in state.source_transactions if row["transaction_ref_id"] not in reviewed_transaction_ids][:limit]

    async def _fake_load_streak(_user_id, _db):
        return state.streak

    async def _fake_serialize_session(session, user_id, _db):
        visible = [tx for tx in state.snapshot_transactions if tx.transaction_ref_id not in state.ratings]
        return {
            "session_id": str(session.id),
            "week_label": session.week_label,
            "transactions": [
                {
                    "id": tx.transaction_ref_id,
                    "merchant": tx.merchant,
                    "description": tx.description,
                    "amount": float(tx.amount),
                    "category": tx.category,
                    "date": tx.tx_date.strftime("%b %d, %Y"),
                    "initial": tx.initial,
                }
                for tx in visible
            ],
            "ratings": dict(state.ratings),
            "streak": state.streak,
            "session_complete": len(state.ratings) >= len(state.snapshot_transactions),
            "session_skipped": False,
        }

    monkeypatch.setattr(session_service, "_get_latest_session", _fake_get_latest_session)
    monkeypatch.setattr(session_service, "_load_reviewed_transaction_ids", _fake_load_reviewed_transaction_ids)
    monkeypatch.setattr(session_service, "_load_reviewable_transactions", _fake_load_reviewable_transactions)
    monkeypatch.setattr(session_service, "_load_streak", _fake_load_streak)
    monkeypatch.setattr(session_service, "_serialize_session", _fake_serialize_session)
    monkeypatch.setattr(rating_service, "_get_active_session", AsyncMock(return_value=state.session))
    monkeypatch.setattr(rating_service, "_update_streak", AsyncMock())

    session_payload = await session_service.get_or_create_session(user, db)
    first = session_payload["transactions"][0]

    await rating_service.rate_transaction(
        user=user,
        transaction_id=first["id"],
        rating="cut",
        merchant=first["merchant"],
        description=first["description"],
        amount=first["amount"],
        category=first["category"],
        db=db,
    )

    assert state.rating_rows[-1].transaction_ref_id == first["id"]
    assert state.rating_rows[-1].rating == WorthItRatingValue.CUT


@pytest.mark.asyncio
async def test_get_or_create_session_dedupes_duplicate_snapshot_transactions(monkeypatch):
    state, user, db = _build_stateful_test_context()
    duplicate_row = dict(state.source_transactions[0])
    state.source_transactions = [
        state.source_transactions[0],
        duplicate_row,
        state.source_transactions[1],
    ]
    get_latest_calls = {"count": 0}

    async def _fake_get_latest_session(user_id, _db, status=None):
        get_latest_calls["count"] += 1
        return None if get_latest_calls["count"] == 1 else state.session

    async def _fake_load_reviewed_transaction_ids(_user_id, _db):
        return set()

    async def _fake_load_reviewable_transactions(_user_id, _db, reviewed_transaction_ids, limit):
        return state.source_transactions[:limit]

    async def _fake_load_streak(_user_id, _db):
        return state.streak

    async def _fake_serialize_session(session, user_id, _db):
        visible = []
        seen = set()
        for tx in state.snapshot_transactions:
            if tx.transaction_ref_id in seen:
                continue
            seen.add(tx.transaction_ref_id)
            visible.append(tx)
        return {
            "session_id": str(session.id),
            "week_label": session.week_label,
            "transactions": [
                {
                    "id": tx.transaction_ref_id,
                    "merchant": tx.merchant,
                    "description": tx.description,
                    "amount": float(tx.amount),
                    "category": tx.category,
                    "date": tx.tx_date.strftime("%b %d, %Y"),
                    "initial": tx.initial,
                }
                for tx in visible
            ],
            "ratings": dict(state.ratings),
            "streak": state.streak,
            "session_complete": len(state.ratings) >= len(visible),
            "session_skipped": False,
        }

    monkeypatch.setattr(session_service, "_get_latest_session", _fake_get_latest_session)
    monkeypatch.setattr(session_service, "_load_reviewed_transaction_ids", _fake_load_reviewed_transaction_ids)
    monkeypatch.setattr(session_service, "_load_reviewable_transactions", _fake_load_reviewable_transactions)
    monkeypatch.setattr(session_service, "_load_streak", _fake_load_streak)
    monkeypatch.setattr(session_service, "_serialize_session", _fake_serialize_session)
    monkeypatch.setattr(rating_service, "_get_active_session", AsyncMock(return_value=state.session))

    session_payload = await session_service.get_or_create_session(user, db)

    assert len(session_payload["transactions"]) == 2
    assert [tx["id"] for tx in session_payload["transactions"]] == ["tx-1", "tx-2"]
    assert [tx.transaction_ref_id for tx in state.snapshot_transactions] == ["tx-1", "tx-2"]
