import { memo } from 'react';
import { AlertTriangle, Sparkles } from 'lucide-react';
import { Card } from '@/components/ui';
import { useAssetInsight } from '@/hooks/queries/usePortfolio';
import { formatCurrency } from '@/utils';

interface AssetInsightCardProps {
  bucket: 'crypto' | 'stocks' | 'cash';
  symbol: string;
}

function displayPercent(value: number): string {
  return `${value.toFixed(1)}%`;
}

const providerDisplayName = (provider: string) =>
  provider === 'plaid' ? 'Bank integration' : provider;

export const AssetInsightCard = memo(function AssetInsightCard({ bucket, symbol }: AssetInsightCardProps) {
  const { data, isLoading } = useAssetInsight(bucket, symbol);

  if (isLoading) {
    return (
      <Card variant="bordered">
        <div className="flex items-center gap-3">
          <IconBadge />
          <div>
            <p className="text-xs uppercase tracking-[0.16em] text-text-muted">Holding stance</p>
            <h3 className="font-display text-2xl font-bold text-text-primary">Holding Analysis</h3>
          </div>
        </div>
        <div className="mt-5 space-y-3 animate-pulse">
          <div className="h-5 w-28 rounded bg-dark-elevated" />
          <div className="h-4 w-full rounded bg-dark-elevated" />
          <div className="h-4 w-4/5 rounded bg-dark-elevated" />
          <div className="grid grid-cols-2 gap-3 pt-2">
            <div className="h-14 rounded-lg bg-dark-elevated" />
            <div className="h-14 rounded-lg bg-dark-elevated" />
          </div>
        </div>
      </Card>
    );
  }

  if (!data) {
    return (
      <Card variant="bordered">
        <div className="flex items-center gap-3">
          <IconBadge />
          <div>
            <p className="text-xs uppercase tracking-[0.16em] text-text-muted">Holding stance</p>
            <h3 className="font-display text-2xl font-bold text-text-primary">Holding Analysis</h3>
          </div>
        </div>
        <p className="mt-5 text-sm text-text-muted">Holding analysis is currently unavailable.</p>
      </Card>
    );
  }

  const showWarning = data.status !== 'ok' || data.warnings.length > 0;
  const category = data.asset.category || data.asset.sector || 'Uncategorized';

  return (
    <Card variant="bordered">
      <div className="flex items-center gap-3">
        <IconBadge />
        <div>
          <p className="text-xs uppercase tracking-[0.16em] text-text-muted">Holding stance</p>
          <h3 className="font-display text-2xl font-bold text-text-primary">Holding Analysis</h3>
        </div>
      </div>

      <div className="mt-5 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.16em] text-text-muted">Stance</p>
            <h3 className="mt-1 font-display text-xl font-semibold text-text-primary">{data.summary.stance}</h3>
          </div>
          <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${
            data.status === 'ok'
              ? 'bg-green-500/15 text-green-300'
              : data.status === 'partial'
                ? 'bg-amber-500/15 text-amber-300'
                : 'bg-red-500/15 text-red-300'
          }`}>
            {data.status}
          </span>
        </div>

        <p className="text-sm leading-6 text-text-secondary">{data.summary.text}</p>

        <div className="grid grid-cols-2 gap-3">
          <InsightStat label="Portfolio weight" value={displayPercent(data.asset.portfolio_weight_pct)} />
          <InsightStat label="Value" value={formatCurrency(data.asset.value_usd)} />
          <InsightStat label="Category" value={category} />
          <InsightStat label="Accounts" value={String(data.accounts.length)} />
        </div>

        {data.accounts.length > 0 ? (
          <div className="rounded-lg border border-white/6 bg-dark-elevated/45 p-4">
            <p className="text-[0.68rem] uppercase tracking-[0.16em] text-text-muted">Top account exposure</p>
            <div className="mt-3 space-y-2">
              {data.accounts.slice(0, 3).map((account) => (
                <div key={account.account_id} className="flex items-center justify-between gap-3 text-sm">
                  <span className="min-w-0 truncate text-text-secondary">
                    {account.account_name || providerDisplayName(account.provider)}
                  </span>
                  <span className="shrink-0 font-medium text-text-primary">
                    {displayPercent(account.weight_pct)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {showWarning ? (
          <div className="rounded-lg border border-amber-500/20 bg-amber-500/8 p-3">
            <div className="flex items-start gap-2">
              <AlertTriangle size={16} className="mt-0.5 shrink-0 text-amber-300" />
              <div className="space-y-1">
                {data.summary.caution ? (
                  <p className="text-sm text-amber-100">{data.summary.caution}</p>
                ) : null}
                {data.warnings.slice(0, 2).map((warning) => (
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

const IconBadge = memo(function IconBadge() {
  return (
    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-cyan-500/15">
      <Sparkles size={18} className="text-cyan-300" />
    </div>
  );
});

const InsightStat = memo(function InsightStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-white/6 bg-dark-elevated/55 px-4 py-3">
      <p className="text-[0.68rem] uppercase tracking-[0.16em] text-text-muted">{label}</p>
      <p className="mt-2 truncate text-sm font-semibold text-text-primary">{value}</p>
    </div>
  );
});
