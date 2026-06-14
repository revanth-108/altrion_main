"""
PDF Statement Parser
--------------------
Extracts portfolio holdings from exchange / brokerage PDF statements.

Three-stage pipeline (each stage is a fallback for the previous):
  1. Claude AI      - understands any layout, most reliable
  2. Table parser   - pure pdfplumber table extraction
  3. Text pattern   - regex on raw text (handles Coinbase, Kraken, Binance…)

After parsing, holdings are upserted as Account + Holding rows so the
aggregation service picks them up immediately.
"""
from __future__ import annotations

import io
import json
import re
from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation
from typing import List, Dict
from uuid import uuid4

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert

from app.core.config import settings
from app.core.logging import get_logger
from app.models.account import Account
from app.models.holding import Holding
from app.models.user import User

logger = get_logger()

# ── Constants ─────────────────────────────────────────────────────────────────

_STABLECOINS = frozenset({
    "USDC", "USDT", "BUSD", "DAI", "TUSD", "USDP", "GUSD", "FRAX",
    "LUSD", "CRVUSD", "PYUSD", "USDD", "FDUSD",
})

_CRYPTO_EXCHANGES = frozenset({
    "coinbase", "kraken", "binance", "gemini", "bitfinex",
    "kucoin", "crypto.com", "bybit", "okx", "huobi",
})

# Words that look like ticker symbols but are not holdings
_TEXT_SKIP_TOKENS = frozenset({
    "AS", "OF", "UTC", "USD", "TOTAL", "ASSET", "PRICE", "VALUE", "PAGE",
    "MARKET", "QUANTITY", "TIMESTAMP", "TRANSACTION", "TYPE", "NOTES",
    "SUBTOTAL", "FILTER", "ACCOUNT", "DATE", "RANGE", "NO", "REPORT",
    "HISTORY", "SUMMARY", "PORTFOLIO", "FROM", "TO", "TAX", "FOR",
})

_QUANTITY_HEADERS = frozenset({
    "amount", "balance", "quantity", "qty", "units", "shares",
    "holdings", "available", "total", "free",
})
_SYMBOL_HEADERS = frozenset({
    "asset", "symbol", "coin", "currency", "ticker", "token",
})


# ── Stage 0: PDF text extraction ──────────────────────────────────────────────

def _extract(pdf_bytes: bytes):
    """Return (full_text, tables) from the PDF."""
    import pdfplumber

    text_parts: list[str] = []
    all_tables: list[list[list[str]]] = []

    with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
        for page in pdf.pages[:30]:
            txt = page.extract_text() or ""
            if txt:
                text_parts.append(txt)
            for table in (page.extract_tables() or []):
                clean = [
                    [str(cell or "").strip() for cell in row]
                    for row in table
                    if any(cell for cell in row)
                ]
                if len(clean) > 1:
                    all_tables.append(clean)
                    for row in clean:
                        text_parts.append(" | ".join(row))

    return "\n".join(text_parts), all_tables


# ── Stage 1: Claude AI ────────────────────────────────────────────────────────

def _parse_with_claude(text: str, exchange_name: str) -> List[Dict]:
    """Ask Claude to extract structured holdings from the PDF text."""
    api_key = getattr(settings, "ANTHROPIC_API_KEY", "")
    if not api_key:
        logger.warning("pdf_parse_no_anthropic_key")
        return []

    try:
        import anthropic
        client = anthropic.Anthropic(api_key=api_key)

        prompt = (
            f"Extract every current asset holding from this {exchange_name} portfolio statement.\n\n"
            "Return ONLY valid JSON, no other text:\n"
            '{\n'
            '  "holdings": [\n'
            '    {"symbol": "BTC",  "quantity": "0.0530515", "asset_class": "crypto"},\n'
            '    {"symbol": "ADA",  "quantity": "199.779147","asset_class": "crypto"},\n'
            '    {"symbol": "USDC", "quantity": "500.0",     "asset_class": "cash_equivalent"}\n'
            '  ]\n'
            '}\n\n'
            "Rules:\n"
            "- symbol: ticker/symbol only (BTC, ETH, ADA, SOL…) — no full names\n"
            "- quantity: the CURRENT BALANCE as a decimal string (positive)\n"
            "- asset_class: exactly 'crypto', 'equity', or 'cash_equivalent'\n"
            "- Skip zero/negative balances, header rows, date rows, and totals\n\n"
            f"Statement text:\n{text[:12000]}"
        )

        message = client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=2048,
            messages=[{"role": "user", "content": prompt}],
        )

        raw = message.content[0].text.strip()
        raw = re.sub(r"^```(?:json)?\s*", "", raw, flags=re.MULTILINE)
        raw = re.sub(r"```\s*$",          "", raw, flags=re.MULTILINE)

        data     = json.loads(raw)
        holdings = data.get("holdings", [])
        logger.info("pdf_parse_claude_ok", exchange=exchange_name, count=len(holdings))
        return holdings

    except Exception as exc:
        logger.error("pdf_parse_claude_failed", exchange=exchange_name, error=str(exc))
        return []


