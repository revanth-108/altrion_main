from datetime import datetime, timezone, date, timedelta
from decimal import Decimal
from types import SimpleNamespace
from uuid import uuid4
from unittest.mock import AsyncMock

import pytest

from app.models.worth_it_rating import WorthItRatingValue
from app.models.worth_it_session import WorthItSessionStatus
from app.services.worth_it import insights_service


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

    def all(self):
        return self._rows

    def scalar_one_or_none(self):
        if isinstance(self._rows, list):
            return self._rows[0] if self._rows else None
        return self._rows


@pytest.mark.asyncio
async def test_get_session_insights_builds_transaction_level_summary(monkeypatch):
    user = SimpleNamespace(id=uuid4())
    session = SimpleNamespace(id=uuid4(), user_id=user.id, week_label='JUN 9-15')
    txs = [
        SimpleNamespace(
            transaction_ref_id='tx-1',
            merchant='Grocer',
            description='Weekly groceries',
            amount=Decimal('45.00'),
            category='Food & Drink',
            tx_date=date(2026, 6, 10),
            initial='G',
            position=0,
        ),
        SimpleNamespace(
            transaction_ref_id='tx-2',
            merchant='Rideshare',
            description='Ride home',
            amount=Decimal('18.00'),
            category='Transport',
            tx_date=date(2026, 6, 11),
            initial='R',
            position=1,
        ),
        SimpleNamespace(
            transaction_ref_id='tx-3',
            merchant='Cafe',
            description='Coffee run',
            amount=Decimal('8.00'),
            category='Food & Drink',
            tx_date=date(2026, 6, 12),
            initial='C',
            position=2,
        ),
        SimpleNamespace(
            transaction_ref_id='tx-4',
            merchant='Flight',
            description='Weekend flight',
            amount=Decimal('220.00'),
            category='Travel',
            tx_date=date(2026, 6, 13),
            initial='F',
            position=3,
        ),
    ]
    ratings = [
        SimpleNamespace(transaction_ref_id='tx-1', rating=WorthItRatingValue.KEEP, merchant='Grocer', category='Food & Drink', amount=Decimal('45.00')),
        SimpleNamespace(transaction_ref_id='tx-2', rating=WorthItRatingValue.CUT, merchant='Rideshare', category='Transport', amount=Decimal('18.00')),
        SimpleNamespace(transaction_ref_id='tx-3', rating=WorthItRatingValue.SKIP, merchant='Cafe', category='Food & Drink', amount=Decimal('8.00')),
        SimpleNamespace(transaction_ref_id='tx-4', rating=WorthItRatingValue.KEEP, merchant='Flight', category='Travel', amount=Decimal('220.00')),
    ]
    cut_rows = [SimpleNamespace(merchant='Rideshare', session_id='session-1')]

    db = SimpleNamespace(
        execute=AsyncMock(
            side_effect=[
                _FakeResult(session),   # load session
                _FakeResult(txs),       # load session transactions
                _FakeResult(ratings),   # load session ratings
                _FakeResult(cut_rows),  # recurring cut detection
            ]
        )
    )
    monkeypatch.setattr(insights_service, '_compute_trend', AsyncMock(return_value='stable'))

    payload = await insights_service.get_session_insights(str(session.id), user, db)

    assert payload['total_reviewed_count'] == 4
    assert payload['keep_count'] == 2
    assert payload['cut_count'] == 1
    assert payload['skip_count'] == 1
    assert payload['keep_total_amount'] == 265.0
    assert payload['cut_total_amount'] == 18.0
    assert payload['skip_total_amount'] == 8.0
    assert payload['top_kept_categories'] == ['Food & Drink', 'Travel']
    assert payload['top_cut_categories'] == ['Transport']
    assert payload['biggest_kept_transaction']['id'] == 'tx-4'
    assert payload['biggest_cut_transaction']['id'] == 'tx-2'
    assert [tx['id'] for tx in payload['recent_happy_transactions']] == ['tx-1', 'tx-4']
    assert [tx['id'] for tx in payload['recent_not_happy_transactions']] == ['tx-2']
    assert 'felt good about 2 purchases worth $265' in payload['summary_message']
    assert 'marked 1 purchases as not worth it, totaling $18' in payload['summary_message']
    assert payload['week_over_week_trend'] == 'stable'


