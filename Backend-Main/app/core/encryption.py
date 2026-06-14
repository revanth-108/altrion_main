"""
AES-256-GCM field-level encryption for PII and sensitive financial data.

Usage
-----
  from app.core.encryption import EncryptedString, EncryptedJSON

  class MyModel(Base):
      secret = Column(EncryptedString)   # transparent encrypt/decrypt
      payload = Column(EncryptedJSON)    # works for dicts/lists

Key management
--------------
Set ENCRYPTION_KEY in .env to a 32-byte value encoded as URL-safe base64.
Generate a new key:
  python -c "import os, base64; print(base64.urlsafe_b64encode(os.urandom(32)).decode())"
"""
from __future__ import annotations

import base64
import json
import os
from typing import Any

from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from sqlalchemy import Text, TypeDecorator


# ---------------------------------------------------------------------------
# Core AES-256-GCM cipher
# ---------------------------------------------------------------------------

class _AES256GCM:
    """AES-256-GCM with per-value random 96-bit nonces."""

    _NONCE_BYTES = 12  # 96-bit nonce — GCM standard

    def __init__(self, key: bytes) -> None:
        if len(key) != 32:
            raise ValueError("ENCRYPTION_KEY must decode to exactly 32 bytes (AES-256).")
        self._aesgcm = AESGCM(key)

    def encrypt(self, plaintext: str) -> str:
        """Encrypt *plaintext* and return a URL-safe base64 token (nonce || ciphertext)."""
        nonce = os.urandom(self._NONCE_BYTES)
        ct = self._aesgcm.encrypt(nonce, plaintext.encode(), None)
        return base64.urlsafe_b64encode(nonce + ct).decode()

    def decrypt(self, token: str) -> str:
        """Decrypt a token produced by :meth:`encrypt`."""
        raw = base64.urlsafe_b64decode(token)
        nonce, ct = raw[: self._NONCE_BYTES], raw[self._NONCE_BYTES :]
        return self._aesgcm.decrypt(nonce, ct, None).decode()


def _load_cipher() -> _AES256GCM | None:
    # 1. Explicit OS env var (works in all environments)
    raw = os.getenv("ENCRYPTION_KEY", "").strip()
    if not raw:
        # 2. pydantic-settings reads .env but doesn't populate os.environ —
        #    import lazily to avoid circular imports at module load time.
        try:
            from app.core.config import settings  # noqa: PLC0415
            raw = settings.ENCRYPTION_KEY.strip()
        except Exception:
            pass
    if not raw:
        return None
    return _AES256GCM(base64.urlsafe_b64decode(raw))


# Lazy singleton — initialised on first _get_cipher() call so that the
# pydantic Settings object (which loads .env) is guaranteed to exist first.
_cipher: _AES256GCM | None = None
_cipher_initialised: bool = False


def _get_cipher() -> _AES256GCM:
    global _cipher, _cipher_initialised
    if not _cipher_initialised:
        _cipher = _load_cipher()
        _cipher_initialised = True
    if _cipher is None:
        raise RuntimeError(
            "ENCRYPTION_KEY is not set. "
            "Generate one with:\n"
            "  python -c \"import os, base64; "
            "print(base64.urlsafe_b64encode(os.urandom(32)).decode())\""
        )
    return _cipher


def generate_key() -> str:
    """Return a new random AES-256 key encoded as URL-safe base64."""
    return base64.urlsafe_b64encode(os.urandom(32)).decode()


# ---------------------------------------------------------------------------
# SQLAlchemy TypeDecorators
# ---------------------------------------------------------------------------

class EncryptedString(TypeDecorator):
    """
    Transparent AES-256-GCM encryption for text columns.

    Stored in the database as TEXT (encrypted, base64-encoded).
    Decrypted automatically on read; falls back to returning the raw value
    for any legacy rows that were written before encryption was enabled.
    """

    impl = Text
    cache_ok = True

    def process_bind_param(self, value: str | None, dialect: Any) -> str | None:
        if value is None:
            return None
        return _get_cipher().encrypt(str(value))

    def process_result_value(self, value: str | None, dialect: Any) -> str | None:
        if value is None:
            return None
        try:
            return _get_cipher().decrypt(value)
        except Exception:
            # Legacy row written before encryption was turned on — return as-is.
            return value


class EncryptedJSON(TypeDecorator):
    """
    Transparent AES-256-GCM encryption for JSON/JSONB columns.

    Stored as TEXT (encrypted base64 of the JSON string).
    The database column must be TEXT (not JSONB) — run the SQL migration
    migrations/add_field_encryption.sql before enabling this.
    """

    impl = Text
    cache_ok = True

    def process_bind_param(self, value: Any, dialect: Any) -> str | None:
        if value is None:
            return None
        return _get_cipher().encrypt(json.dumps(value, default=str))

    def process_result_value(self, value: str | None, dialect: Any) -> Any:
        if value is None:
            return None
        try:
            return json.loads(_get_cipher().decrypt(value))
        except Exception:
            # Try parsing as plain JSON (legacy unencrypted row).
            try:
                return json.loads(value)
            except Exception:
                return value
