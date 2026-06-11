"""
plaid_persist.py — persistence helpers for Plaid sync operations.

Each function receives already-parsed Plaid response data and writes it into
the database using async SQLAlchemy.  Controllers should call these instead of
embedding upsert logic inline.
"""
from datetime import datetime, date as date_type
from typing import Optional
import json
import uuid

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete, text

from app.models.account import Account
from app.models.transaction import Transaction
from app.models.holding import Holding
from app.models.investment_transaction import InvestmentTransaction
from app.models.security import Security
from app.core.logging import get_logger
from app.services.plaid_safe import (
    normalize_plaid_list,
    normalize_plaid_value,
    parse_plaid_timestamp,
    value_type,
)

logger = get_logger()


# ---------------------------------------------------------------------------
# Helper
# ---------------------------------------------------------------------------

def _parse_date(value) -> Optional[date_type]:
    """Convert a string, None, or date object to datetime.date."""
    if not value or value == "None":
        return None
    if isinstance(value, date_type):
        return value
    try:
        return date_type.fromisoformat(str(value))
    except (ValueError, TypeError):
        return None


def _security_asset_class(sec_type: str, is_cash_equivalent: bool) -> str:
    """Map Plaid security type string to our internal asset_class."""
    t = (sec_type or "").lower()
    if is_cash_equivalent or "cash" in t or "money market" in t:
        return "cash_equivalent"
    if "crypto" in t or "cryptocurrency" in t:
        return "crypto"
    if t in ("equity", "etf", "mutual fund", "derivative"):
        return "equity"
    return "other"


async def find_existing_plaid_account(
    db: AsyncSession,
    user_id: uuid.UUID,
    item_id: str,
    provider_account_id: str,
) -> Account | None:
    """
    Find a Plaid account by the full composite key.

    Falls back to a legacy item_id=NULL row so older connections can be
    reattached without creating a duplicate.
    """
    exact_stmt = select(Account).where(
        Account.user_id == user_id,
        Account.provider == "plaid",
        Account.item_id == item_id,
        Account.provider_account_id == provider_account_id,
    )
    exact_result = await db.execute(exact_stmt)
    exact = exact_result.scalar_one_or_none()
    if exact:
        return exact

    legacy_stmt = select(Account).where(
        Account.user_id == user_id,
        Account.provider == "plaid",
        Account.item_id.is_(None),
        Account.provider_account_id == provider_account_id,
    )
    legacy_result = await db.execute(legacy_stmt)
    legacy = legacy_result.scalar_one_or_none()
    if legacy:
        legacy.item_id = item_id
        return legacy

    return None


# ---------------------------------------------------------------------------
# 1. upsert_accounts
# ---------------------------------------------------------------------------

async def upsert_accounts(
    db: AsyncSession,
    user_id: uuid.UUID,
    item_id: str,
    plaid_accounts: list,
) -> list:
    """
    Upsert Plaid accounts into the accounts table.

    Args:
        db:             Async DB session.
        user_id:        Internal user UUID.
        item_id:        Plaid item_id the accounts belong to.
        plaid_accounts: List of account dicts from /accounts/get or
                        /accounts/balance/get.  Each dict must have at least:
                        account_id, type, subtype, name, mask, balances{}.

    Returns:
        List of Account ORM objects (both updated and newly created).
    """
    now = datetime.utcnow()
    result_accounts: list[Account] = []

    for raw_pa in normalize_plaid_list(plaid_accounts):
        pa = normalize_plaid_value(raw_pa)
        plaid_account_id = pa.get("account_id") or pa.get("id")
        if not plaid_account_id:
            logger.warning(
                "upsert_accounts: account missing account_id, skipping",
                account_type=value_type(raw_pa),
            )
            continue
        balances = normalize_plaid_value(pa.get("balances"))

        existing = await find_existing_plaid_account(
            db=db,
            user_id=user_id,
            item_id=item_id,
            provider_account_id=plaid_account_id,
        )

        if existing:
            existing.name = pa.get("name")
            existing.subtype = pa.get("subtype")
            existing.mask = pa.get("mask")
            existing.balance_available = balances.get("available")
            existing.balance_current = balances.get("current")
            existing.balance_limit = balances.get("limit")
            existing.balance_currency = balances.get("iso_currency_code", "USD")
            existing.last_synced_at = now
            result_accounts.append(existing)
        else:
            new_account = Account(
                user_id=user_id,
                provider="plaid",
                provider_account_id=plaid_account_id,
                account_type=pa.get("type", "bank"),
                subtype=pa.get("subtype"),
                name=pa.get("name"),
                mask=pa.get("mask"),
                item_id=item_id,
                institution_name=pa.get("institution_name", ""),
                balance_available=balances.get("available"),
                balance_current=balances.get("current"),
                balance_limit=balances.get("limit"),
                balance_currency=balances.get("iso_currency_code", "USD"),
                is_active=True,
                last_synced_at=now,
            )
            db.add(new_account)
            result_accounts.append(new_account)

    await db.flush()  # populate IDs without committing — caller commits
    logger.info(
        "upsert_accounts complete",
        user_id=str(user_id),
        item_id=item_id,
        count=len(result_accounts),
    )
    return result_accounts


# ---------------------------------------------------------------------------
# 2. upsert_transactions
# ---------------------------------------------------------------------------