@pytest.mark.asyncio
async def test_get_session_insights_dedupes_duplicate_snapshots_and_prefers_latest_rating(monkeypatch):
    user = SimpleNamespace(id=uuid4())
    session = SimpleNamespace(id=uuid4(), user_id=user.id, week_label='JUN 9-15')
    txs = [
        SimpleNamespace(
            transaction_ref_id='tx-1',
            merchant='American Eagle',
            description='Shirt',
            amount=Decimal('39.76'),
            category='Shopping',
            tx_date=date(2026, 6, 10),
            initial='A',
            position=0,
        ),
        SimpleNamespace(
            transaction_ref_id='tx-1',
            merchant='American Eagle',
            description='Shirt duplicate',
            amount=Decimal('39.76'),
            category='Shopping',
            tx_date=date(2026, 6, 10),
            initial='A',
            position=1,
        ),
        SimpleNamespace(
            transaction_ref_id='tx-2',
            merchant='Cafe',
            description='Coffee run',
            amount=Decimal('13.22'),
            category='Food & Drink',
            tx_date=date(2026, 6, 11),
            initial='C',
            position=2,
        ),
    ]
    ratings = [
        SimpleNamespace(transaction_ref_id='tx-1', rating=WorthItRatingValue.SKIP, merchant='American Eagle', category='Shopping', amount=Decimal('39.76'), created_at=datetime(2026, 6, 12, 10, 0, tzinfo=timezone.utc), updated_at=datetime(2026, 6, 12, 10, 0, tzinfo=timezone.utc), rated_at=datetime(2026, 6, 12, 10, 0, tzinfo=timezone.utc), id=uuid4()),
        SimpleNamespace(transaction_ref_id='tx-1', rating=WorthItRatingValue.KEEP, merchant='American Eagle', category='Shopping', amount=Decimal('39.76'), created_at=datetime(2026, 6, 11, 10, 0, tzinfo=timezone.utc), updated_at=datetime(2026, 6, 11, 10, 0, tzinfo=timezone.utc), rated_at=datetime(2026, 6, 11, 10, 0, tzinfo=timezone.utc), id=uuid4()),
        SimpleNamespace(transaction_ref_id='tx-2', rating=WorthItRatingValue.KEEP, merchant='Cafe', category='Food & Drink', amount=Decimal('13.22'), created_at=datetime(2026, 6, 12, 9, 0, tzinfo=timezone.utc), updated_at=datetime(2026, 6, 12, 9, 0, tzinfo=timezone.utc), rated_at=datetime(2026, 6, 12, 9, 0, tzinfo=timezone.utc), id=uuid4()),
    ]

    db = SimpleNamespace(
        execute=AsyncMock(
            side_effect=[
                _FakeResult(session),
                _FakeResult(txs),
                _FakeResult(ratings),
                _FakeResult([]),
            ]
        )
    )
    monkeypatch.setattr(insights_service, '_compute_trend', AsyncMock(return_value='stable'))

    payload = await insights_service.get_session_insights(str(session.id), user, db)

    assert payload['total_reviewed_count'] == 2
    assert payload['keep_count'] == 1
    assert payload['cut_count'] == 0
    assert payload['skip_count'] == 1
    assert [tx['id'] for tx in payload['recent_happy_transactions']] == ['tx-2']
    assert [tx['id'] for tx in payload['recent_not_happy_transactions']] == []
    assert [tx['id'] for tx in payload['recent_happy_transactions'] + payload['recent_not_happy_transactions']] == ['tx-2']
    assert 'felt good about 1 purchases worth $13.22' in payload['summary_message']
    assert 'skipped 1 purchases worth $39.76' not in payload['summary_message']


@pytest.mark.asyncio
async def test_get_history_returns_summary_fields_and_orders_by_recency(monkeypatch):
    user = SimpleNamespace(id=uuid4())
    newer = SimpleNamespace(
        id=uuid4(),
        week_label='JUN 16-22',
        status=WorthItSessionStatus.COMPLETED,
        created_at=datetime(2026, 6, 22, 10, 0, tzinfo=timezone.utc),
        completed_at=datetime(2026, 6, 22, 11, 0, tzinfo=timezone.utc),
    )
    older = SimpleNamespace(
        id=uuid4(),
        week_label='JUN 9-15',
        status=WorthItSessionStatus.SKIPPED,
        created_at=datetime(2026, 6, 15, 10, 0, tzinfo=timezone.utc),
        completed_at=None,
    )

    db = SimpleNamespace(
        execute=AsyncMock(return_value=_FakeResult([newer, older]))
    )
    monkeypatch.setattr(insights_service, '_load_session_transactions', AsyncMock(return_value=[]))
    monkeypatch.setattr(insights_service, '_load_session_ratings', AsyncMock(return_value={}))
    monkeypatch.setattr(
        insights_service,
        '_build_session_insights',
        AsyncMock(return_value={
            'total_reviewed_count': 4,
            'keep_count': 2,
            'cut_count': 1,
            'skip_count': 1,
            'keep_total_amount': 265.0,
            'cut_total_amount': 18.0,
            'skip_total_amount': 8.0,
            'top_kept_categories': [],
            'top_cut_categories': [],
            'biggest_kept_transaction': None,
            'biggest_cut_transaction': None,
            'recent_happy_transactions': [],
            'recent_not_happy_transactions': [],
            'summary_message': 'You felt good about 2 purchases worth $265. You marked 1 purchases as not worth it, totaling $18.',
            'category_breakdown': {},
            'total_saved_estimate': 18.0,
            'recurring_cuts': [],
            'week_over_week_trend': 'stable',
        }),
    )

    payload = await insights_service.get_history(user, db)

    assert [session['session_id'] for session in payload['sessions']] == [str(newer.id), str(older.id)]
    assert payload['sessions'][0]['reviewed_count'] == 4
    assert payload['sessions'][0]['summary_message'].startswith('You felt good about 2 purchases')
    assert payload['sessions'][1]['reviewed_count'] == 0
    assert payload['sessions'][1]['summary_message'] == 'Review a few transactions first, then your insights will appear here.'


