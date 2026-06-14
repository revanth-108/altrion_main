import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockedPlaidService = vi.hoisted(() => ({
  refreshAllItems: vi.fn(),
  disconnectItem: vi.fn(),
  syncAccounts: vi.fn(),
  syncTransactionUpdates: vi.fn(),
  getTransactionSyncStatus: vi.fn(),
}));

const mockedToast = vi.hoisted(() => ({
  success: vi.fn(),
  error: vi.fn(),
  warning: vi.fn(),
  info: vi.fn(),
}));

vi.mock('@/services/plaid.service', () => ({
  plaidService: {
    refreshAllItems: mockedPlaidService.refreshAllItems,
    disconnectItem: mockedPlaidService.disconnectItem,
    syncAccounts: mockedPlaidService.syncAccounts,
    syncTransactionUpdates: mockedPlaidService.syncTransactionUpdates,
    getTransactionSyncStatus: mockedPlaidService.getTransactionSyncStatus,
  },
}));

vi.mock('@/components/ui/Toast', () => ({
  useToast: () => mockedToast,
}));

import { plaidKeys } from '@/constants';
import { useDisconnectPlaidItem, usePlaidTransactionSyncStatus, useRefreshAll, useSyncPlaidBalances, useSyncPlaidTransactionUpdates } from './usePlaid';

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });

  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );

  return { queryClient, wrapper };
}

describe('usePlaid', () => {
  beforeEach(() => {
    mockedPlaidService.refreshAllItems.mockReset();
    mockedPlaidService.disconnectItem.mockReset();
    mockedPlaidService.syncAccounts.mockReset();
    mockedPlaidService.syncTransactionUpdates.mockReset();
    mockedPlaidService.getTransactionSyncStatus.mockReset();
    mockedToast.success.mockReset();
    mockedToast.error.mockReset();
    mockedToast.warning.mockReset();
    mockedToast.info.mockReset();
  });

  it('calls the all-items plaid refresh endpoint and invalidates plaid caches', async () => {
    mockedPlaidService.refreshAllItems.mockResolvedValue({
      data: {
        success: true,
        status: 'synced',
        message: 'Plaid data refreshed.',
        items: [],
        errors: [],
      },
    });

    const { queryClient, wrapper } = createWrapper();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
    const { result } = renderHook(() => useRefreshAll(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync();
    });

    expect(mockedPlaidService.refreshAllItems).toHaveBeenCalledTimes(1);
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: plaidKeys.all });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: plaidKeys.transactionSyncStatus });
    expect(mockedToast.success).toHaveBeenCalledWith('Plaid data refreshed', 'Plaid data refreshed.');
  });

  it('calls the plaid item disconnect endpoint', async () => {
    mockedPlaidService.disconnectItem.mockResolvedValue({
      data: { success: true, status: 'synced', message: 'Disconnected.', items: [], errors: [] },
    });

    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useDisconnectPlaidItem(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync('item-123');
    });

    expect(mockedPlaidService.disconnectItem).toHaveBeenCalledWith('item-123');
    expect(mockedToast.success).toHaveBeenCalledWith('Connection removed', 'The Plaid item was disconnected successfully.');
  });

  it('calls the plaid balances sync endpoint and invalidates connected data', async () => {
    mockedPlaidService.syncAccounts.mockResolvedValue({
      data: {
        success: true,
        status: 'synced',
        message: 'Balances updated.',
        accounts: [],
      },
    });

    const { queryClient, wrapper } = createWrapper();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
    const { result } = renderHook(() => useSyncPlaidBalances(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync(undefined);
    });

    expect(mockedPlaidService.syncAccounts).toHaveBeenCalledTimes(1);
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: plaidKeys.accounts });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: plaidKeys.liabilities });
    expect(mockedToast.success).toHaveBeenCalledWith('Balances updated', 'Balances updated.');
  });

  it.each([
    ['no_updates', 'No transaction updates available', mockedToast.info, 'No transaction updates available.'],
    ['already_running', 'Transaction sync already running', mockedToast.warning, 'Sync already running.'],
    ['synced', 'Transaction updates synced', mockedToast.success, 'Transaction updates synced.'],
    ['failed', 'Transaction sync failed', mockedToast.error, 'Transaction sync failed.'],
  ] as const)(
    'shows the correct toast for plaid transaction updates status %s',
    async (status, expectedTitle, toastSpy, responseMessage) => {
      mockedPlaidService.syncTransactionUpdates.mockResolvedValue({
        data: {
          success: status !== 'failed',
          status,
          message: responseMessage,
          items: [],
          errors: status === 'failed' ? [{ item_id: 'item-1', sync_step: 'transactions', error: 'boom', message: 'boom' }] : [],
        },
      });

      const { queryClient, wrapper } = createWrapper();
      const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
      const { result } = renderHook(() => useSyncPlaidTransactionUpdates(), { wrapper });

      await act(async () => {
        await result.current.mutateAsync();
      });

      expect(mockedPlaidService.syncTransactionUpdates).toHaveBeenCalledTimes(1);
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: plaidKeys.transactionsBase });
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: plaidKeys.transactionSyncStatus });
      expect(toastSpy).toHaveBeenCalled();
      expect(expectedTitle).toBeTruthy();
    },
  );

  it('exposes the plaid transaction sync status query', async () => {
    mockedPlaidService.getTransactionSyncStatus.mockResolvedValue({
      data: {
        success: true,
        status: 'updates_available',
        message: 'Transaction updates are available.',
        hasTransactionUpdates: true,
        items: [
          {
            item_id: 'item-123',
            institution_name: 'Test Bank',
            transactions_update_available: true,
            updated_at: '2026-01-01T00:00:00Z',
          },
        ],
      },
    });

    const { wrapper } = createWrapper();
    const { result } = renderHook(() => usePlaidTransactionSyncStatus(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data?.hasTransactionUpdates).toBe(true);
    expect(result.current.data?.status).toBe('updates_available');
    expect(mockedPlaidService.getTransactionSyncStatus).toHaveBeenCalledTimes(1);
  });
});
