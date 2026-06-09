import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';

const mockedPlaidService = vi.hoisted(() => ({
  refreshAllItems: vi.fn(),
}));

vi.mock('@/services/plaid.service', () => ({
  plaidService: {
    refreshAllItems: mockedPlaidService.refreshAllItems,
  },
}));

import { useRefreshAll } from './usePlaid';

describe('useRefreshAll', () => {
  beforeEach(() => {
    mockedPlaidService.refreshAllItems.mockReset();
  });

  it('calls the all-items plaid refresh endpoint', async () => {
    mockedPlaidService.refreshAllItems.mockResolvedValue({ success: true });

    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false, gcTime: 0 },
        mutations: { retry: false },
      },
    });

    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );

    const { result } = renderHook(() => useRefreshAll(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync();
    });

    expect(mockedPlaidService.refreshAllItems).toHaveBeenCalledTimes(1);
  });
});
