"""
One-time migration: encrypt all plaintext PII already in the database.

Run AFTER applying migrations/add_field_encryption.sql and setting ENCRYPTION_KEY in .env.

Usage:
    cd altrion-backend
    python scripts/encrypt_existing_data.py

The script is idempotent: rows that are already encrypted (i.e. decryption
succeeds) are skipped so it is safe to run more than once.
"""
import asyncio
import json
import os
import sys
from pathlib import Path

# Allow importing from the app package
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from dotenv import load_dotenv
load_dotenv()

from app.core.encryption import _get_cipher          # noqa: E402  (after sys.path fix)

import asyncpg                                        # noqa: E402


DATABASE_URL: str = os.environ["DATABASE_URL"]
# asyncpg needs a plain postgresql:// URL (not postgresql+asyncpg://)
_DB_URL = DATABASE_URL.replace("postgresql+asyncpg://", "postgresql://")


def _already_encrypted(value: str) -> bool:
    """Return True if *value* looks like an AES-256-GCM token (i.e. is already encrypted)."""
    try:
        _get_cipher().decrypt(value)
        return True
    except Exception:
        return False


def _encrypt(value: str | None) -> str | None:
    if value is None:
        return None
    if _already_encrypted(value):
        return value        # skip — already encrypted
    return _get_cipher().encrypt(value)


def _encrypt_json(value: str | None) -> str | None:
    """Encrypt a JSON string stored as text."""
    if value is None:
        return None
    if _already_encrypted(value):
        return value        # skip — already encrypted
    # Normalise: parse then re-serialise so format is consistent
    try:
        parsed = json.loads(value)
        return _get_cipher().encrypt(json.dumps(parsed, default=str))
    except json.JSONDecodeError:
        # Not valid JSON — encrypt as-is
        return _get_cipher().encrypt(value)


async def migrate(conn: asyncpg.Connection) -> None:
    print("Starting field-level encryption migration …\n")

    # ------------------------------------------------------------------
    # users
    # ------------------------------------------------------------------
    rows = await conn.fetch(
        "SELECT id, name, income_source, wallet_address FROM public.users"
    )
    print(f"  users: {len(rows)} rows")
    for row in rows:
        await conn.execute(
            """
            UPDATE public.users
               SET name = $1,
                   income_source = $2,
                   wallet_address = $3
             WHERE id = $4
            """,
            _encrypt(row["name"]),
            _encrypt(row["income_source"]),
            _encrypt(row["wallet_address"]),
            row["id"],
        )
    print("  users: done")

    # ------------------------------------------------------------------
    # accounts
    # ------------------------------------------------------------------
    rows = await conn.fetch(
        "SELECT id, name, mask, institution_name FROM public.accounts"
    )
    print(f"  accounts: {len(rows)} rows")
    for row in rows:
        await conn.execute(
            """
            UPDATE public.accounts
               SET name = $1,
                   mask = $2,
                   institution_name = $3
             WHERE id = $4
            """,
            _encrypt(row["name"]),
            _encrypt(row["mask"]),
            _encrypt(row["institution_name"]),
            row["id"],
        )
    print("  accounts: done")

    # ------------------------------------------------------------------
    # transactions  (potentially large — batch by 500)
    # ------------------------------------------------------------------
    total = await conn.fetchval("SELECT COUNT(*) FROM public.transactions")
    print(f"  transactions: {total} rows")
    offset = 0
    batch = 500
    processed = 0
    while offset < total:
        rows = await conn.fetch(
            "SELECT id, name, merchant_name FROM public.transactions LIMIT $1 OFFSET $2",
            batch,
            offset,
        )
        for row in rows:
            await conn.execute(
                """
                UPDATE public.transactions
                   SET name = $1,
                       merchant_name = $2
                 WHERE id = $3
                """,
                _encrypt(row["name"]),
                _encrypt(row["merchant_name"]),
                row["id"],
            )
        processed += len(rows)
        offset += batch
        print(f"    {processed}/{total} transactions encrypted …", end="\r")
    print(f"\n  transactions: done")

    # ------------------------------------------------------------------
    # provider_tokens  (CRITICAL — Plaid / Coinbase API keys)
    # ------------------------------------------------------------------
    rows = await conn.fetch("SELECT id, token_data FROM public.provider_tokens")
    print(f"  provider_tokens: {len(rows)} rows")
    for row in rows:
        await conn.execute(
            "UPDATE public.provider_tokens SET token_data = $1 WHERE id = $2",
            _encrypt_json(row["token_data"]),
            row["id"],
        )
    print("  provider_tokens: done")

    # ------------------------------------------------------------------
    # loan_calculations
    # ------------------------------------------------------------------
    rows = await conn.fetch(
        "SELECT id, client_ip, user_agent FROM public.loan_calculations"
    )
    print(f"  loan_calculations: {len(rows)} rows")
    for row in rows:
        await conn.execute(
            """
            UPDATE public.loan_calculations
               SET client_ip = $1,
                   user_agent = $2
             WHERE id = $3
            """,
            _encrypt(row["client_ip"]),
            _encrypt(row["user_agent"]),
            row["id"],
        )
    print("  loan_calculations: done")

    print("\nMigration complete. All PII fields are now AES-256-GCM encrypted.")


async def main() -> None:
    conn = await asyncpg.connect(_DB_URL)
    try:
        await migrate(conn)
    finally:
        await conn.close()


if __name__ == "__main__":
    asyncio.run(main())
