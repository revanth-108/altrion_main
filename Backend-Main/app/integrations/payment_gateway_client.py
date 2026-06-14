"""Provider-agnostic payment gateway adapter."""
from dataclasses import dataclass
from datetime import datetime, timezone
from decimal import Decimal
import base64
import hashlib
import hmac
from types import SimpleNamespace
from typing import Any, Dict, Optional
from urllib.parse import parse_qs
import uuid

from app.core.config import settings
from app.core.logging import get_logger

logger = get_logger()


@dataclass
class HostedCheckoutSession:
    """Normalized hosted checkout response."""

    session_id: str
    url: str
    publishable_key: Optional[str] = None
    method: str = "GET"
    fields: Optional[Dict[str, str]] = None
    raw: Any = None


class PaymentGatewayClient:
    """Gateway adapter for hosted billing operations."""

    @property
    def gateway(self) -> str:
        return settings.PAYMENT_GATEWAY

    def _raise_hpp_not_implemented(self, operation: str) -> None:
        raise NotImplementedError(
            f"Hosted payments provider integration is not implemented yet for `{operation}`. "
            "Implement the provider API mapping in payment_gateway_client.py."
        )

    def create_customer(
        self,
        email: str,
        name: str,
        metadata: Optional[Dict[str, str]] = None,
    ) -> Any:
        if self.gateway == "hosted_payments_page":
            self._validate_hpp_settings()
            customer_id = metadata.get("user_id") if metadata else email
            return SimpleNamespace(id=customer_id, email=email, name=name)

        raise NotImplementedError(f"Unsupported payment gateway: {self.gateway}")

    def create_hosted_checkout(
        self,
        customer_id: str,
        price_id: str,
        success_url: str,
        cancel_url: str,
        amount: Optional[Decimal] = None,
        currency: Optional[str] = None,
        trial_days: Optional[int] = None,
        coupon_code: Optional[str] = None,
        metadata: Optional[Dict[str, str]] = None,
    ) -> HostedCheckoutSession:
        if self.gateway == "hosted_payments_page":
            self._validate_hpp_settings()
            transaction_uuid = uuid.uuid4().hex
            endpoint = self._hpp_endpoint()

            # Only include fields that CyberSource Secure Acceptance recognises.
            # Unknown fields in signed_field_names cause "not authorized" rejections.
            request_fields: Dict[str, str] = {
                "access_key":       settings.HPP_ACCESS_KEY,
                "profile_id":       settings.HPP_PROFILE_ID,
                "transaction_uuid": transaction_uuid,
                "unsigned_field_names": "",
                "signed_date_time": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
                "transaction_type": settings.HPP_TRANSACTION_TYPE,
                "reference_number": transaction_uuid,
                "amount":           f"{Decimal(amount or '0.00'):.2f}",
                "currency":         (currency or settings.HPP_CURRENCY).upper(),
                "locale":           settings.HPP_LOCALE,
                "payment_method":   "card",
            }

            receipt_url = success_url or settings.HPP_RETURN_URL
            cancel_receipt_url = cancel_url or settings.HPP_CANCEL_URL
            if receipt_url:
                request_fields["override_custom_receipt_page"] = receipt_url
            if cancel_receipt_url:
                request_fields["override_custom_cancel_page"] = cancel_receipt_url


            if metadata:
                if metadata.get("user_id"):
                    request_fields["merchant_defined_data1"] = str(metadata["user_id"])
                if metadata.get("plan_id"):
                    request_fields["merchant_defined_data2"] = str(metadata["plan_id"])
                if metadata.get("subscription_id"):
                    request_fields["merchant_defined_data3"] = str(metadata["subscription_id"])
            if coupon_code:
                request_fields["promotion_code"] = coupon_code

            # signed_field_names must include itself per CyberSource SA spec
            field_keys = list(request_fields.keys()) + ["signed_field_names"]
            signed_field_names = ",".join(field_keys)
            request_fields["signed_field_names"] = signed_field_names
            request_fields["signature"] = self._sign_hpp_fields(request_fields, signed_field_names)

            logger.info(
                "hpp_checkout_payload",
                endpoint=endpoint,
                profile_id=settings.HPP_PROFILE_ID,
                access_key=settings.HPP_ACCESS_KEY[:8] + "...",
                transaction_uuid=transaction_uuid,
                amount=request_fields["amount"],
                currency=request_fields["currency"],
                transaction_type=request_fields["transaction_type"],
                signed_field_names=signed_field_names,
                signed_data=",".join(
                    f"{n}={request_fields.get(n, '')}"
                    for n in signed_field_names.split(",")
                ),
                signature=request_fields["signature"],
            )

            return HostedCheckoutSession(
                session_id=transaction_uuid,
                url=endpoint,
                method="POST",
                fields=request_fields,
                raw=request_fields,
            )

        raise NotImplementedError(f"Unsupported payment gateway: {self.gateway}")

    def create_dynamic_price(
        self,
        amount: Decimal,
        currency: str,
        interval: str,
        product_id: str,
        nickname: Optional[str] = None,
    ) -> Any:
        if self.gateway == "hosted_payments_page":
            return SimpleNamespace(
                id=f"dynamic-{interval}-{amount}",
                amount=amount,
                currency=currency,
                interval=interval,
                product_id=product_id,
                nickname=nickname,
            )

        raise NotImplementedError(f"Unsupported payment gateway: {self.gateway}")

    def cancel_subscription(self, subscription_id: str, immediately: bool = False) -> Any:
        if self.gateway == "hosted_payments_page":
            raise NotImplementedError(
                "Hosted Payments Page guide does not define a recurring subscription cancel API. "
                "You need the token/recurring billing API for automated subscription lifecycle control."
            )

        raise NotImplementedError(f"Unsupported payment gateway: {self.gateway}")

    def reactivate_subscription(self, subscription_id: str) -> Any:
        if self.gateway == "hosted_payments_page":
            raise NotImplementedError(
                "Hosted Payments Page guide does not define a recurring subscription reactivate API. "
                "You need the recurring billing API from the processor for this action."
            )

        raise NotImplementedError(f"Unsupported payment gateway: {self.gateway}")

    def create_coupon(
        self,
        discount_type: str,
        value: Decimal,
        duration: str,
        max_redemptions: Optional[int] = None,
        coupon_id: Optional[str] = None,
    ) -> Any:
        if self.gateway == "hosted_payments_page":
            return SimpleNamespace(id=coupon_id or f"promo-{discount_type}-{value}")

        raise NotImplementedError(f"Unsupported payment gateway: {self.gateway}")

    def delete_coupon(self, coupon_id: str) -> Any:
        if self.gateway == "hosted_payments_page":
            return True

        raise NotImplementedError(f"Unsupported payment gateway: {self.gateway}")

    def construct_webhook_event(self, payload: bytes, signature: Optional[str]) -> Any:
        if self.gateway == "hosted_payments_page":
            form = {key: values[0] for key, values in parse_qs(payload.decode("utf-8"), keep_blank_values=True).items()}
            if not form.get("signature") or not form.get("signed_field_names"):
                raise ValueError("Missing signed response fields")
            self._validate_hpp_settings()
            expected_signature = self._sign_hpp_fields(form, form["signed_field_names"])
            if not hmac.compare_digest(expected_signature, form["signature"]):
                raise ValueError("Invalid Hosted Payments Page signature")

            decision = form.get("decision", "").upper()
            event_type = {
                "ACCEPT": "hpp.payment.accept",
                "DECLINE": "hpp.payment.decline",
                "REVIEW": "hpp.payment.review",
                "ERROR": "hpp.payment.error",
                "CANCEL": "hpp.payment.cancel",
            }.get(decision, "hpp.payment.unknown")

            return SimpleNamespace(
                id=form.get("transaction_id") or form.get("req_transaction_uuid") or form.get("transaction_uuid"),
                type=event_type,
                data=SimpleNamespace(object=SimpleNamespace(**form)),
                to_dict_recursive=lambda: form,
            )

        raise NotImplementedError(f"Unsupported payment gateway: {self.gateway}")

    def webhook_signature_header_name(self) -> str:
        if self.gateway == "hosted_payments_page":
            return ""

        raise NotImplementedError(f"Unsupported payment gateway: {self.gateway}")

    def _hpp_endpoint(self) -> str:
        self._validate_hpp_settings()
        if settings.HPP_API_URL:
            return settings.HPP_API_URL
        if settings.ENVIRONMENT == "production":
            return "https://secureacceptance.merchant-services.bankofamerica.com/pay"
        return "https://testsecureacceptance.merchant-services.bankofamerica.com/pay"

    def _validate_hpp_settings(self) -> None:
        missing = [
            field_name
            for field_name, value in (
                ("HPP_PROFILE_ID", settings.HPP_PROFILE_ID),
                ("HPP_ACCESS_KEY", settings.HPP_ACCESS_KEY),
                ("HPP_SECRET_KEY", settings.HPP_SECRET_KEY),
            )
            if not value
        ]
        if missing:
            raise ValueError(
                "Hosted Payments Page is selected but required settings are missing: "
                + ", ".join(missing)
            )

    def _sign_hpp_fields(self, fields: Dict[str, Any], signed_field_names: str) -> str:
        names = [name.strip() for name in signed_field_names.split(",") if name.strip()]
        data = ",".join(f"{name}={fields.get(name, '')}" for name in names)
        digest = hmac.new(
            settings.HPP_SECRET_KEY.encode("utf-8"),
            data.encode("utf-8"),
            hashlib.sha256,
        ).digest()
        return base64.b64encode(digest).decode("utf-8")


payment_gateway_client = PaymentGatewayClient()
