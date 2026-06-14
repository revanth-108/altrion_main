import { memo, useState } from 'react';
import { TrendingUp } from 'lucide-react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';
import { Card } from '@/components/ui';
import { useHealthHistory } from '@/hooks/queries/usePortfolio';

// ─── helpers ──────────────────────────────────────────────────────────────────

const PERIOD_OPTIONS = [
  { label: '30D', days: 30 },
  { label: '90D', days: 90 },
  { label: '1Y', days: 365 },
] as const;

function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

const OVERALL_COLOR = '#06b6d4'; // accent-cyan

// ─── custom tooltip ───────────────────────────────────────────────────────────

const CustomTooltip = memo(function CustomTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: { name: string; value: number; color: string }[];
  label?: number;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-dark-card border border-dark-elevated rounded-lg p-3 text-xs shadow-lg">
      <p className="text-text-muted mb-2">{label ? formatDate(label) : ''}</p>
      {payload.map((p) => (
        <div key={p.name} className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full" style={{ background: p.color }} />
          <span className="text-text-secondary capitalize">{p.name}:</span>
          <span className="font-semibold text-text-primary">{Math.round(p.value)}</span>
        </div>
      ))}
    </div>
  );
});

// ─── main component ───────────────────────────────────────────────────────────

export const ScoreHistoryChart = memo(function ScoreHistoryChart() {
  const [days, setDays] = useState<number>(90);
  const { data: history, isLoading } = useHealthHistory(days);

  const points = history?.data ?? [];

  const chartData = points.map((p) => ({
    ts: new Date(p.computed_at).getTime(),
    overall: p.overall_score,
  }));

  return (
    <Card variant="bordered">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-accent-cyan/20 flex items-center justify-center">
            <TrendingUp size={20} className="text-accent-cyan" />
          </div>
          <div>
            <p className="text-xs uppercase tracking-[0.16em] text-text-muted">AFHS trend</p>
            <h3 className="font-display text-lg sm:text-2xl font-bold text-text-primary">
              Score History
            </h3>
          </div>
        </div>

        <div className="flex gap-1">
          {PERIOD_OPTIONS.map((opt) => (
            <button
              key={opt.days}
              onClick={() => setDays(opt.days)}
              className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
                days === opt.days
                  ? 'bg-accent-cyan/20 text-accent-cyan'
                  : 'text-text-muted hover:text-text-secondary'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="h-48 flex items-center justify-center">
          <div className="w-8 h-8 rounded-full border-4 border-dark-elevated border-t-accent-cyan animate-spin" />
        </div>
      ) : chartData.length === 0 ? (
        <div className="h-48 flex flex-col items-center justify-center text-center gap-2">
          <TrendingUp size={32} className="text-text-muted opacity-40" />
          <p className="text-sm text-text-muted">No history yet</p>
          <p className="text-xs text-text-muted opacity-70">
            Score history begins after the first successful AFHS snapshot.
          </p>
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={180}>
          <LineChart data={chartData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
            <XAxis
              dataKey="ts"
              type="number"
              scale="time"
              domain={['dataMin', 'dataMax']}
              tickFormatter={formatDate}
              tick={{ fontSize: 10, fill: '#6b7280' }}
              axisLine={false}
              tickLine={false}
              interval="preserveStartEnd"
            />
            <YAxis
              domain={[0, 100]}
              tick={{ fontSize: 10, fill: '#6b7280' }}
              axisLine={false}
              tickLine={false}
              tickCount={5}
            />
            <Tooltip content={<CustomTooltip />} />
            <Legend
              wrapperStyle={{ fontSize: '11px', paddingTop: '8px' }}
              formatter={(value: string) => (
                <span className="text-text-secondary capitalize">{value}</span>
              )}
            />
            <Line
              type="monotone"
              dataKey="overall"
              name="AFHS score"
              stroke={OVERALL_COLOR}
              strokeWidth={2}
              dot={chartData.length <= 20 ? { r: Math.max(2, 4 - Math.floor(chartData.length / 8)), fill: OVERALL_COLOR } : false}
              activeDot={{ r: 5 }}
            />
          </LineChart>
        </ResponsiveContainer>
      )}

      {!isLoading && chartData.length > 0 && (
        <p className="mt-2 text-xs text-text-muted text-center">
          Last {days} days · {chartData.length} data point{chartData.length !== 1 ? 's' : ''}
        </p>
      )}
    </Card>
  );
});
