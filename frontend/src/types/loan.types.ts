/**
 * Loan API Types
 * Types for the Aetherum Loan Agent API
 */

// Request types
export interface LoanAssetRequest {
  symbol: string;
  allocation_usd: number;
}

export type PayoutCurrency = 'USD' | 'USDT';
export type BankOption = 'chase' | 'bofa';

export interface LoanCalculateRequest {
  assets: LoanAssetRequest[];
  months: 6 | 12 | 18 | 24 | 36;
  payout_currency?: PayoutCurrency;
  bank?: BankOption;
}

// Response types
export interface LoanAnalyst {
  markdown: string;
  provider: string;
  model: string;
  used_llm: boolean;
}

export interface LoanSummary {
  total_collateral: number;
  total_loan: number;
  portfolio_ltv: number;
  liquidation_ltv: number;
  margin_call_ltv: number;
  interest_rate: number;
  monthly_emi: number;
  months: number;
  analyst: LoanAnalyst;
}

export interface AmortizationRow {
  month: number;
  opening_balance: number;
  payment: number;
  interest: number;
  principal: number;
  ending_balance: number;
}

export interface LoanSchedule {
  portfolio: AmortizationRow[];
  assets: Record<string, AmortizationRow[]>;
  payments: Record<string, number>;
}

export interface LoanAssetDetail {
  symbol: string;
  tier: string;
  ltv: number;
  base_rate: number;
  risk_premium: number;
  volatility_premium: number;
  interest_rate: number;
  collateral_usd: number;
  loan_usd: number;
  pct_change_30d: number | null;
}

export interface LoanCalculateResponse {
  summary: LoanSummary;
  schedule: LoanSchedule;
  assets: LoanAssetDetail[];
}

export interface LoanError {
  error: string;
}
