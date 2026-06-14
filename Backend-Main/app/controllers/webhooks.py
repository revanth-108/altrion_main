"""
Payment webhook endpoints
"""
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.database import get_db
from app.integrations.payment_gateway_client import payment_gateway_client
from app.models.provider_token import ProviderToken
from app.services.providers.plaid import PlaidAdapter
from app.services import plaid_persist
from app.services.plaid_safe import parse_token_data
from app.services.plaid_utils import plaid_error_context
from app.services.plaid_sync import (
    plaid_item_supports_transactions,
)
from app.services.webhook_service import webhook_service
from app.core.logging import get_logger
from app.schemas.plaid import PlaidWebhookResponse

logger = get_logger()

router = APIRouter(prefix="/webhooks", tags=["webhooks"])


def _webhook_response(
    *,
    status_value: str,
    message: str,
    success: bool = True,
    **extra,
):
    response = {
        "success": success,
        "status": status_value,
        "message": message,
        "items": extra.pop("items", []),
        "errors": extra.pop("errors", []),
    }
    response.update(extra)
    return response


async def _handle_payment_webhook(
    request: Request,
    db: AsyncSession = Depends(get_db)
):
    """
    Handle payment gateway webhook events
    """
    payload = await request.body()
    signature_header_name = payment_gateway_client.webhook_signature_header_name()
    sig_header = request.headers.get(signature_header_name)
    
    if signature_header_name and not sig_header:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Missing {signature_header_name} header"
        )
    
    try:
        event = payment_gateway_client.construct_webhook_event(payload, sig_header)
        
        logger.info("payment_webhook_received",
                   event_type=event.type,
                   event_id=getattr(event, "id", "unknown"),
                   gateway=payment_gateway_client.gateway)

        if await webhook_service.has_processed_event(db, event.id):
            logger.info("payment_webhook_duplicate_ignored",
                       event_type=event.type,
                       event_id=event.id,
                       gateway=payment_gateway_client.gateway)
            return {"success": True, "event_type": event.type, "duplicate": True}
        
        if event.type == "hpp.payment.accept":
            await webhook_service.handle_hpp_accept(db, event)

        elif event.type in {"hpp.payment.decline", "hpp.payment.review", "hpp.payment.error", "hpp.payment.cancel", "hpp.payment.unknown"}:
            await webhook_service.handle_hpp_non_accept(db, event)
        
        else:
            logger.info("payment_webhook_unhandled", event_type=event.type)
        
        return {"success": True, "event_type": event.type}
    
    except ValueError as e:
        logger.error("payment_webhook_invalid_payload", error=str(e))
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid payload"
        )
    
    except Exception as e:
        logger.error("payment_webhook_processing_failed",
                    event_type=event.type if 'event' in locals() else "unknown",
                    error=str(e))
        return {"success": False, "error": str(e)}


@router.post("/payments")
async def handle_payment_webhook(
    request: Request,
    db: AsyncSession = Depends(get_db)
):
    """Gateway-neutral payment webhook endpoint."""
    return await _handle_payment_webhook(request, db)


