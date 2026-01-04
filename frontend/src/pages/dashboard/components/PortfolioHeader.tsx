import { memo } from 'react';
import { motion } from 'framer-motion';
import { TrendingUp, TrendingDown } from 'lucide-react';
import { Card } from '@/components/ui';
import { formatCurrency, formatPercent } from '@/utils';
import { ITEM_VARIANTS } from '@/constants';

interface PortfolioHeaderProps {
  totalValue: number;
  change24h: number;
  cryptoValue: number;
  stocksValue: number;
  cashValue: number;
}

export const PortfolioHeader = memo(function PortfolioHeader({
  totalValue,
  change24h,
  cryptoValue,
  stocksValue,
  cashValue,
}: PortfolioHeaderProps) {
  return (
    <motion.div variants={ITEM_VARIANTS}>
      <Card
        variant="bordered"
        className="relative overflow-hidden bg-gradient-to-br from-dark-card via-dark-elevated to-dark-card border-altrion-500/20"
      >
        {/* Subtle background pattern */}
        <div className="absolute inset-0 bg-grid-pattern opacity-5 pointer-events-none" />

        <div className="relative flex flex-col lg:flex-row lg:items-center lg:justify-between gap-5">
          <div>
            <p className="font-display text-text-secondary text-sm mb-2 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-altrion-500 animate-pulse" />
              Total Portfolio Value
            </p>
            <div className="flex items-baseline gap-4">
              <h2 className="text-5xl lg:text-6xl font-bold text-text-primary">
                {formatCurrency(totalValue)}
              </h2>
              <div
                className={`flex items-center gap-1 px-2.5 py-1.5 rounded-full text-xs font-semibold mb-2 ${
                  change24h >= 0
                    ? 'bg-green-500/20 text-green-400 border border-green-500/30'
                    : 'bg-red-500/20 text-red-400 border border-red-500/30'
                }`}
              >
                {change24h >= 0 ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
                {formatPercent(change24h)}
                <span className="text-xs opacity-75">24h</span>
              </div>
            </div>
          </div>

          <div className="flex gap-3">
            <AssetCard label="Crypto" value={cryptoValue} />
            <AssetCard label="Stocks" value={stocksValue} />
            <AssetCard label="Stable" value={cashValue} />
          </div>
        </div>
      </Card>
    </motion.div>
  );
});

const AssetCard = memo(function AssetCard({
  label,
  value,
}: {
  label: string;
  value: number;
}) {
  return (
    <div className="text-center px-6 py-4 bg-dark-elevated/80 backdrop-blur rounded-xl border border-dark-border hover:border-altrion-500/30 transition-all">
      <p className="text-text-muted text-xs mb-1 uppercase tracking-wider">{label}</p>
      <p className="text-text-primary font-bold text-lg">{formatCurrency(value)}</p>
    </div>
  );
});
