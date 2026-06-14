import { memo } from 'react';
import { motion } from 'framer-motion';
import { Minus, TrendingDown, TrendingUp } from 'lucide-react';
import { Card } from '@/components/ui';
import { formatCurrency, formatLastSyncedAt, formatPercent } from '@/utils';
import { ITEM_VARIANTS } from '@/constants';

interface PortfolioHeaderProps {
  totalValue: number;
  changeType: '24h' | 'since_last' | 'tracking_started';
  changePct: number | null;
  cryptoValue: number;
  stocksValue: number;
  cashValue: number;
  isLoading?: boolean;
  isRefreshing?: boolean;
  lastSyncedAt?: string | null;
}

export const PortfolioHeader = memo(function PortfolioHeader({
  totalValue,
  changeType,
  changePct,
  cryptoValue,
  stocksValue,
  cashValue,
  isLoading = false,
  isRefreshing = false,
  lastSyncedAt,
}: PortfolioHeaderProps) {
  const hasChange = changePct !== null;
  const isFlat = hasChange && Math.abs(changePct) < 0.005;
  const showTrackingStarted = changeType === 'tracking_started';
  const changeLabel = showTrackingStarted
    ? 'Tracking started - building insights'
    : changeType === 'since_last'
      ? `${formatPercent(changePct ?? 0)} since last check`
      : `${formatPercent(changePct ?? 0)} (24h)`;
  const summaryItems = [
    { label: 'Crypto', value: cryptoValue },
    { label: 'Stocks', value: stocksValue },
    { label: 'Cash', value: cashValue },
  ].map((item) => ({
    ...item,
    share: totalValue > 0 ? (item.value / totalValue) * 100 : 0,
  }));

  return (
    <motion.div variants={ITEM_VARIANTS}>
      <Card
        variant="bordered"
        className="relative overflow-hidden border-altrion-500/20 bg-gradient-to-br from-dark-card via-dark-elevated to-dark-card"
      >
        <div className="pointer-events-none absolute inset-0 bg-grid-pattern opacity-5" />

        <div className="relative flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="mb-2 flex items-center gap-2 font-display text-sm text-text-secondary">
              <span className="h-2 w-2 animate-pulse rounded-full bg-altrion-500" />
              Synced Portfolio Value
            </p>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:gap-4">
              {isLoading ? (
                <div className="h-12 w-56 animate-pulse rounded-lg bg-dark-elevated sm:h-14" />
              ) : (
                <h2 className="break-words font-display text-[2.5rem] font-bold leading-none text-text-primary sm:text-5xl lg:text-6xl">
                  {formatCurrency(totalValue)}
                </h2>
              )}
              <div className="flex flex-wrap items-center gap-2">
                <div
                  className={`flex items-center gap-1 rounded-full border px-2.5 py-1.5 text-xs font-semibold ${
                    showTrackingStarted || isFlat
                      ? 'border-white/10 bg-white/5 text-text-muted'
                      : (changePct ?? 0) > 0
                      ? 'border-green-500/30 bg-green-500/20 text-green-400'
                      : 'border-red-500/30 bg-red-500/20 text-red-400'
                  }`}
                >
                  {showTrackingStarted || isFlat ? <Minus size={14} /> : (changePct ?? 0) > 0 ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
                  {changeLabel}
                </div>
              </div>
            </div>
            <p className="mt-3 text-xs text-text-muted">
              {isRefreshing ? 'Syncing now' : formatLastSyncedAt(lastSyncedAt)}
            </p>
          </div>

          <div className="w-full lg:max-w-[27rem]">
            <div className="overflow-hidden rounded-lg border border-white/6 bg-dark-elevated/55">
              <div className="grid grid-cols-3 divide-x divide-white/6">
                {summaryItems.map((item) => (
                  <SummarySegment key={item.label} label={item.label} value={item.value} share={item.share} />
                ))}
              </div>
            </div>
          </div>
        </div>
      </Card>
    </motion.div>
  );
});

const SummarySegment = memo(function SummarySegment({
  label,
  value,
  share,
}: {
  label: string;
  value: number;
  share: number;
}) {
  return (
    <div className="px-4 py-3.5 sm:px-5">
      <p className="text-[0.68rem] uppercase tracking-[0.16em] text-text-muted">{label}</p>
      <p className="mt-2 text-base font-semibold tracking-tight text-text-primary sm:text-lg">{formatCurrency(value)}</p>
      <p className="mt-1 text-xs text-text-muted">{share.toFixed(1)}% of portfolio</p>
    </div>
  );
});
