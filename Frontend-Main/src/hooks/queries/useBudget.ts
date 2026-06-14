import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { budgetService } from '@/services/budget.service';
import type { BudgetData, BudgetAllocation } from '@/types';

export const budgetKeys = {
  all: ['budget'] as const,
  data: () => [...budgetKeys.all, 'data'] as const,
};

export function useBudgetData() {
  return useQuery<BudgetData>({
    queryKey: budgetKeys.data(),
    queryFn: () => budgetService.getBudgetData(),
    staleTime: 60 * 1000,
    retry: false,
  });
}

export function useDeleteAllocation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (allocationId: number) => budgetService.deleteAllocation(allocationId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: budgetKeys.data() });
    },
  });
}

export function useSaveAllocations() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (allocation: BudgetAllocation) =>
      budgetService.saveAllocation(allocation),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: budgetKeys.data() });
    },
  });
}
