/**
 * Loan Query Hooks
 * React Query hooks for loan calculations
 */

import { useMutation } from '@tanstack/react-query';
import { loanService } from '@/services';
import type { LoanCalculateRequest, LoanCalculateResponse } from '@/types';

export const loanKeys = {
  all: ['loan'] as const,
  calculate: () => [...loanKeys.all, 'calculate'] as const,
};

export function useCalculateLoan() {
  return useMutation<LoanCalculateResponse, Error, LoanCalculateRequest>({
    mutationFn: (request) => loanService.calculateLoan(request),
  });
}