async def _handle_plaid_webhook(request: Request, db: AsyncSession):
    """
    Handle Plaid webhook events safely.

    For TRANSACTIONS/SYNC_UPDATES_AVAILABLE, we refresh item status and mark
    the token row so the UI knows new transaction sync data is ready.
    """
    try:
        payload = await request.json()
    except Exception:
        payload = {}

    webhook_type = payload.get("webhook_type")
    webhook_code = payload.get("webhook_code")
    item_id = payload.get("item_id")

    logger.info(
        "plaid_webhook_received",
        webhook_type=webhook_type,
        webhook_code=webhook_code,
        item_id=item_id,
    )

    if not item_id:
        return _webhook_response(
            status_value="skipped",
            message="Webhook ignored because item_id was missing.",
            webhook_type=webhook_type,
            webhook_code=webhook_code,
            item_id=None,
            status_refreshed=False,
            sync_triggered=False,
            reason="missing_item_id",
        )

    result = await db.execute(
        select(ProviderToken).where(
            ProviderToken.provider == "plaid",
            ProviderToken.item_id == item_id,
            ProviderToken.is_active == True,
        )
    )
    token_row = result.scalar_one_or_none()

    if not token_row:
        logger.warning(
            "plaid_webhook_no_matching_item",
            webhook_type=webhook_type,
            webhook_code=webhook_code,
            item_id=item_id,
        )
        return _webhook_response(
            status_value="skipped",
            message="Webhook ignored because no matching Plaid item was found.",
            webhook_type=webhook_type,
            webhook_code=webhook_code,
            item_id=item_id,
            status_refreshed=False,
            sync_triggered=False,
            reason="no_matching_item",
        )

    token_data = parse_token_data(token_row.token_data)
    access_token = token_data.get("access_token")
    if not access_token:
        logger.warning(
            "plaid_webhook_missing_access_token",
            webhook_type=webhook_type,
            webhook_code=webhook_code,
            item_id=item_id,
            user_id=str(token_row.user_id),
        )
        return _webhook_response(
            status_value="skipped",
            message="Webhook ignored because the access token is unavailable.",
            webhook_type=webhook_type,
            webhook_code=webhook_code,
            item_id=item_id,
            status_refreshed=False,
            sync_triggered=False,
            reason="missing_access_token",
        )

    adapter = PlaidAdapter()
    try:
        item_status = await adapter.get_item_status(access_token)
        await plaid_persist.upsert_item_status(
            db=db,
            item_id=item_id,
            item_status=item_status,
        )
        await db.commit()
        logger.info(
            "plaid_webhook_item_status_refreshed",
            webhook_type=webhook_type,
            webhook_code=webhook_code,
            item_id=item_id,
            user_id=str(token_row.user_id),
        )
    except Exception as exc:
        await db.rollback()
        logger.error(
            "plaid_webhook_item_status_refresh_failed",
            webhook_type=webhook_type,
            webhook_code=webhook_code,
            item_id=item_id,
            user_id=str(token_row.user_id),
            **plaid_error_context(exc),
        )
        return _webhook_response(
            status_value="failed",
            message="Webhook item status refresh failed.",
            success=False,
            webhook_type=webhook_type,
            webhook_code=webhook_code,
            item_id=item_id,
            status_refreshed=False,
            sync_triggered=False,
            error=str(exc),
        )

    if webhook_type == "TRANSACTIONS" and webhook_code == "SYNC_UPDATES_AVAILABLE":
        transactions_supported = plaid_item_supports_transactions(
            getattr(token_row, "available_products", None),
            getattr(token_row, "billed_products", None),
        )
        if not transactions_supported:
            logger.info(
                "plaid_webhook_transaction_sync_skipped",
                webhook_type=webhook_type,
                webhook_code=webhook_code,
                item_id=item_id,
                user_id=str(token_row.user_id),
                reason="investment_only",
            )
            return _webhook_response(
                status_value="skipped",
                message="Webhook received but transaction sync is not supported for this item.",
                webhook_type=webhook_type,
                webhook_code=webhook_code,
                item_id=item_id,
                status_refreshed=True,
                sync_triggered=False,
                reason="investment_only",
            )

        token_row.transactions_update_available = True
        token_row.transactions_update_available_at = datetime.utcnow()
        token_row.last_transactions_sync_status = "updates_available"
        await db.commit()
        logger.info(
            "plaid_webhook_transaction_updates_available",
            webhook_type=webhook_type,
            webhook_code=webhook_code,
            item_id=item_id,
            user_id=str(token_row.user_id),
        )
        return _webhook_response(
            status_value="synced",
            message="Transaction updates marked available.",
            webhook_type=webhook_type,
            webhook_code=webhook_code,
            item_id=item_id,
            status_refreshed=True,
            sync_triggered=False,
            transactions_update_available=True,
        )

    return _webhook_response(
        status_value="synced",
        message="Webhook processed successfully.",
        webhook_type=webhook_type,
        webhook_code=webhook_code,
        item_id=item_id,
        status_refreshed=True,
        sync_triggered=False,
    )


@router.post("/plaid", response_model=PlaidWebhookResponse)
async def handle_plaid_webhook(
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """Plaid webhook endpoint."""
    return await _handle_plaid_webhook(request, db)
