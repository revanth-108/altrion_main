import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { ConnectAPI } from './ConnectAPI';

const mockedPlatformService = vi.hoisted(() => ({
  getPlaidLinkToken: vi.fn(),
  exchangePlaidToken: vi.fn(),
  connectWithCredentials: vi.fn(),
}));

const mockedUsePlaidLink = vi.hoisted(() => ({
  open: vi.fn(),
  ready: true,
}));

const mockedUseConnectionStatus = vi.hoisted(() => ({
  retryConnection: vi.fn(),
}));

vi.mock('../../services', () => ({
  ApiError: class ApiError extends Error {
    status: number;
    constructor(status: number, message: string) {
      super(message);
      this.status = status;
    }
  },
  platformService: mockedPlatformService,
}));

vi.mock('../../hooks/queries/usePlatforms', () => ({
  usePlatforms: () => ({
    data: {
      crypto: [],
      banks: [{ id: 'plaid', name: 'Plaid', icon: '/plaid.svg', category: 'bank' }],
      brokers: [],
    },
  }),
}));

vi.mock('../../hooks', () => ({
  useConnectionStatus: () => ({
    connections: [{ platformId: 'plaid', status: 'pending' }],
    successCount: 0,
    retryConnection: mockedUseConnectionStatus.retryConnection,
  }),
}));

vi.mock('../../components/layout', () => ({
  DashboardLayout: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  ConnectionSetupLayout: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

vi.mock('react-plaid-link', () => ({
  usePlaidLink: (args: { onSuccess: (publicToken: string) => Promise<void> }) => ({
    open: async () => {
      mockedUsePlaidLink.open();
      await args.onSuccess('public-token-123');
    },
    ready: mockedUsePlaidLink.ready,
  }),
}));

function renderConnectAPI() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <ConnectAPI />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('ConnectAPI Plaid flow', () => {
  beforeEach(() => {
    mockedPlatformService.getPlaidLinkToken.mockReset();
    mockedPlatformService.exchangePlaidToken.mockReset();
    mockedPlatformService.connectWithCredentials.mockReset();
    mockedUsePlaidLink.open.mockReset();
    mockedUseConnectionStatus.retryConnection.mockReset();
    localStorage.clear();
  });

  it('uses the normalized Plaid exchange endpoint and avoids the legacy generic connect path', async () => {
    mockedPlatformService.getPlaidLinkToken.mockResolvedValue('link-token-123');
    mockedPlatformService.exchangePlaidToken.mockResolvedValue({
      success: true,
      persisted: true,
      item_id: 'item-123',
      accounts: [],
      account_count: 0,
    });

    renderConnectAPI();

    await waitFor(() => expect(mockedPlatformService.getPlaidLinkToken).toHaveBeenCalledTimes(1));
    const button = screen.getByRole('button', { name: 'Connect Bank' });

    await act(async () => {
      fireEvent.click(button);
    });

    await waitFor(() => expect(mockedPlatformService.exchangePlaidToken).toHaveBeenCalledWith('public-token-123'));
    expect(await screen.findByText('Bank account connected')).toBeInTheDocument();
    expect(screen.getByText('Redirecting to your dashboard')).toBeInTheDocument();
    expect(mockedPlatformService.connectWithCredentials).not.toHaveBeenCalled();
    expect(mockedUsePlaidLink.open).toHaveBeenCalledTimes(1);
  });
});
