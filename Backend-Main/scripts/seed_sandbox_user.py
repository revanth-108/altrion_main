"""
Seed script: adds a realistic diversified portfolio to the sandboxuser01 account.

Asset mix (covers all 4 types the user wants to test):
  Crypto    : BTC, ETH, SOL, USDC
  Stocks    : AAPL, MSFT, NVDA, GOOGL, XOM, JPM
  ETFs      : VOO, QQQ, VTI, SCHD
  Mutual Fn : FXAIX (Fidelity 500 Index), VFIAX (Vanguard 500 Admiral), PRGFX (T.Rowe Growth)

Run from the altrion-backend directory:
  python scripts/seed_sandbox_user.py
"""
from __future__ import annotations

import asyncio
import sys
import os
from datetime import datetime, timezone
from decimal import Decimal
import uuid
from uuid import uuid4

# Add project root to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.pool import NullPool

from app.core.config import settings

# ── Engine ─────────────────────────────────────────────────────────────────────
engine = create_async_engine(
    settings.DATABASE_URL.replace("postgresql://", "postgresql+asyncpg://"),
    echo=False,
    poolclass=NullPool,
    connect_args={
        "statement_cache_size": 0,
        "prepared_statement_cache_size": 0,
        "prepared_statement_name_func": lambda: f"__asyncpg_{uuid4()}__",
        "ssl": "require",
    },
)
SessionLocal = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

NOW = datetime.now(timezone.utc)

# ── Seed data ──────────────────────────────────────────────────────────────────

# Securities: covers stocks, ETFs, and mutual funds
# (crypto has no security record — it maps directly via canonical_symbol)
SECURITIES = [
    # ── Stocks ────────────────────────────────────────────────────────────────
    dict(security_id="plaid_sec_aapl",   name="Apple Inc.",             ticker_symbol="AAPL",  type="equity",       is_cash=False, close_price=Decimal("211.45")),
    dict(security_id="plaid_sec_msft",   name="Microsoft Corporation",  ticker_symbol="MSFT",  type="equity",       is_cash=False, close_price=Decimal("449.30")),
    dict(security_id="plaid_sec_nvda",   name="NVIDIA Corporation",     ticker_symbol="NVDA",  type="equity",       is_cash=False, close_price=Decimal("135.60")),
    dict(security_id="plaid_sec_googl",  name="Alphabet Inc. Class A",  ticker_symbol="GOOGL", type="equity",       is_cash=False, close_price=Decimal("178.20")),
    dict(security_id="plaid_sec_xom",    name="Exxon Mobil Corporation",ticker_symbol="XOM",   type="equity",       is_cash=False, close_price=Decimal("108.75")),
    dict(security_id="plaid_sec_jpm",    name="JPMorgan Chase & Co.",   ticker_symbol="JPM",   type="equity",       is_cash=False, close_price=Decimal("267.30")),
    # ── ETFs ──────────────────────────────────────────────────────────────────
    dict(security_id="plaid_sec_voo",    name="Vanguard S&P 500 ETF",   ticker_symbol="VOO",   type="etf",          is_cash=False, close_price=Decimal("548.90")),
    dict(security_id="plaid_sec_qqq",    name="Invesco QQQ Trust",      ticker_symbol="QQQ",   type="etf",          is_cash=False, close_price=Decimal("496.10")),
    dict(security_id="plaid_sec_vti",    name="Vanguard Total Stock Market ETF", ticker_symbol="VTI", type="etf",   is_cash=False, close_price=Decimal("285.40")),
    dict(security_id="plaid_sec_schd",   name="Schwab US Dividend Equity ETF", ticker_symbol="SCHD", type="etf",   is_cash=False, close_price=Decimal("82.35")),
    # ── Mutual Funds ──────────────────────────────────────────────────────────
    dict(security_id="plaid_sec_fxaix",  name="Fidelity 500 Index Fund",          ticker_symbol="FXAIX",  type="mutual fund", is_cash=False, close_price=Decimal("202.15")),
    dict(security_id="plaid_sec_vfiax",  name="Vanguard 500 Index Fund Admiral",  ticker_symbol="VFIAX",  type="mutual fund", is_cash=False, close_price=Decimal("528.80")),
    dict(security_id="plaid_sec_prgfx",  name="T. Rowe Price Growth Stock Fund",  ticker_symbol="PRGFX",  type="mutual fund", is_cash=False, close_price=Decimal("89.60")),
]