async def upsert_transactions(
    db: AsyncSession,
    user_id: uuid.UUID,
    account_map: dict,
    added: list,
    modified: list,
    removed: list,
    item_id: str | None = None,
) -> dict:
    """
    Persist incremental transaction changes from /transactions/sync.

    Args:
        db:          Async DB session.
        user_id:     Internal user UUID.
        account_map: {plaid_account_id: internal Account.id (UUID)}
        added:       List of new transaction dicts.
        modified:    List of updated transaction dicts.
        removed:     List of dicts/strings with transaction_id to delete.

    Returns:
        {"added": int, "modified": int, "removed": int}
    """
    now = datetime.utcnow()

    # --- deletions ---
    removed_ids = []
    for item in removed:
        tid = item["transaction_id"] if isinstance(item, dict) else item
        removed_ids.append(tid)

    removed_count = 0
    if removed_ids:
        del_stmt = delete(Transaction).where(
            Transaction.user_id == user_id,
            Transaction.transaction_id.in_(removed_ids),
        )
        del_res = await db.execute(del_stmt)
        removed_count = del_res.rowcount

    # --- upsert added + modified ---
    added_count = 0
    modified_count = 0
    skipped_count = 0

    for raw_txn in (normalize_plaid_list(added) + normalize_plaid_list(modified)):
        txn = normalize_plaid_value(raw_txn)
        if not txn:
            skipped_count += 1
            logger.warning("upsert_transactions: transaction parse skipped", transaction_type=value_type(raw_txn))
            continue
        internal_account_id = account_map.get(txn.get("account_id"))
        logger.info(
            "transactions_account_match",
            user_id=str(user_id),
            item_id=item_id,
            plaid_account_id=txn.get("account_id"),
            transaction_id_present=bool(txn.get("transaction_id")),
            matched=internal_account_id is not None,
        )
        if not internal_account_id:
            skipped_count += 1
            logger.warning(
                "upsert_transactions: account not in account_map, skipping",
                plaid_account_id=txn.get("account_id"),
                transaction_id=txn.get("transaction_id"),
            )
            continue

        stmt = select(Transaction).where(
            Transaction.user_id == user_id,
            Transaction.transaction_id == txn["transaction_id"],
        )
        res = await db.execute(stmt)
        existing = res.scalar_one_or_none()

        if existing:
            existing.amount = txn.get("amount")
            existing.date = _parse_date(txn.get("date"))
            existing.authorized_date = _parse_date(txn.get("authorized_date"))
            existing.name = txn.get("name")
            existing.merchant_name = txn.get("merchant_name")
            existing.pending = txn.get("pending", False)
            existing.payment_channel = txn.get("payment_channel")
            existing.category_primary = txn.get("category_primary")
            existing.category_detailed = txn.get("category_detailed")
            existing.category_confidence = txn.get("category_confidence")
            existing.logo_url = txn.get("logo_url")
            existing.website = txn.get("website")
            modified_count += 1
        else:
            new_txn = Transaction(
                user_id=user_id,
                account_id=internal_account_id,
                transaction_id=txn["transaction_id"],
                amount=txn.get("amount"),
                date=_parse_date(txn.get("date")),
                authorized_date=_parse_date(txn.get("authorized_date")),
                name=txn.get("name"),
                merchant_name=txn.get("merchant_name"),
                pending=txn.get("pending", False),
                payment_channel=txn.get("payment_channel"),
                category_primary=txn.get("category_primary"),
                category_detailed=txn.get("category_detailed"),
                category_confidence=txn.get("category_confidence"),
                logo_url=txn.get("logo_url"),
                website=txn.get("website"),
            )
            db.add(new_txn)
            added_count += 1

    await db.flush()
    logger.info(
        "upsert_transactions complete",
        user_id=str(user_id),
        transactions_received=len(added) + len(modified),
        added=added_count,
        modified=modified_count,
        removed=removed_count,
        skipped=skipped_count,
    )
    return {"added": added_count, "modified": modified_count, "removed": removed_count, "skipped": skipped_count}


async def upsert_credit_liabilities_from_account_balances(
    db: AsyncSession,
    user_id: uuid.UUID,
    accounts: list[Account],
    exclude_provider_account_ids: set[str] | None = None,
) -> dict:
    """
    Ensure credit-card accounts with Plaid balances have liability rows.

    Plaid /liabilities/get can omit card detail for some institutions, while
    /accounts/balance/get still returns the card balance and limit. The current
    debt value remains on accounts.balance_current; this row lets the DB-backed
    liabilities API classify and display the card consistently.
    """
    excluded = exclude_provider_account_ids or set()
    now = datetime.utcnow()
    count = 0
    skipped = 0
    total_balance = 0.0

    for account in accounts:
        account_type = (account.account_type or "").strip().lower()
        subtype = (account.subtype or "").strip().lower()
        if account_type != "credit" and subtype != "credit card":
            continue
        if not account.provider_account_id:
            skipped += 1
            continue
        if account.provider_account_id in excluded:
            continue

        balance = account.balance_current
        debt_amount = abs(float(balance)) if balance is not None else None
        if debt_amount is None:
            skipped += 1
            continue
        total_balance += debt_amount

        await db.execute(
            text("""
                INSERT INTO public.liabilities (
                    user_id, account_id, provider_account_id, liability_type,
                    credit_last_statement_balance,
                    last_synced_at, created_at, updated_at
                ) VALUES (
                    :user_id, :account_id, :provider_account_id, 'credit',
                    :debt_amount,
                    :now, :now, :now
                )
                ON CONFLICT (user_id, provider_account_id, liability_type)
                DO UPDATE SET
                    account_id = EXCLUDED.account_id,
                    credit_last_statement_balance = COALESCE(
                        public.liabilities.credit_last_statement_balance,
                        EXCLUDED.credit_last_statement_balance
                    ),
                    last_synced_at = EXCLUDED.last_synced_at,
                    updated_at = EXCLUDED.updated_at
            """),
            {
                "user_id": str(user_id),
                "account_id": str(account.id),
                "provider_account_id": account.provider_account_id,
                "debt_amount": debt_amount,
                "now": now,
            },
        )
        count += 1
        logger.info(
            "credit_liability_from_balance_created",
            user_id=str(user_id),
            plaid_account_id=account.provider_account_id,
            account_id=str(account.id),
            created=True,
        )

    await db.flush()
    return {
        "credit_from_balance": count,
        "credit_from_balance_skipped": skipped,
        "credit_from_balance_total": total_balance,
    }


