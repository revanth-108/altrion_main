import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/components/ui/Toast';
import { plaidKeys } from '@/constants';
import { plaidService, type PlaidTransactionQueryParams } from '@/services/plaid.service';
import { platformKeys } from './usePlatforms';
import { portfolioKeys } from './usePortfolio';
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

function getErrorMessage(error: unknown, fallback = 'Request failed') {
  return error instanceof Error ? error.message : fallback;
}

function invalidatePlaidConnectionData(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.invalidateQueries({ queryKey: plaidKeys.accounts });
  queryClient.invalidateQueries({ queryKey: plaidKeys.balances });
  queryClient.invalidateQueries({ queryKey: plaidKeys.liabilities });
  queryClient.invalidateQueries({ queryKey: platformKeys.connected() });
  queryClient.invalidateQueries({ queryKey: portfolioKeys.all });
}

function invalidatePlaidTransactionData(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.invalidateQueries({ queryKey: plaidKeys.transactionsBase });
  queryClient.invalidateQueries({ queryKey: plaidKeys.transactionSyncStatus });
  queryClient.invalidateQueries({ queryKey: plaidKeys.accounts });
  queryClient.invalidateQueries({ queryKey: plaidKeys.balances });
  queryClient.invalidateQueries({ queryKey: plaidKeys.liabilities });
  queryClient.invalidateQueries({ queryKey: portfolioKeys.all });
}

function invalidatePlaidAllData(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.invalidateQueries({ queryKey: plaidKeys.all });
  queryClient.invalidateQueries({ queryKey: plaidKeys.transactionsBase });
  queryClient.invalidateQueries({ queryKey: plaidKeys.transactionSyncStatus });
  queryClient.invalidateQueries({ queryKey: plaidKeys.recurring });
  queryClient.invalidateQueries({ queryKey: plaidKeys.holdings });
  queryClient.invalidateQueries({ queryKey: plaidKeys.liabilities });
  queryClient.invalidateQueries({ queryKey: plaidKeys.identity });
  queryClient.invalidateQueries({ queryKey: plaidKeys.itemStatus });
  queryClient.invalidateQueries({ queryKey: platformKeys.connected() });
  queryClient.invalidateQueries({ queryKey: portfolioKeys.all });
}

function showSyncToast(
  toast: ReturnType<typeof useToast>,
  payload: PlaidSyncResponse,
  {
    successTitle,
    noUpdatesTitle = 'No updates available',
    failureTitle = 'Sync failed',
    runningTitle = 'Sync already running',
  }: {
    successTitle: string;
    noUpdatesTitle?: string;
    failureTitle?: string;
    runningTitle?: string;
  },
) {
  const message = payload.message || undefined;

  if (payload.status === 'no_updates') {
    toast.info(noUpdatesTitle, message);
    return;
  }

  if (payload.status === 'already_running') {
    toast.warning(runningTitle, message);
    return;
  }

  if (payload.status === 'failed') {
    toast.error(failureTitle, message);
    return;
  }

  if (payload.errors?.length) {
    toast.warning(successTitle, message || 'Completed with partial errors.');
    return;
  }

  toast.success(successTitle, message);
}

export const PLAID_KEYS = plaidKeys;

export type PlaidTransactionSyncStatus = PlaidTransactionSyncStatusResponse;

export const usePlaidAccounts = (enabled = true) =>
  useQuery<PlaidAccountsResponse>({
    queryKey: plaidKeys.accounts,
    queryFn: async () => (await plaidService.getAccounts()).data,
    enabled,
  });

export const usePlaidBalances = (enabled = true) =>
  useQuery<PlaidBalancesResponse>({
    queryKey: plaidKeys.balances,
    queryFn: async () => (await plaidService.getBalances()).data,
    enabled,
  });

export const usePlaidTransactions = (
  params?: PlaidTransactionQueryParams,
  enabled = true,
) =>
  useQuery<PlaidTransactionsResponse>({
    queryKey: plaidKeys.transactions(params),
    queryFn: async () => (await plaidService.getTransactions(params)).data,
    enabled,
  });

export const usePlaidTransactionSyncStatus = (enabled = true) =>
  useQuery<PlaidTransactionSyncStatusResponse>({
    queryKey: plaidKeys.transactionSyncStatus,
    queryFn: async () => (await plaidService.getTransactionSyncStatus()).data,
    enabled,
    refetchInterval: enabled ? 60_000 : false,
    refetchOnWindowFocus: true,
  });

export const usePlaidRecurring = () =>
  useQuery<PlaidRecurringResponse>({
    queryKey: plaidKeys.recurring,
    queryFn: async () => (await plaidService.getRecurringTransactions()).data,
  });

export const usePlaidHoldings = () =>
  useQuery<PlaidSyncResponse>({
    queryKey: plaidKeys.holdings,
    queryFn: async () => (await plaidService.getHoldings()).data,
  });

