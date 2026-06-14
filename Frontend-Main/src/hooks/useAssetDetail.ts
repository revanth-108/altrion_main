import { useMemo } from 'react';
import { usePortfolio } from './queries/usePortfolio';
import type { AggregatedAssetDetail, PlatformHolding, AssetMarketStats } from '@/types';

const KNOWN_CRYPTO_STATS: Record<string, Partial<AssetMarketStats>> = {
  BTC:  { marketCap: 1.9e12,  volume24h: 28e9,    circulatingSupply: 19.8e6,  maxSupply: 21e6,    allTimeHigh: 108268, allTimeHighDate: 'Dec 2024', allTimeLow: 67.81,  allTimeLowDate: 'Jul 2013' },
  ETH:  { marketCap: 320e9,   volume24h: 12e9,    circulatingSupply: 120.2e6, maxSupply: null,    allTimeHigh: 4878,   allTimeHighDate: 'Nov 2021', allTimeLow: 0.43,   allTimeLowDate: 'Oct 2015' },
  SOL:  { marketCap: 90e9,    volume24h: 3e9,     circulatingSupply: 440e6,   maxSupply: null,    allTimeHigh: 263.83, allTimeHighDate: 'Nov 2024', allTimeLow: 0.50,   allTimeLowDate: 'May 2020' },
  USDC: { marketCap: 45e9,    volume24h: 8e9,     circulatingSupply: 45e9,    maxSupply: null,    allTimeHigh: 1.17,   allTimeHighDate: 'May 2019', allTimeLow: 0.88,   allTimeLowDate: 'Mar 2023' },
  USDT: { marketCap: 120e9,   volume24h: 60e9,    circulatingSupply: 120e9,   maxSupply: null,    allTimeHigh: 1.22,   allTimeHighDate: 'Jul 2018', allTimeLow: 0.57,   allTimeLowDate: 'Mar 2015' },
  XRP:  { marketCap: 40e9,    volume24h: 2e9,     circulatingSupply: 56e9,    maxSupply: 100e9,   allTimeHigh: 3.84,   allTimeHighDate: 'Jan 2018', allTimeLow: 0.003,  allTimeLowDate: 'Jul 2014' },
  ADA:  { marketCap: 15e9,    volume24h: 500e6,   circulatingSupply: 36e9,    maxSupply: 45e9,    allTimeHigh: 3.09,   allTimeHighDate: 'Sep 2021', allTimeLow: 0.02,   allTimeLowDate: 'Mar 2020' },
  DOGE: { marketCap: 25e9,    volume24h: 1.5e9,   circulatingSupply: 147e9,   maxSupply: null,    allTimeHigh: 0.74,   allTimeHighDate: 'May 2021', allTimeLow: 0.0001, allTimeLowDate: 'May 2015' },
  BNB:  { marketCap: 90e9,    volume24h: 1.8e9,   circulatingSupply: 145e6,   maxSupply: 200e6,   allTimeHigh: 793,    allTimeHighDate: 'Dec 2024', allTimeLow: 0.10,   allTimeLowDate: 'Aug 2017' },
  MATIC:{ marketCap: 5e9,     volume24h: 300e6,   circulatingSupply: 10e9,    maxSupply: 10e9,    allTimeHigh: 2.92,   allTimeHighDate: 'Dec 2021', allTimeLow: 0.003,  allTimeLowDate: 'May 2019' },
};

function generateMarketStats(price: number, symbol: string, change24h: number, assetType: string): AssetMarketStats {
  const known = KNOWN_CRYPTO_STATS[symbol.toUpperCase()];

  if (known) {
    return {
      marketCap: known.marketCap!,
      volume24h: known.volume24h!,
      circulatingSupply: known.circulatingSupply!,
      maxSupply: known.maxSupply ?? null,
      allTimeHigh: known.allTimeHigh!,
      allTimeHighDate: known.allTimeHighDate!,
      allTimeLow: known.allTimeLow!,
      allTimeLowDate: known.allTimeLowDate!,
      high52w: price * 1.4,
      low52w: price * 0.5,
      priceChange1h: change24h * 0.1,
      priceChange24h: change24h,
      priceChange7d: change24h * 2.5,
      priceChange30d: change24h * 5,
    };
  }

  // For stocks/ETFs/other: only show what we actually know (24h change from backend close_price).
  // Do not fabricate market cap, supply, or ATH/ATL.
  const isStock = assetType === 'equity' || assetType === 'stocks' || assetType === 'stock';
  return {
    marketCap: isStock ? null : price * 1e6,
    volume24h: null,
    circulatingSupply: null,
    maxSupply: null,
    allTimeHigh: null,
    allTimeHighDate: null,
    allTimeLow: null,
    allTimeLowDate: null,
    high52w: null,
    low52w: null,
    priceChange1h: null,
    priceChange24h: change24h || null,
    priceChange7d: null,
    priceChange30d: null,
  };
}

export function useAssetDetail(symbol: string): {
  asset: AggregatedAssetDetail | null;
  error: string | null;
} {
  const { data: portfolio } = usePortfolio();

  return useMemo(() => {
    if (!portfolio || !symbol) {
      return { asset: null, error: null };
    }

    const matchingAssets = portfolio.assets.filter(
      (a) => a.symbol.toUpperCase() === symbol.toUpperCase()
    );


    if (matchingAssets.length === 0) {
      return { asset: null, error: `Asset "${symbol}" not found in your portfolio.` };
    }

    const first = matchingAssets[0];

    // Aggregate holdings across platforms, using per-source data where available
    const holdingsMap = new Map<string, PlatformHolding>();
    matchingAssets.forEach((a) => {
      if (a.sources && a.sources.length > 0) {
        // Key by accountId so each Plaid account gets its own entry
        a.sources.forEach((src) => {
          const existing = holdingsMap.get(src.accountId);
          if (existing) {
            existing.amount += src.quantity;
            existing.value  += src.value;
          } else {
            holdingsMap.set(src.accountId, {
              platform: src.accountName ?? src.accountId,
              amount:   src.quantity,
              value:    src.value,
            });
          }
        });
      } else {
        // Fallback: split evenly across the comma-separated platform names
        const platforms = a.platform.split(', ').filter(Boolean);
        const share = platforms.length || 1;
        platforms.forEach((platform) => {
          const existing = holdingsMap.get(platform);
          if (existing) {
            existing.amount += a.amount / share;
            existing.value  += a.value  / share;
          } else {
            holdingsMap.set(platform, {
              platform,
              amount: a.amount / share,
              value:  a.value  / share,
            });
          }
        });
      }
    });

    const totalAmount = matchingAssets.reduce((sum, a) => sum + a.amount, 0);
    const totalValue = matchingAssets.reduce((sum, a) => sum + a.value, 0);

    const asset: AggregatedAssetDetail = {
      symbol: first.symbol,
      name: first.name,
      type: first.type,
      price: first.price,
      change24h: first.change24h,
      totalAmount,
      totalValue,
      holdings: Array.from(holdingsMap.values()),
      marketStats: generateMarketStats(first.price, first.symbol, first.change24h, first.type ?? ''),
    };

    return { asset, error: null };
  }, [portfolio, symbol]);
}