# ---------------------------------------------------------------------------
# 3. upsert_securities
# ---------------------------------------------------------------------------

async def upsert_securities(
    db: AsyncSession,
    securities: list,
) -> dict:
    """
    Upsert securities into the global securities table.

    Args:
        db:         Async DB session.
        securities: List of security dicts from Plaid (parse_security output
                    or raw /investments/* response).

    Returns:
        {plaid_security_id: Security ORM object}
    """
    security_map: dict[str, Security] = {}

    for raw_sec in normalize_plaid_list(securities):
        sec = normalize_plaid_value(raw_sec)
        sid = sec.get("security_id")
        if not sid:
            continue

        stmt = select(Security).where(Security.security_id == sid)
        res = await db.execute(stmt)
        existing = res.scalar_one_or_none()

        if existing:
            existing.name = sec.get("name") or existing.name
            existing.ticker_symbol = sec.get("ticker_symbol") or existing.ticker_symbol
            existing.type = sec.get("type") or existing.type
            existing.is_cash_equivalent = sec.get("is_cash_equivalent", existing.is_cash_equivalent)
            existing.close_price = sec.get("close_price")
            existing.currency = sec.get("currency") or sec.get("iso_currency_code") or existing.currency
            security_map[sid] = existing
        else:
            new_sec = Security(
                security_id=sid,
                name=sec.get("name"),
                ticker_symbol=sec.get("ticker_symbol"),
                type=sec.get("type"),
                is_cash_equivalent=sec.get("is_cash_equivalent", False),
                close_price=sec.get("close_price"),
                currency=sec.get("currency") or sec.get("iso_currency_code", "USD"),
            )
            db.add(new_sec)
            security_map[sid] = new_sec

    await db.flush()

    securities_data_map = {
        sec.get("security_id"): sec
        for sec in normalize_plaid_list(securities)
        if sec.get("security_id")
    }

    logger.info("upsert_securities complete", count=len(security_map))
    return security_map, securities_data_map


# ---------------------------------------------------------------------------
# 4. upsert_holdings
# ---------------------------------------------------------------------------

async def upsert_holdings(
    db: AsyncSession,
    user_id: uuid.UUID,
    account_map: dict,
    holdings: list,
    security_map: dict,
    securities_data_map: dict = None,
    item_id: str | None = None,
) -> int:
    """
    Upsert investment holdings into the holdings table.

    Args:
        db:                  Async DB session.
        user_id:             Internal user UUID.
        account_map:         {plaid_account_id: internal Account.id (UUID)}
        holdings:            List of holding dicts from Plaid.
        security_map:        {plaid_security_id: Security ORM object} — from upsert_securities.
        securities_data_map: {plaid_security_id: raw Plaid dict} — avoids ORM lazy loads.

    Returns:
        Number of rows upserted.
    """
    now = datetime.utcnow()
    upserted = 0
    _sec_data = securities_data_map or {}

    for raw_holding in normalize_plaid_list(holdings):
        h = normalize_plaid_value(raw_holding)
        plaid_account_id = h.get("account_id")
        internal_account_id = account_map.get(plaid_account_id)
        if not internal_account_id:
            logger.warning(
                "upsert_holdings: account not in account_map, skipping",
                user_id=str(user_id),
                item_id=item_id,
                plaid_account_id=plaid_account_id,
                security_id=h.get("security_id"),
            )
            continue

        raw_sec = normalize_plaid_value(_sec_data.get(h.get("security_id"), {}))
        ticker = raw_sec.get("ticker_symbol") or h.get("security_id", "UNKNOWN")
        canonical_symbol = ticker.upper()[:20]  # holdings.canonical_symbol is VARCHAR(20)

        sec_type = raw_sec.get("type", "") or ""
        is_cash_eq = bool(raw_sec.get("is_cash_equivalent", False))
        asset_class = _security_asset_class(sec_type, is_cash_eq)

        stmt = select(Holding).where(
            Holding.account_id == internal_account_id,
            Holding.canonical_symbol == canonical_symbol,
        )
        res = await db.execute(stmt)
        existing = res.scalar_one_or_none()

        if existing:
            existing.quantity = h.get("quantity", 0)
            existing.institution_price = h.get("institution_price")
            existing.institution_value = h.get("institution_value")
            existing.cost_basis = h.get("cost_basis")
            existing.security_id = h.get("security_id")
            existing.asset_class = asset_class
            existing.retrieved_at = now
            existing.last_updated = now
        else:
            db.add(Holding(
                user_id=user_id,
                account_id=internal_account_id,
                canonical_symbol=canonical_symbol,
                asset_class=asset_class,
                quantity=h.get("quantity", 0),
                institution_price=h.get("institution_price"),
                institution_value=h.get("institution_value"),
                cost_basis=h.get("cost_basis"),
                security_id=h.get("security_id"),
                source="plaid",
                retrieved_at=now,
            ))

        upserted += 1

    await db.flush()
    logger.info("upsert_holdings complete", user_id=str(user_id), upserted=upserted)
    return upserted