# ── Stage 2: Table-based extraction ──────────────────────────────────────────

def _first_number_in_cell(cell: str) -> str | None:
    """Return the first positive decimal found in a (possibly multi-line) cell."""
    for part in re.split(r"[\n\r]+", cell):
        cleaned = part.strip().replace(",", "")
        try:
            n = Decimal(cleaned)
            if n > 0:
                return cleaned
        except InvalidOperation:
            pass
    return None

def _parse_from_tables(tables: list, exchange_name: str) -> List[Dict]:
    results: list[dict] = []

    for table in tables:
        if len(table) < 2:
            continue

        header = [h.lower().strip() for h in table[0]]

        sym_col = qty_col = None
        for i, h in enumerate(header):
            if h in _SYMBOL_HEADERS and sym_col is None:
                sym_col = i
            if h in _QUANTITY_HEADERS and qty_col is None:
                qty_col = i

        if sym_col is None or qty_col is None:
            continue

        seen: set[str] = set()
        for row in table[1:]:
            if len(row) <= max(sym_col, qty_col):
                continue
            sym     = re.split(r"[\n\r]", row[sym_col])[0].strip().upper()
            qty_str = _first_number_in_cell(row[qty_col])

            if not sym or len(sym) > 20 or not re.match(r"^[A-Z][A-Z0-9.]{0,19}$", sym):
                continue
            if sym in _TEXT_SKIP_TOKENS or sym in seen:
                continue
            if qty_str is None:
                continue

            seen.add(sym)
            results.append({
                "symbol":      sym,
                "quantity":    qty_str,
                "asset_class": _resolve_asset_class(sym, "", exchange_name),
            })

    logger.info("pdf_parse_tables_ok", exchange=exchange_name, count=len(results))
    return results


# ── Stage 3: Text-pattern regex (Coinbase / Kraken / Binance style) ───────────

def _parse_from_text(text: str, exchange_name: str) -> List[Dict]:
    """
    Handles PDFs where holdings appear as:
        SYMBOL
        quantity_number
        as of DATE   ← (optional, used as confirmation the line above is a quantity)

    Works for Coinbase transaction history reports and similar formats.
    """
    # Match:  ^SYMBOL\nNUMBER  (the number line is what follows the all-caps symbol)
    pattern = re.compile(r"^([A-Z]{2,10})\n([\d]+\.[\d]+)", re.MULTILINE)

    results: list[dict] = []
    seen:    set[str]   = set()

    for m in pattern.finditer(text):
        sym = m.group(1).strip()
        qty = m.group(2).strip()

        if sym in _TEXT_SKIP_TOKENS or sym in seen:
            continue

        try:
            if Decimal(qty) <= 0:
                continue
        except InvalidOperation:
            continue

        seen.add(sym)
        results.append({
            "symbol":      sym,
            "quantity":    qty,
            "asset_class": _resolve_asset_class(sym, "", exchange_name),
        })

    logger.info("pdf_parse_text_ok", exchange=exchange_name, count=len(results))
    return results


# ── Asset-class helper ────────────────────────────────────────────────────────

