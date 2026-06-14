import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { AlertTriangle, Loader2, RefreshCcw, Target } from 'lucide-react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, Button } from '@/components/ui';
import { AiExplain } from '@/components/AiExplain';
import { usePortfolio } from '@/hooks/queries/usePortfolio';
import {
  analysisService,
  type GoalFitRequest,
  type GoalFitResult,
} from '@/services';
import type { Portfolio } from '@/types';
import { WhatIfCalculator } from './financial-analysis/WhatIfCalculator';
import { WealthManagementSnapshot } from './financial-analysis/WealthManagementSnapshot';

type TabKey = 'wealth_snapshot' | 'what_if';
type WhatIfView = 'what_if' | 'goal_fit';

const TABS: { key: TabKey; label: string; description: string }[] = [
  { key: 'wealth_snapshot', label: 'Wealth Snapshot', description: 'Live net worth, cash flow, and drift view' },
  { key: 'what_if', label: 'What-If', description: 'Scenario projection, tax drag, and goal-fit scoring' },
];

const GOAL_FIT_CLASSES = [
  'US Equity',
  'Intl Equity',
  'Fixed Income',
  'Real Estate',
  'Crypto',
  'Cash',
  'Other',
] as const;

type GoalFitClass = (typeof GOAL_FIT_CLASSES)[number];

const GOAL_FIT_DEFAULTS: GoalFitRequest = {
  current_assets: 250000,
  target_amount: 1250000,
  years_to_goal: 15,
  annual_savings: 30000,
  goal_type: 'Retirement',
  risk_comfort: 'moderate',
  allocation: {
    'US Equity': 55,
    'Intl Equity': 10,
    'Fixed Income': 20,
    'Real Estate': 5,
    Crypto: 5,
    Cash: 5,
    Other: 0,
  },
};

/* ── Helpers ───────────────────────────────────────────────────────────── */
const fmtPercentValue = (n: number | null | undefined, digits = 1) =>
  n === null || n === undefined || Number.isNaN(n) ? '—' : `${n.toFixed(digits)}%`;

const tierClasses = (tier: string) => {
  switch (tier) {
    case 'GREEN':
      return 'bg-emerald-500/15 text-emerald-300 border-emerald-500/25';
    case 'YELLOW':
      return 'bg-amber-500/15 text-amber-300 border-amber-500/25';
    case 'RED':
      return 'bg-red-500/15 text-red-300 border-red-500/25';
    default:
      return 'bg-slate-500/15 text-slate-300 border-slate-500/25';
  }
};

const normalizeAllocation = (allocation: Record<string, number>) => {
  const sanitizedEntries = Object.entries(allocation).map(([key, value]) => [key, Math.max(0, value)] as const);
  const total = sanitizedEntries.reduce((sum, [, value]) => sum + value, 0);

  if (total <= 0) {
    return { ...GOAL_FIT_DEFAULTS.allocation };
  }

  return Object.fromEntries(
    sanitizedEntries.map(([key, value]) => [key, Number(((value / total) * 100).toFixed(1))]),
  );
};

const deriveGoalFitAllocation = (portfolio?: Portfolio): Record<string, number> => {
  if (!portfolio?.assets?.length || portfolio.totalValue <= 0) {
    return { ...GOAL_FIT_DEFAULTS.allocation };
  }

  const buckets: Record<GoalFitClass, number> = {
    'US Equity': 0,
    'Intl Equity': 0,
    'Fixed Income': 0,
    'Real Estate': 0,
    Crypto: 0,
    Cash: 0,
    Other: 0,
  };

  for (const asset of portfolio.assets) {
    if (asset.type === 'stock') {
      buckets['US Equity'] += asset.value;
    } else if (asset.type === 'crypto') {
      buckets.Crypto += asset.value;
    } else if (asset.type === 'cash') {
      buckets.Cash += asset.value;
    } else {
      buckets.Other += asset.value;
    }
  }

  return normalizeAllocation(buckets);
};