# ---------------------------------------------------------------------------
# 5. upsert_investment_transactions
# ---------------------------------------------------------------------------

async def upsert_investment_transactions(
    db: AsyncSession,
    user_id: uuid.UUID,
    account_map: dict,
    inv_transactions: list,
    item_id: str | None = None,
) -> int:
    """
    Upsert investment transactions into the investment_transactions table.

    Args:
        db:               Async DB session.
        user_id:          Internal user UUID.
        account_map:      {plaid_account_id: internal Account.id (UUID)}
        inv_transactions: List of investment transaction dicts from Plaid.

    Returns:
        Number of rows upserted.
    """
    upserted = 0

    for raw_txn in normalize_plaid_list(inv_transactions):
        txn = normalize_plaid_value(raw_txn)
        internal_account_id = account_map.get(txn.get("account_id"))
        if not internal_account_id:
            logger.warning(
                "upsert_investment_transactions: account not in account_map, skipping",
                user_id=str(user_id),
                item_id=item_id,
                plaid_account_id=txn.get("account_id"),
                investment_transaction_id=txn.get("investment_transaction_id"),
            )
            continue

        inv_txn_id = txn.get("investment_transaction_id")
        if not inv_txn_id:
            continue

        stmt = select(InvestmentTransaction).where(
            InvestmentTransaction.user_id == user_id,
            InvestmentTransaction.investment_transaction_id == inv_txn_id,
        )
        res = await db.execute(stmt)
        existing = res.scalar_one_or_none()

        if existing:
            existing.amount = txn.get("amount")
            existing.quantity = txn.get("quantity")
            existing.price = txn.get("price")
            existing.fees = txn.get("fees")
            existing.type = txn.get("type")
            existing.subtype = txn.get("subtype")
        else:
            db.add(InvestmentTransaction(
                user_id=user_id,
                account_id=internal_account_id,
                investment_transaction_id=inv_txn_id,
                security_id=txn.get("security_id"),
                date=_parse_date(txn.get("date")),
                name=txn.get("name"),
                quantity=txn.get("quantity"),
                amount=txn.get("amount"),
                price=txn.get("price"),
                fees=txn.get("fees"),
                type=txn.get("type"),
                subtype=txn.get("subtype"),
                currency=txn.get("currency", "USD"),
            ))

        upserted += 1

    await db.flush()
    logger.info(
        "upsert_investment_transactions complete",
        user_id=str(user_id),
        upserted=upserted,
    )
    return upserted


# ---------------------------------------------------------------------------
# 6. upsert_liabilities
# ---------------------------------------------------------------------------

