"""
Webhook service for handling payment gateway webhook events
"""
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import Dict, Any
from datetime import datetime, timezone, timedelta
from decimal import Decimal

from app.models.subscription import Subscription, SubscriptionStatusEnum
from app.models.subscription_plan import SubscriptionPlan
from app.models.subscription_history import SubscriptionHistory
from app.models.payment_event_log import PaymentEventLog
from app.models.bofa_payment_transaction import BofaPaymentTransaction
from app.models.user import User
from app.integrations.payment_gateway_client import payment_gateway_client
from app.services.email_service import email_service
from app.core.logging import get_logger

logger = get_logger()


class WebhookService:
    """Service for processing payment gateway webhook events."""

    @staticmethod
    def _decimal_or_none(value: Any) -> Decimal | None:
        if value in (None, ""):
            return None
        try:
            return Decimal(str(value))
        except Exception:
            return None

    @staticmethod
    async def _record_hpp_transaction(
        db: AsyncSession,
        *,
        subscription: Subscription,
        payload: Any,
        event: Any,
    ) -> None:
        fields = event.to_dict_recursive() if callable(getattr(event, "to_dict_recursive", None)) else vars(payload)
        transaction_id = fields.get("transaction_id") or fields.get("transaction_id_0")
        transaction_uuid = fields.get("req_transaction_uuid") or fields.get("transaction_uuid")
        decision = fields.get("decision") or "UNKNOWN"

        existing = None
        if transaction_id:
            result = await db.execute(
                select(BofaPaymentTransaction).where(BofaPaymentTransaction.transaction_id == transaction_id)
            )
            existing = result.scalar_one_or_none()
        if not existing and transaction_uuid:
            result = await db.execute(
                select(BofaPaymentTransaction).where(
                    BofaPaymentTransaction.transaction_uuid == transaction_uuid,
                    BofaPaymentTransaction.decision == decision,
                )
            )
            existing = result.scalar_one_or_none()
        if existing:
            return

        db.add(
            BofaPaymentTransaction(
                user_id=subscription.user_id,
                subscription_id=subscription.id,
                reference_number=fields.get("req_reference_number") or fields.get("reference_number") or transaction_uuid or "",
                transaction_uuid=transaction_uuid,
                transaction_id=transaction_id,
                decision=decision,
                reason_code=fields.get("reason_code"),
                auth_code=fields.get("auth_code") or fields.get("auth_trans_ref_no"),
                amount=WebhookService._decimal_or_none(
                    fields.get("auth_amount") or fields.get("req_amount") or fields.get("amount")
                ),
                currency=(fields.get("req_currency") or fields.get("currency") or "USD").upper(),
                req_card_type=fields.get("req_card_type"),
                req_card_number=fields.get("req_card_number"),
                req_bill_to_email=fields.get("req_bill_to_email"),
                req_bill_to_forename=fields.get("req_bill_to_forename"),
                req_bill_to_surname=fields.get("req_bill_to_surname"),
                req_bill_to_address_line1=fields.get("req_bill_to_address_line1"),
                req_bill_to_address_city=fields.get("req_bill_to_address_city"),
                req_bill_to_address_state=fields.get("req_bill_to_address_state"),
                req_bill_to_address_postal_code=fields.get("req_bill_to_address_postal_code"),
                req_bill_to_address_country=fields.get("req_bill_to_address_country"),
                payment_token=fields.get("payment_token"),
                avs_code=fields.get("auth_avs_code"),
                cvn_code=fields.get("auth_cv_result"),
                raw_response=fields,
            )
        )

    @staticmethod
    async def has_processed_event(db: AsyncSession, event_id: str) -> bool:
        """Return whether a webhook event was already processed."""
        result = await db.execute(
            select(PaymentEventLog).where(PaymentEventLog.event_id == event_id)
        )
        existing = result.scalar_one_or_none()
        return bool(existing and existing.processed)

    @staticmethod
    async def record_processed_event(
        db: AsyncSession,
        event: Any,
        subscription_id: Any = None,
        user_id: Any = None,
    ) -> None:
        """Persist a processed webhook event for idempotency checks."""
        result = await db.execute(
            select(PaymentEventLog).where(PaymentEventLog.event_id == event.id)
        )
        existing = result.scalar_one_or_none()
        if existing:
            existing.processed = True
            existing.processed_at = datetime.now(timezone.utc)
            existing.subscription_id = subscription_id or existing.subscription_id
            existing.user_id = user_id or existing.user_id
            existing.payload = event.to_dict_recursive()
            await db.commit()
            return

        db.add(
            PaymentEventLog(
                event_id=event.id,
                gateway=payment_gateway_client.gateway,
                event_type=event.type,
                subscription_id=subscription_id,
                user_id=user_id,
                payload=event.to_dict_recursive(),
                processed=True,
                processed_at=datetime.now(timezone.utc),
            )
        )
        await db.commit()
    
    @staticmethod
    async def handle_hpp_accept(
        db: AsyncSession,
        event: Any,
    ):
        """Handle a Hosted Payments Page success notification."""
        payload = event.data.object
        transaction_uuid = getattr(payload, "req_transaction_uuid", None) or getattr(payload, "transaction_uuid", None)
        result = await db.execute(
            select(Subscription).where(Subscription.gateway_checkout_session_id == transaction_uuid)
        )
        subscription = result.scalar_one_or_none()
        if not subscription:
            logger.warning("hpp_accept_subscription_not_found", transaction_uuid=transaction_uuid)
            return

        previous_state = {"status": subscription.status.value}
        now = datetime.now(timezone.utc)

        # Use select() instead of db.get() to avoid pgbouncer prepared-statement collision
        plan = None
        if subscription.plan_id:
            _plan_res = await db.execute(
                select(SubscriptionPlan).where(SubscriptionPlan.id == subscription.plan_id)
            )
            plan = _plan_res.scalar_one_or_none()

        subscription.status = SubscriptionStatusEnum.ACTIVE
        subscription.gateway_last_event_id = event.id
        subscription.gateway_payment_profile_id = getattr(payload, "payment_token", None)
        subscription.current_period_start = now
        if plan and plan.billing_cycle.value == "yearly":
            subscription.current_period_end = now + timedelta(days=365)
        elif plan and plan.billing_cycle.value == "quarterly":
            subscription.current_period_end = now + timedelta(days=90)
        elif plan and plan.billing_cycle.value == "lifetime":
            subscription.current_period_end = now + timedelta(days=3650)
        else:
            subscription.current_period_end = now + timedelta(days=30)
        await WebhookService._record_hpp_transaction(db, subscription=subscription, payload=payload, event=event)
        await db.commit()

        await WebhookService._log_history(
            db,
            subscription.id,
            "hpp_payment_accepted",
            previous_state,
            {
                "status": subscription.status.value,
                "transaction_id": getattr(payload, "transaction_id", None),
                "payment_token": getattr(payload, "payment_token", None),
                "decision": getattr(payload, "decision", None),
                "reason_code": getattr(payload, "reason_code", None),
            },
        )
        await WebhookService.record_processed_event(db, event, subscription.id, subscription.user_id)

        # Send subscription activated email (best-effort)
        try:
            _user_res = await db.execute(
                select(User).where(User.id == subscription.user_id)
            )
            _u = _user_res.scalar_one_or_none()
            if _u and plan:
                from app.controllers.auth import _readable_name
                period_end = subscription.current_period_end.strftime("%B %d, %Y")
                await email_service.send_subscription_activated(
                    email=_u.email,
                    name=_readable_name(_u.name, _u.email),
                    plan_name=plan.name,
                    price=f"{plan.base_price:.2f}",
                    billing_cycle=plan.billing_cycle.value,
                    period_end=period_end,
                )
        except Exception as _e:
            logger.warning("hpp_activation_email_failed", error=str(_e))

    @staticmethod
    async def handle_hpp_non_accept(
        db: AsyncSession,
        event: Any,
    ):
        """Handle Hosted Payments Page non-success decisions."""
        payload = event.data.object
        transaction_uuid = getattr(payload, "req_transaction_uuid", None) or getattr(payload, "transaction_uuid", None)
        result = await db.execute(
            select(Subscription).where(Subscription.gateway_checkout_session_id == transaction_uuid)
        )
        subscription = result.scalar_one_or_none()
        if not subscription:
            logger.warning("hpp_non_accept_subscription_not_found", transaction_uuid=transaction_uuid)
            return

        previous_state = {"status": subscription.status.value}
        if event.type in {"hpp.payment.decline", "hpp.payment.error"}:
            subscription.status = SubscriptionStatusEnum.INCOMPLETE
        subscription.gateway_last_event_id = event.id
        await WebhookService._record_hpp_transaction(db, subscription=subscription, payload=payload, event=event)
        await db.commit()

        await WebhookService._log_history(
            db,
            subscription.id,
            "hpp_payment_non_accept",
            previous_state,
            {
                "status": subscription.status.value,
                "decision": getattr(payload, "decision", None),
                "reason_code": getattr(payload, "reason_code", None),
            },
        )
        await WebhookService.record_processed_event(db, event, subscription.id, subscription.user_id)
    
    @staticmethod
    async def _log_history(
        db: AsyncSession,
        subscription_id: str,
        action: str,
        previous_state: Dict[str, Any],
        new_state: Dict[str, Any]
    ):
        """Log webhook event to subscription history"""
        history = SubscriptionHistory(
            subscription_id=subscription_id,
            action=action,
            previous_state=previous_state,
            new_state=new_state,
            performed_by="payment_webhook"
        )
        db.add(history)
        await db.commit()


webhook_service = WebhookService()