const getScenarioFill = (tier: string) => {
  switch (tier) {
    case 'GREEN':
      return '#10b981';
    case 'YELLOW':
      return '#f59e0b';
    case 'RED':
      return '#ef4444';
    default:
      return '#64748b';
  }
};

/* ── Reusable number input ─────────────────────────────────────────────── */
function NumberField({
  label,
  value,
  onChange,
  step = 1,
  prefix,
  suffix,
}: {
  label: string;
  value: number | undefined | null;
  onChange: (v: number) => void;
  step?: number;
  prefix?: string;
  suffix?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-text-muted">
        {label}
      </span>
      <div className="flex items-stretch rounded-lg border-2 border-dark-border bg-transparent transition-colors focus-within:border-altrion-500">
        {prefix ? (
          <span className="flex items-center pl-3 pr-1.5 text-sm text-text-muted">{prefix}</span>
        ) : null}
        <input
          type="number"
          step={step}
          value={value ?? ''}
          onChange={(e) => onChange(Number(e.target.value))}
          className="w-full bg-transparent px-3 py-2.5 text-sm text-text-primary focus:outline-none"
        />
        {suffix ? (
          <span className="flex items-center pl-1.5 pr-3 text-sm text-text-muted">{suffix}</span>
        ) : null}
      </div>
    </label>
  );
}

