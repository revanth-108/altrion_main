import { useEffect, useMemo, useState } from 'react';
import {
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
import { RefreshCcw, ShieldAlert, Sparkles, Target } from 'lucide-react';
import { Card, Button } from '@/components/ui';
import { AiExplain } from '@/components/AiExplain';
import { useBudgetData } from '@/hooks/queries/useBudget';
import { usePlaidBalances } from '@/hooks/queries/usePlaid';
import { usePortfolio } from '@/hooks/queries/usePortfolio';
import { selectUser, useAuthStore } from '@/store';
import {
  calcAfterTaxRatePct,
  calcFutureValue,
  deriveSyncedPlanningInputs,
  extractPlaidBalancesPayload,
  fmtMoney,
  fmtPercentValue,
} from './shared';

type ScenarioId = 'scenarioA' | 'scenarioB' | 'scenarioC';

interface ScenarioInput {
  id: ScenarioId;
  name: string;
  annualReturnPct: number;
  contributionGrowthPct: number;
  color: string;
}

interface WhatIfForm {
  currentBalance: number;
  annualContribution: number;
  targetAmount: number;
  yearsToGoal: number;
  capitalGainsRatePct: number;
  incomeRatePct: number;
  taxablePortionPct: number;
  scenarios: ScenarioInput[];
}

const DEFAULT_SCENARIOS: ScenarioInput[] = [
  { id: 'scenarioA', name: 'Conservative', annualReturnPct: 5, contributionGrowthPct: 1, color: '#10b981' },
  { id: 'scenarioB', name: 'Moderate', annualReturnPct: 7.5, contributionGrowthPct: 2, color: '#38bdf8' },
  { id: 'scenarioC', name: 'Aggressive', annualReturnPct: 10, contributionGrowthPct: 3, color: '#f59e0b' },
];

const DEFAULT_FORM: WhatIfForm = {
  currentBalance: 250000,
  annualContribution: 24000,
  targetAmount: 1000000,
  yearsToGoal: 12,
  capitalGainsRatePct: 20,
  incomeRatePct: 24,
  taxablePortionPct: 30,
  scenarios: DEFAULT_SCENARIOS,
};

const clampYears = (value: number) => Math.max(1, Math.min(50, Math.round(value || 0)));

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

const outcomeToneClasses = (delta: number) =>
  delta >= 0
    ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
    : 'border-amber-500/30 bg-amber-500/10 text-amber-300';

function NumberField({
  label,
  value,
  onChange,
  step = 1,
  prefix,
  suffix,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  step?: number;
  prefix?: string;
  suffix?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-text-muted">
        {label}
      </span>
      <div className="flex items-stretch rounded-lg border border-dark-border bg-dark-elevated/20 transition-colors focus-within:border-altrion-500/60">
        {prefix ? (
          <span className="flex items-center pl-3 pr-1.5 text-sm text-text-muted">{prefix}</span>
        ) : null}
        <input
          type="number"
          step={step}
          value={Number.isFinite(value) ? value : ''}
          onChange={(event) => onChange(Number(event.target.value))}
          className="w-full bg-transparent px-3 py-2.5 text-sm text-text-primary focus:outline-none"
        />
        {suffix ? (
          <span className="flex items-center pl-1.5 pr-3 text-sm text-text-muted">{suffix}</span>
        ) : null}
      </div>
    </label>
  );
}

function TextField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-text-muted">
        {label}
      </span>
      <input
        type="text"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-lg border border-dark-border bg-dark-elevated/20 px-3 py-2.5 text-sm text-text-primary focus:border-altrion-500/60 focus:outline-none"
      />
    </label>
  );
}

