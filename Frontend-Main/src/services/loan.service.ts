/**
 * Loan Service
 * API client for the Aetherum Loan Agent
 */

import type { LoanCalculateRequest, LoanCalculateResponse } from '@/types';
import { api } from './api';

export const loanService = {
  /**
   * Calculate loan based on collateral assets
   */
  async calculateLoan(request: LoanCalculateRequest): Promise<LoanCalculateResponse> {
    const response = await api.post<LoanCalculateResponse>('/loan/calculate', request);
    return response.data;
  },
};

export default loanService;
