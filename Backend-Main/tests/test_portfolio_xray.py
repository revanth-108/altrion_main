"""
Unit tests for Portfolio X-Ray diagnostics.
"""
from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock

import pytest

from app.services.financial_analysis.macro_snapshot import build_macro_snapshot
from app.services.financial_analysis.portfolio_xray import build_portfolio_xray


def _metadata(
    *,
    sector: str = "Technology",
    display_name: str = "Apple Inc.",
    metadata_status: str = "ready",
    raw_payload: dict | None = None,
):
    record = MagicMock()
    record.sector = sector
    record.display_name = display_name
    record.metadata_status = metadata_status
    record.raw_payload_json = raw_payload or {"pe": 25.8}
    return record


@pytest.mark.asyncio
async def test_build_portfolio_xray_empty_holdings_returns_error():
    metadata_service = MagicMock()
    result = await build_portfolio_xray({"assets": [], "status": "degraded"}, metadata_service)
    assert result["error"] == "No holdings available for analysis."


@pytest.mark.asyncio
async def test_build_portfolio_xray_mixed_holdings_shape():
    allocation = {
        "status": "ok",
        "warnings": [],
        "metrics": {
            "stocks_pct": 76.0,
            "crypto_pct": 4.0,
            "cash_pct": 20.0,
            "stablecoin_pct": 0.0,
            "metadata_coverage_pct": 88.0,
        },
        "breakdowns": {
            "by_sector": [
                {"label": "Technology", "weight_pct": 31.0},
                {"label": "Energy", "weight_pct": 4.0},
            ]
        },
        "assets": [
            {
                "asset_key": "stock:AAPL",
                "canonical_symbol": "AAPL",
                "bucket": "stocks",
                "asset_class": "equity",
                "weight_pct": 8.4,
                "value_usd": 238_560.0,
            },
            {
                "asset_key": "stock:VOO",
                "canonical_symbol": "VOO",
                "bucket": "stocks",
                "asset_class": "equity",
                "weight_pct": 15.5,
                "value_usd": 440_200.0,
            },
            {
                "asset_key": "stock:QQQ",
                "canonical_symbol": "QQQ",
                "bucket": "stocks",
                "asset_class": "equity",
                "weight_pct": 11.2,
                "value_usd": 318_080.0,
            },
        ],
    }

    metadata_service = MagicMock()
    metadata_service.get_many = AsyncMock(
        return_value={
            "stock:AAPL": _metadata(sector="Technology", display_name="Apple Inc."),
            "stock:VOO": _metadata(sector="Funds / ETFs", display_name="Vanguard S&P 500 ETF", raw_payload={}),
            "stock:QQQ": _metadata(sector="Funds / ETFs", display_name="Invesco QQQ Trust", raw_payload={}),
        }
    )

    result = await build_portfolio_xray(allocation, metadata_service)

    assert result["status"] == "ok"
    assert result["macro_snapshot"]["regime_label"]
    assert len(result["key_findings"]) <= 4
    assert result["methodology"]["overlap_model"] == "estimated_pairwise"
    assert result["secondary_kpis"]["international_equity_pct"] >= 0

    matrix = result["overlap_heatmap"]["matrix"]
    assert all(matrix[idx][idx] == 0.0 for idx in range(len(matrix)))
    assert result["kpis"]["etf_overlap_pct"] >= 0

    holdings = {row["symbol"]: row for row in result["holdings"]}
    assert holdings["VOO"]["valuation_label"] == "Index"
    assert holdings["AAPL"]["valuation_label"] == "25.8x P/E"
    assert holdings["AAPL"]["analyst_rating"] is None

    impact_text = " ".join(card["description"] for card in result["macro_snapshot"]["impact_cards"])
    assert "AAPL" in impact_text or "VOO" in impact_text or "QQQ" in impact_text


@pytest.mark.asyncio
async def test_real_overlap_uses_etf_constituents_not_stock_correlation():
    allocation = {
        "status": "ok",
        "warnings": [],
        "metrics": {
            "stocks_pct": 100.0,
            "crypto_pct": 0.0,
            "cash_pct": 0.0,
            "metadata_coverage_pct": 100.0,
        },
        "breakdowns": {},
        "assets": [
            {
                "asset_key": "stock:QQQ",
                "canonical_symbol": "QQQ",
                "bucket": "stocks",
                "asset_class": "equity",
                "weight_pct": 20.0,
                "value_usd": 20_000.0,
            },
            {
                "asset_key": "stock:AAPL",
                "canonical_symbol": "AAPL",
                "bucket": "stocks",
                "asset_class": "equity",
                "weight_pct": 5.0,
                "value_usd": 5_000.0,
            },
            {
                "asset_key": "stock:MSFT",
                "canonical_symbol": "MSFT",
                "bucket": "stocks",
                "asset_class": "equity",
                "weight_pct": 4.0,
                "value_usd": 4_000.0,
            },
        ],
    }
    metadata_service = MagicMock()
    metadata_service.get_many = AsyncMock(
        return_value={
            "stock:QQQ": _metadata(sector="Funds/ETFs", display_name="Invesco QQQ Trust", raw_payload={}),
            "stock:AAPL": _metadata(sector="Technology", display_name="Apple Inc."),
            "stock:MSFT": _metadata(sector="Technology", display_name="Microsoft Corp."),
        }
    )
    lookthrough_service = MagicMock()
    lookthrough_service.get_many = AsyncMock(
        return_value={
            "QQQ": [
                {"symbol": "AAPL", "name": "Apple Inc.", "weight_pct": 10.0},
                {"symbol": "MSFT", "name": "Microsoft Corp.", "weight_pct": 9.0},
            ]
        }
    )
    from app.services.etf_lookthrough_service import ETFLookthroughService
    lookthrough_service.compute_true_exposure.side_effect = (
        lambda enriched, constituents_map: ETFLookthroughService.compute_true_exposure(
            None,
            enriched,
            constituents_map,
        )
    )

    result = await build_portfolio_xray(allocation, metadata_service, lookthrough_service)

    labels = result["overlap_heatmap"]["labels"]
    matrix = result["overlap_heatmap"]["matrix"]
    aapl_idx = labels.index("AAPL")
    msft_idx = labels.index("MSFT")
    qqq_idx = labels.index("QQQ")

    assert matrix[aapl_idx][msft_idx] == 0.0
    assert matrix[aapl_idx][qqq_idx] == 2.0
    assert result["methodology"]["overlap_model"] == "fmp_constituent_intersection"
    assert result["data_quality"]["lookthrough_confidence"] == "real"

    holdings = {row["symbol"]: row for row in result["holdings"]}
    assert holdings["AAPL"]["true_exposure_pct"] == 7.0
    assert holdings["QQQ"]["true_exposure_pct"] == 20.0


@pytest.mark.asyncio
async def test_macro_snapshot_mentions_holdings():
    assets = [
        {"symbol": "MSFT", "weight_pct": 12.0, "sector": "Technology", "is_etf": False, "bucket": "stocks"},
        {"symbol": "VOO", "weight_pct": 10.0, "sector": "Funds / ETFs", "is_etf": True, "bucket": "stocks"},
    ]
    snapshot = await build_macro_snapshot(assets)
    joined = " ".join(card["description"] for card in snapshot["impact_cards"])
    assert "MSFT" in joined or "VOO" in joined
