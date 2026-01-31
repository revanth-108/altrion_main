import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { portfolioService } from '@/services';
import { usePortfolioStore } from '@/store';
import type { Portfolio, LoanEligibility } from '@/types';

export const portfolioKeys = {
  all: ['portfolio'] as const,
  detail: () => [...portfolioKeys.all, 'detail'] as const,
  history: (period: string) => [...portfolioKeys.all, 'history', period] as const,
  loanEligibility: () => [...portfolioKeys.all, 'loan-eligibility'] as const,
};

export function usePortfolio() {
  const { setPortfolio, setLoading, setError } = usePortfolioStore();

  return useQuery<Portfolio>({
    queryKey: portfolioKeys.detail(),
    queryFn: async () => {
      setLoading(true);
      try {
        const portfolio = await portfolioService.getPortfolio();
        setPortfolio(portfolio);
        return portfolio;
      } catch (error) {
        setError(error instanceof Error ? error.message : 'Failed to load portfolio');
        throw error;
      } finally {
        setLoading(false);
      }
    },
    staleTime: 30 * 1000, // 30 seconds
    refetchInterval: 60 * 1000, // Refetch every minute
  });
}

export function usePortfolioHistory(period: '1H' | '24H' | '7D' | '1M' | '1Y') {
  return useQuery({
    queryKey: portfolioKeys.history(period),
    queryFn: () => portfolioService.getPortfolioHistory(period),
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

export function useLoanEligibility() {
  return useQuery<LoanEligibility>({
    queryKey: portfolioKeys.loanEligibility(),
    queryFn: () => portfolioService.getLoanEligibility(),
    staleTime: 60 * 1000, // 1 minute
  });
}

export function useRefreshPortfolio() {
  const queryClient = useQueryClient();
  const { setPortfolio } = usePortfolioStore();

  return useMutation({
    mutationFn: () => portfolioService.refreshPortfolio(),
    onSuccess: (result) => {
      setPortfolio(result.portfolio);
      queryClient.setQueryData(portfolioKeys.detail(), result.portfolio);
      // Return warnings so component can access them
      return result.warnings;
    },
  });
}

export function useApplyForLoan() {
  return useMutation({
    mutationFn: ({ amount, collateralAssetIds }: { amount: number; collateralAssetIds: string[] }) =>
      portfolioService.applyForLoan(amount, collateralAssetIds),
  });
}
