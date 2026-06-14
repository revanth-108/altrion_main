import { memo } from 'react';
import { motion } from 'framer-motion';
import { Minus, TrendingDown, TrendingUp } from 'lucide-react';
import { Card } from '@/components/ui';
import { formatCurrency, formatPercent } from '@/utils';
import { ITEM_VARIANTS } from '@/constants';
import type { AggregatedAssetDetail } from '@/types';

interface AssetHeroProps {
  asset: AggregatedAssetDetail;
}

const TYPE_LABELS: Record<string, { label: string; color: string }> = {
  crypto: { label: 'Cryptocurrency', color: 'bg-green-500/20 text-green-400' },
  stock: { label: 'Stock', color: 'bg-blue-500/20 text-blue-400' },
  cash: { label: 'Cash', color: 'bg-amber-500/20 text-amber-400' },
};

export const AssetHero = memo(function AssetHero({ asset }: AssetHeroProps) {
  const typeInfo = TYPE_LABELS[asset.type] || TYPE_LABELS.crypto;
  const displayPrice = asset.price;
  const displayHoldingsValue = asset.totalValue;
  const change24h = asset.change24h;
  const isFlat = Math.abs(change24h) < 0.005;
  const isPositive = change24h > 0;

  return (
    <motion.div variants={ITEM_VARIANTS}>
      <Card
        variant="bordered"
        className="relative overflow-hidden bg-gradient-to-br from-dark-card via-dark-elevated to-dark-card border-altrion-500/20"
      >
        <div className="absolute inset-0 bg-grid-pattern opacity-5 pointer-events-none" />

        <div className="relative flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
          <div className="flex items-center gap-3 sm:gap-5">
            <div className="relative">
              <div className="w-14 h-14 sm:w-20 sm:h-20 rounded-full bg-gradient-to-br from-dark-elevated to-dark-bg flex items-center justify-center border border-dark-border shadow-lg">
                <span className="font-bold text-lg sm:text-2xl text-text-muted">
                  {asset.symbol.slice(0, 2)}
                </span>
              </div>
              <div className="absolute inset-0 rounded-full bg-altrion-500/10 blur-xl -z-10" />
            </div>

            <div>
              <div className="flex items-baseline gap-3 mb-1">
                <h1 className="font-display text-2xl sm:text-3xl font-bold text-text-primary">
                  {asset.name}
                </h1>
                <span className="text-text-muted text-lg">{asset.symbol}</span>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                <span className={`px-3 py-1 rounded-full text-xs font-semibold ${typeInfo.color}`}>
                  {typeInfo.label}
                </span>
                <span className="px-3 py-1 rounded-full text-xs font-medium bg-dark-elevated text-text-secondary border border-dark-border">
                  {asset.holdings.length} Platform{asset.holdings.length !== 1 ? 's' : ''}
                </span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 sm:flex sm:items-center sm:gap-8">
            <div className="text-left sm:text-right">
              <p className="text-text-muted text-xs uppercase tracking-wider mb-1">Your Holdings</p>
              <p className="text-xl sm:text-3xl font-bold text-altrion-400">
                {formatCurrency(displayHoldingsValue)}
              </p>
              <p className="text-text-secondary text-xs sm:text-sm">
                {asset.totalAmount.toLocaleString()} {asset.symbol}
              </p>
            </div>

            <div className="hidden sm:block w-px h-12 bg-green-500/50" />

            <div className="text-left sm:text-right">
              <p className="text-text-muted text-xs uppercase tracking-wider mb-1">Current Price</p>
              <p className="text-xl sm:text-2xl font-bold text-text-primary">
                {formatCurrency(displayPrice)}
              </p>
              <div
                className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-semibold mt-1 ${
                  isFlat
                    ? 'bg-white/5 text-text-muted'
                    : isPositive
                    ? 'bg-green-500/15 text-green-400'
                    : 'bg-red-500/15 text-red-400'
                }`}
              >
                {isFlat ? <Minus size={12} /> : isPositive ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                {formatPercent(change24h)}
              </div>
            </div>
          </div>
        </div>
      </Card>
    </motion.div>
  );
});