async def upsert_liabilities(
    db: AsyncSession,
    user_id: uuid.UUID,
    liabilities_data: dict,
    account_id_map: dict,
) -> dict:
    """
    Upsert Plaid liability entries into the liabilities table.

    Args:
        db:               Async DB session.
        user_id:          Internal user UUID.
        liabilities_data: Dict returned by adapter.get_liabilities(), with keys:
                          'credit' (list), 'mortgage' (list), 'student' (list).
        account_id_map:   {provider_account_id (str): internal accounts.id (UUID)}

    Returns:
        {"credit": int, "mortgage": int, "student": int, "total": int}
    """
    counts = {"credit": 0, "mortgage": 0, "student": 0}
    now = datetime.utcnow()

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    def _address_str(addr: dict | None) -> str | None:
        """Join a Plaid address object into a single readable string."""
        addr = normalize_plaid_value(addr)
        if not addr:
            return None
        parts = [
            addr.get("street"),
            addr.get("city"),
            addr.get("region"),
            addr.get("postal_code"),
            addr.get("country"),
        ]
        return ", ".join(p for p in parts if p)

    # ------------------------------------------------------------------
    # Credit cards
    # ------------------------------------------------------------------
    liabilities_data = normalize_plaid_value(liabilities_data)

    for raw_entry in normalize_plaid_list(liabilities_data.get("credit", [])):
        entry = normalize_plaid_value(raw_entry)
        plaid_account_id = entry.get("account_id")
        if not plaid_account_id:
            continue
        internal_account_id = account_id_map.get(plaid_account_id)
        logger.info(
            "liability_account_matched",
            liability_type="credit",
            plaid_account_id=plaid_account_id,
            matched=internal_account_id is not None,
            db_row_matched=internal_account_id is not None,
            db_account_id=str(internal_account_id) if internal_account_id else None,
        )

        # Primary APR (first entry in aprs list, if present)
        aprs = entry.get("aprs") or []
        primary_apr = normalize_plaid_value(aprs[0]) if aprs else {}

        await db.execute(
            text("""
                INSERT INTO public.liabilities (
                    user_id, account_id, provider_account_id, liability_type,
                    credit_apr_percentage, credit_apr_type,
                    credit_last_payment_amount, credit_last_payment_date,
                    credit_last_statement_balance, credit_last_statement_issue_date,
                    credit_minimum_payment_amount, credit_next_payment_due_date,
                    credit_is_overdue,
                    last_synced_at, created_at, updated_at
                ) VALUES (
                    :user_id, :account_id, :provider_account_id, 'credit',
                    :apr_pct, :apr_type,
                    :last_pmt_amt, :last_pmt_date,
                    :last_stmt_bal, :last_stmt_date,
                    :min_pmt, :next_due_date,
                    :is_overdue,
                    :now, :now, :now
                )
                ON CONFLICT (user_id, provider_account_id, liability_type)
                DO UPDATE SET
                    account_id                      = EXCLUDED.account_id,
                    credit_apr_percentage           = EXCLUDED.credit_apr_percentage,
                    credit_apr_type                 = EXCLUDED.credit_apr_type,
                    credit_last_payment_amount      = EXCLUDED.credit_last_payment_amount,
                    credit_last_payment_date        = EXCLUDED.credit_last_payment_date,
                    credit_last_statement_balance   = EXCLUDED.credit_last_statement_balance,
                    credit_last_statement_issue_date= EXCLUDED.credit_last_statement_issue_date,
                    credit_minimum_payment_amount   = EXCLUDED.credit_minimum_payment_amount,
                    credit_next_payment_due_date    = EXCLUDED.credit_next_payment_due_date,
                    credit_is_overdue               = EXCLUDED.credit_is_overdue,
                    last_synced_at                  = EXCLUDED.last_synced_at,
                    updated_at                      = EXCLUDED.updated_at
            """),
            {
                "user_id":          str(user_id),
                "account_id":       str(internal_account_id) if internal_account_id else None,
                "provider_account_id": plaid_account_id,
                "apr_pct":          primary_apr.get("apr_percentage"),
                "apr_type":         primary_apr.get("apr_type"),
                "last_pmt_amt":     entry.get("last_payment_amount"),
                "last_pmt_date":    _parse_date(entry.get("last_payment_date")),
                "last_stmt_bal":    entry.get("last_statement_balance"),
                "last_stmt_date":   _parse_date(entry.get("last_statement_issue_date")),
                "min_pmt":          entry.get("minimum_payment_amount"),
                "next_due_date":    _parse_date(entry.get("next_payment_due_date")),
                "is_overdue":       entry.get("is_overdue"),
                "now":              now,
            },
        )
        counts["credit"] += 1

    # ------------------------------------------------------------------
    # Mortgages
    # ------------------------------------------------------------------
    for raw_entry in normalize_plaid_list(liabilities_data.get("mortgage", [])):
        entry = normalize_plaid_value(raw_entry)
        plaid_account_id = entry.get("account_id")
        if not plaid_account_id:
            continue
        internal_account_id = account_id_map.get(plaid_account_id)
        logger.info(
            "liability_account_matched",
            liability_type="mortgage",
            plaid_account_id=plaid_account_id,
            matched=internal_account_id is not None,
            db_row_matched=internal_account_id is not None,
            db_account_id=str(internal_account_id) if internal_account_id else None,
        )

        rate = normalize_plaid_value(entry.get("interest_rate"))

        await db.execute(
            text("""
                INSERT INTO public.liabilities (
                    user_id, account_id, provider_account_id, liability_type,
                    mortgage_interest_rate_percentage, mortgage_interest_rate_type,
                    mortgage_last_payment_amount, mortgage_last_payment_date,
                    mortgage_maturity_date, mortgage_next_monthly_payment,
                    mortgage_next_payment_due_date,
                    mortgage_origination_principal_amount,
                    mortgage_outstanding_principal_amount,
                    mortgage_ytd_interest_paid, mortgage_ytd_principal_paid,
                    mortgage_property_address,
                    last_synced_at, created_at, updated_at
                ) VALUES (
                    :user_id, :account_id, :provider_account_id, 'mortgage',
                    :rate_pct, :rate_type,
                    :last_pmt_amt, :last_pmt_date,
                    :maturity_date, :next_monthly_pmt,
                    :next_due_date,
                    :orig_principal,
                    :outstanding_principal,
                    :ytd_interest, :ytd_principal,
                    :property_address,
                    :now, :now, :now
                )
                ON CONFLICT (user_id, provider_account_id, liability_type)
                DO UPDATE SET
                    account_id                              = EXCLUDED.account_id,
                    mortgage_interest_rate_percentage       = EXCLUDED.mortgage_interest_rate_percentage,
                    mortgage_interest_rate_type             = EXCLUDED.mortgage_interest_rate_type,
                    mortgage_last_payment_amount            = EXCLUDED.mortgage_last_payment_amount,
                    mortgage_last_payment_date              = EXCLUDED.mortgage_last_payment_date,
                    mortgage_maturity_date                  = EXCLUDED.mortgage_maturity_date,
                    mortgage_next_monthly_payment           = EXCLUDED.mortgage_next_monthly_payment,
                    mortgage_next_payment_due_date          = EXCLUDED.mortgage_next_payment_due_date,
                    mortgage_origination_principal_amount   = EXCLUDED.mortgage_origination_principal_amount,
                    mortgage_outstanding_principal_amount   = EXCLUDED.mortgage_outstanding_principal_amount,
                    mortgage_ytd_interest_paid              = EXCLUDED.mortgage_ytd_interest_paid,
                    mortgage_ytd_principal_paid             = EXCLUDED.mortgage_ytd_principal_paid,
                    mortgage_property_address               = EXCLUDED.mortgage_property_address,
                    last_synced_at                          = EXCLUDED.last_synced_at,
                    updated_at                              = EXCLUDED.updated_at
            """),
            {
                "user_id":              str(user_id),
                "account_id":           str(internal_account_id) if internal_account_id else None,
                "provider_account_id":  plaid_account_id,
                "rate_pct":             rate.get("percentage"),
                "rate_type":            rate.get("type"),
                "last_pmt_amt":         entry.get("last_payment_amount"),
                "last_pmt_date":        _parse_date(entry.get("last_payment_date")),
                "maturity_date":        _parse_date(entry.get("maturity_date")),
                "next_monthly_pmt":     entry.get("next_monthly_payment"),
                "next_due_date":        _parse_date(entry.get("next_payment_due_date")),
                "orig_principal":       entry.get("origination_principal_amount"),
                "outstanding_principal": entry.get("outstanding_principal_amount"),
                "ytd_interest":         entry.get("ytd_interest_paid"),
                "ytd_principal":        entry.get("ytd_principal_paid"),
                "property_address":     _address_str(entry.get("property_address")),
                "now":                  now,
            },
        )
        counts["mortgage"] += 1

    # ------------------------------------------------------------------
    # Student loans
    # ------------------------------------------------------------------
    for raw_entry in normalize_plaid_list(liabilities_data.get("student", [])):
        entry = normalize_plaid_value(raw_entry)
        plaid_account_id = entry.get("account_id")
        if not plaid_account_id:
            continue
        internal_account_id = account_id_map.get(plaid_account_id)
        logger.info(
            "liability_account_matched",
            liability_type="student",
            plaid_account_id=plaid_account_id,
            matched=internal_account_id is not None,
            db_row_matched=internal_account_id is not None,
            db_account_id=str(internal_account_id) if internal_account_id else None,
        )

        pslf = normalize_plaid_value(entry.get("pslf_status"))
        loan_status = normalize_plaid_value(entry.get("loan_status"))
        repayment_plan = normalize_plaid_value(entry.get("repayment_plan"))

        # disbursement_dates is a list of date strings — store as JSON
        disbursement_dates_raw = entry.get("disbursement_dates")
        disbursement_dates_json = json.dumps(disbursement_dates_raw) if disbursement_dates_raw else None

        await db.execute(
            text("""
                INSERT INTO public.liabilities (
                    user_id, account_id, provider_account_id, liability_type,
                    student_disbursement_dates, student_expected_payoff_date,
                    student_guarantor, student_interest_rate_percentage,
                    student_is_overdue,
                    student_last_payment_amount, student_last_payment_date,
                    student_last_statement_balance, student_loan_name,
                    student_loan_status_type,
                    student_minimum_payment_amount, student_next_payment_due_date,
                    student_origination_principal_amount,
                    student_outstanding_interest_amount,
                    student_payment_reference_number,
                    student_pslf_estimated_eligibility_date,
                    student_pslf_payments_made, student_pslf_payments_remaining,
                    student_repayment_plan_type, student_servicer_address,
                    student_sequence_number,
                    last_synced_at, created_at, updated_at
                ) VALUES (
                    :user_id, :account_id, :provider_account_id, 'student',
                    CAST(:disbursement_dates AS JSONB), :expected_payoff_date,
                    :guarantor, :interest_rate_pct,
                    :is_overdue,
                    :last_pmt_amt, :last_pmt_date,
                    :last_stmt_bal, :loan_name,
                    :loan_status_type,
                    :min_pmt, :next_due_date,
                    :orig_principal,
                    :outstanding_interest,
                    :payment_ref,
                    :pslf_eligibility_date,
                    :pslf_payments_made, :pslf_payments_remaining,
                    :repayment_plan_type, :servicer_address,
                    :sequence_number,
                    :now, :now, :now
                )
                ON CONFLICT (user_id, provider_account_id, liability_type)
                DO UPDATE SET
                    account_id                              = EXCLUDED.account_id,
                    student_disbursement_dates              = EXCLUDED.student_disbursement_dates,
                    student_expected_payoff_date            = EXCLUDED.student_expected_payoff_date,
                    student_guarantor                       = EXCLUDED.student_guarantor,
                    student_interest_rate_percentage        = EXCLUDED.student_interest_rate_percentage,
                    student_is_overdue                      = EXCLUDED.student_is_overdue,
                    student_last_payment_amount             = EXCLUDED.student_last_payment_amount,
                    student_last_payment_date               = EXCLUDED.student_last_payment_date,
                    student_last_statement_balance          = EXCLUDED.student_last_statement_balance,
                    student_loan_name                       = EXCLUDED.student_loan_name,
                    student_loan_status_type                = EXCLUDED.student_loan_status_type,
                    student_minimum_payment_amount          = EXCLUDED.student_minimum_payment_amount,
                    student_next_payment_due_date           = EXCLUDED.student_next_payment_due_date,
                    student_origination_principal_amount    = EXCLUDED.student_origination_principal_amount,
                    student_outstanding_interest_amount     = EXCLUDED.student_outstanding_interest_amount,
                    student_payment_reference_number        = EXCLUDED.student_payment_reference_number,
                    student_pslf_estimated_eligibility_date = EXCLUDED.student_pslf_estimated_eligibility_date,
                    student_pslf_payments_made              = EXCLUDED.student_pslf_payments_made,
                    student_pslf_payments_remaining         = EXCLUDED.student_pslf_payments_remaining,
                    student_repayment_plan_type             = EXCLUDED.student_repayment_plan_type,
                    student_servicer_address                = EXCLUDED.student_servicer_address,
                    student_sequence_number                 = EXCLUDED.student_sequence_number,
                    last_synced_at                          = EXCLUDED.last_synced_at,
                    updated_at                              = EXCLUDED.updated_at
            """),
            {
                "user_id":              str(user_id),
                "account_id":           str(internal_account_id) if internal_account_id else None,
                "provider_account_id":  plaid_account_id,
                "disbursement_dates":   disbursement_dates_json,
                "expected_payoff_date": _parse_date(entry.get("expected_payoff_date")),
                "guarantor":            entry.get("guarantor"),
                "interest_rate_pct":    entry.get("interest_rate_percentage"),
                "is_overdue":           entry.get("is_overdue"),
                "last_pmt_amt":         entry.get("last_payment_amount"),
                "last_pmt_date":        _parse_date(entry.get("last_payment_date")),
                "last_stmt_bal":        entry.get("last_statement_balance"),
                "loan_name":            entry.get("loan_name"),
                "loan_status_type":     loan_status.get("type"),
                "min_pmt":              entry.get("minimum_payment_amount"),
                "next_due_date":        _parse_date(entry.get("next_payment_due_date")),
                "orig_principal":       entry.get("origination_principal_amount"),
                "outstanding_interest": entry.get("outstanding_interest_amount"),
                "payment_ref":          entry.get("payment_reference_number"),
                "pslf_eligibility_date": _parse_date(pslf.get("estimated_eligibility_date")),
                "pslf_payments_made":   pslf.get("payments_made"),
                "pslf_payments_remaining": pslf.get("payments_remaining"),
                "repayment_plan_type":  repayment_plan.get("type"),
                "servicer_address":     _address_str(entry.get("servicer_address")),
                "sequence_number":      entry.get("sequence_number"),
                "now":                  now,
            },
        )
        counts["student"] += 1

    await db.flush()
    total = counts["credit"] + counts["mortgage"] + counts["student"]
    logger.info(
        "upsert_liabilities complete",
        user_id=str(user_id),
        liabilities_received=sum(len(liabilities_data.get(k, [])) for k in ("credit", "mortgage", "student")),
        total_liability_balance_persisted=None,
        **counts,
        total=total,
    )
    return {**counts, "total": total}


