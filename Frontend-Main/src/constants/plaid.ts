import type { PlaidTransactionQueryParams } from '@/services/plaid.service';

export const plaidKeys = {
  all: ['plaid'] as const,
  accounts: ['plaid', 'accounts'] as const,
  balances: ['plaid', 'balances'] as const,
  transactionsBase: ['plaid', 'transactions'] as const,
  transactions: (params?: PlaidTransactionQueryParams) => ['plaid', 'transactions', params ?? null] as const,
  transactionSyncStatus: ['plaid', 'sync-status'] as const,
  recurring: ['plaid', 'recurring'] as const,
  holdings: ['plaid', 'holdings'] as const,
  liabilities: ['plaid', 'liabilities'] as const,
  identity: ['plaid', 'identity'] as const,
  itemStatus: ['plaid', 'item-status'] as const,
};
