"""
Tests for PricingService price batch + crypto asset_metadata upsert.

Integration tests against real Postgres are skipped when PgBouncer breaks asyncpg
prepared statements; the mock tests below verify wiring without a database.
Run: pytest tests/test_pricing_metadata.py -v
"""
from decimal import Decimal
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.services.pricing import PricingService


def _result_all(rows):
    m = MagicMock()
    m.scalars.return_value.all.return_value = rows
    return m


def _result_one(row):
    m = MagicMock()
    m.scalar_one_or_none.return_value = row
    return m


@pytest.mark.asyncio
async def test_get_prices_batch_upserts_price_and_metadata_for_crypto():
    """Mock DB: external fetch persists Price + calls AssetMetadata upsert path for crypto."""
    session = MagicMock()
    call_idx = {"n": 0}

    async def execute_side_effect(stmt):
        n = call_idx["n"]
        call_idx["n"] += 1
        # 0: batch load prices by symbols
        if n == 0:
            return _result_all([])
        # 1: per-symbol Price row before upsert
        if n == 1:
            return _result_one(None)
        # 2: AssetMetadata lookup in upsert_minimal_crypto_metadata
        if n == 2:
            return _result_one(None)
        return _result_one(None)

    session.execute = AsyncMock(side_effect=execute_side_effect)
    session.flush = AsyncMock()

    async def do_commit():
        await session.flush()

    session.commit = AsyncMock(side_effect=do_commit)

    svc = PricingService(session)
    svc.use_cmc = False

    fake_prices = {"PEPE": Decimal("0.00001234")}
    fake_hints = {
        "PEPE": {
            "display_name": "Pepe",
            "coingecko_id": "pepe",
            "metadata_source": "coingecko",
        }
    }

    with patch.object(
        PricingService,
        "_fetch_batch_from_coingecko",
        new_callable=AsyncMock,
        return_value=(fake_prices, fake_hints),
    ):
        out = await svc.get_prices_batch(["PEPE"], crypto_symbols={"PEPE"})

    assert out["PEPE"] == Decimal("0.00001234")
    assert session.add.call_count >= 2
    session.commit.assert_awaited_once()


@pytest.mark.asyncio
async def test_get_prices_batch_skips_metadata_without_crypto_symbols():
    """When crypto_symbols is omitted, only Price rows should be added (no metadata upsert selects)."""
    session = MagicMock()
    call_idx = {"n": 0}

    async def execute_side_effect(stmt):
        n = call_idx["n"]
        call_idx["n"] += 1
        if n == 0:
            return _result_all([])
        if n == 1:
            return _result_one(None)
        return _result_one(None)

    session.execute = AsyncMock(side_effect=execute_side_effect)
    session.flush = AsyncMock()

    async def do_commit():
        await session.flush()

    session.commit = AsyncMock(side_effect=do_commit)

    svc = PricingService(session)
    svc.use_cmc = False

    with patch.object(
        PricingService,
        "_fetch_batch_from_coingecko",
        new_callable=AsyncMock,
        return_value=(
            {"PEPE": Decimal("1")},
            {"PEPE": {"display_name": "Pepe", "coingecko_id": "pepe", "metadata_source": "coingecko"}},
        ),
    ):
        await svc.get_prices_batch(["PEPE"], crypto_symbols=None)

    assert call_idx["n"] == 2
    assert session.add.call_count == 1


@pytest.mark.asyncio
async def test_get_prices_batch_persists_stablecoin_without_external_fetch():
    """Symbols with pegged USD price insert into `prices` with source internal; no CoinGecko/CMC call."""
    session = MagicMock()

    async def execute_side_effect(stmt):
        return _result_all([])

    session.execute = AsyncMock(side_effect=execute_side_effect)
    session.flush = AsyncMock()
    session.commit = AsyncMock()

    svc = PricingService(session)

    with patch.object(
        PricingService,
        "_fetch_batch_from_coingecko",
        new_callable=AsyncMock,
    ) as mock_cg:
        out = await svc.get_prices_batch(["USDC"], crypto_symbols={"USDC"})

    mock_cg.assert_not_called()
    assert out["USDC"] == Decimal("1")
    session.add.assert_called_once()
    added = session.add.call_args[0][0]
    assert added.canonical_symbol == "USDC"
    assert added.usd_price == Decimal("1")
    assert added.source == "internal"
    session.commit.assert_awaited_once()


@pytest.mark.asyncio
async def test_get_prices_batch_cmc_branch_metadata():
    session = MagicMock()
    call_idx = {"n": 0}

    async def execute_side_effect(stmt):
        n = call_idx["n"]
        call_idx["n"] += 1
        if n == 0:
            return _result_all([])
        if n == 1:
            return _result_one(None)
        if n == 2:
            return _result_one(None)
        return _result_one(None)

    session.execute = AsyncMock(side_effect=execute_side_effect)
    session.flush = AsyncMock()

    async def do_commit():
        await session.flush()

    session.commit = AsyncMock(side_effect=do_commit)

    svc = PricingService(session)
    svc.use_cmc = True

    with patch.object(
        PricingService,
        "_fetch_batch_from_coinmarketcap",
        new_callable=AsyncMock,
        return_value=({"DOGE": Decimal("0.42")}, {"DOGE": "Dogecoin"}),
    ):
        await svc.get_prices_batch(["DOGE"], crypto_symbols={"DOGE"})

    assert session.add.call_count >= 2
    session.commit.assert_awaited_once()
