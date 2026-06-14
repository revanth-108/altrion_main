"""
Research Lab service — aggregates financial data and runs Claude analysis
across 7 analyst modes: investment thesis, earnings, comps/valuation,
bull/bear memo, catalyst tracker, insider activity, and protocol deep-dive (crypto).

Data is sourced entirely from Yahoo Finance (quoteSummary + search) — all FMP v3/v4
endpoints are "Legacy" for subscriptions after August 2025.
"""
from __future__ import annotations

from typing import Any

import httpx

from app.core.config import settings
from app.core.logging import get_logger
from app.services.fmp_service import FMPService

logger = get_logger()

# Haiku 4.5 is the optimal cost/quality model for structured data-grounded analysis.
# It follows system-prompt instructions reliably and costs ~10x less than Sonnet.
# Override via CLAUDE_MODEL in .env if you need higher reasoning quality.
_DEFAULT_MODEL = "claude-haiku-4-5-20251001"
_MAX_TOKENS = 1100   # bumped from 900 — structured multi-section outputs need more room

_SYSTEM_PROMPTS: dict[str, str] = {
    "investment_thesis": (
        "You are a sell-side equity research analyst initiating or updating coverage. "
        "Using only the financial data provided, write a structured investment thesis:\n\n"
        "## Business Quality — describe the competitive moat, margin profile, and what makes "
        "this business defensible. Cite specific margins or returns from the data.\n"
        "## Valuation Context — state whether the stock is undervalued, fairly valued, or "
        "overvalued vs sector. Reference P/E, EV/EBITDA, or PEG with exact numbers.\n"
        "## Growth Outlook — quantify the revenue growth trajectory and the primary driver.\n"
        "## Key Risks — name the 2-3 specific risks that could break the thesis, with numbers.\n"
        "## Verdict — one sentence: Buy / Hold / Avoid and the single most important reason.\n\n"
        "Every sentence must cite at least one number from the data. Be direct and opinionated. "
        "Never use vague language like 'relatively strong' — state the actual figure."
    ),
    "earnings_analysis": (
        "You are a sell-side equity research analyst writing a post-earnings update. "
        "Using the financial data provided, produce a structured earnings analysis:\n\n"
        "## Results Snapshot — Revenue beat/miss vs analyst consensus (state exact %) and "
        "EPS beat/miss vs consensus (state exact $). Note gross margin vs expectations.\n"
        "## Key Drivers — explain WHY results differed. Which segments beat or missed? "
        "What drove margin expansion or compression?\n"
        "## Guidance — raised / maintained / lowered. State the new range explicitly. "
        "If guidance data is unavailable, say so.\n"
        "## Thesis Impact — does this quarter strengthen, weaken, or leave unchanged the "
        "investment case? One clear directional statement.\n"
        "## What to Watch — one specific metric to monitor next quarter, and why it matters.\n\n"
        "Quantify every beat/miss with a number. If consensus data is unavailable, say so explicitly."
    ),
    "earnings_preview": (
        "You are a buy-side analyst building a pre-earnings preview. "
        "Using the analyst estimates and financial data provided:\n\n"
        "## Setup — current price, P/E, and analyst sentiment heading into earnings. "
        "Is the bar high or low based on recent estimate revisions and price action?\n"
        "## Key Metrics to Watch — the 2-3 numbers that will move the stock most. "
        "For each: state the consensus estimate, explain why it matters, and what a "
        "surprise in either direction would signal.\n"
        "## Scenarios:\n"
        "**Bull Case** — what a beat looks like and estimated upside (e.g. +X%)\n"
        "**Base Case** — in-line result and likely price reaction\n"
        "**Bear Case** — what a miss looks like and estimated downside (e.g. -X%)\n"
        "## Positioning — given the setup, is the risk/reward into earnings favorable, "
        "neutral, or unfavorable? One sentence verdict.\n\n"
        "This is a pre-earnings analysis — acknowledge uncertainty explicitly. "
        "Describe scenarios, do not make price predictions."
    ),
    "comps_valuation": (
        "You are a valuation specialist writing a comparable company analysis. "
        "Using the financial data provided:\n\n"
        "## Valuation Snapshot — list each available multiple (P/E, EV/EBITDA, P/S, P/B, PEG) "
        "with its exact value from the data.\n"
        "## Sector Context — compare each multiple against typical sector ranges. "
        "State whether each signals premium, discount, or fair value — with a number for each.\n"
        "## Price Target Analysis — if analyst targets are provided, state the implied "
        "upside/downside from current price and the number of analysts. If absent, note it.\n"
        "## Quality Adjustment — does the valuation premium or discount make sense given "
        "ROE, profit margins, and growth rate? Explain the trade-off.\n"
        "## Verdict — one sentence: undervalued / fairly valued / overvalued, "
        "and the single most important reason.\n\n"
        "State every multiple as a specific number. Never say 'relatively high' — "
        "say 'P/E of 32x vs sector average of 24x.'"
    ),
    "bull_bear_memo": (
        "You are a portfolio manager writing an internal investment committee memo. "
        "Structure your response exactly as:\n\n"
        "**Bull Case**\n"
        "1. [specific data-backed reason with exact number]\n"
        "2. [specific data-backed reason with exact number]\n"
        "3. [specific data-backed reason with exact number]\n\n"
        "**Bear Case**\n"
        "1. [specific risk with quantified downside or probability]\n"
        "2. [specific risk with quantified downside or probability]\n"
        "3. [specific risk with quantified downside or probability]\n\n"
        "**Net Verdict** — 2-3 sentences. State whether you would own this position today "
        "and at what conviction level: Overweight / Neutral / Underweight.\n\n"
        "Every bullet must cite a specific number. No generic statements — "
        "be specific about what the risk is and what it would mean for the stock price."
    ),
    "catalyst_tracker": (
        "You are an event-driven research analyst building a catalyst calendar. "
        "Using the financial data provided:\n\n"
        "## Upcoming Catalysts — for each catalyst identified, state:\n"
        "- What it is (earnings date, rating change, guidance update, etc.)\n"
        "- Potential price impact: High / Medium / Low — and why\n"
        "- Bull outcome: what upside looks like if positive\n"
        "- Bear outcome: what downside looks like if disappointing\n\n"
        "## Macro Sensitivity — how sensitive is this stock to interest rates, "
        "inflation, or the economic cycle? Reference the beta or sector context.\n"
        "## Analyst Sentiment Shift — are ratings and price targets moving up or down? "
        "Name the direction and magnitude if data is available.\n"
        "## Net Catalyst Score — is the near-term setup favorable, neutral, or unfavorable? "
        "One sentence verdict with your reasoning.\n\n"
        "If a catalyst lacks sufficient data, say so and note what information would change the view."
    ),
    "insider_activity_analysis": (
        "You are a forensic equity analyst specialising in corporate insider behaviour. "
        "Using the insider transaction data provided:\n\n"
        "## Transaction Summary — who bought or sold, how many shares, at what price, "
        "on what dates, and the aggregate value of all transactions.\n"
        "## Signal Interpretation — classify the pattern as: Accumulation / Distribution / Noise. "
        "Justify your classification with specific reference to transaction size and timing.\n"
        "## Context Check — does insider activity align or conflict with:\n"
        "- Analyst ratings and price targets (if available)\n"
        "- Current valuation (cheap or expensive relative to multiples)\n"
        "- Recent earnings momentum (consistent beats or misses)\n"
        "## Net Signal — Buy / Neutral / Sell based solely on insider data. "
        "State your confidence: High / Medium / Low based on the volume of data available.\n\n"
        "If fewer than 3 insider transactions are present, state 'Insufficient data' and "
        "explain what volume of activity would be needed to draw a meaningful conclusion."
    ),
    "protocol_deep_dive": (
        "You are a digital asset research analyst covering crypto protocols. "
        "Using the financial data provided:\n\n"
        "## Market Context — current price, % change, 52-week range, and market cap tier "
        "(Mega / Large / Mid / Small). How does this compare to BTC and ETH in the same period?\n"
        "## Protocol Fundamentals — competitive positioning within its category "
        "(Layer 1 / Layer 2 / DeFi / Stablecoin / etc.). What is the core value proposition "
        "and what differentiates it from competitors?\n"
        "## Institutional Signals — evidence of institutional interest from the data: "
        "market cap relative to category, volume patterns, or analyst coverage.\n"
        "## Macro & Regulatory Sensitivity — how does this asset behave in risk-on vs risk-off "
        "environments? Any specific regulatory exposure to note?\n"
        "## Risk/Reward — one sentence verdict on whether the risk/reward is favourable "
        "given current price and market conditions.\n\n"
        "Be specific about all numbers. Caveat conclusions where fundamental data is limited "
        "compared to equities — crypto analysis requires more epistemic humility."
    ),
}