def _make_review_row(*, ref_id, rating_value, merchant, category, amount, created_at, description=None):
    tx = SimpleNamespace(
        transaction_ref_id=ref_id,
        merchant=merchant,
        description=description or f'{merchant} purchase',
        amount=Decimal(str(amount)),
        category=category,
        tx_date=created_at.date(),
        initial=merchant[0].upper(),
        position=0,
    )
    rating = SimpleNamespace(
        transaction_ref_id=ref_id,
        rating=rating_value,
        merchant=merchant,
        category=category,
        amount=Decimal(str(amount)),
        created_at=created_at,
        updated_at=created_at,
        id=uuid4(),
    )
    return (rating, tx)


@pytest.mark.asyncio
async def test_get_last_30_days_insights_uses_last_30_days_window_and_sorts_categories(monkeypatch):
    user = SimpleNamespace(id=uuid4())
    now = datetime(2026, 6, 12, 12, 0, tzinfo=timezone.utc)
    monkeypatch.setattr(insights_service, '_now_utc', lambda: now)

    rows = [
        _make_review_row(ref_id='cut-1', rating_value=WorthItRatingValue.CUT, merchant='Dinner A', category='Dining', amount=5, created_at=now - timedelta(days=1)),
        _make_review_row(ref_id='keep-1', rating_value=WorthItRatingValue.KEEP, merchant='Travel A', category='Travel', amount=120, created_at=now - timedelta(days=2)),
        _make_review_row(ref_id='cut-2', rating_value=WorthItRatingValue.CUT, merchant='Snack A', category='Snacks', amount=10, created_at=now - timedelta(days=3)),
        _make_review_row(ref_id='keep-2', rating_value=WorthItRatingValue.KEEP, merchant='Travel B', category='Travel', amount=80, created_at=now - timedelta(days=4)),
        _make_review_row(ref_id='skip-1', rating_value=WorthItRatingValue.SKIP, merchant='Skip A', category='Other', amount=7, created_at=now - timedelta(days=5)),
        _make_review_row(ref_id='cut-3', rating_value=WorthItRatingValue.CUT, merchant='Dinner B', category='Dining', amount=5, created_at=now - timedelta(days=6)),
        _make_review_row(ref_id='keep-3', rating_value=WorthItRatingValue.KEEP, merchant='Groceries A', category='Groceries', amount=30, created_at=now - timedelta(days=7)),
        _make_review_row(ref_id='cut-4', rating_value=WorthItRatingValue.CUT, merchant='Transport A', category='Transport', amount=25, created_at=now - timedelta(days=8)),
        _make_review_row(ref_id='keep-4', rating_value=WorthItRatingValue.KEEP, merchant='Groceries B', category='Groceries', amount=20, created_at=now - timedelta(days=9)),
        _make_review_row(ref_id='cut-5', rating_value=WorthItRatingValue.CUT, merchant='Transport B', category='Transport', amount=25, created_at=now - timedelta(days=10)),
        _make_review_row(ref_id='keep-5', rating_value=WorthItRatingValue.KEEP, merchant='Entertainment', category='Entertainment', amount=15, created_at=now - timedelta(days=11)),
        _make_review_row(ref_id='cut-6', rating_value=WorthItRatingValue.CUT, merchant='Coffee A', category='Coffee', amount=12, created_at=now - timedelta(days=12)),
        _make_review_row(ref_id='keep-6', rating_value=WorthItRatingValue.KEEP, merchant='Travel C', category='Travel', amount=5, created_at=now - timedelta(days=13)),
        _make_review_row(ref_id='cut-7', rating_value=WorthItRatingValue.CUT, merchant='Coffee B', category='Coffee', amount=10, created_at=now - timedelta(days=14)),
        _make_review_row(ref_id='cut-8', rating_value=WorthItRatingValue.CUT, merchant='Dinner C', category='Dining', amount=5, created_at=now - timedelta(days=15)),
        _make_review_row(ref_id='old-cut', rating_value=WorthItRatingValue.CUT, merchant='Old Merchant', category='Dining', amount=100, created_at=now - timedelta(days=35)),
    ]

    db = SimpleNamespace(execute=AsyncMock(return_value=_FakeResult(rows)))

    payload = await insights_service.get_last_30_days_insights(user, db)

    assert payload['total_reviewed_count'] == 15
    assert payload['keep_count'] == 6
    assert payload['cut_count'] == 8
    assert payload['skip_count'] == 1
    assert payload['keep_total_amount'] == 270.0
    assert payload['cut_total_amount'] == 97.0
    assert payload['skip_total_amount'] == 7.0
    assert payload['top_kept_categories'] == ['Travel', 'Groceries', 'Entertainment']
    assert payload['top_cut_categories'] == ['Dining', 'Transport', 'Coffee']
    assert payload['biggest_kept_transaction']['id'] == 'keep-1'
    assert payload['biggest_cut_transaction']['id'] == 'cut-4'
    assert [tx['id'] for tx in payload['recent_happy_transactions']] == ['keep-1', 'keep-2', 'keep-3', 'keep-4', 'keep-5']
    assert [tx['id'] for tx in payload['recent_not_happy_transactions']] == ['cut-1', 'cut-2', 'cut-3', 'cut-4', 'cut-5']
    assert 'Old Merchant' not in payload['summary_message']
    assert 'felt good about 6 purchases worth $270' in payload['summary_message']
    assert 'not worth it, totaling $97' in payload['summary_message']


