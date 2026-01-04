import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import type { Portfolio, Asset, AssetType } from '@/types';

interface PortfolioState {
  portfolio: Portfolio | null;
  selectedAssetType: AssetType | 'all';
  chartPeriod: '1H' | '24H' | '7D' | '1M' | '1Y';
  isLoading: boolean;
  error: string | null;
}

interface PortfolioActions {
  setPortfolio: (portfolio: Portfolio | null) => void;
  setSelectedAssetType: (type: AssetType | 'all') => void;
  setChartPeriod: (period: PortfolioState['chartPeriod']) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  updateAsset: (assetId: string, updates: Partial<Asset>) => void;
  reset: () => void;
}

type PortfolioStore = PortfolioState & PortfolioActions;

const initialState: PortfolioState = {
  portfolio: null,
  selectedAssetType: 'all',
  chartPeriod: '24H',
  isLoading: false,
  error: null,
};

export const usePortfolioStore = create<PortfolioStore>()(
  immer((set) => ({
    ...initialState,

    setPortfolio: (portfolio) =>
      set((state) => {
        state.portfolio = portfolio;
        state.error = null;
      }),

    setSelectedAssetType: (type) =>
      set((state) => {
        state.selectedAssetType = type;
      }),

    setChartPeriod: (period) =>
      set((state) => {
        state.chartPeriod = period;
      }),

    setLoading: (loading) =>
      set((state) => {
        state.isLoading = loading;
      }),

    setError: (error) =>
      set((state) => {
        state.error = error;
        state.isLoading = false;
      }),

    updateAsset: (assetId, updates) =>
      set((state) => {
        if (!state.portfolio) return;
        const assetIndex = state.portfolio.assets.findIndex(
          (a) => a.id === assetId
        );
        if (assetIndex !== -1) {
          Object.assign(state.portfolio.assets[assetIndex], updates);
        }
      }),

    reset: () => set(initialState),
  }))
);

// Derived selectors
export const selectFilteredAssets = (state: PortfolioStore): Asset[] => {
  if (!state.portfolio) return [];
  if (state.selectedAssetType === 'all') return state.portfolio.assets;
  
  const typeMap: Record<AssetType | 'all', AssetType | null> = {
    all: null,
    crypto: 'crypto',
    stock: 'stock',
    stablecoin: 'stablecoin',
  };
  
  return state.portfolio.assets.filter(
    (asset) => asset.type === typeMap[state.selectedAssetType]
  );
};

export const selectAssetAllocation = (state: PortfolioStore) => {
  if (!state.portfolio) return { crypto: 0, stocks: 0, cash: 0 };
  
  const { assets, totalValue } = state.portfolio;
  
  const cryptoValue = assets
    .filter((a) => a.type === 'crypto')
    .reduce((sum, a) => sum + a.value, 0);
  const stocksValue = assets
    .filter((a) => a.type === 'stock')
    .reduce((sum, a) => sum + a.value, 0);
  const cashValue = assets
    .filter((a) => a.type === 'stablecoin')
    .reduce((sum, a) => sum + a.value, 0);

  return {
    crypto: (cryptoValue / totalValue) * 100,
    stocks: (stocksValue / totalValue) * 100,
    cash: (cashValue / totalValue) * 100,
    cryptoValue,
    stocksValue,
    cashValue,
  };
};
