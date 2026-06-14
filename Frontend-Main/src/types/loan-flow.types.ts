import type { LoanCalculateRequest, LoanCalculateResponse } from './loan.types';

export interface SelectedAsset {
  name: string;
  symbol: string;
  amount: number;
  value: number;
}

export interface LoanReviewData {
  loanRequest: LoanCalculateRequest;
  selectedAssets: SelectedAsset[];
  totalCollateral: number;
}

export interface LoanSummaryData {
  loanResponse: LoanCalculateResponse;
  selectedAssets: SelectedAsset[];
  loanRequest: {
    months: number;
    payout_currency: string;
    payout_method: string;
  };
}

export interface LoanConfirmationData {
  loanResponse: LoanCalculateResponse;
  selectedAssets: SelectedAsset[];
  applicationId?: string;
}