# Holdings: (security_id|None, canonical_symbol, asset_class, quantity, institution_price)
# institution_value is computed as quantity × institution_price
HOLDINGS_SPEC = [
    # ── Crypto ────────────────────────────────────────────────────────────────
    dict(sec_id=None,              sym="BTC",   asset_class="crypto",           qty=Decimal("0.75"),     price=Decimal("67800.00")),
    dict(sec_id=None,              sym="ETH",   asset_class="crypto",           qty=Decimal("8.50"),     price=Decimal("3620.00")),
    dict(sec_id=None,              sym="SOL",   asset_class="crypto",           qty=Decimal("45.0"),     price=Decimal("188.50")),
    dict(sec_id=None,              sym="USDC",  asset_class="cash_equivalent",  qty=Decimal("2500.0"),   price=Decimal("1.00")),
    # ── Stocks ────────────────────────────────────────────────────────────────
    dict(sec_id="plaid_sec_aapl",  sym="AAPL",  asset_class="equity",           qty=Decimal("65.0"),     price=Decimal("211.45")),
    dict(sec_id="plaid_sec_msft",  sym="MSFT",  asset_class="equity",           qty=Decimal("22.0"),     price=Decimal("449.30")),
    dict(sec_id="plaid_sec_nvda",  sym="NVDA",  asset_class="equity",           qty=Decimal("80.0"),     price=Decimal("135.60")),
    dict(sec_id="plaid_sec_googl", sym="GOOGL", asset_class="equity",           qty=Decimal("35.0"),     price=Decimal("178.20")),
    dict(sec_id="plaid_sec_xom",   sym="XOM",   asset_class="equity",           qty=Decimal("40.0"),     price=Decimal("108.75")),
    dict(sec_id="plaid_sec_jpm",   sym="JPM",   asset_class="equity",           qty=Decimal("18.0"),     price=Decimal("267.30")),
    # ── ETFs ──────────────────────────────────────────────────────────────────
    dict(sec_id="plaid_sec_voo",   sym="VOO",   asset_class="equity",           qty=Decimal("25.0"),     price=Decimal("548.90")),
    dict(sec_id="plaid_sec_qqq",   sym="QQQ",   asset_class="equity",           qty=Decimal("18.0"),     price=Decimal("496.10")),
    dict(sec_id="plaid_sec_vti",   sym="VTI",   asset_class="equity",           qty=Decimal("30.0"),     price=Decimal("285.40")),
    dict(sec_id="plaid_sec_schd",  sym="SCHD",  asset_class="equity",           qty=Decimal("120.0"),    price=Decimal("82.35")),
    # ── Mutual Funds ──────────────────────────────────────────────────────────
    dict(sec_id="plaid_sec_fxaix", sym="FXAIX", asset_class="equity",           qty=Decimal("50.0"),     price=Decimal("202.15")),
    dict(sec_id="plaid_sec_vfiax", sym="VFIAX", asset_class="equity",           qty=Decimal("10.0"),     price=Decimal("528.80")),
    dict(sec_id="plaid_sec_prgfx", sym="PRGFX", asset_class="equity",           qty=Decimal("55.0"),     price=Decimal("89.60")),
]


async def find_user(session: AsyncSession, email_fragment: str):
    """Find user by partial email match."""
    result = await session.execute(
        text("SELECT id, supabase_user_id, email FROM public.users WHERE email ILIKE :pattern LIMIT 1"),
        {"pattern": f"%{email_fragment}%"},
    )
    return result.fetchone()


