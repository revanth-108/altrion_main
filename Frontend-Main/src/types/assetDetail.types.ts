export interface PlatformHolding {
  platform: string;
  amount: number;
  value: number;
}

export interface AssetMarketStats {
  marketCap: number | null;
  volume24h: number | null;
  circulatingSupply: number | null;
  maxSupply: number | null;
  allTimeHigh: number | null;
  allTimeHighDate: string | null;
  allTimeLow: number | null;
  allTimeLowDate: string | null;
  high52w: number | null;
  low52w: number | null;
  priceChange1h: number | null;
  priceChange24h: number | null;
  priceChange7d: number | null;
  priceChange30d: number | null;
}

export interface AggregatedAssetDetail {
  symbol: string;
  name: string;
  type: 'crypto' | 'stock' | 'cash';
  price: number;
  change24h: number;
  totalAmount: number;
  totalValue: number;
  holdings: PlatformHolding[];
  marketStats: AssetMarketStats;
}
