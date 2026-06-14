import type { Portfolio, Asset, LoanEligibility, PortfolioHealth, HealthHistoryResponse, AllocationInsights, AssetInsight } from '@/types';
import type { ChartPeriod } from '@/utils';
import { mockLoanEligibility } from '@/mock/data';
import { api } from './api';

const simulateDelay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const toSafeNumber = (value: unknown, fallback: number = 0): number => {
  const parsed = typeof value === 'number' ? value : parseFloat(String(value ?? ''));
  return Number.isFinite(parsed) ? parsed : fallback;
};

const toOptionalNumber = (value: unknown): number | null => {
  if (value == null) return null;
  const parsed = typeof value === 'number' ? value : parseFloat(String(value));
  return Number.isFinite(parsed) ? parsed : null;
};

// Backend response types
interface BackendAsset {
  symbol: string;
  name: string;
  quantity: string;
  value_usd: string;
  price_usd: string;
  change_24h: number | null;
  asset_class: string;
  sources: Array<{
    source: string;
    account_id: string;
    account_name: string | null;
    quantity: string;
    value_usd: string;
  }>;
}

interface BackendPortfolioResponse {
  schema_version: string;
  total_value: string;
  portfolio_value?: string;
  total_assets?: string;
  total_liabilities?: string;
  liabilities_total?: string;
  net_worth?: string;
  change_type?: '24h' | 'since_last' | 'tracking_started';
  change_value?: number | null;
  change_pct?: number | null;
  change_since_last_value?: number | null;
  change_since_last_pct?: number | null;
  change_24h: number | null;
  change_24h_pct?: number | null;
  change_24h_value?: number | null;
  last_synced_at?: string | null;
  refreshed_at?: string | null;
  assets: BackendAsset[];
  categories: {
    crypto: string;
    equity: string;
    cash_equivalent: string;
  };
  warnings: Array<{
    type: string;
    message: string;
    account_id?: string;
    provider?: string;
  }>;
}

const ASSET_NAME_FALLBACKS: Record<string, string> = {
  BTC: 'Bitcoin',
  USDC: 'USD Coin',
};

const isGarbageAssetLabel = (value: string): boolean => {
  const trimmed = value.trim();
  if (!trimmed) return true;
  if (/^[0-9a-f]{16,}$/i.test(trimmed)) return true;
  if (/^0x[0-9a-f]{8,}$/i.test(trimmed)) return true;
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(trimmed)) return true;
  if (trimmed.length > 32 && !/\s/.test(trimmed)) return true;
  // Plaid security IDs: uppercase alphanumeric, 12+ chars, no vowel-pattern words
  if (/^[A-Z0-9]{12,}$/.test(trimmed)) return true;
  return false;
};

const cleanSymbol = (symbol: string): string => {
  if (isGarbageAssetLabel(symbol)) return 'UNKNOWN';
  return symbol.toUpperCase();
};

