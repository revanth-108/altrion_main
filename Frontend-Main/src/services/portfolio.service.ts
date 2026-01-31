import type { Portfolio, Asset, LoanEligibility } from '@/types';
import { mockPortfolio, mockLoanEligibility } from '@/mock/data';
import { api } from './api';

const useMockPortfolio = import.meta.env.VITE_USE_MOCK_PORTFOLIO === 'true';

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
  change_24h: number | null;
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

// Transform backend response to frontend format
const transformPortfolio = (backendData: BackendPortfolioResponse): Portfolio => {
  const assets: Asset[] = backendData.assets.map((asset, index) => ({
    id: `asset-${asset.symbol}-${index}`,
    symbol: asset.symbol,
    name: asset.name,
    amount: parseFloat(asset.quantity),
    value: parseFloat(asset.value_usd),
    price: parseFloat(asset.price_usd),
    change24h: asset.change_24h || 0,
    platform: asset.sources.map(s => s.source).join(', '),
    type: asset.asset_class === 'crypto' ? 'crypto' : asset.asset_class === 'equity' ? 'stock' : 'stablecoin',
  }));

  const parsedTotal = parseFloat(backendData.total_value);
  const computedTotal = assets.reduce((sum, asset) => sum + asset.value, 0);
  const totalValue = Number.isFinite(parsedTotal) && parsedTotal > 0 ? parsedTotal : computedTotal;

  return {
    totalValue,
    change24h: backendData.change_24h || 0,
    assets,
  };
};

export const portfolioService = {
  /**
   * Fetch user's complete portfolio
   */
  async getPortfolio(): Promise<Portfolio> {
    try {
      const { data } = await api.get<BackendPortfolioResponse>('/portfolio');
      return transformPortfolio(data);
    } catch (error) {
      console.error('Failed to fetch portfolio:', error);
      if (useMockPortfolio) {
        return mockPortfolio;
      }
      throw error;
    }
  },

  /**
   * Fetch a specific asset by ID
   */
  async getAsset(assetId: string): Promise<Asset | null> {
    // TODO: Replace with real API call
    // const { data } = await api.get<Asset>(`/portfolio/assets/${assetId}`);
    // return data;

    await simulateDelay(300);
    return mockPortfolio.assets.find((a) => a.id === assetId) || null;
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
    period: '1H' | '24H' | '7D' | '1M' | '1Y'
  ): Promise<{ timestamp: number; value: number }[]> {
    // TODO: Replace with real API call
    // const { data } = await api.get<HistoryData[]>('/portfolio/history', {
    //   params: { period },
    // });
    // return data;

    await simulateDelay(400);
    
    // Generate mock historical data
    const now = Date.now();
    const periods: Record<string, { count: number; interval: number }> = {
      '1H': { count: 12, interval: 5 * 60 * 1000 },
      '24H': { count: 24, interval: 60 * 60 * 1000 },
      '7D': { count: 7, interval: 24 * 60 * 60 * 1000 },
      '1M': { count: 30, interval: 24 * 60 * 60 * 1000 },
      '1Y': { count: 12, interval: 30 * 24 * 60 * 60 * 1000 },
    };

    const { count, interval } = periods[period];
    const baseValue = mockPortfolio.totalValue;

    return Array.from({ length: count }, (_, i) => ({
      timestamp: now - (count - 1 - i) * interval,
      value: baseValue * (0.95 + Math.random() * 0.1),
    }));
  },

  /**
   * Refresh portfolio data from connected platforms
   */
  async refreshPortfolio(): Promise<{ portfolio: Portfolio; warnings: Array<{ type: string; message: string }> }> {
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
        portfolio: transformPortfolio(data),
        warnings: allWarnings,
      };
    } catch (error) {
      console.error('Failed to refresh portfolio:', error);
      throw error;
    }
  },

  /**
   * Apply for a loan
   */
  async applyForLoan(_amount: number, _collateralAssetIds: string[]): Promise<{ applicationId: string }> {
    // TODO: Replace with real API call
    // const { data } = await api.post('/loans/apply', { amount, collateralAssetIds });
    // return data;

    await simulateDelay(1500);
    return { applicationId: `LOAN-${Date.now()}` };
  },
};

export default portfolioService;