export const usePlaidLiabilities = (enabled = true) =>
  useQuery<PlaidLiabilityResponse>({
    queryKey: plaidKeys.liabilities,
    queryFn: async () => (await plaidService.getLiabilities()).data,
    enabled,
  });

export const useSyncRecurring = () => {
  const qc = useQueryClient();
  const toast = useToast();

  return useMutation({
    mutationFn: async () => (await plaidService.syncRecurring()).data,
    onSuccess: (payload: PlaidRecurringResponse) => {
      qc.invalidateQueries({ queryKey: plaidKeys.recurring });
      toast.success('Recurring streams updated', payload.summary ? `Inflow: ${payload.summary.inflow_count}, outflow: ${payload.summary.outflow_count}.` : undefined);
    },
    onError: (error) => {
      toast.error('Recurring sync failed', getErrorMessage(error));
    },
  });
};

export const useSyncLiabilities = () => {
  const qc = useQueryClient();
  const toast = useToast();

  return useMutation({
    mutationFn: async () => (await plaidService.syncLiabilities()).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: plaidKeys.liabilities });
      qc.invalidateQueries({ queryKey: plaidKeys.balances });
      toast.success('Liabilities updated', 'Your synced liabilities were refreshed.');
    },
    onError: (error) => {
      toast.error('Liabilities sync failed', getErrorMessage(error));
    },
  });
};

export const useSyncTransactions = () => {
  const qc = useQueryClient();
  const toast = useToast();

  return useMutation({
    mutationFn: async () => (await plaidService.syncTransactions()).data,
    onSuccess: (payload: PlaidTransactionsResponse) => {
      qc.invalidateQueries({ queryKey: plaidKeys.transactionsBase });
      qc.invalidateQueries({ queryKey: plaidKeys.transactionSyncStatus });
      qc.invalidateQueries({ queryKey: plaidKeys.accounts });
      toast.success('Transactions synced', payload.summary ? `Added ${payload.summary.added ?? 0}, modified ${payload.summary.modified ?? 0}, removed ${payload.summary.removed ?? 0}.` : undefined);
    },
    onError: (error) => {
      toast.error('Transaction sync failed', getErrorMessage(error));
    },
  });
};

export const useSyncPlaidBalances = () => {
  const qc = useQueryClient();
  const toast = useToast();

  return useMutation({
    mutationFn: async (itemId?: string) => (await plaidService.syncAccounts(itemId)).data,
    onSuccess: (payload: PlaidBalancesResponse) => {
      invalidatePlaidConnectionData(qc);
      toast.success('Balances updated', payload.message || 'Plaid balances were refreshed.');
    },
    onError: (error) => {
      toast.error('Balance sync failed', getErrorMessage(error));
    },
  });
};

export const useSyncPlaidTransactionUpdates = () => {
  const qc = useQueryClient();
  const toast = useToast();

  return useMutation({
    mutationFn: async () => (await plaidService.syncTransactionUpdates()).data,
    onSuccess: (payload: PlaidTransactionsSyncUpdatesResponse) => {
      invalidatePlaidTransactionData(qc);
      showSyncToast(toast, payload, {
        successTitle: 'Transaction updates synced',
        noUpdatesTitle: 'No transaction updates available',
        failureTitle: 'Transaction sync failed',
        runningTitle: 'Transaction sync already running',
      });
    },
    onError: (error) => {
      toast.error('Transaction sync failed', getErrorMessage(error));
    },
  });
};

export const useSyncInvestments = () => {
  const qc = useQueryClient();
  const toast = useToast();

  return useMutation({
    mutationFn: async () => (await plaidService.syncInvestments()).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: plaidKeys.holdings });
      toast.success('Investments updated', 'Your investment holdings were refreshed.');
    },
    onError: (error) => {
      toast.error('Investment sync failed', getErrorMessage(error));
    },
  });
};

export const useDisconnectPlaidItem = () => {
  const qc = useQueryClient();
  const toast = useToast();

  return useMutation({
    mutationFn: async (itemId: string) => (await plaidService.disconnectItem(itemId)).data,
    onSuccess: () => {
      invalidatePlaidAllData(qc);
      toast.success('Connection removed', 'The Plaid item was disconnected successfully.');
    },
    onError: (error) => {
      toast.error('Disconnect failed', getErrorMessage(error));
    },
  });
};

export const useRefreshAll = () => {
  const qc = useQueryClient();
  const toast = useToast();

  return useMutation({
    mutationFn: async () => (await plaidService.refreshAllItems()).data,
    onSuccess: (payload: PlaidRefreshResponse) => {
      invalidatePlaidAllData(qc);
      showSyncToast(toast, payload, {
        successTitle: 'Plaid data refreshed',
        noUpdatesTitle: 'No updates available',
        failureTitle: 'Plaid refresh failed',
        runningTitle: 'Plaid refresh already running',
      });
    },
    onError: (error) => {
      toast.error('Plaid refresh failed', getErrorMessage(error));
    },
  });
};
