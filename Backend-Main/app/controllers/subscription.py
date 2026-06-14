"""
Subscription API endpoints for users
"""
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List

from sqlalchemy import select
from app.core.database import get_db
from app.core.auth import get_current_user
from app.core.config import settings
from app.services.subscription_service import subscription_service
from app.services.email_service import email_service
from app.integrations.payment_gateway_client import payment_gateway_client
from app.models.bofa_payment_transaction import BofaPaymentTransaction
from app.models.subscription_plan import SubscriptionPlan
from app.models.subscription import Subscription, SubscriptionStatusEnum
from app.models.user import User
from app.schemas.subscription import (
    SubscriptionResponse,
    SubscriptionPlanResponse,
    CheckoutSessionCreate,
    CheckoutSessionResponse,
    CancelSubscriptionRequest,
    ApplyPromoCodeRequest,
    SubscriptionWithOverride
)
from app.core.logging import get_logger

logger = get_logger()

router = APIRouter(prefix="/subscriptions", tags=["subscriptions"])


def _serialize_bofa_transaction(t: BofaPaymentTransaction) -> dict:
    return {
        "id": str(t.id),
        "reference_number": t.reference_number,
        "transaction_uuid": t.transaction_uuid,
        "transaction_id": t.transaction_id,
        "decision": t.decision,
        "reason_code": t.reason_code,
        "auth_code": t.auth_code,
        "amount": str(t.amount) if t.amount is not None else None,
        "currency": t.currency,
        "req_card_type": t.req_card_type,
        "req_card_number": t.req_card_number,
        "payment_token": t.payment_token,
        "created_at": t.created_at.isoformat() if t.created_at else None,
    }


def _decimal_or_none(value: str | None) -> Decimal | None:
    if not value:
        return None
    try:
        return Decimal(str(value))
    except Exception:
        return None


async def _record_bofa_payment_response(
    db: AsyncSession,
    *,
    subscription: Subscription,
    fields: dict[str, str],
) -> None:
    transaction_id = fields.get("transaction_id") or fields.get("transaction_id_0")
    transaction_uuid = fields.get("req_transaction_uuid") or fields.get("transaction_uuid")

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
                BofaPaymentTransaction.decision == (fields.get("decision") or "UNKNOWN"),
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
            decision=fields.get("decision") or "UNKNOWN",
            reason_code=fields.get("reason_code"),
            auth_code=fields.get("auth_code") or fields.get("auth_trans_ref_no"),
            amount=_decimal_or_none(fields.get("auth_amount") or fields.get("req_amount") or fields.get("amount")),
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


@router.get("/me", response_model=SubscriptionWithOverride)
async def get_my_subscription(
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user)
):
    """
    Get current user's subscription details including overrides
    """
    try:
        subscription = await subscription_service.get_user_subscription(db, user["user_id"])
        
        if not subscription:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="No subscription found"
            )
        
        # Get override if exists
        override = await subscription_service._get_override(db, user["user_id"])
        
        # Calculate effective price if subscription has a plan
        effective_price = None
        if subscription.plan_id:
            effective_price = await subscription_service.get_effective_price(
                db, user["user_id"], str(subscription.plan_id)
            )
        
        # Convert to response format
        response_data = SubscriptionResponse.from_orm(subscription)
        response_data.is_active = subscription.is_active()
        
        # Calculate days until renewal
        if subscription.current_period_end:
            from datetime import datetime, timezone
            now = datetime.now(timezone.utc)
            days = (subscription.current_period_end - now).days
            response_data.days_until_renewal = days if days >= 0 else 0
        
        return SubscriptionWithOverride(
            **response_data.dict(),
            override=override,
            effective_price=effective_price
        )
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error("get_subscription_failed", user_id=user["user_id"], error=str(e))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )


@router.get("/plans", response_model=List[SubscriptionPlanResponse])
async def get_plans(
    db: AsyncSession = Depends(get_db)
):
    """
    Get all available subscription plans
    """
    try:
        plans = await subscription_service.get_all_plans(db, active_only=True)
        return plans
    except Exception as e:
        logger.error("get_plans_failed", error=str(e))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )


