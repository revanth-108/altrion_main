export type PlaidSyncStatusValue = 'no_updates' | 'updates_available' | 'synced' | 'failed' | 'skipped' | 'already_running';

export interface PlaidSyncCounts {
  items?: number;
  errors?: number;
  requested?: number;
  skipped?: number;
  accounts?: number;
  initial_sync_errors?: number;
  warnings?: number;
  items_with_updates?: number;
}

export type PlaidCounts = PlaidSyncCounts;

export interface PlaidSyncError {
  item_id: string;
  sync_step: string;
  error: string;
  message: string;
  error_code?: string | null;
  plaid_error_code?: string | null;
  plaid_error_message?: string | null;
  request_id?: string | null;
  institution_id?: string | null;
}

export interface PlaidSyncItemResult {
  item_id: string;
  step: string;
  success: boolean;
  added: number;
  modified: number;
  removed: number;
  error_code?: string | null;
  message?: string | null;
  institution_id?: string | null;
  details?: unknown;
  transactions?: {
    added: number;
    modified: number;
    removed: number;
    cursor_saved: boolean;
    skipped_reason: string | null;
  };
}

export type PlaidItemResult = PlaidSyncItemResult;

export interface PlaidSyncResponse<TItem = PlaidSyncItemResult> {
  success: boolean;
  status: PlaidSyncStatusValue | string;
  message: string;
  items: TItem[];
  errors: PlaidSyncError[];
  counts?: PlaidSyncCounts;
  item_count?: number;
  requested?: boolean;
  persisted?: boolean;
  steps?: Array<Record<string, unknown>>;
  skipped_items?: TItem[];
  hasTransactionUpdates?: boolean;
}

export type PlaidRefreshResponse = PlaidSyncResponse<PlaidItemResult>;
export type PlaidTransactionsSyncUpdatesResponse = PlaidSyncResponse<PlaidItemResult>;

export interface PlaidTransactionSyncStatusItem {
  item_id: string;
  institution_name: string | null;
  transactions_update_available: boolean;
  updated_at: string | null;
  skipped_reason?: string | null;
}

export interface PlaidTransactionSyncStatusResponse {
  success: boolean;
  status: PlaidSyncStatusValue | 'updates_available';
  message: string;
  hasTransactionUpdates: boolean;
  items: PlaidTransactionSyncStatusItem[];
  errors?: PlaidSyncError[];
  counts?: PlaidSyncCounts;
}

export interface PlaidAccount {
  id: string;
  name: string;
  type: string;
  subtype: string;
  mask: string | null;
}

export interface PlaidBalanceAccount {
  account_id: string;
  name?: string;
  available: number | null;
  current: number | null;
  limit: number | null;
  currency: string | null;
}

export interface PlaidAccountsResponse {
  success: boolean;
  source: string;
  status?: string;
  message?: string;
  accounts: PlaidAccount[];
  account_count?: number;
  items?: PlaidSyncItemResult[];
  errors?: PlaidSyncError[];
}

export interface PlaidBalancesResponse {
  success: boolean;
  source: string;
  status?: string;
  message?: string;
  accounts: PlaidBalanceAccount[];
  items?: PlaidSyncItemResult[];
  errors?: PlaidSyncError[];
}

export interface PlaidTransaction {
  id: string;
  account_id: string;
  transaction_id: string | null;
  amount: number;
  date: string;
  authorized_date?: string | null;
  name: string;
  merchant_name?: string | null;
  pending?: boolean;
  category_primary?: string | null;
  category_detailed?: string | null;
  payment_channel?: string | null;
  logo_url?: string | null;
  account_name?: string | null;
  account_mask?: string | null;
  institution_name?: string | null;
}

export interface PlaidTransactionsResponse {
  success: boolean;
  source: string;
  status?: string;
  message?: string;
  transactions: PlaidTransaction[];
  total_transactions: number;
  summary?: Record<string, number>;
  next_cursor?: string | null;
  has_more?: boolean;
  items?: PlaidSyncItemResult[];
  errors?: PlaidSyncError[];
}

export interface PlaidRecurringStream {
  stream_id: string;
  account_id: string;
  description: string;
  merchant_name: string;
  frequency: string;
  average_amount: number | null;
  last_amount: number | null;
  first_date: string | null;
  last_date: string | null;
  predicted_next_date: string | null;
  status: string;
  is_active: boolean;
}

export interface PlaidRecurringResponse {
  success: boolean;
  source: string;
  status?: string;
  message?: string;
  inflow_streams: PlaidRecurringStream[];
  outflow_streams: PlaidRecurringStream[];
  summary?: {
    inflow_count: number;
    outflow_count: number;
  };
  items?: PlaidSyncItemResult[];
  errors?: PlaidSyncError[];
}

export interface PlaidLiabilityResponse {
  success: boolean;
  source: string;
  status?: string;
  message?: string;
  credit?: Array<Record<string, unknown>>;
  credit_cards?: Array<Record<string, unknown>>;
  mortgage?: Array<Record<string, unknown>>;
  student?: Array<Record<string, unknown>>;
  loans?: Array<Record<string, unknown>>;
  total_liabilities?: number;
  liabilities_total?: number;
  summary?: Record<string, number>;
  items?: PlaidSyncItemResult[];
  errors?: PlaidSyncError[];
}

export interface PlaidExchangeTokenResponse extends PlaidSyncResponse {
  item_id: string;
  accounts: Array<{
    provider_account_id: string;
    name?: string | null;
    type?: string | null;
    subtype?: string | null;
    mask?: string | null;
  }>;
  account_count: number;
  duplicate_institution_detected: boolean;
  replaced_item_ids: string[];
  warnings: Array<{
    item_id: string;
    step: string;
    success: boolean;
    message: string;
    institution_id?: string | null;
    replaced_item_ids?: string[];
  }>;
  initial_sync: PlaidSyncResponse;
}

export interface PlaidWebhookResponse {
  success: boolean;
  status: PlaidSyncStatusValue | string;
  message: string;
  items: Array<Record<string, unknown>>;
  errors: Array<Record<string, unknown>>;
  counts?: PlaidCounts;
  webhook_type?: string | null;
  webhook_code?: string | null;
  item_id?: string | null;
  status_refreshed?: boolean;
  sync_triggered?: boolean;
  reason?: string;
  error?: string;
  transactions_update_available?: boolean;
  persisted?: boolean;
  requested?: boolean;
  skipped_items?: Array<Record<string, unknown>>;
}
