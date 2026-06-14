import { useEffect, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { AlertTriangle, Loader2, ShieldAlert } from 'lucide-react';
import { Card, Button } from '@/components/ui';
import { usePortfolio } from '@/hooks/queries/usePortfolio';
import { analysisService, type ConcentrationResult } from '@/services';

type ChartValue = string | number | readonly (string | number)[] | undefined;

const fmtMoney = (n: number | null | undefined) => {
  if (n === null || n === undefined || Number.isNaN(n)) return '—';
  const abs = Math.abs(n);
  if (abs >= 1_000_000_000) return `${n < 0 ? '-' : ''}$${(abs / 1_000_000_000).toFixed(2)}B`;
  if (abs >= 1_000_000) return `${n < 0 ? '-' : ''}$${(abs / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `${n < 0 ? '-' : ''}$${(abs / 1_000).toFixed(1)}k`;
  return `${n < 0 ? '-' : ''}$${abs.toFixed(2)}`;
};

const fmtPercentValue = (n: number | null | undefined, digits = 1) =>
  n === null || n === undefined || Number.isNaN(n) ? '—' : `${n.toFixed(digits)}%`;

const toNumber = (value: ChartValue): number | null => {
  const raw = Array.isArray(value) ? value[0] : value;
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null;
  if (typeof raw === 'string') {
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

const formatTooltipMoney = (value: ChartValue) => fmtMoney(toNumber(value));
const formatTooltipPercent = (value: ChartValue) => fmtPercentValue(toNumber(value), 2);

const severityClasses = (severity: string) => {
  switch (severity) {
    case 'GREEN':
      return 'bg-emerald-500/15 text-emerald-300 border-emerald-500/25';
    case 'YELLOW':
      return 'bg-amber-500/15 text-amber-300 border-amber-500/25';
    case 'RED':
      return 'bg-red-500/15 text-red-300 border-red-500/25';
    case 'CRITICAL':
      return 'bg-fuchsia-500/15 text-fuchsia-300 border-fuchsia-500/25';
    default:
      return 'bg-slate-500/15 text-slate-300 border-slate-500/25';
  }
};

const getSeverityFill = (tier: string) => {
  switch (tier) {
    case 'GREEN':
      return '#10b981';
    case 'YELLOW':
      return '#f59e0b';
    case 'RED':
      return '#ef4444';
    case 'CRITICAL':
      return '#d946ef';
    default:
      return '#64748b';
  }
};

/**
 * Portfolio concentration analysis — largest holdings, asset class mix,
 * risk flags, and top-holdings detail. Sourced from the synced portfolio.
 */
export function ConcentrationPanel() {
  const { data: portfolio } = usePortfolio();
  const [result, setResult] = useState<ConcentrationResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const run = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await analysisService.getConcentration();
      setResult(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Concentration analysis failed');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void run();
  }, []);

  const topHoldings = result?.holdings_sorted.slice(0, 8).map((holding) => ({
    name: holding.ticker,
    weight_pct: holding.weight_pct,
    market_value: holding.market_value,
  })) ?? [];

  const classMix = result?.asset_class_concentration.map((bucket) => ({
    name: bucket.asset_class,
    weight_pct: bucket.weight_pct,
    severity: bucket.severity,
  })) ?? [];

  const holdingCount = typeof result?.risk_metadata?.holding_count === 'number'
    ? result.risk_metadata.holding_count
    : topHoldings.length;
  const flaggedCount = typeof result?.risk_metadata?.flagged_count === 'number'
    ? result.risk_metadata.flagged_count
    : result?.individual_flags.length ?? 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm text-text-secondary">
            Review how much of the synced portfolio is concentrated in a few holdings or asset classes.
          </p>
          {portfolio?.totalValue ? (
            <p className="mt-1 text-xs text-text-muted">
              Synced portfolio value: {fmtMoney(portfolio.totalValue)}
            </p>
          ) : null}
        </div>
        <Button onClick={run} disabled={loading} className="flex items-center gap-2">
          {loading ? <Loader2 size={16} className="animate-spin" /> : <ShieldAlert size={16} />}
          {loading ? 'Analyzing…' : 'Refresh analysis'}
        </Button>
      </div>

      {error ? (
        <Card variant="bordered" className="border-red-500/40">
          <div className="flex items-start gap-2">
            <AlertTriangle className="text-red-400" size={18} />
            <p className="text-sm text-red-300">{error}</p>
          </div>
        </Card>
      ) : null}

      {result?.error ? (
        <Card variant="bordered" className="border-amber-500/40">
          <p className="text-sm text-amber-300">{result.error}</p>
        </Card>
      ) : null}

      {result && !result.error ? (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
            <Card variant="bordered">
              <p className="text-xs uppercase tracking-wider text-text-muted">Total value</p>
              <p className="mt-1 text-2xl font-semibold text-text-primary">{fmtMoney(result.total_value)}</p>
            </Card>
            <Card variant="bordered">
              <p className="text-xs uppercase tracking-wider text-text-muted">Top 3 exposure</p>
              <p className="mt-1 text-2xl font-semibold text-text-primary">
                {fmtPercentValue(result.top3_pct, 1)}
              </p>
            </Card>
            <Card variant="bordered">
              <p className="text-xs uppercase tracking-wider text-text-muted">HHI</p>
              <p className="mt-1 text-2xl font-semibold text-text-primary">{result.hhi_score.toFixed(0)}</p>
              <p className="mt-1 text-xs text-text-muted">{result.hhi_label}</p>
            </Card>
            <Card variant="bordered">
              <p className="text-xs uppercase tracking-wider text-text-muted">Overall severity</p>
              <div className="mt-2">
                <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${severityClasses(result.overall_severity)}`}>
                  {result.overall_severity}
                </span>
              </div>
            </Card>
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Card variant="bordered">
              <h4 className="mb-3 text-sm font-semibold text-text-primary">Largest holdings</h4>
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={topHoldings} layout="vertical">
                    <CartesianGrid stroke="#1f2937" horizontal={false} />
                    <XAxis
                      type="number"
                      stroke="#64748b"
                      tick={{ fontSize: 12 }}
                      tickFormatter={(value) => fmtPercentValue(typeof value === 'number' ? value : Number(value), 0)}
                    />
                    <YAxis
                      dataKey="name"
                      type="category"
                      stroke="#64748b"
                      tick={{ fontSize: 12 }}
                      width={70}
                    />
                    <Tooltip
                      contentStyle={{
                        background: '#0a0e1a',
                        border: '1px solid #1f2937',
                        borderRadius: 8,
                        color: '#e5e7eb',
                      }}
                      formatter={(value, name) =>
                        name === 'market_value' ? formatTooltipMoney(value) : formatTooltipPercent(value)
                      }
                    />
                    <Legend wrapperStyle={{ fontSize: 12, color: '#94a3b8' }} />
                    <Bar dataKey="weight_pct" fill="#38bdf8" name="Weight %" radius={[0, 6, 6, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>

            <Card variant="bordered">
              <h4 className="mb-3 text-sm font-semibold text-text-primary">Asset class mix</h4>
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={classMix}>
                    <CartesianGrid stroke="#1f2937" vertical={false} />
                    <XAxis dataKey="name" stroke="#64748b" tick={{ fontSize: 12 }} />
                    <YAxis
                      stroke="#64748b"
                      tick={{ fontSize: 12 }}
                      tickFormatter={(value) => fmtPercentValue(typeof value === 'number' ? value : Number(value), 0)}
                      width={64}
                    />
                    <Tooltip
                      contentStyle={{
                        background: '#0a0e1a',
                        border: '1px solid #1f2937',
                        borderRadius: 8,
                        color: '#e5e7eb',
                      }}
                      formatter={(value) => formatTooltipPercent(value)}
                    />
                    <Bar dataKey="weight_pct" name="Weight %">
                      {classMix.map((entry) => (
                        <Cell key={entry.name} fill={getSeverityFill(entry.severity)} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Card variant="bordered">
              <div className="mb-3 flex items-center justify-between">
                <h4 className="text-sm font-semibold text-text-primary">Risk flags</h4>
                <span className="text-xs text-text-muted">
                  {holdingCount} holdings · {flaggedCount} flagged
                </span>
              </div>
              <div className="space-y-2">
                {result.summary_flags.length > 0 ? (
                  result.summary_flags.map((flag) => (
                    <div key={`${flag.flag_code}-${flag.title}`} className="rounded-xl border border-dark-border bg-dark-elevated/35 p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-text-primary">{flag.title}</p>
                          <p className="mt-1 text-xs leading-relaxed text-text-secondary">{flag.description}</p>
                        </div>
                        <span className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold ${severityClasses(flag.severity)}`}>
                          {flag.severity}
                        </span>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-text-muted">No elevated flags were generated for the synced portfolio.</p>
                )}
              </div>
            </Card>

            <Card variant="bordered">
              <h4 className="mb-3 text-sm font-semibold text-text-primary">Top holdings detail</h4>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs uppercase tracking-wide text-text-muted">
                      <th className="pb-2 pr-4">Ticker</th>
                      <th className="pb-2 pr-4">Asset class</th>
                      <th className="pb-2 pr-4">Weight</th>
                      <th className="pb-2">Value</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.holdings_sorted.slice(0, 8).map((holding) => (
                      <tr key={`${holding.ticker}-${holding.asset_class}`} className="border-t border-dark-border">
                        <td className="py-2 pr-4 text-text-primary">{holding.ticker}</td>
                        <td className="py-2 pr-4 text-text-secondary">{holding.asset_class}</td>
                        <td className="py-2 pr-4 text-text-primary">{fmtPercentValue(holding.weight_pct, 1)}</td>
                        <td className="py-2 text-text-primary">{fmtMoney(holding.market_value)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          </div>
        </>
      ) : !loading ? (
        <Card variant="bordered">
          <p className="text-sm text-text-muted">
            Run the concentration engine to inspect top holdings, top-three exposure, HHI, and asset class crowding.
          </p>
        </Card>
      ) : null}
    </div>
  );
}

export default ConcentrationPanel;
