"""Plaid API response schemas.

These models define the stable Plaid response contract used by the backend
and mirrored in the frontend type layer. Legacy/compatibility fields are kept
as optional extras for now so older clients continue to work.
"""
from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field


class PlaidCounts(BaseModel):
    model_config = ConfigDict(extra="allow")

    items: int | None = None
    errors: int | None = None
    requested: int | None = None
    skipped: int | None = None
    accounts: int | None = None
    initial_sync_errors: int | None = None
    warnings: int | None = None
    items_with_updates: int | None = None


class PlaidSyncError(BaseModel):
    model_config = ConfigDict(extra="allow")

    item_id: str
    sync_step: str
    error: str
    message: str
    error_code: str | None = None
    plaid_error_code: str | None = None
    plaid_error_message: str | None = None
    request_id: str | None = None
    institution_id: str | None = None


class PlaidItemTransactions(BaseModel):
    model_config = ConfigDict(extra="allow")

    added: int = 0
    modified: int = 0
    removed: int = 0
    cursor_saved: bool = False
    skipped_reason: str | None = None


class PlaidItemResult(BaseModel):
    model_config = ConfigDict(extra="allow")

    item_id: str
    step: str
    success: bool
    added: int = 0
    modified: int = 0
    removed: int = 0
    error_code: str | None = None
    message: str | None = None
    institution_id: str | None = None
    details: dict[str, Any] | None = None
    transactions: PlaidItemTransactions | None = None


class PlaidTransactionSyncStatusItem(BaseModel):
    model_config = ConfigDict(extra="allow")

    item_id: str
    institution_name: str | None = None
    transactions_update_available: bool
    updated_at: str | None = None
    skipped_reason: str | None = None


class PlaidSyncBaseResponse(BaseModel):
    model_config = ConfigDict(extra="allow")

    success: bool
    status: Literal[
        "no_updates",
        "updates_available",
        "synced",
        "failed",
        "skipped",
        "already_running",
    ] | str
    message: str
    items: list[PlaidItemResult] = Field(default_factory=list)
    errors: list[PlaidSyncError] = Field(default_factory=list)
    counts: PlaidCounts | None = None


class PlaidRefreshResponse(PlaidSyncBaseResponse):
    persisted: bool | None = None
    item_count: int | None = None
    steps: list[dict[str, Any]] | None = None
    initial_sync_results: list[PlaidItemResult] | None = None


class PlaidExchangeTokenResponse(PlaidSyncBaseResponse):
    item_id: str | None = None
    accounts: list[dict[str, Any]] = Field(default_factory=list)
    account_count: int | None = None
    duplicate_institution_detected: bool | None = None
    replaced_item_ids: list[str] = Field(default_factory=list)
    warnings: list[dict[str, Any]] = Field(default_factory=list)
    initial_sync: dict[str, Any] | None = None


class PlaidSyncStatusResponse(BaseModel):
    model_config = ConfigDict(extra="allow")

    success: bool
    status: Literal["no_updates", "updates_available", "failed", "skipped", "already_running"] | str
    message: str
    items: list[PlaidTransactionSyncStatusItem] = Field(default_factory=list)
    errors: list[PlaidSyncError] = Field(default_factory=list)
    counts: PlaidCounts | None = None
    hasTransactionUpdates: bool = False


class PlaidTransactionsSyncUpdatesResponse(PlaidSyncBaseResponse):
    requested: bool | None = None
    item_count: int | None = None
    hasTransactionUpdates: bool | None = None
    skipped_items: list[PlaidItemResult] = Field(default_factory=list)


class PlaidWebhookResponse(BaseModel):
    model_config = ConfigDict(extra="allow")

    success: bool
    status: Literal["synced", "skipped", "failed"] | str
    message: str
    items: list[dict[str, Any]] = Field(default_factory=list)
    errors: list[dict[str, Any]] = Field(default_factory=list)
    webhook_type: str | None = None
    webhook_code: str | None = None
    item_id: str | None = None
    status_refreshed: bool | None = None
    sync_triggered: bool | None = None
    reason: str | None = None
    error: str | None = None
    transactions_update_available: bool | None = None
    persisted: bool | None = None
    requested: bool | None = None
    skipped_items: list[dict[str, Any]] | None = None
    counts: PlaidCounts | None = None