@router.post("/checkout", response_model=CheckoutSessionResponse)
async def create_checkout_session(
    data: CheckoutSessionCreate,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user)
):
    """
    Create a hosted checkout session for subscription
    """
    try:
        # Get plan — use select() instead of db.get() to avoid pgbouncer prepared-statement collision
        _plan_result = await db.execute(
            select(SubscriptionPlan).where(SubscriptionPlan.id == data.plan_id)
        )
        plan = _plan_result.scalar_one_or_none()
        if not plan or not plan.is_active:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Plan not found or inactive"
            )
        
        # Get or create local subscription record
        subscription = await subscription_service.get_user_subscription(db, user["user_id"])
        if not subscription:
            subscription = await subscription_service.create_trial_subscription(db, user["user_id"])

        # Persist the selected plan before redirecting for new/incomplete
        # subscriptions only. Existing active users may be starting an upgrade;
        # don't mutate their current plan until the gateway returns ACCEPT.
        should_apply_plan_immediately = subscription.status not in (
            SubscriptionStatusEnum.ACTIVE,
            SubscriptionStatusEnum.LIFETIME,
        )
        if should_apply_plan_immediately:
            subscription.plan_id = plan.id
        subscription.cancel_at_period_end = False
        if subscription.status == SubscriptionStatusEnum.CANCELED:
            subscription.canceled_at = None
        if should_apply_plan_immediately:
            subscription.status = SubscriptionStatusEnum.INCOMPLETE
        
        # Create gateway customer if needed
        customer_id = subscription.gateway_customer_id
        if not customer_id:
            customer = payment_gateway_client.create_customer(
                email=user["email"],
                name=user.get("name", ""),
                metadata={"user_id": user["user_id"]}
            )
            customer_id = customer.id
            
            subscription.gateway_customer_id = customer_id
            await db.commit()
        
        # Check for promo code
        coupon_code = None
        if data.promo_code:
            promo = await subscription_service.apply_promo_code(db, user["user_id"], data.promo_code)
            coupon_code = promo.gateway_coupon_id
        
        # Calculate effective price for custom pricing
        effective_price = await subscription_service.get_effective_price(
            db, user["user_id"], data.plan_id
        )

        # Determine URLs
        success_url = data.success_url or f"{settings.FRONTEND_URL}/subscription/success"
        cancel_url = data.cancel_url or f"{settings.FRONTEND_URL}/pricing"

        # Waived or fully discounted subscriptions should activate locally without
        # sending the user through a payment provider checkout.
        if effective_price <= Decimal("0.00"):
            now = datetime.now(timezone.utc)
            subscription.status = (
                SubscriptionStatusEnum.LIFETIME
                if plan.billing_cycle.value == "lifetime"
                else SubscriptionStatusEnum.ACTIVE
            )
            subscription.current_period_start = now
            if plan.billing_cycle.value == "yearly":
                subscription.current_period_end = now + timedelta(days=365)
            elif plan.billing_cycle.value == "quarterly":
                subscription.current_period_end = now + timedelta(days=90)
            elif plan.billing_cycle.value == "lifetime":
                subscription.current_period_end = now + timedelta(days=3650)
            else:
                subscription.current_period_end = now + timedelta(days=30)
            subscription.gateway_checkout_session_id = None
            await db.commit()

            logger.info(
                "subscription_activated_without_checkout",
                user_id=user["user_id"],
                plan_id=data.plan_id,
                status=subscription.status.value,
            )

            return CheckoutSessionResponse(
                session_id=f"local-{subscription.id}",
                url=success_url,
                publishable_key=None,
                method="GET",
                fields=None,
            )
        
        # If price is different from base, create a gateway-specific dynamic price.
        price_id = plan.gateway_plan_id
        product_id = plan.gateway_product_id
        if effective_price != plan.base_price and product_id:
            custom_price = payment_gateway_client.create_dynamic_price(
                amount=effective_price,
                currency=plan.currency,
                interval=plan.billing_cycle.value.rstrip('ly'),  # Convert 'monthly' to 'month'
                product_id=product_id,
                nickname=f"Custom price for {user['email']}"
            )
            price_id = custom_price.id
        
        # Create checkout session
        session = payment_gateway_client.create_hosted_checkout(
            customer_id=customer_id,
            price_id=price_id,
            success_url=success_url,
            cancel_url=cancel_url,
            amount=effective_price,
            currency=plan.currency,
            trial_days=settings.DEFAULT_TRIAL_DAYS if subscription.status == SubscriptionStatusEnum.TRIALING else None,
            coupon_code=coupon_code,
            metadata={
                "user_id": user["user_id"],
                "plan_id": data.plan_id,
                "subscription_id": str(subscription.id),
            }
        )
        subscription.gateway_checkout_session_id = session.session_id
        await db.commit()
        
        logger.info("checkout_session_created",
                   user_id=user["user_id"],
                   plan_id=data.plan_id,
                   session_id=session.session_id)
        
        return CheckoutSessionResponse(
            session_id=session.session_id,
            url=session.url,
            publishable_key=session.publishable_key or settings.PAYMENT_PUBLIC_KEY,
            method=session.method,
            fields=session.fields,
        )
    
    except HTTPException:
        raise
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )
    except Exception as e:
        logger.error("create_checkout_failed", user_id=user["user_id"], error=str(e))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )


