import { useEffect, useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Activity, Layers3, ShieldCheck, Target, Wallet } from 'lucide-react';
import { Card } from '@/components/ui';
import { useBudgetData } from '@/hooks/queries/useBudget';
import { usePlaidBalances } from '@/hooks/queries/usePlaid';
import { usePortfolio, usePortfolioHealth } from '@/hooks/queries/usePortfolio';
import {
  analysisService,
  type ConcentrationResult,
} from '@/services';
import { selectUser, useAuthStore } from '@/store';
import {
  allocationForHorizon,
  buildFinancialPlan,
  buildPlanningTargetRows,
  deriveAllocationFromPortfolio,
  deriveSyncedPlanningInputs,
  extractPlaidBalancesPayload,
  fmtMoney,
  fmtPercentValue,
  monthsOfCoverage,
} from './shared';

type InsightTone = 'positive' | 'warning' | 'info';

interface SnapshotInsight {
  tone: InsightTone;
  tag: string;
  title: string;
  body: string;
}

interface PlanningCheckpoint {
  name: string;
  targetLabel: string;
  current: number;
  target: number;
  yearLabel: string;
  status: string;
}

const EXPECTED_RETURN = 0.07;
const INFLATION_RATE = 0.03;

const parseChartValue = (
  value: string | number | readonly (string | number)[] | null | undefined,
): number | null => {
  const raw = Array.isArray(value) ? value[0] : value;
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null;
  if (typeof raw === 'string') {
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

const insightClasses = (tone: InsightTone) => {
  switch (tone) {
    case 'positive':
      return 'border-emerald-500/25 bg-emerald-500/10 text-emerald-200';
    case 'warning':
      return 'border-amber-500/25 bg-amber-500/10 text-amber-200';
    default:
      return 'border-sky-500/25 bg-sky-500/10 text-sky-200';
  }
};

const checkpointClasses = (status: string) => {
  if (/reached|strong|on track/i.test(status)) {
    return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300';
  }
  if (/building|monitor/i.test(status)) {
    return 'border-sky-500/30 bg-sky-500/10 text-sky-300';
  }
  return 'border-amber-500/30 bg-amber-500/10 text-amber-300';
};

function MetricCard({
  label,
  value,
  note,
  accent = false,
}: {
  label: string;
  value: string;
  note: string;
  accent?: boolean;
}) {
  return (
    <div
      className={`rounded-2xl border p-4 ${
        accent
          ? 'border-altrion-500/20 bg-gradient-to-br from-altrion-500/20 via-dark-elevated/60 to-dark-elevated/35'
          : 'border-dark-border bg-dark-elevated/25'
      }`}
    >
      <p className="text-[11px] uppercase tracking-[0.18em] text-text-muted">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-text-primary">{value}</p>
      <p className="mt-2 text-xs leading-relaxed text-text-secondary">{note}</p>
    </div>
  );
}

export function WealthManagementSnapshot() {
  const user = useAuthStore(selectUser);
  const { data: portfolio } = usePortfolio();
  const { data: health } = usePortfolioHealth();
  const { data: budgetData } = useBudgetData();
  const { data: plaidBalancesData } = usePlaidBalances();
  const [concentration, setConcentration] = useState<ConcentrationResult | null>(null);

  const plaidPayload = useMemo(
    () => extractPlaidBalancesPayload(plaidBalancesData),
    [plaidBalancesData],
  );
  const syncedInputs = useMemo(
    () => deriveSyncedPlanningInputs(user, portfolio, budgetData, plaidPayload),
    [budgetData, plaidPayload, portfolio, user],
  );

  useEffect(() => {
    let active = true;

    void analysisService
      .getConcentration()
      .then((result) => {
        if (active) setConcentration(result);
      })
      .catch(() => {
        if (active) setConcentration(null);
      });

    return () => {
      active = false;
    };
  }, []);

  const planningAge = syncedInputs.currentAge ?? 35;
  const retirementTarget = syncedInputs.retirementAge ?? planningAge + syncedInputs.yearsToGoal;
  const effectiveTargetAmount =
    syncedInputs.targetAmount > 0 ? syncedInputs.targetAmount : Math.max(syncedInputs.currentBalance * 2.2, 250000);

  const plan = useMemo(
    () =>
      buildFinancialPlan({
        age: planningAge,
        retirementTarget,
        income: syncedInputs.annualIncome,
        expenses: syncedInputs.annualExpenses,
        assets: syncedInputs.currentBalance,
        liabilities: syncedInputs.liabilities,
        expectedReturns: EXPECTED_RETURN,
        inflation: INFLATION_RATE,
      }),
    [planningAge, retirementTarget, syncedInputs],
  );

  const coverageMonths = useMemo(
    () => monthsOfCoverage(syncedInputs.liquidReserves, syncedInputs.annualExpenses),
    [syncedInputs.annualExpenses, syncedInputs.liquidReserves],
  );

  const actualAllocation = useMemo(() => deriveAllocationFromPortfolio(portfolio), [portfolio]);
  const targetAllocation = useMemo(
    () =>
      Object.keys(plan.suggestedAllocation).length > 0
        ? plan.suggestedAllocation
        : allocationForHorizon(plan.retirementReadiness.yearsToRetirement),
    [plan.retirementReadiness.yearsToRetirement, plan.suggestedAllocation],
  );

  const allocationRows = useMemo(
    () =>
      buildPlanningTargetRows(actualAllocation, targetAllocation)
        .filter((row) => row.actual > 0 || row.target > 0)
        .sort((left, right) => Math.max(right.actual, right.target) - Math.max(left.actual, left.target)),
    [actualAllocation, targetAllocation],
  );

  const allocationDrift = allocationRows
    .map((row) => ({ ...row, drift: row.actual - row.target }))
    .sort((left, right) => Math.abs(right.drift) - Math.abs(left.drift))[0];

  const currentYear = new Date().getFullYear();
  const reserveTarget = syncedInputs.annualExpenses > 0 ? syncedInputs.annualExpenses / 2 : 0;
  const savingsTarget = syncedInputs.annualIncome > 0 ? syncedInputs.annualIncome * 0.2 : syncedInputs.annualSavings;

  const checkpoints: PlanningCheckpoint[] = [
    {
      name: 'Retirement target',
      targetLabel: fmtMoney(effectiveTargetAmount),
      current: plan.retirementReadiness.currentTrajectoryValue,
      target: effectiveTargetAmount,
      yearLabel:
        plan.retirementReadiness.yearsToRetirement > 0
          ? String(currentYear + plan.retirementReadiness.yearsToRetirement)
          : String(currentYear),
      status: plan.retirementReadiness.onTrack ? 'On track' : 'Needs attention',
    },
    {
      name: 'Emergency reserve',
      targetLabel: reserveTarget > 0 ? fmtMoney(reserveTarget) : 'Needs expense data',
      current: syncedInputs.liquidReserves,
      target: reserveTarget,
      yearLabel: 'Current',
      status:
        coverageMonths === null
          ? 'Needs expense data'
          : coverageMonths >= 6
            ? 'Reached'
            : coverageMonths >= 3
              ? 'Building'
              : 'Needs attention',
    },
    {
      name: 'Annual savings pace',
      targetLabel: savingsTarget > 0 ? fmtMoney(savingsTarget) : 'No target yet',
      current: syncedInputs.annualSavings,
      target: savingsTarget,
      yearLabel: 'Current',
      status:
        plan.savingsRate >= 20 ? 'Strong' : plan.savingsRate >= 10 ? 'Monitor' : 'Needs attention',
    },
  ];

  const insights = useMemo<SnapshotInsight[]>(() => {
    const items: SnapshotInsight[] = [];

    if (allocationDrift && Math.abs(allocationDrift.drift) >= 8) {
      const direction = allocationDrift.drift > 0 ? 'over' : 'under';
      items.push({
        tone: 'warning',
        tag: 'Allocation Drift Detected',
        title: `${allocationDrift.name} is materially ${direction} target.`,
        body: `${allocationDrift.name} sits ${fmtPercentValue(Math.abs(allocationDrift.drift), 1)} away from the planning target of ${fmtPercentValue(allocationDrift.target, 1)}.`,
      });
    }

    if (plan.retirementReadiness.onTrack) {
      items.push({
        tone: 'positive',
        tag: 'Retirement Trajectory',
        title: 'The current savings path is covering the estimated retirement need.',
        body: `Projected retirement assets are ${fmtMoney(plan.retirementReadiness.currentTrajectoryValue)} against an estimated need of ${fmtMoney(plan.retirementReadiness.requiredSavings)}.`,
      });
    } else {
      items.push({
        tone: 'warning',
        tag: 'Projection Gap',
        title: 'Current contributions are below the modeled retirement requirement.',
        body: `The model shows a ${fmtMoney(Math.abs(plan.retirementReadiness.gapOrSurplus))} gap by retirement. Closing it would require about ${fmtMoney(plan.savingsGap)} per month in additional savings at the current assumptions.`,
      });
    }

    if (coverageMonths !== null) {
      items.push({
        tone: coverageMonths >= 6 ? 'positive' : coverageMonths >= 3 ? 'info' : 'warning',
        tag: 'Liquidity Ratio',
        title: `Liquid reserves cover ${coverageMonths.toFixed(1)} months of spending.`,
        body:
          coverageMonths >= 6
            ? 'Short-term cash coverage is comfortably above the typical six-month reserve benchmark.'
            : coverageMonths >= 3
              ? 'Liquidity is workable, but still short of a six-month reserve target.'
              : 'Cash coverage is thin relative to current annual expenses and deserves closer monitoring.',
      });
    }

    if (concentration && !concentration.error) {
      items.push({
        tone:
          concentration.overall_severity === 'RED' || concentration.overall_severity === 'CRITICAL'
            ? 'warning'
            : 'info',
        tag: 'Concentration Threshold',
        title: `Top 3 holdings account for ${fmtPercentValue(concentration.top3_pct, 1)} of the synced portfolio.`,
        body: `The concentration engine currently labels the portfolio ${concentration.overall_severity.toLowerCase()} with HHI ${concentration.hhi_score.toFixed(0)} and ${concentration.summary_flags.length} summary flags.`,
      });
    }

    if (health) {
      items.push({
        tone: health.overall_score >= 75 ? 'positive' : health.overall_score >= 60 ? 'info' : 'warning',
        tag: 'Health Score',
        title: `Portfolio health is ${health.overall_score}/100.`,
        body: `${health.overall_label} across ${health.active_dimensions} active dimensions with life stage marked as ${health.life_stage.toLowerCase()}.`,
      });
    }

    return items.slice(0, 6);
  }, [allocationDrift, concentration, coverageMonths, health, plan]);

  const trajectoryData = plan.cashFlowProjection.map((row) => ({
    age: row.age,
    year: row.year,
    portfolioValue: row.portfolioValue,
    annualSavings: row.savings,
    income: row.income,
    expenses: row.expenses,
    target: effectiveTargetAmount,
  }));

  const cashFlowPreview = plan.cashFlowProjection.slice(0, 6);

  const investedAssets = portfolio?.totalValue ?? syncedInputs.currentBalance;
  const annualSavings = syncedInputs.annualSavings;

  return (
    <div className="space-y-4">
      <Card variant="bordered" className="overflow-hidden">
        <div className="grid gap-4 lg:grid-cols-[1.6fr_1fr]">
          <div>
            <p className="text-xs uppercase tracking-[0.24em] text-altrion-400">Wealth Snapshot</p>
            <h3 className="mt-2 text-xl font-semibold text-text-primary">
              Live personal-finance snapshot built from connected portfolio, budget, and Plaid data.
            </h3>
            <p className="mt-2 max-w-3xl text-sm leading-relaxed text-text-secondary">
              Review net worth, liquidity, savings pace, allocation drift, projection gaps, and
              planning milestones in one place.
            </p>
            <div className="mt-4 flex flex-wrap gap-2 text-xs text-text-muted">
              <span className="rounded-full border border-dark-border px-3 py-1">
                Current age: {syncedInputs.currentAge ?? 'Not set'}
              </span>
              <span className="rounded-full border border-dark-border px-3 py-1">
                Retirement target: {retirementTarget}
              </span>
              <span className="rounded-full border border-dark-border px-3 py-1">
                Expected return: {(EXPECTED_RETURN * 100).toFixed(1)}%
              </span>
              <span className="rounded-full border border-dark-border px-3 py-1">
                Inflation: {(INFLATION_RATE * 100).toFixed(1)}%
              </span>
            </div>
          </div>

          <div className="rounded-2xl border border-dark-border bg-dark-elevated/25 p-4">
            <div className="flex items-center gap-2 text-text-primary">
              <Wallet size={16} className="text-altrion-400" />
              <h4 className="text-sm font-semibold">Planning summary</h4>
            </div>
            <p className="mt-3 text-sm leading-relaxed text-text-secondary">
              {plan.scenarioCommentary}
            </p>
          </div>
        </div>
      </Card>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Total net worth"
          value={fmtMoney(plan.netWorthSummary.netWorth)}
          note={`Assets ${fmtMoney(plan.netWorthSummary.totalAssets)} minus liabilities ${fmtMoney(plan.netWorthSummary.totalLiabilities)}.`}
          accent
        />
        <MetricCard
          label="Invested assets"
          value={fmtMoney(investedAssets)}
          note={`Portfolio total synced from connected holdings and cash buckets.`}
        />
        <MetricCard
          label="Liquid reserves"
          value={fmtMoney(syncedInputs.liquidReserves)}
          note={
            coverageMonths === null
              ? 'Expense data is needed to estimate months of coverage.'
              : `${coverageMonths.toFixed(1)} months of current expense coverage.`
          }
        />
        <MetricCard
          label="Total liabilities"
          value={fmtMoney(syncedInputs.liabilities)}
          note={
            investedAssets > 0
              ? `${fmtPercentValue((syncedInputs.liabilities / investedAssets) * 100, 1)} of invested assets.`
              : 'Connected liability balances when available.'
          }
        />
        <MetricCard
          label="Annual income"
          value={fmtMoney(syncedInputs.annualIncome)}
          note="Budget recurring inflows first, then saved profile income."
        />
        <MetricCard
          label="Annual savings"
          value={fmtMoney(annualSavings)}
          note={`Monthly savings pace: ${fmtMoney(Math.round(annualSavings / 12))}.`}
        />
        <MetricCard
          label="Savings rate"
          value={fmtPercentValue(plan.savingsRate, 1)}
          note={`Annual surplus is ${fmtMoney(plan.annualSurplus)} after modeled expenses.`}
        />
        <MetricCard
          label="Health score"
          value={health ? `${health.overall_score}/100` : '—'}
          note={
            health
              ? `${health.overall_label} · ${health.life_stage}`
              : 'Waiting on portfolio health inputs.'
          }
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.45fr_1fr]">
        <Card variant="bordered">
          <div className="mb-4 flex items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 text-text-primary">
                <Target size={16} className="text-altrion-400" />
                <h4 className="text-sm font-semibold">Planning trajectory</h4>
              </div>
              <p className="mt-1 text-xs leading-relaxed text-text-muted">
                The projection curve uses current assets, annual savings, expected return, and inflation
                to show a simple planning path.
              </p>
            </div>
            <div className="rounded-full border border-dark-border px-3 py-1 text-[11px] uppercase tracking-[0.18em] text-text-muted">
              Goal line shown
            </div>
          </div>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trajectoryData}>
                <CartesianGrid stroke="#1f2937" vertical={false} />
                <XAxis dataKey="age" stroke="#64748b" tick={{ fontSize: 12 }} />
                <YAxis
                  yAxisId="left"
                  stroke="#64748b"
                  tick={{ fontSize: 12 }}
                  tickFormatter={(value) => fmtMoney(typeof value === 'number' ? value : Number(value))}
                  width={80}
                />
                <YAxis
                  yAxisId="right"
                  orientation="right"
                  stroke="#64748b"
                  tick={{ fontSize: 12 }}
                  tickFormatter={(value) => fmtMoney(typeof value === 'number' ? value : Number(value))}
                  width={80}
                />
                <Tooltip
                  contentStyle={{
                    background: '#0a0e1a',
                    border: '1px solid #1f2937',
                    borderRadius: 8,
                    color: '#e5e7eb',
                  }}
                  formatter={(value) => fmtMoney(parseChartValue(value))}
                />
                <Legend wrapperStyle={{ fontSize: 12, color: '#94a3b8' }} />
                <ReferenceLine
                  yAxisId="left"
                  y={effectiveTargetAmount}
                  stroke="#cbd5e1"
                  strokeDasharray="6 4"
                  label={{ value: 'Target', position: 'insideTopRight', fill: '#cbd5e1', fontSize: 11 }}
                />
                <Line
                  yAxisId="left"
                  type="monotone"
                  dataKey="portfolioValue"
                  name="Projected portfolio"
                  stroke="#10b981"
                  strokeWidth={2.5}
                  dot={false}
                />
                <Line
                  yAxisId="right"
                  type="monotone"
                  dataKey="annualSavings"
                  name="Annual savings"
                  stroke="#38bdf8"
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card variant="bordered">
          <div className="flex items-center gap-2 text-text-primary">
            <Layers3 size={16} className="text-altrion-400" />
            <h4 className="text-sm font-semibold">Allocation actual vs target</h4>
          </div>
          <p className="mt-1 text-xs leading-relaxed text-text-muted">
            Planning targets shift with years to retirement so the current mix can be compared with a
            horizon-based target.
          </p>
          <div className="mt-4 h-80">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={allocationRows}>
                <CartesianGrid stroke="#1f2937" vertical={false} />
                <XAxis dataKey="name" stroke="#64748b" tick={{ fontSize: 11 }} />
                <YAxis
                  stroke="#64748b"
                  tick={{ fontSize: 12 }}
                  tickFormatter={(value) => fmtPercentValue(typeof value === 'number' ? value : Number(value), 0)}
                  width={68}
                />
                <Tooltip
                  contentStyle={{
                    background: '#0a0e1a',
                    border: '1px solid #1f2937',
                    borderRadius: 8,
                    color: '#e5e7eb',
                  }}
                  formatter={(value) => fmtPercentValue(parseChartValue(value), 1)}
                />
                <Legend wrapperStyle={{ fontSize: 12, color: '#94a3b8' }} />
                <Bar dataKey="actual" fill="#38bdf8" name="Actual %" radius={[6, 6, 0, 0]} />
                <Bar dataKey="target" fill="#f59e0b" name="Target %" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.25fr_1fr]">
        <Card variant="bordered">
          <div className="flex items-center gap-2 text-text-primary">
            <Activity size={16} className="text-altrion-400" />
            <h4 className="text-sm font-semibold">Cash flow preview</h4>
          </div>
          <p className="mt-1 text-xs leading-relaxed text-text-muted">
            Near-term yearly projection of income, expenses, and surplus before any manual assumption
            changes.
          </p>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-text-muted">
                  <th className="pb-2 pr-4">Year</th>
                  <th className="pb-2 pr-4">Age</th>
                  <th className="pb-2 pr-4">Income</th>
                  <th className="pb-2 pr-4">Expenses</th>
                  <th className="pb-2 pr-4">Savings</th>
                  <th className="pb-2">Portfolio</th>
                </tr>
              </thead>
              <tbody>
                {cashFlowPreview.map((row) => (
                  <tr key={`${row.year}-${row.age}`} className="border-t border-dark-border">
                    <td className="py-2 pr-4 text-text-secondary">{currentYear + row.year}</td>
                    <td className="py-2 pr-4 text-text-secondary">{row.age}</td>
                    <td className="py-2 pr-4 text-text-primary">{fmtMoney(row.income)}</td>
                    <td className="py-2 pr-4 text-text-primary">{fmtMoney(row.expenses)}</td>
                    <td
                      className={`py-2 pr-4 font-medium ${
                        row.savings >= 0 ? 'text-emerald-300' : 'text-red-300'
                      }`}
                    >
                      {fmtMoney(row.savings)}
                    </td>
                    <td className="py-2 text-text-primary">{fmtMoney(row.portfolioValue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <Card variant="bordered">
          <div className="flex items-center gap-2 text-text-primary">
            <ShieldCheck size={16} className="text-altrion-400" />
            <h4 className="text-sm font-semibold">Planning checkpoints</h4>
          </div>
          <div className="mt-4 space-y-3">
            {checkpoints.map((checkpoint) => {
              const progress =
                checkpoint.target > 0 ? Math.max(0, Math.min((checkpoint.current / checkpoint.target) * 100, 100)) : 0;
              return (
                <div
                  key={checkpoint.name}
                  className="rounded-2xl border border-dark-border bg-dark-elevated/25 p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-text-primary">{checkpoint.name}</p>
                      <p className="mt-1 text-xs text-text-secondary">
                        Target {checkpoint.targetLabel} · {checkpoint.yearLabel}
                      </p>
                    </div>
                    <span
                      className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold ${checkpointClasses(checkpoint.status)}`}
                    >
                      {checkpoint.status}
                    </span>
                  </div>
                  <div className="mt-3 flex items-center justify-between text-sm">
                    <span className="text-text-secondary">Current</span>
                    <span className="font-medium text-text-primary">{fmtMoney(checkpoint.current)}</span>
                  </div>
                  <div className="mt-3 h-2 rounded-full bg-dark-border">
                    <div
                      className="h-2 rounded-full bg-altrion-500"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.2fr_1fr]">
        <Card variant="bordered">
          <div className="flex items-center gap-2 text-text-primary">
            <Layers3 size={16} className="text-altrion-400" />
            <h4 className="text-sm font-semibold">Milestones</h4>
          </div>
          <div className="mt-4 space-y-3">
            {plan.milestones.map((milestone) => (
              <div
                key={`${milestone.year}-${milestone.name}`}
                className="rounded-2xl border border-dark-border bg-dark-elevated/25 p-4"
              >
                <div className="flex flex-wrap items-center gap-3">
                  <span className="rounded-full border border-dark-border px-3 py-1 text-[11px] uppercase tracking-[0.18em] text-text-muted">
                    {milestone.year} · {milestone.status}
                  </span>
                  <p className="text-sm font-semibold text-text-primary">{milestone.name}</p>
                </div>
                <p className="mt-2 text-sm leading-relaxed text-text-secondary">
                  {milestone.description}
                </p>
              </div>
            ))}
          </div>
        </Card>

        <Card variant="bordered">
          <div className="flex items-center gap-2 text-text-primary">
            <ShieldCheck size={16} className="text-altrion-400" />
            <h4 className="text-sm font-semibold">Insights and actions</h4>
          </div>
          <div className="mt-4 space-y-3">
            {insights.length > 0 ? (
              insights.map((insight) => (
                <div
                  key={`${insight.tag}-${insight.title}`}
                  className={`rounded-2xl border p-4 ${insightClasses(insight.tone)}`}
                >
                  <p className="text-[11px] uppercase tracking-[0.18em]">{insight.tag}</p>
                  <p className="mt-2 text-sm font-semibold text-text-primary">{insight.title}</p>
                  <p className="mt-2 text-sm leading-relaxed text-text-secondary">{insight.body}</p>
                </div>
              ))
            ) : (
              <div className="rounded-2xl border border-dark-border bg-dark-elevated/25 p-4">
                <p className="text-sm text-text-secondary">
                  More connected data is needed before this snapshot can surface drift, liquidity, and
                  concentration insights.
                </p>
              </div>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}

export default WealthManagementSnapshot;