async def get_or_create_account(session: AsyncSession, user_id, label: str) -> uuid.UUID:
    """Return existing sandbox brokerage account or create one."""
    result = await session.execute(
        text("""
            SELECT id FROM public.accounts
            WHERE user_id = :uid AND provider = 'sandbox'
            LIMIT 1
        """),
        {"uid": str(user_id)},
    )
    row = result.fetchone()
    if row:
        print(f"  + Using existing sandbox account: {row[0]}")
        return row[0]

    acct_id = uuid.uuid4()
    await session.execute(
        text("""
            INSERT INTO public.accounts
              (id, user_id, provider, provider_account_id, account_type, subtype,
               is_active, created_at, updated_at)
            VALUES
              (:id, :uid, 'sandbox', :ext_id, 'brokerage', 'investment',
               TRUE, NOW(), NOW())
        """),
        {
            "id": str(acct_id),
            "uid": str(user_id),
            "ext_id": f"sandbox_{str(user_id)[:8]}",
        },
    )
    print(f"  + Created sandbox brokerage account: {acct_id}")
    return acct_id


async def upsert_securities(session: AsyncSession):
    """Upsert all securities into the shared securities table."""
    for s in SECURITIES:
        await session.execute(
            text("""
                INSERT INTO public.securities
                  (id, security_id, name, ticker_symbol, type, is_cash_equivalent,
                   close_price, currency, created_at, updated_at)
                VALUES
                  (gen_random_uuid(), :sec_id, :name, :ticker, :type, :is_cash,
                   :close_price, 'USD', NOW(), NOW())
                ON CONFLICT (security_id) DO UPDATE SET
                  name          = EXCLUDED.name,
                  ticker_symbol = EXCLUDED.ticker_symbol,
                  type          = EXCLUDED.type,
                  close_price   = EXCLUDED.close_price,
                  updated_at    = NOW()
            """),
            {
                "sec_id":      s["security_id"],
                "name":        s["name"],
                "ticker":      s["ticker_symbol"],
                "type":        s["type"],
                "is_cash":     s["is_cash"],
                "close_price": float(s["close_price"]),
            },
        )
    print(f"  + Upserted {len(SECURITIES)} securities")


async def upsert_holdings(session: AsyncSession, user_id, account_id):
    """Upsert all holdings for the sandbox account."""
    inserted = 0
    updated = 0
    for h in HOLDINGS_SPEC:
        inst_value = float(h["qty"] * h["price"])
        # Check if holding already exists
        existing = await session.execute(
            text("""
                SELECT id FROM public.holdings
                WHERE account_id = :acct_id AND canonical_symbol = :sym
                LIMIT 1
            """),
            {"acct_id": str(account_id), "sym": h["sym"]},
        )
        row = existing.fetchone()
        if row:
            await session.execute(
                text("""
                    UPDATE public.holdings SET
                      quantity           = :qty,
                      institution_price  = :price,
                      institution_value  = :value,
                      security_id        = :sec_id,
                      retrieved_at       = NOW(),
                      last_updated       = NOW()
                    WHERE id = :hid
                """),
                {
                    "qty":    float(h["qty"]),
                    "price":  float(h["price"]),
                    "value":  inst_value,
                    "sec_id": h["sec_id"],
                    "hid":    str(row[0]),
                },
            )
            updated += 1
        else:
            await session.execute(
                text("""
                    INSERT INTO public.holdings
                      (id, user_id, account_id, canonical_symbol, asset_class,
                       quantity, institution_price, institution_value, security_id,
                       source, retrieved_at, last_updated, created_at)
                    VALUES
                      (gen_random_uuid(), :uid, :acct_id, :sym, :asset_class,
                       :qty, :price, :value, :sec_id,
                       'sandbox', NOW(), NOW(), NOW())
                """),
                {
                    "uid":         str(user_id),
                    "acct_id":     str(account_id),
                    "sym":         h["sym"],
                    "asset_class": h["asset_class"],
                    "qty":         float(h["qty"]),
                    "price":       float(h["price"]),
                    "value":       inst_value,
                    "sec_id":      h["sec_id"],
                },
            )
            inserted += 1

    print(f"  + Holdings: {inserted} inserted, {updated} updated")


async def invalidate_stale_metadata(session: AsyncSession):
    """Force re-enrichment for all symbols we just seeded by resetting refresh_after."""
    symbols = [h["sym"] for h in HOLDINGS_SPEC]
    await session.execute(
        text("""
            UPDATE public.asset_metadata
            SET refresh_after = NOW() - INTERVAL '1 second'
            WHERE canonical_symbol = ANY(:syms)
        """),
        {"syms": symbols},
    )
    print(f"  + Invalidated cached metadata for {len(symbols)} symbols -> will re-enrich on next load")