# ---------------------------------------------------------------------------
# 7. upsert_item_status
# ---------------------------------------------------------------------------

async def upsert_item_status(
    db: AsyncSession,
    item_id: str,
    item_status: dict,
) -> bool:
    """
    Persist Plaid /item/get response fields onto the provider_tokens row.

    Args:
        db:          Async DB session.
        item_id:     Plaid item_id — used as the lookup key.
        item_status: Dict returned by adapter.get_item_status(), with keys:
                     item_id, institution_id, available_products,
                     billed_products, consent_expiration_time, update_type,
                     webhook, error (nested dict or None).

    Returns:
        True if a provider_tokens row was found and updated, False otherwise.
    """
    now = datetime.utcnow()

    error = item_status.get("error")  # None or {"error_type", "error_code", "error_message"}

    # Serialise list fields to JSON strings for the JSONB cast
    available_products = json.dumps(item_status.get("available_products") or [])
    billed_products    = json.dumps(item_status.get("billed_products") or [])

    consent_expiration_time = parse_plaid_timestamp(item_status.get("consent_expiration_time"))

    result = await db.execute(
        text("""
            UPDATE public.provider_tokens SET
                institution_id              = :institution_id,
                available_products          = CAST(:available_products AS JSONB),
                billed_products             = CAST(:billed_products AS JSONB),
                consent_expiration_time     = :consent_expiration_time,
                update_type                 = :update_type,
                webhook                     = :webhook,
                item_error_type             = :item_error_type,
                item_error_code             = :item_error_code,
                item_error_message          = :item_error_message,
                item_status_last_synced_at  = :now,
                updated_at                  = :now
            WHERE item_id = :item_id
        """),
        {
            "item_id":                  item_id,
            "institution_id":           item_status.get("institution_id"),
            "available_products":       available_products,
            "billed_products":          billed_products,
            "consent_expiration_time":  consent_expiration_time,
            "update_type":              str(item_status.get("update_type")) if item_status.get("update_type") else None,
            "webhook":                  str(item_status.get("webhook")) if item_status.get("webhook") else None,
            # Write error fields if present; explicitly NULL them out when cleared
            "item_error_type":          error.get("error_type") if error else None,
            "item_error_code":          error.get("error_code") if error else None,
            "item_error_message":       error.get("error_message") if error else None,
            "now":                      now,
        },
    )

    updated = result.rowcount > 0
    logger.info(
        "upsert_item_status complete",
        item_id=item_id,
        updated=updated,
        has_error=bool(error),
    )
    return updated


