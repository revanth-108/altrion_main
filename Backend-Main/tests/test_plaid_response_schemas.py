from app.schemas.plaid import (
    PlaidExchangeTokenResponse,
    PlaidRefreshResponse,
    PlaidSyncStatusResponse,
    PlaidTransactionsSyncUpdatesResponse,
    PlaidWebhookResponse,
)


def test_plaid_exchange_token_response_validates_success_payload():
    payload = {
        "success": True,
        "status": "synced",
        "message": "Plaid item connected.",
        "items": [
            {
                "item_id": "item-1",
                "step": "exchange-token",
                "success": True,
                "added": 2,
                "modified": 0,
                "removed": 0,
            }
        ],
        "errors": [],
        "counts": {"accounts": 2, "initial_sync_errors": 0, "warnings": 0},
        "item_id": "item-1",
        "accounts": [],
        "account_count": 2,
        "duplicate_institution_detected": False,
        "replaced_item_ids": [],
        "warnings": [],
        "initial_sync": {"success": True, "items": [], "errors": []},
    }

    model = PlaidExchangeTokenResponse.model_validate(payload)
    assert model.status == "synced"
    assert model.item_id == "item-1"


def test_plaid_sync_status_response_validates_no_updates_payload():
    payload = {
        "success": True,
        "status": "no_updates",
        "message": "No transaction updates available.",
        "hasTransactionUpdates": False,
        "items": [],
        "errors": [],
        "counts": {"items": 0, "items_with_updates": 0},
    }

    model = PlaidSyncStatusResponse.model_validate(payload)
    assert model.status == "no_updates"
    assert model.hasTransactionUpdates is False


def test_plaid_transactions_sync_updates_response_validates_already_running_payload():
    payload = {
        "success": False,
        "status": "already_running",
        "message": "Plaid sync already running.",
        "items": [],
        "errors": [
            {
                "item_id": "item-1",
                "sync_step": "transactions/sync-updates",
                "error": "already_running",
                "message": "already_running",
            }
        ],
        "counts": {"items": 0, "requested": 0, "skipped": 0, "errors": 1},
        "requested": False,
        "item_count": 0,
        "hasTransactionUpdates": True,
        "skipped_items": [],
    }

    model = PlaidTransactionsSyncUpdatesResponse.model_validate(payload)
    assert model.status == "already_running"
    assert model.errors[0].error == "already_running"


def test_plaid_refresh_response_validates_partial_failure_payload():
    payload = {
        "success": True,
        "status": "synced",
        "message": "Plaid refresh completed with errors.",
        "items": [
            {
                "item_id": "item-1",
                "step": "refresh",
                "success": True,
                "added": 0,
                "modified": 1,
                "removed": 0,
            },
            {
                "item_id": "item-2",
                "step": "refresh",
                "success": False,
                "added": 0,
                "modified": 0,
                "removed": 0,
                "message": "Plaid API error",
            },
        ],
        "errors": [
            {
                "item_id": "item-2",
                "sync_step": "refresh",
                "error": "Plaid API error",
                "message": "Plaid API error",
            }
        ],
        "counts": {"items": 2, "errors": 1},
        "persisted": True,
        "item_count": 2,
        "steps": [],
        "initial_sync_results": [],
    }

    model = PlaidRefreshResponse.model_validate(payload)
    assert model.status == "synced"
    assert len(model.errors) == 1


def test_plaid_refresh_response_validates_consent_required_payload():
    payload = {
        "success": True,
        "status": "skipped",
        "message": "Plaid refresh skipped because storage consent is missing.",
        "items": [],
        "errors": [],
        "counts": {"items": 0, "errors": 0},
        "persisted": False,
        "steps": [],
        "item_count": 0,
    }

    model = PlaidRefreshResponse.model_validate(payload)
    assert model.status == "skipped"
    assert model.persisted is False


def test_plaid_webhook_response_validates_success_payload():
    payload = {
        "success": True,
        "status": "synced",
        "message": "Webhook processed successfully.",
        "items": [],
        "errors": [],
        "webhook_type": "TRANSACTIONS",
        "webhook_code": "SYNC_UPDATES_AVAILABLE",
        "item_id": "item-1",
        "status_refreshed": True,
        "sync_triggered": False,
        "transactions_update_available": True,
    }

    model = PlaidWebhookResponse.model_validate(payload)
    assert model.status == "synced"
    assert model.transactions_update_available is True
