export type AssetType = 'crypto' | 'stock' | 'cash';

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
  sources?: Array<{
    source: string;
    accountId: string;
    accountName: string | null;
    quantity: number;
    value: number;
  }>;
}

export interface Portfolio {
  totalValue: number;
  portfolioValue?: number;
  totalAssets?: number;
  totalLiabilities?: number;
  liabilitiesTotal?: number;
  netWorth?: number;
  change24h: number | null;
  changeType: '24h' | 'since_last' | 'tracking_started';
  changeValue: number | null;
  changePct: number | null;
  changeSinceLastValue?: number | null;
  changeSinceLastPct?: number | null;
  lastSyncedAt?: string | null;
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

export interface AllocationBreakdownItem {
  label: string;
  weight_pct: number;
  value_usd: number;
}

export interface TopPositionItem {
  asset: string;
  name: string;
  bucket: 'crypto' | 'stocks' | 'cash';
  weight_pct: number;
  value_usd: number;
}

export interface AllocationInsights {
  summary: {
    stance: string;
    confidence: number;
    text: string;
    caution?: string | null;
    used_llm: boolean;
  };
  metrics: {
    cash_pct: number;
    stocks_pct: number;
    crypto_pct: number;
    stablecoin_pct: number;
    top_position_pct: number;
    top_sector: string;
    top_crypto_category: string;
    metadata_coverage_pct: number;
    unknown_allocations_pct: number;
  };
  breakdowns: {
    top_positions: TopPositionItem[];
    by_sector: AllocationBreakdownItem[];
    by_crypto_category: AllocationBreakdownItem[];
  };
  status: 'ok' | 'partial' | 'degraded';
  warnings: string[];
}

export interface AssetInsightAccountBreakdown {
  account_id: string;
  account_name?: string | null;
  provider: string;
  value_usd: number;
  quantity: number;
  weight_pct: number;
}

export interface AssetInsight {
  summary: AllocationInsights['summary'];
  asset: {
    symbol: string;
    bucket: 'crypto' | 'stocks' | 'cash';
    display_name: string;
    portfolio_weight_pct: number;
    value_usd: number;
    quantity: number;
    sector?: string | null;
    category?: string | null;
    metadata_status: string;
  };
  accounts: AssetInsightAccountBreakdown[];
  status: 'ok' | 'partial' | 'degraded';
  warnings: string[];
}