def _build_context(
    symbol: str,
    profile: dict | None,
    quote: dict | None,
    metrics: dict | None,
    estimates: list[dict],
    surprises: list[dict],
    grades: list[dict],
    price_target: dict | None,
    insider: list[dict],
    news: list[dict],
) -> str:
    parts: list[str] = [f"# Asset Data: {symbol}\n"]

    if profile:
        desc = (profile.get("description") or "")[:400]
        parts.append(
            f"**Company:** {profile.get('companyName', symbol)}\n"
            f"**Sector:** {profile.get('sector', '—')} | **Industry:** {profile.get('industry', '—')}\n"
            + (f"**Description:** {desc}\n" if desc else "")
        )

    if quote:
        parts.append(
            f"\n## Price Snapshot\n"
            f"- Price: ${quote.get('price', '—')} ({quote.get('changesPercentage', '—')}% today)\n"
            f"- 52w High / Low: ${quote.get('yearHigh', '—')} / ${quote.get('yearLow', '—')}\n"
            f"- Market Cap: ${quote.get('marketCap', '—')} | Avg Volume: {quote.get('avgVolume', '—')}\n"
            f"- P/E: {quote.get('pe', '—')} | EPS (TTM): {quote.get('eps', '—')}\n"
        )

    if metrics:
        parts.append(
            f"\n## Key Metrics (TTM)\n"
            f"- P/E: {metrics.get('peRatioTTM', '—')} | EV/EBITDA: {metrics.get('enterpriseValueOverEBITDATTM', '—')}\n"
            f"- P/S: {metrics.get('priceToSalesRatioTTM', '—')} | P/B: {metrics.get('pbRatioTTM', '—')}\n"
            f"- ROE: {metrics.get('roeTTM', '—')} | ROIC: {metrics.get('roicTTM', '—')}\n"
            f"- Debt/Equity: {metrics.get('debtToEquityTTM', '—')} | FCF Yield: {metrics.get('freeCashFlowYieldTTM', '—')}\n"
            f"- Net Margin: {metrics.get('netProfitMarginTTM', '—')} | Revenue/Share: {metrics.get('revenuePerShareTTM', '—')}\n"
        )

    if estimates:
        parts.append("\n## Analyst Estimates\n")
        for e in estimates[:2]:
            parts.append(
                f"- {e.get('date', '')}: Est Rev ${e.get('estimatedRevenueAvg', '—')} | "
                f"Est EPS {e.get('estimatedEpsAvg', '—')}\n"
            )

    if surprises:
        parts.append("\n## Earnings Surprises (Last 4Q)\n")
        for s in surprises:
            parts.append(
                f"- {s.get('date', '')}: Actual {s.get('actualEarningResult', '—')} "
                f"vs Est {s.get('estimatedEarning', '—')}\n"
            )

    if grades:
        parts.append("\n## Analyst Grade Changes\n")
        for g in grades[:3]:
            parts.append(
                f"- {g.get('date', '')} {g.get('gradingCompany', '')}: "
                f"{g.get('previousGrade', '—')} → {g.get('newGrade', '—')}\n"
            )

    if price_target:
        parts.append(
            f"\n## Price Targets\n"
            f"- Consensus: ${price_target.get('targetConsensus', '—')} | "
            f"High: ${price_target.get('targetHigh', '—')} | Low: ${price_target.get('targetLow', '—')}\n"
            f"- # Analysts: {price_target.get('numberOfAnalysts', '—')}\n"
        )

    if insider:
        parts.append("\n## Recent Insider Activity\n")
        for tx in insider[:3]:
            parts.append(
                f"- {tx.get('transactionDate', '')} {tx.get('reportingName', '')}: "
                f"{tx.get('transactionType', '')} {tx.get('securitiesTransacted', '')} shares\n"
            )

    if news:
        parts.append("\n## Recent Headlines\n")
        for article in news[:3]:
            publisher = article.get("publisher", "")
            title = article.get("title", "")
            parts.append(f"- {title}" + (f" ({publisher})" if publisher else "") + "\n")

    return "".join(parts)


