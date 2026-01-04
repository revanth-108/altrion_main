/**
 * Loan Service
 * API client for the Aetherum Loan Agent
 */

import type { LoanCalculateRequest, LoanCalculateResponse } from '@/types';

const LOAN_API_URL = import.meta.env.VITE_LOAN_API_URL || 'http://localhost:5002';

export const loanService = {
  /**
   * Calculate loan based on collateral assets
   */
  async calculateLoan(request: LoanCalculateRequest): Promise<LoanCalculateResponse> {
    const response = await fetch(`${LOAN_API_URL}/loan/calculate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
      throw new Error(errorData.error || `API Error: ${response.status}`);
    }

    return response.json();
  },
};

export default loanService;