const cleanAssetName = (symbol: string, rawName: string): string => {
  const normalizedSymbol = symbol.trim().toUpperCase();
  const fallback = ASSET_NAME_FALLBACKS[normalizedSymbol];
  const trimmedName = rawName.trim();

  if (!trimmedName) {
    return fallback ?? 'Unlabeled Asset';
  }

  if (trimmedName.toUpperCase() === normalizedSymbol) {
    return fallback ?? normalizedSymbol;
  }

  if (isGarbageAssetLabel(trimmedName)) {
    return fallback ?? 'Custom Asset';
  }

  const cleaned = trimmedName
    .replace(/^0x/i, '')
    .replace(/[_:-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!cleaned || isGarbageAssetLabel(cleaned)) {
    return fallback ?? 'Custom Asset';
  }

  return cleaned
    .split(' ')
    .map((part) => (part.length <= 5 && /^[A-Z0-9]+$/.test(part) ? part : part.charAt(0).toUpperCase() + part.slice(1).toLowerCase()))
    .join(' ');
};

// Transform backend response to frontend format
const transformPortfolio = (backendData: BackendPortfolioResponse): Portfolio => {
  const assets: Asset[] = backendData.assets.map((asset, index) => ({
    id: `asset-${asset.symbol}-${asset.asset_class}-${index}`,
    symbol: cleanSymbol(asset.symbol),
    name: cleanAssetName(asset.symbol, asset.name),
    amount: toSafeNumber(asset.quantity),
    value: toSafeNumber(asset.value_usd),
    price: toSafeNumber(asset.price_usd),
    change24h: toSafeNumber(asset.change_24h),
    platform: asset.sources.map(s => s.source).join(', '),
    type: asset.asset_class === 'cash_equivalent' ? 'cash' : asset.asset_class === 'crypto' ? 'crypto' : 'stock',
    sources: asset.sources.map((source) => ({
      source: source.source,
      accountId: source.account_id,
      accountName: source.account_name,
      quantity: toSafeNumber(source.quantity),
      value: toSafeNumber(source.value_usd),
    })),
  }));

  const parsedTotal = toSafeNumber(backendData.total_value);
  const computedTotal = assets.reduce((sum, asset) => sum + asset.value, 0);
  const totalValue = Number.isFinite(parsedTotal) && parsedTotal > 0 ? parsedTotal : computedTotal;

  return {
    totalValue,
    portfolioValue: toSafeNumber(backendData.portfolio_value ?? backendData.total_value),
    totalAssets: toSafeNumber(backendData.total_assets ?? backendData.portfolio_value ?? backendData.total_value),
    totalLiabilities: toSafeNumber(backendData.total_liabilities ?? backendData.liabilities_total),
    liabilitiesTotal: toSafeNumber(backendData.liabilities_total ?? backendData.total_liabilities),
    netWorth: toSafeNumber(backendData.net_worth, totalValue),
    changeType: backendData.change_type ?? 'tracking_started',
    changeValue: toOptionalNumber(backendData.change_value),
    changePct: toOptionalNumber(backendData.change_pct),
    changeSinceLastValue: toOptionalNumber(backendData.change_since_last_value),
    changeSinceLastPct: toOptionalNumber(backendData.change_since_last_pct),
    change24h: toOptionalNumber(backendData.change_24h_pct ?? backendData.change_24h),
    lastSyncedAt: backendData.last_synced_at ?? backendData.refreshed_at ?? null,
    assets,
  };
};

export const portfolioService = {
  /**
   * Fetch user's complete portfolio
   */
  async getPortfolio(): Promise<Portfolio> {
    const { data } = await api.get<BackendPortfolioResponse>('/portfolio');
    return transformPortfolio(data);
  },

  /**
   * Fetch a specific asset by ID
   */
  async getAsset(assetId: string): Promise<Asset | null> {
    const { data } = await api.get<Asset>(`/portfolio/assets/${assetId}`);
    return data;
  },

  /**
   * Get loan eligibility based on portfolio
   */
  async getLoanEligibility(): Promise<LoanEligibility> {
    // TODO: Replace with real API call
    // const { data } = await api.get<LoanEligibility>('/portfolio/loan-eligibility');
    // return data;

    await simulateDelay(500);
    return mockLoanEligibility;
  },

  /**
   * Get historical portfolio data for charts
   */
  async getPortfolioHistory(
    period: ChartPeriod
  ): Promise<{ timestamp: number; value: number }[]> {
    try {
      const backendPeriod = period === '5Y' || period === 'ALL' ? '1Y' : period;
      const { data } = await api.get<{
        schema_version: string;
        period: string;
        data: Array<{ timestamp: string; value: number }>;
      }>('/portfolio/history', { params: { period: backendPeriod } });

      if (data.data && data.data.length > 0) {
        return data.data.map(point => ({
          timestamp: new Date(point.timestamp).getTime(),
          value: point.value,
        }));
      }
      return [];
    } catch {
      // Backend not available — let CoinGecko estimate take over
      return [];
    }
  },

  /**
   * Refresh portfolio data from connected platforms
   */
  async refreshPortfolio(): Promise<{ portfolio: Portfolio; refreshedAt: string; warnings: Array<{ type: string; message: string }> }> {
    try {
      const { data: refreshData } = await api.post<{
        schema_version: string;
        success: boolean;
        message: string;
        refreshed_at: string;
        warnings: Array<{
          type: string;
          message: string;
          account_id?: string;
          provider?: string;
        }>;
      }>('/portfolio/refresh');
      
      // After refresh, fetch updated portfolio
      const { data } = await api.get<BackendPortfolioResponse>('/portfolio');
      
      // Combine warnings from refresh and portfolio response
      const allWarnings = [
        ...refreshData.warnings.map(w => ({ type: w.type, message: w.message })),
        ...data.warnings.map(w => ({ type: w.type, message: w.message })),
      ];
      
      return {
        portfolio: {
          ...transformPortfolio(data),
          lastSyncedAt: refreshData.refreshed_at,
        },
        refreshedAt: refreshData.refreshed_at,
        warnings: allWarnings,
      };
    } catch (error) {
      console.error('Failed to refresh portfolio:', error);
      throw error;
    }
  },

  /**
   * Get portfolio health score (AFHS)
   */
  async getPortfolioHealth(): Promise<PortfolioHealth> {
    const { data } = await api.get<PortfolioHealth>('/portfolio/health');
    return data;
  },

  /**
   * Get AFHS score history
   */
  async getHealthHistory(days: number = 90): Promise<HealthHistoryResponse> {
    const { data } = await api.get<HealthHistoryResponse>('/portfolio/health/history', {
      params: { days: String(days) },
    });
    return data;
  },

  async getAllocationInsights(): Promise<AllocationInsights> {
    const { data } = await api.get<AllocationInsights>('/portfolio/allocation-insights');
    return data;
  },

  async getAccountAllocationInsights(accountId: string): Promise<AllocationInsights> {
    const { data } = await api.get<AllocationInsights>(`/portfolio/accounts/${accountId}/allocation-insights`);
    return data;
  },

  async getAssetInsight(bucket: 'crypto' | 'stocks' | 'cash', symbol: string): Promise<AssetInsight> {
    const { data } = await api.get<AssetInsight>(`/portfolio/assets/${bucket}/${symbol}/insights`);
    return data;
  },

  /**
   * Apply for a loan
   */
  async applyForLoan(_amount: number, _collateralAssetIds: string[]): Promise<{ applicationId: string }> {
    void _amount;
    void _collateralAssetIds;
    // TODO: Replace with real API call
    // const { data } = await api.post('/loans/apply', { amount, collateralAssetIds });
    // return data;

    await simulateDelay(1500);
    return { applicationId: `LOAN-${Date.now()}` };
  },
};

export default portfolioService;