@router.post("/cancel")
async def cancel_subscription(
    data: CancelSubscriptionRequest,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user)
):
    """Cancel current subscription"""
    try:
        subscription = await subscription_service.cancel_subscription(
            db,
            user["user_id"],
            immediately=data.immediately,
            reason=data.reason
        )

        # Fire cancellation email (best-effort, non-blocking)
        try:
            _user_result = await db.execute(
                select(User).where(User.supabase_user_id == user["user_id"])
            )
            _u = _user_result.scalar_one_or_none()
            if _u:
                from app.controllers.auth import _readable_name
                end_date = subscription.current_period_end.strftime("%B %d, %Y") if subscription.current_period_end else "end of period"
                plan_name = subscription.plan.name if subscription.plan else "your plan"
                await email_service.send_subscription_canceled(
                    email=_u.email,
                    name=_readable_name(_u.name, _u.email),
                    plan_name=plan_name,
                    end_date=end_date,
                    immediately=data.immediately,
                )
        except Exception as _email_err:
            logger.warning("cancel_email_failed", error=str(_email_err))

        return {
            "success": True,
            "message": "Subscription canceled" if data.immediately else "Subscription will cancel at period end",
            "subscription": SubscriptionResponse.from_orm(subscription)
        }

    except HTTPException:
        raise
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))
    except Exception as e:
        logger.error("cancel_subscription_failed", user_id=user["user_id"], error=str(e))
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))


@router.post("/reactivate")
async def reactivate_subscription(
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user)
):
    """Reactivate a subscription scheduled for cancellation"""
    try:
        subscription = await subscription_service.reactivate_subscription(db, user["user_id"])

        # Fire reactivation email (best-effort)
        try:
            _user_result = await db.execute(
                select(User).where(User.supabase_user_id == user["user_id"])
            )
            _u = _user_result.scalar_one_or_none()
            if _u:
                from app.controllers.auth import _readable_name
                next_billing = subscription.current_period_end.strftime("%B %d, %Y") if subscription.current_period_end else "your next billing date"
                plan_name = subscription.plan.name if subscription.plan else "your plan"
                await email_service.send_subscription_reactivated(
                    email=_u.email,
                    name=_readable_name(_u.name, _u.email),
                    plan_name=plan_name,
                    next_billing=next_billing,
                )
        except Exception as _email_err:
            logger.warning("reactivate_email_failed", error=str(_email_err))

        return {
            "success": True,
            "message": "Subscription reactivated",
            "subscription": SubscriptionResponse.from_orm(subscription)
        }

    except HTTPException:
        raise
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except Exception as e:
        logger.error("reactivate_subscription_failed", user_id=user["user_id"], error=str(e))
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))


@router.post("/apply-promo")
async def apply_promo_code(
    data: ApplyPromoCodeRequest,
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user)
):
    """
    Validate a promo code (doesn't apply it, just validates)
    """
    try:
        promo = await subscription_service.apply_promo_code(db, user["user_id"], data.code)
        
        return {
            "success": True,
            "message": "Promo code is valid",
            "promo_code": {
                "code": promo.code,
                "discount_type": promo.discount_type.value,
                "discount_value": str(promo.discount_value)
            }
        }
    
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )
    except Exception as e:
        logger.error("apply_promo_failed", user_id=user["user_id"], error=str(e))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )


@router.get("/payments/bofa")
async def get_my_bofa_payments(
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """Return BofA/Secure Acceptance payment attempts for the current user."""
    try:
        resolved_user_id = await subscription_service._resolve_user_id(db, user["user_id"])
        if not resolved_user_id:
            return []

        result = await db.execute(
            select(BofaPaymentTransaction)
            .where(BofaPaymentTransaction.user_id == resolved_user_id)
            .order_by(BofaPaymentTransaction.created_at.desc())
            .limit(50)
        )
        return [_serialize_bofa_transaction(t) for t in result.scalars().all()]
    except Exception as e:
        logger.error("get_bofa_payments_failed", user_id=user["user_id"], error=str(e))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e),
        )