# ---------------------------------------------------------------------------
# 8. upsert_recurring_streams
# ---------------------------------------------------------------------------

async def upsert_recurring_streams(
    db: AsyncSession,
    user_id: uuid.UUID,
    inflow_streams: list,
    outflow_streams: list,
    account_id_map: dict,
) -> dict:
    """
    Upsert Plaid recurring transaction streams into the recurring_streams table.

    Args:
        db:               Async DB session.
        user_id:          Internal user UUID.
        inflow_streams:   List of inflow stream dicts from adapter.get_recurring_transactions().
        outflow_streams:  List of outflow stream dicts.
        account_id_map:   {provider_account_id (str): internal accounts.id (UUID)}

    Returns:
        {"inflow": int, "outflow": int, "total": int}
    """
    counts = {"inflow": 0, "outflow": 0}
    now = datetime.utcnow()

    tagged = (
        [(s, "inflow")  for s in inflow_streams] +
        [(s, "outflow") for s in outflow_streams]
    )

    for raw_stream, stream_type in tagged:
        stream = normalize_plaid_value(raw_stream)
        plaid_account_id = stream.get("account_id")
        if not plaid_account_id:
            continue

        internal_account_id = account_id_map.get(plaid_account_id)

        await db.execute(
            text("""
                INSERT INTO public.recurring_streams (
                    user_id, account_id, provider_account_id,
                    stream_id, stream_type,
                    description, merchant_name, frequency,
                    average_amount, last_amount,
                    first_date, last_date, predicted_next_date,
                    status, is_active,
                    last_synced_at, created_at, updated_at
                ) VALUES (
                    :user_id, :account_id, :provider_account_id,
                    :stream_id, :stream_type,
                    :description, :merchant_name, :frequency,
                    :average_amount, :last_amount,
                    :first_date, :last_date, :predicted_next_date,
                    :status, :is_active,
                    :now, :now, :now
                )
                ON CONFLICT (user_id, stream_id)
                DO UPDATE SET
                    account_id          = EXCLUDED.account_id,
                    provider_account_id = EXCLUDED.provider_account_id,
                    stream_type         = EXCLUDED.stream_type,
                    description         = EXCLUDED.description,
                    merchant_name       = EXCLUDED.merchant_name,
                    frequency           = EXCLUDED.frequency,
                    average_amount      = EXCLUDED.average_amount,
                    last_amount         = EXCLUDED.last_amount,
                    first_date          = EXCLUDED.first_date,
                    last_date           = EXCLUDED.last_date,
                    predicted_next_date = EXCLUDED.predicted_next_date,
                    status              = EXCLUDED.status,
                    is_active           = EXCLUDED.is_active,
                    last_synced_at      = EXCLUDED.last_synced_at,
                    updated_at          = EXCLUDED.updated_at
            """),
            {
                "user_id":              str(user_id),
                "account_id":           str(internal_account_id) if internal_account_id else None,
                "provider_account_id":  plaid_account_id,
                "stream_id":            stream.get("stream_id"),
                "stream_type":          stream_type,
                "description":          stream.get("description"),
                "merchant_name":        stream.get("merchant_name"),
                "frequency":            stream.get("frequency"),
                "average_amount":       stream.get("average_amount"),
                "last_amount":          stream.get("last_amount"),
                "first_date":           _parse_date(stream.get("first_date")),
                "last_date":            _parse_date(stream.get("last_date")),
                "predicted_next_date":  _parse_date(stream.get("predicted_next_date")),
                "status":               stream.get("status"),
                "is_active":            stream.get("is_active", True),
                "now":                  now,
            },
        )
        counts[stream_type] += 1

    await db.flush()
    total = counts["inflow"] + counts["outflow"]
    logger.info(
        "upsert_recurring_streams complete",
        user_id=str(user_id),
        inflow=counts["inflow"],
        outflow=counts["outflow"],
        total=total,
    )
    return {**counts, "total": total}


