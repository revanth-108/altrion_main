import { memo } from 'react';
import { Sparkles, AlertTriangle } from 'lucide-react';
import { Card } from '@/components/ui';
import { useAllocationInsights } from '@/hooks/queries/usePortfolio';
import type { AggregatedAsset } from '@/hooks/useAggregatedAssets';

function displayPercent(value: number): string {
  return `${value.toFixed(1)}%`;
}

interface AllocationInsightsCardProps {
  accountId?: string;
  assets?: AggregatedAsset[];
  totalValue?: number;
  eyebrow?: string;
  title?: string;
}

export const AllocationInsightsCard = memo(function AllocationInsightsCard({
  accountId,
  assets = [],
  totalValue = 0,
  eyebrow = 'Portfolio stance',
  title = 'Allocation Insights',
}: AllocationInsightsCardProps) {
  const { data, isLoading } = useAllocationInsights(accountId);
  const hasPortfolioData = totalValue > 0 && assets.some((asset) => asset.value > 0);
  const fallbackAllocation = {
    crypto: assets.filter((asset) => asset.type === 'crypto').reduce((sum, asset) => sum + asset.value, 0),
    stocks: assets.filter((asset) => asset.type === 'stock').reduce((sum, asset) => sum + asset.value, 0),
    cash: assets.filter((asset) => asset.type === 'cash').reduce((sum, asset) => sum + asset.value, 0),
  };
  const fallbackAllocationRows = [
    { label: 'Stocks', value: fallbackAllocation.stocks },
    { label: 'Crypto', value: fallbackAllocation.crypto },
    { label: 'Cash', value: fallbackAllocation.cash },
  ]
    .map((row) => ({
      ...row,
      percent: totalValue > 0 ? (row.value / totalValue) * 100 : 0,
    }))
    .sort((a, b) => b.value - a.value);
  const fallbackDominantAllocation = fallbackAllocationRows.find((row) => row.value > 0) ?? null;
  const fallbackCryptoPercent = totalValue > 0 ? (fallbackAllocation.crypto / totalValue) * 100 : 0;
  const fallbackCashPercent = totalValue > 0 ? (fallbackAllocation.cash / totalValue) * 100 : 0;
  const fallbackTopPosition = hasPortfolioData
    ? assets.reduce<AggregatedAsset | null>((top, asset) => (!top || asset.value > top.value ? asset : top), null)
    : null;
  const fallbackTopPositionPct = fallbackTopPosition && totalValue > 0 ? (fallbackTopPosition.value / totalValue) * 100 : null;

  if (isLoading && !hasPortfolioData) {
    return (
      <Card variant="bordered">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-cyan-500/15">
            <Sparkles size={18} className="text-cyan-300" />
          </div>
          <div>
            <p className="text-xs uppercase tracking-[0.16em] text-text-muted">{eyebrow}</p>
            <h3 className="font-display text-2xl font-bold text-text-primary">{title}</h3>
          </div>
        </div>
        <div className="mt-5 space-y-3 animate-pulse">
          <div className="h-5 w-32 rounded bg-dark-elevated" />
          <div className="h-4 w-full rounded bg-dark-elevated" />
          <div className="h-4 w-5/6 rounded bg-dark-elevated" />
          <div className="grid grid-cols-2 gap-3 pt-2">
            <div className="h-14 rounded-lg bg-dark-elevated" />
            <div className="h-14 rounded-lg bg-dark-elevated" />
          </div>
        </div>
      </Card>
    );
  }

  if (!hasPortfolioData) {
    return (
      <Card variant="bordered">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-cyan-500/15">
            <Sparkles size={18} className="text-cyan-300" />
          </div>
          <div>
            <p className="text-xs uppercase tracking-[0.16em] text-text-muted">{eyebrow}</p>
            <h3 className="font-display text-2xl font-bold text-text-primary">{title}</h3>
          </div>
        </div>
        <p className="mt-5 text-sm text-text-muted">Not enough data to generate insights.</p>
      </Card>
    );
  }

  const insightStatus = data?.status ?? 'ok';
  const insightWarnings = data?.warnings ?? [];
  const showWarning = insightStatus !== 'ok' || insightWarnings.length > 0;
  const dominantAllocation = data
    ? [
        { label: 'Cash', percent: data.metrics.cash_pct },
        { label: 'Stocks', percent: data.metrics.stocks_pct },
        { label: 'Crypto', percent: data.metrics.crypto_pct },
      ].sort((a, b) => b.percent - a.percent)[0]
    : fallbackDominantAllocation;
  const cryptoPercent = data?.metrics.crypto_pct ?? fallbackCryptoPercent;
  const cashPercent = data?.metrics.cash_pct ?? fallbackCashPercent;
  const topPosition = data?.breakdowns.top_positions[0] ?? null;
  const topPositionLabel = topPosition
    ? `${topPosition.name} · ${displayPercent(topPosition.weight_pct)}`
    : fallbackTopPositionPct === null
      ? 'Data unavailable'
      : `${fallbackTopPosition?.name ?? fallbackTopPosition?.symbol} · ${displayPercent(fallbackTopPositionPct)}`;
  const hasCrypto = cryptoPercent > 0;
  const stance = data?.summary.stance ?? (dominantAllocation ? `${dominantAllocation.label} led` : 'Data unavailable');
  const summaryText = dominantAllocation
    ? `${dominantAllocation.label} is the largest allocation at ${displayPercent(dominantAllocation.percent)}. ${
        hasCrypto
          ? `Crypto represents ${displayPercent(cryptoPercent)} of synced value.`
          : 'No crypto assets are detected in the synced portfolio.'
      }`
    : 'Not enough data to generate insights.';

  return (
    <Card variant="bordered">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-cyan-500/15">
          <Sparkles size={18} className="text-cyan-300" />
        </div>
        <div>
          <p className="text-xs uppercase tracking-[0.16em] text-text-muted">{eyebrow}</p>
          <h3 className="font-display text-2xl font-bold text-text-primary">{title}</h3>
        </div>
      </div>

      <div className="mt-5 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.16em] text-text-muted">Stance</p>
            <h3 className="mt-1 font-display text-xl font-semibold text-text-primary">
              {stance}
            </h3>
          </div>
          <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${
            insightStatus === 'ok'
              ? 'bg-green-500/15 text-green-300'
              : insightStatus === 'partial'
                ? 'bg-amber-500/15 text-amber-300'
                : 'bg-red-500/15 text-red-300'
          }`}>
            {insightStatus}
          </span>
        </div>

        <p className="text-sm leading-6 text-text-secondary">{summaryText}</p>

        <div className="grid grid-cols-2 gap-3">
          <InsightStat label="Largest bucket" value={dominantAllocation ? `${dominantAllocation.label} · ${displayPercent(dominantAllocation.percent)}` : 'Data unavailable'} />
          <InsightStat label="Crypto exposure" value={hasCrypto ? displayPercent(cryptoPercent) : 'No crypto assets'} />
          <InsightStat label="Top position" value={topPositionLabel} />
          <InsightStat label="Cash exposure" value={displayPercent(cashPercent)} />
        </div>

        {showWarning ? (
          <div className="rounded-lg border border-amber-500/20 bg-amber-500/8 p-3">
            <div className="flex items-start gap-2">
              <AlertTriangle size={16} className="mt-0.5 shrink-0 text-amber-300" />
              <div className="space-y-1">
                <p className="text-sm text-amber-100">Some classifications are incomplete. Percentages above use synced portfolio values.</p>
                {insightWarnings.slice(0, 2).map((warning) => (
                  <p key={warning} className="text-xs text-amber-200/85">{warning}</p>
                ))}
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </Card>
  );
});

const InsightStat = memo(function InsightStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-white/6 bg-dark-elevated/55 px-4 py-3">
      <p className="text-[0.68rem] uppercase tracking-[0.16em] text-text-muted">{label}</p>
      <p className="mt-2 break-words text-sm font-semibold text-text-primary">{value}</p>
    </div>
  );
});
