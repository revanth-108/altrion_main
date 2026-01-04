export type AssetType = 'crypto' | 'stock' | 'stablecoin';

export interface Asset {
  id: string;
  symbol: string;
  name: string;
  amount: number;
  value: number;
  price: number;
  change24h: number;
  platform: string;
  type: AssetType;
}

export interface Portfolio {
  totalValue: number;
  change24h: number;
  assets: Asset[];
}

export interface LoanEligibility {
  maxLoanAmount: number;
  currentLTV: number;
  maxLTV: number;
  eligibleCollateral: number;
  riskScore: number;
  riskLevel: string;
}
