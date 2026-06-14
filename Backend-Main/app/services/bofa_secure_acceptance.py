"""
BofA/CyberSource Secure Acceptance hosted payment signer.

This service prepares signed form fields for the hosted payment page. The secret
key stays on the backend; the browser receives only signed fields and the
hosted-payment URL.
"""
from __future__ import annotations

import base64
import hashlib
import hmac
import uuid
from datetime import datetime, timezone
from decimal import Decimal, ROUND_HALF_UP
from typing import Dict, Optional

from app.core.config import settings
from app.domain.errors import BadRequest


class BofaSecureAcceptanceService:
    BASE_SIGNED_FIELDS = [
        "access_key",
        "profile_id",
        "transaction_uuid",
        "signed_field_names",
        "unsigned_field_names",
        "signed_date_time",
        "locale",
        "transaction_type",
        "reference_number",
        "amount",
        "currency",
    ]

    def _require_configured(self) -> None:
        missing = [
            name
            for name, value in {
                "BOFA_SA_PROFILE_ID": settings.BOFA_SA_PROFILE_ID,
                "BOFA_SA_ACCESS_KEY": settings.BOFA_SA_ACCESS_KEY,
                "BOFA_SA_SECRET_KEY": settings.BOFA_SA_SECRET_KEY,
                "BOFA_SA_PAYMENT_URL": settings.BOFA_SA_PAYMENT_URL,
            }.items()
            if not value
        ]
        if missing:
            raise BadRequest(f"BofA Secure Acceptance is not configured: {', '.join(missing)}")

    @staticmethod
    def _money(amount: float | Decimal) -> str:
        value = Decimal(str(amount)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
        if value <= 0:
            raise BadRequest("amount must be greater than 0")
        return f"{value:.2f}"

    @staticmethod
    def _utc_timestamp() -> str:
        return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

    @staticmethod
    def _sign(fields: Dict[str, str], signed_field_names: str, secret_key: str) -> str:
        data = ",".join(f"{field}={fields[field]}" for field in signed_field_names.split(","))
        digest = hmac.new(secret_key.encode("utf-8"), data.encode("utf-8"), hashlib.sha256).digest()
        return base64.b64encode(digest).decode("utf-8")

    def verify_response_signature(self, fields: Dict[str, str]) -> bool:
        self._require_configured()

        signed_field_names = fields.get("signed_field_names")
        provided_signature = fields.get("signature")
        if not signed_field_names or not provided_signature:
            return False

        try:
            expected_signature = self._sign(fields, signed_field_names, settings.BOFA_SA_SECRET_KEY)
        except KeyError:
            return False

        return hmac.compare_digest(expected_signature, provided_signature)

    def create_payment_form(
        self,
        *,
        amount: float,
        currency: str = "USD",
        reference_number: str,
        bill_to_email: Optional[str] = None,
        bill_to_forename: Optional[str] = None,
        bill_to_surname: Optional[str] = None,
    ) -> Dict[str, object]:
        self._require_configured()

        signed_fields = list(self.BASE_SIGNED_FIELDS)
        if bill_to_email:
            signed_fields.append("bill_to_email")
        if bill_to_forename:
            signed_fields.append("bill_to_forename")
        if bill_to_surname:
            signed_fields.append("bill_to_surname")
        signed_field_names = ",".join(signed_fields)
        fields: Dict[str, str] = {
            "access_key": settings.BOFA_SA_ACCESS_KEY,
            "profile_id": settings.BOFA_SA_PROFILE_ID,
            "transaction_uuid": str(uuid.uuid4()),
            "signed_field_names": signed_field_names,
            "unsigned_field_names": "",
            "signed_date_time": self._utc_timestamp(),
            "locale": settings.BOFA_SA_LOCALE,
            "transaction_type": settings.BOFA_SA_TRANSACTION_TYPE,
            "reference_number": reference_number,
            "amount": self._money(amount),
            "currency": currency.upper(),
        }

        if bill_to_email:
            fields["bill_to_email"] = bill_to_email
        if bill_to_forename:
            fields["bill_to_forename"] = bill_to_forename
        if bill_to_surname:
            fields["bill_to_surname"] = bill_to_surname
        fields["signature"] = self._sign(fields, signed_field_names, settings.BOFA_SA_SECRET_KEY)

        return {
            "form_action": settings.BOFA_SA_PAYMENT_URL,
            "method": "POST",
            "fields": fields,
        }


bofa_secure_acceptance_service = BofaSecureAcceptanceService()
