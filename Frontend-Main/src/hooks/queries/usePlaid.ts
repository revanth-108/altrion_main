import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { plaidService } from '@/services/plaid.service';

export const PLAID_KEYS = {
  accounts: ['plaid', 'accounts'],
  balances: ['plaid', 'balances'],
  transactions: (params?: object) => ['plaid', 'transactions', params],
  recurring: ['plaid', 'recurring'],
  holdings: ['plaid', 'holdings'],
  liabilities: ['plaid', 'liabilities'],
  identity: ['plaid', 'identity'],
  itemStatus: ['plaid', 'item-status'],
};

export const usePlaidAccounts = (enabled = true) =>
  useQuery({ queryKey: PLAID_KEYS.accounts, queryFn: () => plaidService.getAccounts(), enabled });

export const usePlaidBalances = (enabled = true) =>
  useQuery({ queryKey: PLAID_KEYS.balances, queryFn: () => plaidService.getBalances(), enabled });

export const usePlaidTransactions = (
  params?: { start_date?: string; end_date?: string; account_id?: string },
  enabled = true,
) =>
  useQuery({ queryKey: PLAID_KEYS.transactions(params), queryFn: () => plaidService.getTransactions(params), enabled });

export const usePlaidRecurring = () =>
  useQuery({ queryKey: PLAID_KEYS.recurring, queryFn: () => plaidService.getRecurringTransactions() });

export const usePlaidHoldings = () =>
  useQuery({ queryKey: PLAID_KEYS.holdings, queryFn: () => plaidService.getHoldings() });

export const usePlaidLiabilities = (enabled = true) =>
  useQuery({ queryKey: PLAID_KEYS.liabilities, queryFn: () => plaidService.getLiabilities(), enabled });

export const useSyncRecurring = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => plaidService.syncRecurring(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: PLAID_KEYS.recurring });
    },
  });
};

export const useSyncLiabilities = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => plaidService.syncLiabilities(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: PLAID_KEYS.liabilities });
      qc.invalidateQueries({ queryKey: PLAID_KEYS.balances });
    },
  });
};

export const useSyncTransactions = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => plaidService.syncTransactions(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['plaid', 'transactions'] });
      qc.invalidateQueries({ queryKey: PLAID_KEYS.accounts });
    },
  });
};

export const useSyncInvestments = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => plaidService.syncInvestments(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: PLAID_KEYS.holdings });
    },
  });
};

export const useRefreshAll = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => plaidService.refreshAllItems(),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['plaid'] });
      qc.invalidateQueries({ queryKey: ['platforms', 'connected'] });
      qc.invalidateQueries({ queryKey: ['portfolio'] });
    },
  });
};