async def main():
    print("\n[*] Altrion - Sandbox Portfolio Seeder")
    print("=" * 48)

    async with SessionLocal() as session:
        # ── 1. Find user ──────────────────────────────────────────────────────
        print("\n[1/5] Looking up sandboxuser01...")
        user_row = await find_user(session, "sandboxuser01")
        if not user_row:
            print("  x  User 'sandboxuser01' not found in public.users")
            print("     Create the account in Supabase Auth first, then re-run this script.")
            return

        user_id = user_row[0]
        print(f"  +  Found user: {user_row[2]}  (id={user_id})")

        # ── 2. Upsert securities ──────────────────────────────────────────────
        print("\n[2/5] Upserting securities...")
        await upsert_securities(session)

        # ── 3. Get or create sandbox account ─────────────────────────────────
        print("\n[3/5] Getting/creating sandbox brokerage account...")
        account_id = await get_or_create_account(session, user_id, "Sandbox Brokerage")

        # ── 4. Upsert holdings ────────────────────────────────────────────────
        print("\n[4/5] Upserting holdings...")
        await upsert_holdings(session, user_id, account_id)

        # ── 5. Invalidate metadata cache ──────────────────────────────────────
        print("\n[5/5] Invalidating metadata cache...")
        await invalidate_stale_metadata(session)

        await session.commit()

    await engine.dispose()

    # ── Summary ───────────────────────────────────────────────────────────────
    total_value = sum(float(h["qty"] * h["price"]) for h in HOLDINGS_SPEC)
    crypto_val  = sum(float(h["qty"] * h["price"]) for h in HOLDINGS_SPEC if h["asset_class"] == "crypto")
    equity_val  = sum(float(h["qty"] * h["price"]) for h in HOLDINGS_SPEC if h["asset_class"] == "equity")
    cash_val    = sum(float(h["qty"] * h["price"]) for h in HOLDINGS_SPEC if h["asset_class"] == "cash_equivalent")

    stocks_val  = sum(float(h["qty"] * h["price"]) for h in HOLDINGS_SPEC if h["asset_class"] == "equity" and h["sec_id"] and "voo" not in h["sec_id"] and "qqq" not in h["sec_id"] and "vti" not in h["sec_id"] and "schd" not in h["sec_id"] and "fxaix" not in h["sec_id"] and "vfiax" not in h["sec_id"] and "prgfx" not in h["sec_id"])
    etf_val     = sum(float(h["qty"] * h["price"]) for h in HOLDINGS_SPEC if h["sec_id"] in ("plaid_sec_voo","plaid_sec_qqq","plaid_sec_vti","plaid_sec_schd"))
    mf_val      = sum(float(h["qty"] * h["price"]) for h in HOLDINGS_SPEC if h["sec_id"] in ("plaid_sec_fxaix","plaid_sec_vfiax","plaid_sec_prgfx"))

    print("\n" + "=" * 48)
    print("[OK] Seed complete!")
    print(f"\n   Portfolio value   : ${total_value:>12,.2f}")
    print(f"   +- Crypto         : ${crypto_val:>12,.2f}  ({crypto_val/total_value*100:.1f}%)")
    print(f"   +- Stocks         : ${stocks_val:>12,.2f}  ({stocks_val/total_value*100:.1f}%)")
    print(f"   +- ETFs           : ${etf_val:>12,.2f}  ({etf_val/total_value*100:.1f}%)")
    print(f"   +- Mutual Funds   : ${mf_val:>12,.2f}  ({mf_val/total_value*100:.1f}%)")
    print(f"   +- Cash / Stable  : ${cash_val:>12,.2f}  ({cash_val/total_value*100:.1f}%)")
    print(f"\n   Holdings: {len(HOLDINGS_SPEC)} positions across 4 asset types")
    print(f"   Securities: {len(SECURITIES)} records (stocks + ETFs + mutual funds)")
    print()
    print("   Next step: log in as sandboxuser01 and open Portfolio X-Ray.")
    print("   FMP metadata enrichment runs automatically on first load.")
    print()


if __name__ == "__main__":
    asyncio.run(main())