@router.post("/confirm-payment")
async def confirm_hpp_payment(
    request: dict[str, str],
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """
    Called by the frontend after BofA redirects back with signed response params.
    Verifies the BofA signature, then activates the subscription locally.
    Works even when the BofA webhook can't reach localhost (dev environment).
    """
    from app.controllers.auth import _readable_name

    decision = (request.get("decision") or "").upper()
    signed_field_names = request.get("signed_field_names", "")
    signature = request.get("signature", "")
    transaction_uuid = request.get("req_transaction_uuid") or request.get("transaction_uuid")
    allow_dev_unsigned_return = (
        settings.ENVIRONMENT == "development"
        and request.get("dev_unsigned_return") == "true"
        and decision == "ACCEPT"
        and bool(transaction_uuid)
    )

    if not decision or (not allow_dev_unsigned_return and (not signed_field_names or not signature)):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Missing signed fields")

    # Verify BofA signature — protects against forged requests
    if payment_gateway_client.gateway == "hosted_payments_page" and not allow_dev_unsigned_return:
        try:
            expected = payment_gateway_client._sign_hpp_fields(request, signed_field_names)
            import hmac as _hmac
            if not _hmac.compare_digest(expected, signature):
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid signature")
        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Signature error: {e}")

    # Find the subscription by the transaction uuid
    if not transaction_uuid:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Missing transaction_uuid")

    _sub_res = await db.execute(
        select(Subscription).where(Subscription.gateway_checkout_session_id == transaction_uuid)
    )
    subscription = _sub_res.scalar_one_or_none()
    if not subscription:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Subscription not found for this transaction")
    resolved_user_id = await subscription_service._resolve_user_id(db, user["user_id"])
    if not resolved_user_id or str(subscription.user_id) != str(resolved_user_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Subscription not found for this user")

    await _record_bofa_payment_response(db, subscription=subscription, fields=request)

    if decision != "ACCEPT":
        if decision in {"DECLINE", "ERROR"}:
            subscription.status = SubscriptionStatusEnum.INCOMPLETE
        await db.commit()
        return {"success": False, "decision": decision, "reason_code": request.get("reason_code")}

    accepted_plan_id = (
        request.get("req_merchant_defined_data2")
        or request.get("merchant_defined_data2")
        or request.get("pending_plan_id")
    )
    if accepted_plan_id:
        _accepted_plan_res = await db.execute(
            select(SubscriptionPlan).where(SubscriptionPlan.id == accepted_plan_id)
        )
        accepted_plan = _accepted_plan_res.scalar_one_or_none()
        if accepted_plan:
            subscription.plan_id = accepted_plan.id

    # Activate if not already active
    if subscription.status not in (SubscriptionStatusEnum.ACTIVE, SubscriptionStatusEnum.LIFETIME):
        now = datetime.now(timezone.utc)
        _plan_res = await db.execute(
            select(SubscriptionPlan).where(SubscriptionPlan.id == subscription.plan_id)
        )
        plan = _plan_res.scalar_one_or_none()

        subscription.status = SubscriptionStatusEnum.ACTIVE
        subscription.current_period_start = now
        subscription.gateway_payment_profile_id = request.get("payment_token")
        if plan and plan.billing_cycle.value == "yearly":
            subscription.current_period_end = now + timedelta(days=365)
        elif plan and plan.billing_cycle.value == "quarterly":
            subscription.current_period_end = now + timedelta(days=90)
        elif plan and plan.billing_cycle.value == "lifetime":
            subscription.status = SubscriptionStatusEnum.LIFETIME
            subscription.current_period_end = now + timedelta(days=3650)
        else:
            subscription.current_period_end = now + timedelta(days=30)
        await db.commit()

        logger.info("subscription_confirmed_via_redirect",
                    user_id=user["user_id"], transaction_uuid=transaction_uuid)

        # Send activation email
        try:
            _user_res = await db.execute(select(User).where(User.supabase_user_id == user["user_id"]))
            _u = _user_res.scalar_one_or_none()
            if _u and plan:
                await email_service.send_subscription_activated(
                    email=_u.email,
                    name=_readable_name(_u.name, _u.email),
                    plan_name=plan.name,
                    price=f"{plan.base_price:.2f}",
                    billing_cycle=plan.billing_cycle.value,
                    period_end=subscription.current_period_end.strftime("%B %d, %Y"),
                )
        except Exception as _e:
            logger.warning("confirm_payment_email_failed", error=str(_e))
    else:
        if accepted_plan_id:
            subscription.cancel_at_period_end = False
        await db.commit()

    return {"success": True, "decision": decision, "status": subscription.status.value}