# ---------------------------------------------------------------------------
# 9. upsert_identity
# ---------------------------------------------------------------------------

async def upsert_identity(
    db: AsyncSession,
    user_id: uuid.UUID,
    accounts: list,
    account_id_map: dict,
) -> dict:
    """
    Persist Plaid identity (owners) data onto the accounts rows.

    Args:
        db:              Async DB session.
        user_id:         Internal user UUID.
        accounts:        List returned by adapter.get_identity() —
                         [{account_id, name, owners: [...]}]
        account_id_map:  {provider_account_id (str): internal accounts.id (UUID)}

    Returns:
        {"accounts_updated": int}
    """
    now = datetime.utcnow()
    updated = 0

    for account in accounts:
        provider_account_id = account.get("account_id")
        if not provider_account_id:
            continue

        internal_id = account_id_map.get(provider_account_id)
        if not internal_id:
            logger.warning(
                "upsert_identity: provider_account_id not in account_id_map, skipping",
                provider_account_id=provider_account_id,
            )
            continue

        owners_json = json.dumps(account.get("owners", []))

        result = await db.execute(
            text("""
                UPDATE public.accounts SET
                    identity_owners         = CAST(:owners AS JSONB),
                    identity_last_synced_at = :now
                WHERE id = :internal_id
            """),
            {
                "internal_id": str(internal_id),
                "owners":      owners_json,
                "now":         now,
            },
        )
        if result.rowcount > 0:
            updated += 1

    await db.flush()
    logger.info(
        "upsert_identity complete",
        user_id=str(user_id),
        accounts_updated=updated,
    )
    return {"accounts_updated": updated}
