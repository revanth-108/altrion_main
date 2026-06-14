import { useQuery } from '@tanstack/react-query';
import { api } from '@/services/api';
import { portfolioService } from '@/services/portfolio.service';
import type { ChartPeriod, ChartDataPoint } from '@/utils';
import type { AggregatedAsset } from '@/hooks/useAggregatedAssets';

// How often to refetch from backend (shorter = more "live")
const REFETCH_MS: Record<ChartPeriod, number> = {
  '1H':  30_000,      // 30s — near real-time
  '24H': 60_000,      // 1 min
  '7D':  5 * 60_000,  // 5 min
  '1M':  15 * 60_000, // 15 min
  '1Y':  60 * 60_000, // 1 hour
  '5Y':  60 * 60_000, // 1 hour
  'ALL': 60 * 60_000, // 1 hour
};

// staleTime slightly less than refetchInterval so React Query re-fetches
const STALE_MS: Record<ChartPeriod, number> = {
  '1H':  25_000,
  '24H': 55_000,
  '7D':  4 * 60_000,
  '1M':  14 * 60_000,
  '1Y':  59 * 60_000,
  '5Y':  59 * 60_000,
  'ALL': 59 * 60_000,
};

export function formatLabel(dateStr: string, period: ChartPeriod): string {
  // Handle: ISO with T ("2024-01-15T09:30:00Z"), FMP space ("2024-01-15 09:30:00"), plain date ("2024-01-15")
  let normalized: string;
  if (dateStr.includes('T')) {
    normalized = dateStr; // already ISO
  } else if (dateStr.includes(' ')) {
    normalized = dateStr.replace(' ', 'T') + 'Z'; // FMP intraday
  } else {
    normalized = dateStr + 'T00:00:00Z'; // FMP daily
  }
  const d = new Date(normalized);
  if (isNaN(d.getTime())) return '';

  switch (period) {
    case '1H':
      return `${d.getUTCHours()}:${d.getUTCMinutes().toString().padStart(2, '0')}`;
    case '24H':
      return `${d.getUTCHours()}:${d.getUTCMinutes().toString().padStart(2, '0')}`;
    case '7D':
      return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getUTCDay()];
    case '1M':
      return `${['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][d.getUTCMonth()]} ${d.getUTCDate()}`;
    case '1Y':
      return ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][d.getUTCMonth()];
    case '5Y':
    case 'ALL': {
      const yr = d.getUTCFullYear();
      const mo = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][d.getUTCMonth()];
      return `${mo} '${String(yr).slice(2)}`;
    }
  }
}

/** Fetch historical prices for a single asset from the FMP-backed backend. */
export function useAssetMarketChart(symbol: string | null | undefined, period: ChartPeriod) {
  return useQuery<ChartDataPoint[]>({
    queryKey: ['asset-chart', symbol, period],
    queryFn: async () => {
      if (!symbol) return [];
      const { data } = await api.get<{
        prices: Array<{ date: string; close: number }>;
      }>(`/analysis/asset/${symbol}/history`, { params: { period } });
      return (data.prices ?? []).map(p => ({
        value: p.close,
        label: formatLabel(p.date, period),
      }));
    },
    enabled: !!symbol,
    staleTime: STALE_MS[period],
    gcTime: 2 * 60_000,
    refetchInterval: REFETCH_MS[period],
    refetchOnWindowFocus: period === '1H' || period === '24H',
    retry: 1,
  });
}

/** No live market data from CoinGecko — stub kept for compatibility. */
export function useCoinGeckoMarketData(_symbol: string | null | undefined) {
  return { data: null, isLoading: false };
}

/** Portfolio chart using backend history with automatic live polling. */
export function usePortfolioMarketChart(
  assets: AggregatedAsset[],
  period: ChartPeriod,
  totalValue: number,
) {
  return useQuery<ChartDataPoint[]>({
    queryKey: ['portfolio-chart-v5', period],
    queryFn: async () => {
      const backendHistory = await portfolioService.getPortfolioHistory(period);
      if (backendHistory.length > 1) {
        return backendHistory.map(point => ({
          value: point.value,
          label: formatLabel(new Date(point.timestamp).toISOString(), period),
        }));
      }
      return [];
    },
    enabled: assets.length > 0 && totalValue > 0,
    staleTime: STALE_MS[period],
    gcTime: 2 * 60_000,
    refetchInterval: REFETCH_MS[period],
    refetchOnWindowFocus: period === '1H' || period === '24H',
    retry: 1,
  });
}