/* ── Goal fit tab ──────────────────────────────────────────────────────── */
function GoalFitTab() {
  const { data: portfolio } = usePortfolio();
  const portfolioAllocation = useMemo(() => deriveGoalFitAllocation(portfolio), [portfolio]);
  const [form, setForm] = useState<GoalFitRequest>(GOAL_FIT_DEFAULTS);
  const [prefillApplied, setPrefillApplied] = useState(false);
  const [result, setResult] = useState<GoalFitResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (prefillApplied || !portfolio || portfolio.totalValue <= 0) return;
    setForm((prev) => ({
      ...prev,
      current_assets: Math.round(portfolio.totalValue),
      allocation: portfolioAllocation,
    }));
    setPrefillApplied(true);
  }, [portfolio, portfolioAllocation, prefillApplied]);

  const allocationTotal = useMemo(
    () => Object.values(form.allocation).reduce((sum, value) => sum + value, 0),
    [form.allocation],
  );

  const patch = (next: Partial<GoalFitRequest>) => setForm((prev) => ({ ...prev, ...next }));

  const updateAllocation = (label: GoalFitClass, value: number) => {
    patch({
      allocation: {
        ...form.allocation,
        [label]: Math.max(0, value),
      },
    });
  };

  const syncFromPortfolio = () => {
    patch({
      current_assets: Math.round(portfolio?.totalValue ?? form.current_assets),
      allocation: portfolioAllocation,
    });
  };

  const run = async () => {
    setLoading(true);
    setError(null);
    try {
      const payload: GoalFitRequest = {
        ...form,
        allocation: normalizeAllocation(form.allocation),
      };
      const res = await analysisService.runGoalFit(payload);
      setResult(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Goal fit analysis failed');
    } finally {
      setLoading(false);
    }
  };

  const scenarioData = result?.scenarios.map((scenario) => ({
    name: scenario.name,
    probability: scenario.probability_pct,
    volatility: scenario.portfolio_vol,
    tier: scenario.tier,
  })) ?? [];

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      <Card variant="bordered" className="lg:col-span-1">
        <div className="mb-3 flex items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold text-text-primary">Goal inputs</h3>
            <p className="mt-1 text-xs text-text-muted">
              Model whether the current allocation is aligned with the goal horizon.
            </p>
          </div>
          <button
            type="button"
            onClick={syncFromPortfolio}
            disabled={!portfolio || portfolio.totalValue <= 0}
            className="flex items-center gap-1 rounded-lg border border-dark-border px-2.5 py-1.5 text-xs text-text-secondary transition-colors hover:border-altrion-500/40 hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-40"
          >
            <RefreshCcw size={12} />
            Sync
          </button>
        </div>

        <div className="space-y-3">
          <NumberField
            label="Current assets"
            value={form.current_assets}
            onChange={(v) => patch({ current_assets: Math.max(0, v) })}
            prefix="$"
            step={1000}
          />
          <NumberField
            label="Target amount"
            value={form.target_amount}
            onChange={(v) => patch({ target_amount: Math.max(0, v) })}
            prefix="$"
            step={5000}
          />
          <NumberField
            label="Years to goal"
            value={form.years_to_goal}
            onChange={(v) => patch({ years_to_goal: Math.max(1, Math.round(v)) })}
          />
          <NumberField
            label="Annual savings"
            value={form.annual_savings}
            onChange={(v) => patch({ annual_savings: Math.max(0, v) })}
            prefix="$"
            step={1000}
          />

          <label className="block">
            <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-text-muted">
              Goal type
            </span>
            <select
              value={form.goal_type ?? 'Retirement'}
              onChange={(e) => patch({ goal_type: e.target.value })}
              className="w-full rounded-lg border-2 border-dark-border bg-dark-bg px-3 py-2.5 text-sm text-text-primary focus:border-altrion-500 focus:outline-none"
            >
              {['Retirement', 'Home Purchase', 'Major Expense', 'Education', 'Custom'].map((option) => (
                <option key={option} value={option}>{option}</option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-text-muted">
              Risk comfort
            </span>
            <select
              value={form.risk_comfort ?? 'moderate'}
              onChange={(e) => patch({ risk_comfort: e.target.value as GoalFitRequest['risk_comfort'] })}
              className="w-full rounded-lg border-2 border-dark-border bg-dark-bg px-3 py-2.5 text-sm text-text-primary focus:border-altrion-500 focus:outline-none"
            >
              <option value="low">Low</option>
              <option value="moderate">Moderate</option>
              <option value="high">High</option>
            </select>
          </label>
        </div>

        <div className="mt-5">
          <div className="mb-2 flex items-center justify-between">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-text-muted">Allocation mix</h4>
            <span className="text-xs text-text-muted">Current total: {fmtPercentValue(allocationTotal, 1)}</span>
          </div>
          <div className="space-y-2">
            {GOAL_FIT_CLASSES.map((bucket) => (
              <div key={bucket} className="grid grid-cols-[1fr_112px] items-center gap-3">
                <span className="text-sm text-text-secondary">{bucket}</span>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={form.allocation[bucket] ?? 0}
                  onChange={(e) => updateAllocation(bucket, Number(e.target.value))}
                  className="w-full rounded-lg border border-dark-border bg-transparent px-3 py-2 text-sm text-text-primary focus:border-altrion-500 focus:outline-none"
                />
              </div>
            ))}
          </div>
          <p className="mt-2 text-xs text-text-muted">
            Inputs are normalized before scoring, so they do not need to sum perfectly to 100.
          </p>
        </div>

        <Button onClick={run} disabled={loading} className="mt-5 flex w-full items-center justify-center gap-2">
          {loading ? <Loader2 size={16} className="animate-spin" /> : <Target size={16} />}
          {loading ? 'Scoring…' : 'Run goal fit'}
        </Button>
      </Card>

      <div className="space-y-4 lg:col-span-2">
        {error ? (
          <Card variant="bordered" className="border-red-500/40">
            <div className="flex items-start gap-2">
              <AlertTriangle className="text-red-400" size={18} />
              <p className="text-sm text-red-300">{error}</p>
            </div>
          </Card>
        ) : null}

        {result ? (
          <>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
              <Card variant="bordered">
                <p className="text-xs uppercase tracking-wider text-text-muted">Tier</p>
                <div className="mt-2">
                  <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${tierClasses(result.tier)}`}>
                    {result.tier}
                  </span>
                </div>
              </Card>
              <Card variant="bordered">
                <p className="text-xs uppercase tracking-wider text-text-muted">Goal probability</p>
                <p className="mt-1 text-2xl font-semibold text-text-primary">
                  {fmtPercentValue(result.probability_pct, 1)}
                </p>
              </Card>
              <Card variant="bordered">
                <p className="text-xs uppercase tracking-wider text-text-muted">Required return</p>
                <p className="mt-1 text-2xl font-semibold text-text-primary">
                  {fmtPercentValue(result.required_return, 1)}
                </p>
              </Card>
              <Card variant="bordered">
                <p className="text-xs uppercase tracking-wider text-text-muted">Portfolio vol</p>
                <p className="mt-1 text-2xl font-semibold text-text-primary">
                  {fmtPercentValue(result.portfolio_vol, 1)}
                </p>
                <p className="mt-1 text-xs text-text-muted">
                  Risk band: {fmtPercentValue(result.risk_band_max_vol, 1)}
                </p>
              </Card>
            </div>

            <Card variant="bordered">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h4 className="text-sm font-semibold text-text-primary">Scenario comparison</h4>
                  <p className="mt-1 text-xs text-text-muted">
                    Compare the current mix with growth and conservative tilts.
                  </p>
                </div>
                <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${tierClasses(result.tier)}`}>
                  {result.tier_reason}
                </span>
              </div>
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={scenarioData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid stroke="#1f2937" strokeOpacity={0.6} vertical={false} />
                    <XAxis dataKey="name" stroke="#475569" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: '#94a3b8' }} tickMargin={8} />
                    <YAxis
                      yAxisId="left"
                      stroke="#475569"
                      tickLine={false}
                      axisLine={false}
                      tick={{ fontSize: 11, fill: '#94a3b8' }}
                      tickFormatter={(value) => fmtPercentValue(typeof value === 'number' ? value : Number(value), 0)}
                      width={56}
                    />
                    <YAxis
                      yAxisId="right"
                      orientation="right"
                      stroke="#475569"
                      tickLine={false}
                      axisLine={false}
                      tick={{ fontSize: 11, fill: '#94a3b8' }}
                      tickFormatter={(value) => fmtPercentValue(typeof value === 'number' ? value : Number(value), 0)}
                      width={56}
                    />
                    <Tooltip
                      cursor={{ fill: 'rgba(148,163,184,0.08)' }}
                      contentStyle={{
                        background: '#0a0e1a',
                        border: '1px solid #1f2937',
                        borderRadius: 10,
                        color: '#e5e7eb',
                        fontSize: 12,
                      }}
                    />
                    <Legend wrapperStyle={{ fontSize: 12, color: '#94a3b8' }} iconType="circle" />
                    <Bar yAxisId="left" dataKey="probability" name="Goal probability" radius={[6, 6, 0, 0]} maxBarSize={56}>
                      {scenarioData.map((entry) => (
                        <Cell key={entry.name} fill={getScenarioFill(entry.tier)} />
                      ))}
                    </Bar>
                    <Line
                      yAxisId="right"
                      type="monotone"
                      dataKey="volatility"
                      stroke="#38bdf8"
                      strokeWidth={2}
                      dot={false}
                      activeDot={{ r: 4, fill: '#38bdf8', stroke: '#0a0e1a', strokeWidth: 2 }}
                      name="Volatility"
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>

            <Card variant="bordered">
              <h4 className="mb-3 text-sm font-semibold text-text-primary">Scenario detail</h4>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs uppercase tracking-wide text-text-muted">
                      <th className="pb-2 pr-4">Scenario</th>
                      <th className="pb-2 pr-4">Tier</th>
                      <th className="pb-2 pr-4">Probability</th>
                      <th className="pb-2 pr-4">Volatility</th>
                      <th className="pb-2">Drawdown</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.scenarios.map((scenario) => (
                      <tr key={scenario.name} className="border-t border-dark-border">
                        <td className="py-2 pr-4 text-text-primary">{scenario.name}</td>
                        <td className="py-2 pr-4">
                          <span className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold ${tierClasses(scenario.tier)}`}>
                            {scenario.tier}
                          </span>
                        </td>
                        <td className="py-2 pr-4 text-text-primary">{fmtPercentValue(scenario.probability_pct, 1)}</td>
                        <td className="py-2 pr-4 text-text-primary">{fmtPercentValue(scenario.portfolio_vol, 1)}</td>
                        <td className="py-2 text-text-primary">{fmtPercentValue(Math.abs(scenario.max_drawdown), 1)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>

            <Card variant="bordered">
              <h4 className="mb-2 text-sm font-semibold text-text-primary">Narrative</h4>
              <p className="text-sm leading-relaxed text-text-secondary">
                {result.summary_commentary}
              </p>
            </Card>

            <AiExplain
              kind="financial_analysis"
              title="Goal fit scoring"
              hint="A plain-English read on this goal-fit result — whether you're on track, why, and the numbers behind it."
              context={{
                tier: result.tier,
                tier_reason: result.tier_reason,
                probability_pct: result.probability_pct,
                required_return: result.required_return,
                portfolio_vol: result.portfolio_vol,
                risk_band_max_vol: result.risk_band_max_vol,
                scenarios: result.scenarios,
                inputs: {
                  current_assets: form.current_assets,
                  target_amount: form.target_amount,
                  years_to_goal: form.years_to_goal,
                  annual_savings: form.annual_savings,
                  goal_type: form.goal_type,
                  risk_comfort: form.risk_comfort,
                },
              }}
            />
          </>
        ) : (
          <Card variant="bordered">
            <p className="text-sm text-text-muted">
              Score the current portfolio against a concrete goal to see probability, required return, and alternative allocation tilts.
            </p>
          </Card>
        )}
      </div>
    </div>
  );
}

/* ── What-If tab (What-If projection + Goal fit) ──────────────────────── */
const WHAT_IF_VIEWS: { key: WhatIfView; label: string }[] = [
  { key: 'what_if', label: 'Scenario projection' },
  { key: 'goal_fit', label: 'Goal fit' },
];

function WhatIfTab() {
  const [view, setView] = useState<WhatIfView>('what_if');

  return (
    <div className="space-y-4">
      <div className="inline-flex flex-wrap gap-1 rounded-xl border border-dark-border bg-dark-elevated/40 p-1">
        {WHAT_IF_VIEWS.map((v) => (
          <button
            key={v.key}
            type="button"
            onClick={() => setView(v.key)}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
              view === v.key
                ? 'bg-altrion-500/15 text-altrion-300'
                : 'text-text-muted hover:text-text-primary'
            }`}
          >
            {v.label}
          </button>
        ))}
      </div>

      {view === 'what_if' ? <WhatIfCalculator /> : <GoalFitTab />}
    </div>
  );
}

/* ── Page ──────────────────────────────────────────────────────────────── */
export function FinancialAnalysis() {
  const [tab, setTab] = useState<TabKey>('wealth_snapshot');

  return (
    <DashboardLayout maxWidth="max-w-7xl">
      <div className="space-y-5 pb-12">
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25 }}
        >
          <h1 className="text-2xl font-semibold tracking-tight text-text-primary sm:text-3xl">
            Financial Analysis
          </h1>
          <p className="mt-1 text-sm text-text-secondary">
            Track your wealth snapshot, then stress-test scenarios and goal-fit from one workspace.
          </p>
        </motion.div>

        <div className="flex gap-1 overflow-x-auto border-b border-dark-border">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
                tab === t.key
                  ? 'border-altrion-500 text-text-primary'
                  : 'border-transparent text-text-muted hover:text-text-primary'
              }`}
            >
              {t.label}
              <span className="block text-[11px] font-normal text-text-muted">
                {t.description}
              </span>
            </button>
          ))}
        </div>

        {tab === 'wealth_snapshot' ? <WealthManagementSnapshot /> : null}
        {tab === 'what_if' ? <WhatIfTab /> : null}
      </div>
    </DashboardLayout>
  );
}

export default FinancialAnalysis;