async def run_research_lab(symbol: str, mode: str, asset_type: str, fmp: FMPService) -> dict:
    if mode not in _SYSTEM_PROMPTS:
        raise ValueError(f"Unknown Research Lab mode: {mode}")

    api_key = settings.ANTHROPIC_API_KEY or settings.CLAUDE_API_KEY
    if not api_key:
        raise RuntimeError("Anthropic API key not configured")

    # Use the configured URL, with a guaranteed fallback to the standard Anthropic endpoint
    claude_url = settings.CLAUDE_API_URL or "https://api.anthropic.com/v1/messages"

    # Single Yahoo Finance batch call — replaces 9 broken FMP v3/v4 endpoints
    research_data = await fmp.get_asset_research_data(symbol)

    context = _build_context(
        symbol=symbol,
        profile=research_data["profile"],
        quote=research_data["quote"],
        metrics=research_data["metrics"],
        estimates=research_data["estimates"],
        surprises=research_data["surprises"],
        grades=research_data["grades"],
        price_target=research_data["price_target"],
        insider=research_data["insider"],
        news=research_data["news"],
    )

    effective_mode = "protocol_deep_dive" if asset_type == "crypto" else mode
    system_prompt = _SYSTEM_PROMPTS[effective_mode]

    async with httpx.AsyncClient(timeout=35) as client:
        resp = await client.post(
            claude_url,
            headers={
                "x-api-key": api_key,
                "anthropic-version": "2023-06-01",
                "anthropic-beta": "prompt-caching-2024-07-31",
                "content-type": "application/json",
            },
            json={
                "model": settings.CLAUDE_MODEL or _DEFAULT_MODEL,
                "max_tokens": _MAX_TOKENS,
                "temperature": 0.3,
                # cache_control on system prompt — each of the 7 mode prompts (~150 tokens)
                # is cached independently. Re-running the same mode costs ~10% of input tokens.
                "system": [
                    {
                        "type": "text",
                        "text": system_prompt,
                        "cache_control": {"type": "ephemeral"},
                    }
                ],
                "messages": [{"role": "user", "content": f"Analyze this asset:\n\n{context}"}],
            },
        )
        resp.raise_for_status()
        data = resp.json()

    analysis = "".join(
        block.get("text", "")
        for block in (data.get("content") or [])
        if block.get("type") == "text"
    ).strip()

    if not analysis:
        raise RuntimeError("Claude returned an empty analysis")

    logger.info("research_lab_completed", symbol=symbol, mode=effective_mode)
    return {"symbol": symbol, "mode": mode, "analysis": analysis}
