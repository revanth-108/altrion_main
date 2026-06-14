"""
Payment gateway endpoints.
"""
import uuid
from decimal import Decimal
from typing import Optional

from fastapi import APIRouter, Depends, Request
from fastapi.responses import HTMLResponse, RedirectResponse
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db
from app.models.bofa_payment_transaction import BofaPaymentTransaction
from app.models.subscription import Subscription, SubscriptionStatusEnum
from app.services.bofa_secure_acceptance import bofa_secure_acceptance_service

router = APIRouter(prefix="/payments", tags=["payments"])


class BofaReceiptResponse(BaseModel):
    verified: bool
    decision: Optional[str] = None
    reason_code: Optional[str] = None
    transaction_id: Optional[str] = None
    reference_number: Optional[str] = None


@router.post("/bofa/secure-acceptance/receipt", response_model=BofaReceiptResponse)
async def bofa_secure_acceptance_receipt(
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """
    Verify a Secure Acceptance receipt/response POST.

    Configure this URL as the receipt/response target in the hosted payment
    profile when you are ready to receive gateway callbacks.
    """
    form = await request.form()
    fields = {key: str(value) for key, value in form.items()}
    verified = bofa_secure_acceptance_service.verify_response_signature(fields)
    reference_number = fields.get("req_reference_number") or fields.get("reference_number")
    decision = fields.get("decision")

    subscription_id: Optional[uuid.UUID] = None
    user_id: Optional[uuid.UUID] = None

    if reference_number and reference_number.startswith("sub-"):
        try:
            subscription_id = uuid.UUID(reference_number.removeprefix("sub-"))
            result = await db.execute(select(Subscription).where(Subscription.id == subscription_id))
            subscription = result.scalar_one_or_none()
            if subscription:
                user_id = subscription.user_id
                if verified and decision == "ACCEPT":
                    subscription.status = SubscriptionStatusEnum.ACTIVE
                    await db.commit()
        except ValueError:
            pass

    # Always record the payment attempt regardless of outcome
    amount_str = fields.get("auth_amount") or fields.get("req_amount")
    try:
        amount_decimal = Decimal(amount_str) if amount_str else None
    except Exception:
        amount_decimal = None

    txn = BofaPaymentTransaction(
        user_id=user_id,
        subscription_id=subscription_id,
        reference_number=reference_number or "",
        transaction_uuid=fields.get("req_transaction_uuid"),
        transaction_id=fields.get("transaction_id") or fields.get("transaction_id_0"),
        decision=decision or "UNKNOWN",
        reason_code=fields.get("reason_code"),
        auth_code=fields.get("auth_code"),
        amount=amount_decimal,
        currency=(fields.get("req_currency") or "USD").upper(),
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
    db.add(txn)
    await db.commit()

    return BofaReceiptResponse(
        verified=verified,
        decision=decision,
        reason_code=fields.get("reason_code"),
        transaction_id=fields.get("transaction_id") or fields.get("transaction_id_0"),
        reference_number=reference_number,
    )


@router.post("/bofa/mock-checkout", response_class=HTMLResponse)
async def bofa_mock_checkout(request: Request):
    """
    Dev-only mock that simulates the CyberSource Secure Acceptance hosted payment page.
    Set BOFA_SA_DEV_MOCK=true and BOFA_SA_PAYMENT_URL to this endpoint's URL in .env.
    """
    if not settings.BOFA_SA_DEV_MOCK:
        return HTMLResponse("<h1>Not available in production</h1>", status_code=404)

    form = await request.form()
    fields = {k: str(v) for k, v in form.items()}
    reference_number = fields.get("reference_number", "")
    amount = fields.get("amount", "0.00")
    currency = fields.get("currency", "USD")

    verified = bofa_secure_acceptance_service.verify_response_signature(fields)
    if not verified:
        return HTMLResponse(
            "<h1>Invalid signature — check BOFA_SA_SECRET_KEY matches your .env</h1>",
            status_code=403,
        )

    html = f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Mock Payment — Dev Only</title>
  <style>
    body{{font-family:system-ui,sans-serif;background:#f5f5f5;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0}}
    .card{{background:#fff;border-radius:12px;padding:40px;max-width:420px;width:100%;box-shadow:0 4px 24px rgba(0,0,0,.08)}}
    .badge{{background:#fff3cd;color:#856404;border:1px solid #ffc107;border-radius:6px;padding:8px 14px;font-size:13px;margin-bottom:24px;display:block;text-align:center}}
    h2{{margin:0 0 8px;color:#1a1a1a}}
    .amount{{font-size:32px;font-weight:700;color:#1a1a1a;margin:16px 0}}
    .ref{{font-size:12px;color:#888;font-family:monospace;margin-bottom:28px}}
    .card-mock{{background:#f9f9f9;border:1px solid #e0e0e0;border-radius:8px;padding:16px;margin-bottom:24px}}
    .card-mock input{{width:100%;border:1px solid #ddd;border-radius:6px;padding:10px;font-size:14px;box-sizing:border-box;margin-top:6px}}
    label{{font-size:12px;color:#666;display:block}}
    .row{{display:flex;gap:12px;margin-top:12px}}
    .row>div{{flex:1}}
    .btn{{width:100%;padding:14px;border:none;border-radius:8px;font-size:16px;font-weight:600;cursor:pointer;margin-top:8px}}
    .btn-success{{background:#22c55e;color:#fff}}
    .btn-cancel{{background:#f5f5f5;color:#666;border:1px solid #ddd}}
  </style>
</head>
<body>
  <div class="card">
    <span class="badge">⚠ Development Mock — no real charge</span>
    <h2>Complete Payment</h2>
    <div class="amount">${amount} {currency}</div>
    <div class="ref">Ref: {reference_number}</div>
    <div class="card-mock">
      <label>Card number</label>
      <input type="text" value="4111 1111 1111 1111" readonly>
      <div class="row">
        <div><label>Expiry</label><input type="text" value="12/26" readonly></div>
        <div><label>CVV</label><input type="text" value="123" readonly></div>
      </div>
    </div>
    <form method="POST" action="/api/payments/bofa/mock-confirm">
      <input type="hidden" name="reference_number" value="{reference_number}">
      <input type="hidden" name="amount" value="{amount}">
      <button class="btn btn-success" type="submit" name="action" value="accept">Pay ${amount} {currency}</button>
      <button class="btn btn-cancel" type="submit" name="action" value="cancel">Cancel</button>
    </form>
  </div>
</body>
</html>"""
    return HTMLResponse(html)


@router.post("/bofa/mock-confirm")
async def bofa_mock_confirm(
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """Dev-only: simulate CyberSource posting back a payment result."""
    if not settings.BOFA_SA_DEV_MOCK:
        return HTMLResponse("<h1>Not available in production</h1>", status_code=404)

    form = await request.form()
    action = str(form.get("action", "cancel"))
    reference_number = str(form.get("reference_number", ""))

    if action == "accept" and reference_number.startswith("sub-"):
        try:
            subscription_id = uuid.UUID(reference_number.removeprefix("sub-"))
            result = await db.execute(
                select(Subscription).where(Subscription.id == subscription_id)
            )
            subscription = result.scalar_one_or_none()
            if subscription:
                subscription.status = SubscriptionStatusEnum.ACTIVE
                await db.commit()
        except ValueError:
            pass

    dest = (
        f"{settings.FRONTEND_URL}/subscription/success"
        if action == "accept"
        else f"{settings.FRONTEND_URL}/pricing"
    )
    return RedirectResponse(url=dest, status_code=303)
