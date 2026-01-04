import type { Portfolio, Asset, LoanEligibility } from '@/types';
import { mockPortfolio, mockLoanEligibility } from '@/mock/data';

// Simulated delay for demo purposes
const simulateDelay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export const portfolioService = {
  /**
   * Fetch user's complete portfolio
   */
  async getPortfolio(): Promise<Portfolio> {
    // TODO: Replace with real API call
    // const { data } = await api.get<Portfolio>('/portfolio');
    // return data;

    await simulateDelay(800);
    return mockPortfolio;
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
  async refreshPortfolio(): Promise<Portfolio> {
    // TODO: Replace with real API call
    // const { data } = await api.post<Portfolio>('/portfolio/refresh');
    // return data;

    await simulateDelay(2000);
    return mockPortfolio;
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
