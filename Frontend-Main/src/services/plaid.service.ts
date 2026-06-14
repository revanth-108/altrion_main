import { api, type ApiResponse } from './api';
import type {
  PlaidAccountsResponse,
  PlaidBalancesResponse,
  PlaidLiabilityResponse,
  PlaidRecurringResponse,
  PlaidRefreshResponse,
  PlaidSyncResponse,
  PlaidTransactionSyncStatusResponse,
  PlaidTransactionsSyncUpdatesResponse,
  PlaidTransactionsResponse,
} from '@/types';

export type PlaidTransactionQueryParams = {
  start_date?: string;
  end_date?: string;
  account_id?: string;
  limit?: number;
  offset?: number;
};

export type PlaidInvestmentTransactionParams = {
  start_date?: string;
  end_date?: string;
};

export const plaidService = {
  // Transactions
  syncTransactions: (itemId?: string): Promise<ApiResponse<PlaidTransactionsResponse>> =>
    api.post('/plaid/transactions/sync', itemId ? { item_id: itemId } : {}),

  syncTransactionUpdates: (): Promise<ApiResponse<PlaidTransactionsSyncUpdatesResponse>> =>
    api.post('/plaid/transactions/sync-updates', {}),

  getTransactionSyncStatus: (): Promise<ApiResponse<PlaidTransactionSyncStatusResponse>> =>
    api.get('/plaid/sync-status'),

  getTransactions: (params?: PlaidTransactionQueryParams): Promise<ApiResponse<PlaidTransactionsResponse>> =>
    api.get('/plaid/transactions', { params: params as Record<string, string> | undefined }),

  getRecurringTransactions: (): Promise<ApiResponse<PlaidRecurringResponse>> =>
    api.get('/plaid/transactions/recurring'),

  syncRecurring: (): Promise<ApiResponse<PlaidRecurringResponse>> =>
    api.post('/plaid/transactions/recurring/sync'),

  // Accounts
  getAccounts: (): Promise<ApiResponse<PlaidAccountsResponse>> =>
    api.get('/plaid/accounts'),

  getBalances: (): Promise<ApiResponse<PlaidBalancesResponse>> =>
    api.get('/plaid/accounts/balances'),

  syncAccounts: (itemId?: string): Promise<ApiResponse<PlaidBalancesResponse>> =>
    api.post('/plaid/accounts/sync', {}, itemId ? { params: { item_id: itemId } } : {}),

  refreshAllItems: (): Promise<ApiResponse<PlaidRefreshResponse>> =>
    api.post('/plaid/refresh', {}),

  // Investments
  syncInvestments: (): Promise<ApiResponse<PlaidSyncResponse>> =>
    api.post('/plaid/investments/sync', {}),

  getHoldings: (): Promise<ApiResponse<PlaidSyncResponse>> =>
    api.get('/plaid/investments/holdings'),

  getInvestmentTransactions: (params?: PlaidInvestmentTransactionParams): Promise<ApiResponse<PlaidSyncResponse>> =>
    api.post('/plaid/investments/transactions', params || {}),

  syncInvestmentTransactions: (): Promise<ApiResponse<PlaidSyncResponse>> =>
    api.post('/plaid/investments/transactions/sync', {}),

  // Liabilities
  getLiabilities: (): Promise<ApiResponse<PlaidLiabilityResponse>> =>
    api.get('/plaid/liabilities'),

  syncLiabilities: (): Promise<ApiResponse<PlaidLiabilityResponse>> =>
    api.post('/plaid/liabilities/sync'),

  // Identity
  getIdentity: (): Promise<ApiResponse<Record<string, unknown>>> =>
    api.get('/plaid/identity'),

  // Item
  getItemStatus: (): Promise<ApiResponse<Record<string, unknown>>> =>
    api.get('/plaid/item/status'),

  disconnectItem: (itemId: string): Promise<ApiResponse<PlaidSyncResponse>> =>
    api.delete(`/plaid/items/${itemId}`),

  removeItem: (itemId: string): Promise<ApiResponse<PlaidSyncResponse>> =>
    api.delete(`/plaid/items/${itemId}`),
};