@pytest.mark.asyncio
async def test_get_last_30_days_insights_returns_empty_state_when_only_old_ratings_exist(monkeypatch):
    user = SimpleNamespace(id=uuid4())
    now = datetime(2026, 6, 12, 12, 0, tzinfo=timezone.utc)
    monkeypatch.setattr(insights_service, '_now_utc', lambda: now)

    rows = [
        _make_review_row(
            ref_id='old-1',
            rating_value=WorthItRatingValue.KEEP,
            merchant='Old Cafe',
            category='Coffee',
            amount=12,
            created_at=now - timedelta(days=40),
        )
    ]
    db = SimpleNamespace(execute=AsyncMock(return_value=_FakeResult(rows)))

    payload = await insights_service.get_last_30_days_insights(user, db)

    assert payload['total_reviewed_count'] == 0
    assert payload['keep_count'] == 0
    assert payload['cut_count'] == 0
    assert payload['skip_count'] == 0
    assert payload['top_kept_categories'] == []
    assert payload['top_cut_categories'] == []
    assert payload['summary_message'] == 'Review transactions to unlock your 30-day insights.'


@pytest.mark.asyncio
async def test_get_last_30_days_insights_dedupes_duplicate_transaction_refs_and_uses_latest_rating(monkeypatch):
    user = SimpleNamespace(id=uuid4())
    now = datetime(2026, 6, 12, 12, 0, tzinfo=timezone.utc)
    monkeypatch.setattr(insights_service, '_now_utc', lambda: now)

    rows = [
        _make_review_row(
            ref_id='dup-1',
            rating_value=WorthItRatingValue.KEEP,
            merchant='American Eagle',
            category='Shopping',
            amount=39.76,
            created_at=now - timedelta(days=1),
        ),
        _make_review_row(
            ref_id='dup-1',
            rating_value=WorthItRatingValue.SKIP,
            merchant='American Eagle',
            category='Shopping',
            amount=39.76,
            created_at=now - timedelta(days=2),
        ),
        _make_review_row(
            ref_id='dup-2',
            rating_value=WorthItRatingValue.CUT,
            merchant='American Eagle',
            category='Shopping',
            amount=13.22,
            created_at=now - timedelta(days=3),
        ),
    ]
    db = SimpleNamespace(execute=AsyncMock(return_value=_FakeResult(rows)))

    payload = await insights_service.get_last_30_days_insights(user, db)

    assert payload['total_reviewed_count'] == 2
    assert payload['keep_count'] == 1
    assert payload['cut_count'] == 1
    assert payload['skip_count'] == 0
    assert payload['keep_total_amount'] == 39.76
    assert payload['cut_total_amount'] == 13.22
    assert [tx['id'] for tx in payload['recent_happy_transactions']] == ['dup-1']
    assert [tx['id'] for tx in payload['recent_not_happy_transactions']] == ['dup-2']
    assert payload['biggest_kept_transaction']['id'] == 'dup-1'
    assert payload['biggest_cut_transaction']['id'] == 'dup-2'
    assert payload['summary_message'].count('American Eagle') <= 2
    assert 'skipped' not in payload['summary_message'].lower()
