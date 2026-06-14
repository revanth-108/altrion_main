import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { portfolioService } from '@/services';
import type { Portfolio, LoanEligibility, PortfolioHealth, HealthHistoryResponse, AllocationInsights, AssetInsight } from '@/types';

export const portfolioKeys = {
  all: ['portfolio'] as const,
  detail: () => [...portfolioKeys.all, 'detail'] as const,
  history: (period: string) => [...portfolioKeys.all, 'history', period] as const,
  loanEligibility: () => [...portfolioKeys.all, 'loan-eligibility'] as const,
  health: () => [...portfolioKeys.all, 'health'] as const,
  healthHistory: (days: number) => [...portfolioKeys.all, 'health-history', days] as const,
  allocationInsights: () => [...portfolioKeys.all, 'allocation-insights'] as const,
  accountAllocationInsights: (accountId: string) => [...portfolioKeys.all, 'accounts', accountId, 'allocation-insights'] as const,
  assetInsight: (bucket: string, symbol: string) => [...portfolioKeys.all, 'assets', bucket, symbol, 'insight'] as const,
};

export function usePortfolio() {
  return useQuery<Portfolio>({
    queryKey: portfolioKeys.detail(),
    queryFn: () => portfolioService.getPortfolio(),
    staleTime: 30 * 1000,
  });
}

export function usePortfolioHistory(period: '1H' | '24H' | '7D' | '1M' | '1Y') {
  return useQuery<{ timestamp: number; value: number }[]>({
    queryKey: portfolioKeys.history(period),
    queryFn: () => portfolioService.getPortfolioHistory(period),
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });
}

export function useLoanEligibility() {
  return useQuery<LoanEligibility>({
    queryKey: portfolioKeys.loanEligibility(),
    queryFn: () => portfolioService.getLoanEligibility(),
    staleTime: 60 * 1000,
  });
}

export function usePortfolioHealth() {
  return useQuery<PortfolioHealth>({
    queryKey: portfolioKeys.health(),
    queryFn: () => portfolioService.getPortfolioHealth(),
    staleTime: 60 * 1000,
    retry: 2,
  });
}

export function useHealthHistory(days: number = 90) {
  return useQuery<HealthHistoryResponse>({
    queryKey: portfolioKeys.healthHistory(days),
    queryFn: () => portfolioService.getHealthHistory(days),
    staleTime: 5 * 60 * 1000,
  });
}

export function useAllocationInsights(accountId?: string) {
  return useQuery<AllocationInsights>({
    queryKey: accountId ? portfolioKeys.accountAllocationInsights(accountId) : portfolioKeys.allocationInsights(),
    queryFn: () => accountId ? portfolioService.getAccountAllocationInsights(accountId) : portfolioService.getAllocationInsights(),
    staleTime: 60 * 1000,
    retry: 1,
  });
}

export function useAccountAllocationInsights(accountId?: string) {
  return useQuery<AllocationInsights>({
    queryKey: accountId ? portfolioKeys.accountAllocationInsights(accountId) : [...portfolioKeys.all, 'accounts', 'missing', 'allocation-insights'],
    queryFn: () => portfolioService.getAccountAllocationInsights(accountId || ''),
    staleTime: 60 * 1000,
    retry: 1,
    enabled: Boolean(accountId),
  });
}

export function useAssetInsight(bucket?: 'crypto' | 'stocks' | 'cash', symbol?: string) {
  return useQuery<AssetInsight>({
    queryKey: bucket && symbol ? portfolioKeys.assetInsight(bucket, symbol) : [...portfolioKeys.all, 'assets', 'missing', 'insight'],
    queryFn: () => portfolioService.getAssetInsight(bucket || 'stocks', symbol || ''),
    staleTime: 60 * 1000,
    retry: 1,
    enabled: Boolean(bucket && symbol),
  });
}

export function useRefreshPortfolio() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => portfolioService.refreshPortfolio(),
    onSuccess: (result) => {
      queryClient.setQueryData(portfolioKeys.detail(), {
        ...result.portfolio,
        lastSyncedAt: result.refreshedAt,
      });
      queryClient.invalidateQueries({ queryKey: portfolioKeys.allocationInsights() });
      queryClient.invalidateQueries({ queryKey: [...portfolioKeys.all, 'accounts'] });
      queryClient.invalidateQueries({ queryKey: [...portfolioKeys.all, 'assets'] });
      queryClient.invalidateQueries({ queryKey: ['plaid'] });
      queryClient.invalidateQueries({ queryKey: ['platforms', 'connected'] });
      queryClient.invalidateQueries({ queryKey: portfolioKeys.health() });
      queryClient.invalidateQueries({ queryKey: portfolioKeys.healthHistory(90) });
    },
  });
}

export function useApplyForLoan() {
  return useMutation({
    mutationFn: ({ amount, collateralAssetIds }: { amount: number; collateralAssetIds: string[] }) =>
      portfolioService.applyForLoan(amount, collateralAssetIds),
  });
}
