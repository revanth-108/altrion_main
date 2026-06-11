# Plaid API Contract

This document describes the normalized Plaid response envelopes used by the backend and the expected shape consumed by the frontend.

## Shared Envelope

Most Plaid endpoints now return:

- `success`: boolean
- `status`: canonical status string
- `message`: human-readable summary
- `items`: per-item result array
- `errors`: per-item error array
- `counts`: summary counts where applicable

Legacy fields are still present for compatibility while older frontend code is retired.

## `POST /api/plaid/exchange-token`

Connect a new Plaid Item after Link completes.

Example response:

```json
{
  "success": true,
  "status": "synced",
  "message": "Plaid item connected.",
  "items": [
    {
      "item_id": "item_123",
      "step": "exchange-token",
      "success": true,
      "added": 3,
      "modified": 0,
      "removed": 0
    }
  ],
  "errors": [],
  "counts": {
    "accounts": 3,
    "initial_sync_errors": 0,
    "warnings": 0
  }
}
```

Frontend expectation:

- Read `items[0]` for connection outcome.
- Keep reading `item_id`, `accounts`, and `initial_sync` only as compatibility fields.

## `POST /api/plaid/refresh`

Refresh all connected Plaid items.

Example response:

```json
{
  "success": true,
  "status": "synced",
  "message": "Plaid refresh completed.",
  "items": [],
  "errors": [],
  "counts": {
    "items": 1,
    "errors": 0
  }
}
```

Consent-missing response:

```json
{
  "success": true,
  "status": "skipped",
  "message": "Plaid refresh skipped because storage consent is missing.",
  "items": [],
  "errors": [],
  "counts": {
    "items": 0,
    "errors": 0
  }
}
```

## `GET /api/plaid/sync-status`

Reports whether webhook-marked transaction updates are available.

Example response:

```json
{
  "success": true,
  "status": "updates_available",
  "message": "Transaction updates are available.",
  "items": [
    {
      "item_id": "item_123",
      "institution_name": "Example Bank",
      "transactions_update_available": true,
      "updated_at": "2026-06-11T00:00:00Z"
    }
  ],
  "errors": [],
  "counts": {
    "items": 1,
    "items_with_updates": 1
  },
  "hasTransactionUpdates": true
}
```

Frontend expectation:

- Hide the transaction sync button unless `status === "updates_available"` or `hasTransactionUpdates` is true.

## `POST /api/plaid/transactions/sync-updates`

Sync transactions only for items marked by a webhook.

Example response:

```json
{
  "success": true,
  "status": "no_updates",
  "message": "No transaction updates available.",
  "items": [],
  "errors": [],
  "counts": {
    "items": 0,
    "requested": 0,
    "skipped": 1,
    "errors": 0
  },
  "requested": false,
  "item_count": 0,
  "hasTransactionUpdates": false,
  "skipped_items": [
    {
      "item_id": "item_123",
      "transactions": {
        "skipped_reason": "no_updates"
      }
    }
  ]
}
```

Frontend expectation:

- Treat `no_updates` as informational, not an error.
- Show partial-error toasts only when `errors` is non-empty.

## `POST /api/webhooks/plaid`

Example response:

```json
{
  "success": true,
  "status": "synced",
  "message": "Webhook processed successfully.",
  "items": [],
  "errors": [],
  "webhook_type": "TRANSACTIONS",
  "webhook_code": "SYNC_UPDATES_AVAILABLE",
  "item_id": "item_123",
  "status_refreshed": true,
  "sync_triggered": false
}
```

## Compatibility Fields

The following fields remain for now and should be removed after all consumers are migrated:

- `initial_sync_results`
- `duplicate_institution_detected`
- `replaced_item_ids`
- `warnings`
- `requested`
- `item_count`
- `hasTransactionUpdates`
- `skipped_items`
- `persisted`
- legacy `item_id=null` token fallback paths in controller aliases

## Legacy Paths Audit

The following paths and compatibility behaviors remain enabled for now, but they are no longer the preferred frontend integration points:

| Legacy path / behavior | Replacement | Status |
| --- | --- | --- |
| `POST /api/platforms/plaid/connect` | `POST /api/plaid/link-token` + `POST /api/plaid/exchange-token` | Removed in Phase 5B; 410 returned for compatibility probes |
| `DELETE /api/plaid/item` | `DELETE /api/plaid/items/{item_id}` | Removed in Phase 5B |
| `item_id = null` fallback token lookup | Pass an explicit `item_id` | Keep temporarily for legacy rows only |
| Legacy response aliases such as `initial_sync_results` and `skipped_items` | Canonical `items`, `errors`, `counts` envelope | Keep until all callers are migrated |

Planned removal date: **2026-07-31**

Audit notes:

- Legacy paths now emit structured warning logs with route, user_id, timestamp, and caller when available.
- Frontend Plaid flows should only use the normalized Plaid endpoints listed above.
- The removed `/api/platforms/plaid/connect` and `/api/plaid/item` aliases should not be used by current clients.
