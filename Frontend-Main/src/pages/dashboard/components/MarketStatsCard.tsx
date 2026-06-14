import { memo } from 'react';
import { motion } from 'framer-motion';
import { BarChart3, TrendingUp, TrendingDown } from 'lucide-react';
import { Card } from '@/components/ui';
import { formatCurrency } from '@/utils';
import { ITEM_VARIANTS } from '@/constants';
import type { AssetMarketStats } from '@/types';

interface MarketStatsCardProps {
  marketStats: AssetMarketStats;
  symbol: string;
}

const NA = '—';

const formatLargeNumber = (num: number | null | undefined): string => {
  if (num == null) return NA;
  if (num >= 1e12) return `$${(num / 1e12).toFixed(2)}T`;
  if (num >= 1e9) return `$${(num / 1e9).toFixed(2)}B`;
  if (num >= 1e6) return `$${(num / 1e6).toFixed(2)}M`;
  return formatCurrency(num);
};

const formatSupply = (num: number | null | undefined): string => {
  if (num == null) return NA;
  if (num >= 1e9) return `${(num / 1e9).toFixed(2)}B`;
  if (num >= 1e6) return `${(num / 1e6).toFixed(2)}M`;
  if (num >= 1e3) return `${(num / 1e3).toFixed(2)}K`;
  return num.toLocaleString();
};

const formatPrice = (num: number | null | undefined): string =>
  num == null ? NA : formatCurrency(num);

const PriceChangeCell = ({ value, label }: { value: number | null; label: string }) => {
  if (value == null) {
    return (
      <div className="text-center">
        <p className="text-xs text-text-muted mb-1">{label}</p>
        <span className="text-sm text-text-muted">{NA}</span>
      </div>
    );
  }
  const isPositive = value >= 0;
  return (
    <div className="text-center">
      <p className="text-xs text-text-muted mb-1">{label}</p>
      <span
        className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-sm font-semibold ${
          isPositive ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'
        }`}
      >
        {isPositive ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
        {isPositive ? '+' : ''}{value.toFixed(2)}%
      </span>
    </div>
  );
};

export const MarketStatsCard = memo(function MarketStatsCard({
  marketStats,
  symbol: _symbol,
}: MarketStatsCardProps) {
  const hasFullData = marketStats.marketCap != null;

  return (
    <motion.div variants={ITEM_VARIANTS}>
      <Card variant="bordered">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-accent-cyan/20 flex items-center justify-center">
            <BarChart3 size={20} className="text-accent-cyan" />
          </div>
          <h3 className="font-display text-xl font-semibold text-text-primary">Market Statistics</h3>
        </div>

        <div className="space-y-3">
          {hasFullData && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 bg-dark-elevated rounded-lg">
                  <p className="text-xs text-text-muted mb-1">Market Cap</p>
                  <p className="font-semibold text-text-primary">{formatLargeNumber(marketStats.marketCap)}</p>
                </div>
                <div className="p-3 bg-dark-elevated rounded-lg">
                  <p className="text-xs text-text-muted mb-1">24h Volume</p>
                  <p className="font-semibold text-text-primary">{formatLargeNumber(marketStats.volume24h)}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 bg-dark-elevated rounded-lg">
                  <p className="text-xs text-text-muted mb-1">Circulating Supply</p>
                  <p className="font-semibold text-text-primary">{formatSupply(marketStats.circulatingSupply)}</p>
                </div>
                <div className="p-3 bg-dark-elevated rounded-lg">
                  <p className="text-xs text-text-muted mb-1">Max Supply</p>
                  <p className="font-semibold text-text-primary">
                    {marketStats.maxSupply ? formatSupply(marketStats.maxSupply) : '∞'}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 bg-dark-elevated rounded-lg border-l-2 border-green-500">
                  <p className="text-xs text-text-muted mb-1">All-Time High</p>
                  <p className="font-semibold text-green-400">{formatPrice(marketStats.allTimeHigh)}</p>
                  <p className="text-xs text-text-muted mt-0.5">{marketStats.allTimeHighDate ?? ''}</p>
                </div>
                <div className="p-3 bg-dark-elevated rounded-lg border-l-2 border-red-500">
                  <p className="text-xs text-text-muted mb-1">All-Time Low</p>
                  <p className="font-semibold text-red-400">{formatPrice(marketStats.allTimeLow)}</p>
                  <p className="text-xs text-text-muted mt-0.5">{marketStats.allTimeLowDate ?? ''}</p>
                </div>
              </div>

              {(marketStats.low52w != null || marketStats.high52w != null) && (
                <div className="p-3 bg-dark-elevated rounded-lg">
                  <p className="text-xs text-text-muted mb-2">52 Week Range</p>
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-red-400">{formatPrice(marketStats.low52w)}</span>
                    <div className="flex-1 h-2 bg-dark-border rounded-full overflow-hidden">
                      <div className="h-full bg-gradient-to-r from-red-500 via-yellow-500 to-green-500 rounded-full" style={{ width: '100%' }} />
                    </div>
                    <span className="text-sm text-green-400">{formatPrice(marketStats.high52w)}</span>
                  </div>
                </div>
              )}
            </>
          )}

          {!hasFullData && (
            <div className="p-4 bg-dark-elevated rounded-lg text-center">
              <p className="text-xs text-text-muted">Detailed market data not available for this asset</p>
            </div>
          )}

          <div className="pt-3 border-t border-dark-border">
            <p className="text-xs text-text-muted mb-3 text-center uppercase tracking-wider">Price Changes</p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <PriceChangeCell value={marketStats.priceChange1h} label="1h" />
              <PriceChangeCell value={marketStats.priceChange24h} label="24h" />
              <PriceChangeCell value={marketStats.priceChange7d} label="7d" />
              <PriceChangeCell value={marketStats.priceChange30d} label="30d" />
            </div>
          </div>
        </div>
      </Card>
    </motion.div>
  );
});