def _resolve_asset_class(symbol: str, declared: str, exchange_name: str) -> str:
    upper = symbol.upper()
    if upper in _STABLECOINS:
        return "cash_equivalent"
    if declared in ("crypto", "equity", "cash_equivalent"):
        return declared
    if any(ex in exchange_name.lower() for ex in _CRYPTO_EXCHANGES):
        return "crypto"
    # Pure letter tickers ≤ 5 chars → likely equity
    if re.match(r"^[A-Z]{1,5}$", upper):
        return "equity"
    return "crypto"


# ── Main entry point ──────────────────────────────────────────────────────────

async def parse_and_store_statement(
    db: AsyncSession,
    user: User,
    exchange_name: str,
    pdf_bytes: bytes,
) -> int:
    """
    Parse PDF → upsert Account + Holding rows.
    Returns the number of holdings stored (0 on failure).
    """
    logger.info("pdf_parse_start", exchange=exchange_name, user_id=str(user.id))

    # ── Extract text + tables ────────────────────────────────────────────────
    try:
        pdf_text, tables = _extract(pdf_bytes)
    except Exception as exc:
        logger.error("pdf_extract_failed", exchange=exchange_name, error=str(exc))
        return 0

    if not pdf_text.strip() and not tables:
        logger.warning("pdf_empty", exchange=exchange_name)
        return 0

    # ── Try each parsing stage until one returns results ─────────────────────
    raw_holdings = _parse_with_claude(pdf_text, exchange_name)

    if not raw_holdings:
        logger.info("pdf_stage2_tables", exchange=exchange_name)
        raw_holdings = _parse_from_tables(tables, exchange_name)

    if not raw_holdings:
        logger.info("pdf_stage3_text_pattern", exchange=exchange_name)
        raw_holdings = _parse_from_text(pdf_text, exchange_name)

    if not raw_holdings:
        logger.warning("pdf_no_holdings_found", exchange=exchange_name)
        return 0

    logger.info("pdf_raw_holdings", exchange=exchange_name, count=len(raw_holdings),
                symbols=[h.get("symbol") for h in raw_holdings])

    # ── Get or create virtual Account for this exchange ──────────────────────
    provider_account_id = "pdf_" + re.sub(r"[^a-z0-9]", "_", exchange_name.lower())[:40]

    result = await db.execute(
        select(Account).where(
            Account.user_id           == user.id,
            Account.provider          == "pdf_upload",
            Account.provider_account_id == provider_account_id,
        )
    )
    account = result.scalar_one_or_none()

    if not account:
        account = Account(
            id=uuid4(),
            user_id=user.id,
            provider="pdf_upload",
            provider_account_id=provider_account_id,
            name=f"{exchange_name.title()} (Statement)",
            account_type="exchange",
            is_active=True,
        )
        db.add(account)
        await db.flush()

    # ── Upsert each holding ───────────────────────────────────────────────────
    now    = datetime.now(timezone.utc)
    source = re.sub(r"[^a-z0-9_]", "_", exchange_name.lower())[:50]
    stored = 0

    for raw in raw_holdings:
        symbol      = str(raw.get("symbol", "")).strip().upper()
        qty_str     = str(raw.get("quantity", "0")).strip().replace(",", "")
        asset_class = _resolve_asset_class(
            symbol,
            str(raw.get("asset_class", "")).strip().lower(),
            exchange_name,
        )

        if not symbol or len(symbol) > 20:
            continue
        try:
            qty = Decimal(qty_str)
            if qty <= 0:
                continue
        except InvalidOperation:
            continue

        await db.execute(
            pg_insert(Holding)
            .values(
                id=uuid4(),
                user_id=user.id,
                account_id=account.id,
                canonical_symbol=symbol,
                asset_class=asset_class,
                quantity=qty,
                source=source,
                retrieved_at=now,
            )
            .on_conflict_do_update(
                index_elements=["account_id", "canonical_symbol"],
                set_={
                    "quantity":     qty,
                    "source":       source,
                    "retrieved_at": now,
                    "last_updated": now,
                },
            )
        )
        stored += 1

    await db.commit()
    logger.info("pdf_parse_done", exchange=exchange_name, stored=stored)
    return stored