export function WhatIfCalculator() {
  const user = useAuthStore(selectUser);
  const { data: portfolio } = usePortfolio();
  const { data: budgetData } = useBudgetData();
  const { data: plaidBalancesData } = usePlaidBalances();
  const [form, setForm] = useState<WhatIfForm>(DEFAULT_FORM);
  const [taxExpanded, setTaxExpanded] = useState(false);
  const [didAutoSync, setDidAutoSync] = useState(false);

  const plaidPayload = useMemo(
    () => extractPlaidBalancesPayload(plaidBalancesData),
    [plaidBalancesData],
  );
  const syncedInputs = useMemo(
    () => deriveSyncedPlanningInputs(user, portfolio, budgetData, plaidPayload),
    [budgetData, plaidPayload, portfolio, user],
  );

  useEffect(() => {
    if (didAutoSync) return;
    if (
      syncedInputs.currentBalance <= 0 &&
      syncedInputs.annualSavings <= 0 &&
      syncedInputs.targetAmount <= 0
    ) {
      return;
    }

    setForm((prev) => ({
      ...prev,
      currentBalance: Math.round(syncedInputs.currentBalance || prev.currentBalance),
      annualContribution: Math.round(syncedInputs.annualSavings || prev.annualContribution),
      targetAmount: Math.round(syncedInputs.targetAmount || prev.targetAmount),
      yearsToGoal: clampYears(syncedInputs.yearsToGoal || prev.yearsToGoal),
    }));
    setDidAutoSync(true);
  }, [didAutoSync, syncedInputs]);

  const applySyncedData = () => {
    setForm((prev) => ({
      ...prev,
      currentBalance: Math.round(syncedInputs.currentBalance || prev.currentBalance),
      annualContribution: Math.round(syncedInputs.annualSavings || prev.annualContribution),
      targetAmount: Math.round(syncedInputs.targetAmount || prev.targetAmount),
      yearsToGoal: clampYears(syncedInputs.yearsToGoal || prev.yearsToGoal),
    }));
  };

  const scenarioResults = useMemo(
    () =>
      form.scenarios.map((scenario) => {
        const projectedValue = calcFutureValue(
          form.currentBalance,
          scenario.annualReturnPct,
          form.annualContribution,
          scenario.contributionGrowthPct,
          form.yearsToGoal,
        );
        const afterTaxRatePct = calcAfterTaxRatePct(
          scenario.annualReturnPct,
          form.taxablePortionPct,
          form.capitalGainsRatePct,
          form.incomeRatePct,
        );
        const afterTaxProjected = calcFutureValue(
          form.currentBalance,
          afterTaxRatePct,
          form.annualContribution,
          scenario.contributionGrowthPct,
          form.yearsToGoal,
        );
        const deltaToTarget = projectedValue - form.targetAmount;
        const progressPct = form.targetAmount > 0 ? (projectedValue / form.targetAmount) * 100 : 0;

        return {
          ...scenario,
          projectedValue,
          afterTaxProjected,
          afterTaxRatePct,
          deltaToTarget,
          progressPct,
          taxDrag: Math.max(projectedValue - afterTaxProjected, 0),
        };
      }),
    [form],
  );

  const chartData = useMemo(
    () =>
      Array.from({ length: form.yearsToGoal + 1 }, (_, year) => {
        const row: Record<string, number | string> = {
          year,
          label: year === 0 ? 'Today' : `Y${year}`,
          target: form.targetAmount,
        };

        form.scenarios.forEach((scenario) => {
          row[scenario.id] =
            year === 0
              ? form.currentBalance
              : calcFutureValue(
                  form.currentBalance,
                  scenario.annualReturnPct,
                  form.annualContribution,
                  scenario.contributionGrowthPct,
                  year,
                );
        });

        return row;
      }),
    [form],
  );

  const syncedSummary = [
    {
      label: 'Annual income',
      value: fmtMoney(syncedInputs.annualIncome),
      note: 'Budget inflows first, profile income fallback',
    },
    {
      label: 'Annual savings',
      value: fmtMoney(syncedInputs.annualSavings),
      note: 'Connected savings pace used for contribution prefill',
    },
    {
      label: 'Monthly savings',
      value: fmtMoney(Math.round(syncedInputs.annualSavings / 12)),
      note: 'Derived from recurring budget cash flow',
    },
    {
      label: 'Liquid reserves',
      value: fmtMoney(syncedInputs.liquidReserves),
      note: 'Pulled from synced depository balances',
    },
  ];

  return (
    <div className="space-y-4">
      <Card variant="bordered" className="overflow-hidden">
        <div className="grid gap-4 lg:grid-cols-[1.5fr_1fr]">
          <div className="space-y-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-[0.24em] text-altrion-400">What-If Calculator</p>
                <h3 className="mt-2 text-xl font-semibold text-text-primary">
                  Compare three user-defined accumulation paths against one target.
                </h3>
                <p className="mt-2 max-w-3xl text-sm leading-relaxed text-text-secondary">
                  Adjust current balance, annual contribution, target amount, and years to goal, then
                  compare three editable scenarios side by side with optional tax drag math.
                </p>
              </div>
              <button
                type="button"
                onClick={applySyncedData}
                className="inline-flex items-center gap-2 rounded-lg border border-dark-border px-3 py-2 text-xs font-medium text-text-secondary transition-colors hover:border-altrion-500/40 hover:text-text-primary"
              >
                <RefreshCcw size={14} />
                Apply synced data
              </button>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <NumberField
                label="Current balance"
                value={form.currentBalance}
                onChange={(value) => setForm((prev) => ({ ...prev, currentBalance: Math.max(0, value) }))}
                prefix="$"
                step={1000}
              />
              <NumberField
                label="Annual contribution"
                value={form.annualContribution}
                onChange={(value) =>
                  setForm((prev) => ({ ...prev, annualContribution: Math.max(0, value) }))
                }
                prefix="$"
                step={1000}
              />
              <NumberField
                label="Goal target"
                value={form.targetAmount}
                onChange={(value) => setForm((prev) => ({ ...prev, targetAmount: Math.max(0, value) }))}
                prefix="$"
                step={5000}
              />
              <NumberField
                label="Years to goal"
                value={form.yearsToGoal}
                onChange={(value) => setForm((prev) => ({ ...prev, yearsToGoal: clampYears(value) }))}
              />
            </div>
          </div>

          <div className="rounded-2xl border border-dark-border bg-dark-elevated/25 p-4">
            <div className="flex items-center gap-2 text-text-primary">
              <Sparkles size={16} className="text-altrion-400" />
              <h4 className="text-sm font-semibold">Synced planning inputs</h4>
            </div>
            <p className="mt-2 text-xs leading-relaxed text-text-muted">
              Savings and income are enabled here and pulled from the same live portfolio, budget, and
              Plaid-linked account data used elsewhere in the dashboard.
            </p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {syncedSummary.map((item) => (
                <div key={item.label} className="rounded-xl border border-dark-border bg-dark-bg/60 p-3">
                  <p className="text-[11px] uppercase tracking-[0.18em] text-text-muted">{item.label}</p>
                  <p className="mt-1 text-lg font-semibold text-text-primary">{item.value}</p>
                  <p className="mt-1 text-xs leading-relaxed text-text-secondary">{item.note}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </Card>

      <div className="grid gap-4 xl:grid-cols-3">
        {form.scenarios.map((scenario) => {
          const result = scenarioResults.find((entry) => entry.id === scenario.id);
          const progress = result?.progressPct ?? 0;

          return (
            <Card key={scenario.id} variant="bordered" className="overflow-hidden">
              <div className="h-1 w-full" style={{ backgroundColor: scenario.color }} />
              <div className="space-y-4 pt-4">
                <TextField
                  label="Scenario name"
                  value={scenario.name}
                  onChange={(value) =>
                    setForm((prev) => ({
                      ...prev,
                      scenarios: prev.scenarios.map((entry) =>
                        entry.id === scenario.id ? { ...entry, name: value } : entry,
                      ),
                    }))
                  }
                />
                <div className="grid gap-3 sm:grid-cols-2">
                  <NumberField
                    label="Annual return"
                    value={scenario.annualReturnPct}
                    onChange={(value) =>
                      setForm((prev) => ({
                        ...prev,
                        scenarios: prev.scenarios.map((entry) =>
                          entry.id === scenario.id
                            ? { ...entry, annualReturnPct: Math.max(-50, Math.min(50, value)) }
                            : entry,
                        ),
                      }))
                    }
                    suffix="%"
                    step={0.25}
                  />
                  <NumberField
                    label="Contribution growth"
                    value={scenario.contributionGrowthPct}
                    onChange={(value) =>
                      setForm((prev) => ({
                        ...prev,
                        scenarios: prev.scenarios.map((entry) =>
                          entry.id === scenario.id
                            ? { ...entry, contributionGrowthPct: Math.max(-20, Math.min(20, value)) }
                            : entry,
                        ),
                      }))
                    }
                    suffix="%"
                    step={0.25}
                  />
                </div>

                <div className="rounded-xl border border-dark-border bg-dark-bg/60 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs uppercase tracking-[0.18em] text-text-muted">Projected balance</p>
                      <p className="mt-1 text-2xl font-semibold text-text-primary">
                        {fmtMoney(result?.projectedValue)}
                      </p>
                    </div>
                    <span
                      className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold ${outcomeToneClasses(result?.deltaToTarget ?? 0)}`}
                    >
                      {result && result.deltaToTarget >= 0 ? 'Above target' : 'Below target'}
                    </span>
                  </div>
                  <div className="mt-4 space-y-2 text-sm">
                    <div className="flex items-center justify-between text-text-secondary">
                      <span>Vs. target</span>
                      <span className="font-medium text-text-primary">
                        {result?.deltaToTarget ? fmtMoney(result.deltaToTarget) : fmtMoney(0)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-text-secondary">
                      <span>Target coverage</span>
                      <span className="font-medium text-text-primary">{fmtPercentValue(progress, 1)}</span>
                    </div>
                    <div>
                      <div className="mb-2 flex items-center justify-between text-xs text-text-muted">
                        <span>Progress to target</span>
                        <span>{fmtPercentValue(progress, 0)}</span>
                      </div>
                      <div className="h-2 rounded-full bg-dark-border">
                        <div
                          className="h-2 rounded-full"
                          style={{
                            width: `${Math.max(0, Math.min(progress, 100))}%`,
                            backgroundColor: scenario.color,
                          }}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.5fr_1fr]">
        <Card variant="bordered">
          <div className="mb-4 flex items-start justify-between gap-3">
            <div>
              <h4 className="text-sm font-semibold text-text-primary">Projected balance over time</h4>
              <p className="mt-1 text-xs leading-relaxed text-text-muted">
                All scenario lines use the same base balance, contribution amount, and target date. Only
                the rate and contribution-growth assumptions differ.
              </p>
            </div>
            <div className="rounded-full border border-dark-border px-3 py-1 text-[11px] uppercase tracking-[0.18em] text-text-muted">
              Target line shown
            </div>
          </div>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                <CartesianGrid stroke="#1f2937" strokeOpacity={0.6} vertical={false} />
                <XAxis dataKey="label" stroke="#475569" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: '#94a3b8' }} tickMargin={8} />
                <YAxis
                  stroke="#475569"
                  tickLine={false}
                  axisLine={false}
                  tick={{ fontSize: 11, fill: '#94a3b8' }}
                  tickFormatter={(value) => fmtMoney(typeof value === 'number' ? value : Number(value))}
                  width={72}
                />
                <Tooltip
                  cursor={{ stroke: '#334155', strokeDasharray: '3 3' }}
                  contentStyle={{
                    background: '#0a0e1a',
                    border: '1px solid #1f2937',
                    borderRadius: 10,
                    color: '#e5e7eb',
                    fontSize: 12,
                  }}
                  formatter={(value) => fmtMoney(parseChartValue(value))}
                />
                <Legend wrapperStyle={{ fontSize: 12, color: '#94a3b8' }} iconType="circle" />
                <ReferenceLine
                  y={form.targetAmount}
                  stroke="#cbd5e1"
                  strokeOpacity={0.6}
                  strokeDasharray="6 4"
                  label={{ value: 'Target', position: 'insideTopRight', fill: '#cbd5e1', fontSize: 11 }}
                />
                {form.scenarios.map((scenario) => (
                  <Line
                    key={scenario.id}
                    dataKey={scenario.id}
                    name={scenario.name}
                    stroke={scenario.color}
                    strokeWidth={2.5}
                    dot={false}
                    activeDot={{ r: 4, stroke: '#0a0e1a', strokeWidth: 2 }}
                    type="monotone"
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card variant="bordered">
          <div className="flex items-center gap-2 text-text-primary">
            <Target size={16} className="text-altrion-400" />
            <h4 className="text-sm font-semibold">Scenario comparison</h4>
          </div>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-text-muted">
                  <th className="pb-2 pr-4">Scenario</th>
                  <th className="pb-2 pr-4">Return</th>
                  <th className="pb-2 pr-4">Contrib growth</th>
                  <th className="pb-2 pr-4">Projected</th>
                  <th className="pb-2">Vs target</th>
                </tr>
              </thead>
              <tbody>
                {scenarioResults.map((scenario) => (
                  <tr key={scenario.id} className="border-t border-dark-border">
                    <td className="py-2 pr-4 text-text-primary">{scenario.name}</td>
                    <td className="py-2 pr-4 text-text-secondary">{fmtPercentValue(scenario.annualReturnPct, 2)}</td>
                    <td className="py-2 pr-4 text-text-secondary">
                      {fmtPercentValue(scenario.contributionGrowthPct, 2)}
                    </td>
                    <td className="py-2 pr-4 text-text-primary">{fmtMoney(scenario.projectedValue)}</td>
                    <td
                      className={`py-2 font-medium ${
                        scenario.deltaToTarget >= 0 ? 'text-emerald-300' : 'text-amber-300'
                      }`}
                    >
                      {fmtMoney(scenario.deltaToTarget)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      <Card variant="bordered">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-start gap-2">
            <ShieldAlert size={16} className="mt-0.5 text-amber-300" />
            <div>
              <h4 className="text-sm font-semibold text-text-primary">Tax drag calculator</h4>
              <p className="mt-1 text-xs leading-relaxed text-text-muted">
                Optional arithmetic layer using only the tax assumptions you enter here. It does not
                infer your tax situation.
              </p>
            </div>
          </div>
          <Button
            onClick={() => setTaxExpanded((prev) => !prev)}
            className="inline-flex items-center gap-2"
          >
            {taxExpanded ? 'Hide tax module' : 'Show tax module'}
          </Button>
        </div>

        {taxExpanded ? (
          <div className="mt-4 space-y-4">
            <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 p-3 text-xs leading-relaxed text-amber-200">
              This calculator is not tax advice. It applies your capital-gains rate, ordinary-income rate,
              and estimated taxable-return share to show an approximate after-tax compounding effect.
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <NumberField
                label="Capital gains rate"
                value={form.capitalGainsRatePct}
                onChange={(value) =>
                  setForm((prev) => ({ ...prev, capitalGainsRatePct: Math.max(0, Math.min(60, value)) }))
                }
                suffix="%"
                step={0.5}
              />
              <NumberField
                label="Ordinary income rate"
                value={form.incomeRatePct}
                onChange={(value) =>
                  setForm((prev) => ({ ...prev, incomeRatePct: Math.max(0, Math.min(60, value)) }))
                }
                suffix="%"
                step={0.5}
              />
              <NumberField
                label="Taxable portion of returns"
                value={form.taxablePortionPct}
                onChange={(value) =>
                  setForm((prev) => ({ ...prev, taxablePortionPct: Math.max(0, Math.min(100, value)) }))
                }
                suffix="%"
                step={1}
              />
            </div>

            <div className="grid gap-4 xl:grid-cols-3">
              {scenarioResults.map((scenario) => (
                <div
                  key={scenario.id}
                  className="rounded-2xl border border-dark-border bg-dark-elevated/25 p-4"
                >
                  <div className="flex items-center gap-2">
                    <span
                      className="h-2.5 w-2.5 rounded-sm"
                      style={{ backgroundColor: scenario.color }}
                    />
                    <p className="text-sm font-semibold text-text-primary">{scenario.name}</p>
                  </div>
                  <div className="mt-4 space-y-3 text-sm">
                    <div className="flex items-center justify-between">
                      <span className="text-text-secondary">After-tax projected</span>
                      <span className="font-medium text-text-primary">
                        {fmtMoney(scenario.afterTaxProjected)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-text-secondary">Estimated tax drag</span>
                      <span className="font-medium text-red-300">{fmtMoney(-scenario.taxDrag)}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-text-secondary">After-tax rate</span>
                      <span className="font-medium text-text-primary">
                        {fmtPercentValue(scenario.afterTaxRatePct, 2)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-text-secondary">Vs. target after tax</span>
                      <span
                        className={`font-medium ${
                          scenario.afterTaxProjected >= form.targetAmount ? 'text-emerald-300' : 'text-amber-300'
                        }`}
                      >
                        {fmtMoney(scenario.afterTaxProjected - form.targetAmount)}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </Card>

      <AiExplain
        kind="financial_analysis"
        title="What-if scenario projection"
        hint="A plain-English read on these scenario projections — what each path leads to, why, and how much you'd end up with."
        context={{
          goal: {
            target_amount: form.targetAmount,
            years_to_goal: form.yearsToGoal,
            current_balance: form.currentBalance,
            annual_contribution: form.annualContribution,
          },
          scenarios: scenarioResults.map((s) => ({
            name: s.name,
            annual_return_pct: s.annualReturnPct,
            projected_value: Math.round(s.projectedValue),
            after_tax_projected: Math.round(s.afterTaxProjected),
            delta_to_target: Math.round(s.deltaToTarget),
            progress_pct: Math.round(s.progressPct),
            tax_drag: Math.round(s.taxDrag),
          })),
        }}
      />

      <Card variant="bordered" className="bg-dark-elevated/15">
        <p className="text-xs leading-relaxed text-text-secondary">
          This page is a calculator, not advice. Outputs are arithmetic results derived from your synced
          balances plus the assumptions you enter for return rates, contribution growth, and taxes. Actual
          market results, taxes, and account behavior will differ.
        </p>
      </Card>
    </div>
  );
}

export default WhatIfCalculator;
