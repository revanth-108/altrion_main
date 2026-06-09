import api from './api';

export const plaidService = {
  // Transactions
  syncTransactions: (itemId?: string) =>
    api.post('/plaid/transactions/sync', itemId ? { item_id: itemId } : {}),

  getTransactions: (params?: { start_date?: string; end_date?: string; account_id?: string; limit?: number; offset?: number }) =>
    api.get('/plaid/transactions', { params: params as Record<string, string> | undefined }),

  getRecurringTransactions: () =>
    api.get('/plaid/transactions/recurring'),

  syncRecurring: () =>
    api.post('/plaid/transactions/recurring/sync'),

  // Accounts
  getAccounts: () =>
    api.get('/plaid/accounts'),

  getBalances: () =>
    api.get('/plaid/accounts/balances'),

  syncAccounts: () =>
    api.post('/plaid/accounts/sync', {}),

  refreshAllItems: () =>
    api.post('/plaid/refresh', {}),

  // Investments
  syncInvestments: () =>
    api.post('/plaid/investments/sync', {}),

  getHoldings: () =>
    api.get('/plaid/investments/holdings'),

  getInvestmentTransactions: (params?: { start_date?: string; end_date?: string }) =>
    api.post('/plaid/investments/transactions', params || {}),

  syncInvestmentTransactions: () =>
    api.post('/plaid/investments/transactions/sync', {}),

  // Liabilities
  getLiabilities: () =>
    api.get('/plaid/liabilities'),

  syncLiabilities: () =>
    api.post('/plaid/liabilities/sync'),

  // Identity
  getIdentity: () =>
    api.get('/plaid/identity'),

  // Item
  getItemStatus: () =>
    api.get('/plaid/item/status'),

  removeItem: (itemId: string) =>
    api.delete(`/plaid/item`, { params: { item_id: itemId } }),
};
