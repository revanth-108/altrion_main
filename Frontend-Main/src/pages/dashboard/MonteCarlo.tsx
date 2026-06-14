import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  AlertTriangle,
  CheckCircle2,
  Copy,
  Loader2,
  Play,
  Plus,
  RefreshCcw,
  Save,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, Button } from '@/components/ui';
import { AiExplain } from '@/components/AiExplain';
import { useBudgetData } from '@/hooks/queries/useBudget';
import { useDebounce } from '@/hooks/useDebounce';
import { usePortfolio } from '@/hooks/queries/usePortfolio';
import {
  analysisService,
  type MonteCarloEvent,
  type MonteCarloRequest,
  type MonteCarloResult,
} from '@/services';
import { selectUser, useAuthStore } from '@/store';
import type { BudgetData, Portfolio, User } from '@/types';

/* ── Types ─────────────────────────────────────────────────────────────── */
interface SavedScenario {
  id: string;
  name: string;
  savedAt: string;
  request: MonteCarloRequest;
  result: MonteCarloResult;
}

type PresetKey = string;
type PlannerTab = 'profile' | 'income' | 'savings' | 'events';

interface Preset {
  key: PresetKey;
  label: string;
  description: string;
  patch: Partial<MonteCarloRequest>;
}

interface PresetGroup {
  title: string;
  presets: Preset[];
}

interface EventTemplate {
  label: string;
  description: string;
  kind: MonteCarloEvent['kind'];
  amount: number;
  ageOffset: number;
}


interface SyncedMonteCarloInputs {
  initialBalance: number | null;
  annualIncome: number | null;
  annualExpenses: number | null;
  annualSavings: number | null;
  currentAge: number | null;
  retirementAge: number | null;
  planningAge: number | null;
  sources: {
    balance?: string;
    income?: string;
    expenses?: string;
    savings?: string;
    age?: string;
    retirement?: string;
  };
}

/* ── Constants ─────────────────────────────────────────────────────────── */
const STORAGE_KEY = 'altrion-monte-carlo-scenarios';

const DEFAULT_REQUEST: MonteCarloRequest = {
  initial_balance: 50000,
  monthly_contribution: 1500,
  annual_income: 120000,
  annual_expenses: 70000,
  use_cash_flow_contribution: false,
  income_growth_rate: 0.03,
  expense_growth_rate: 0.03,
  events: [],
  current_age: 32,
  retirement_age: 65,
  planning_age: 90,
  target_annual_income: 80000,
  social_security_income: 24000,
  mean_return: 0.07,
  return_std: 0.15,
  retirement_mean_return: 0.05,
  retirement_return_std: 0.1,
  mean_inflation: 0.025,
  inflation_std: 0.01,
  n_iterations: 1000,
  random_salt: 0,
};

const PRESET_GROUPS: PresetGroup[] = [
  {
    title: 'Bull markets',
    presets: [
      {
        key: 'bull-2',
        label: 'Market +2%',
        description: 'Mild tailwind: 9% mean return, slightly lower vol.',
        patch: { mean_return: 0.09, return_std: 0.14, mean_inflation: 0.024 },
      },
      {
        key: 'bull-5',
        label: 'Market +5%',
        description: 'Strong tailwind: 12% mean return, compressed vol.',
        patch: { mean_return: 0.12, return_std: 0.13, mean_inflation: 0.022 },
      },
      {
        key: 'bull-8',
        label: 'Market +8%',
        description: 'Extended boom: 15% mean return.',
        patch: { mean_return: 0.15, return_std: 0.13, mean_inflation: 0.022 },
      },
      {
        key: 'bull-10',
        label: 'Market +10%',
        description: 'Euphoric melt-up: 17% mean return, rising vol.',
        patch: { mean_return: 0.17, return_std: 0.16, mean_inflation: 0.025 },
      },
    ],
  },
  {
    title: 'Bear markets',
    presets: [
      {
        key: 'bear-2',
        label: 'Market -2%',
        description: 'Soft patch: 5% mean return, elevated dispersion.',
        patch: { mean_return: 0.05, return_std: 0.17, mean_inflation: 0.028 },
      },
      {
        key: 'bear-5',
        label: 'Market -5%',
        description: 'Drawdown regime: 2% mean return, high vol.',
        patch: { mean_return: 0.02, return_std: 0.2, mean_inflation: 0.03 },
      },
      {
        key: 'bear-8',
        label: 'Market -8%',
        description: 'Deep bear: slightly negative returns, very high vol.',
        patch: { mean_return: -0.01, return_std: 0.24, mean_inflation: 0.032 },
      },
      {
        key: 'bear-10',
        label: 'Market -10%',
        description: 'Severe bear: sustained losses, extreme vol.',
        patch: { mean_return: -0.03, return_std: 0.28, mean_inflation: 0.034, retirement_mean_return: 0.02 },
      },
    ],
  },
  {
    title: 'Macro events',
    presets: [
      {
        key: 'baseline',
        label: 'Base case',
        description: 'Long-run averages — 7% equity return, 2.5% inflation.',
        patch: { mean_return: 0.07, return_std: 0.15, mean_inflation: 0.025, inflation_std: 0.01 },
      },
      {
        key: 'recession',
        label: 'Recession',
        description: 'Contraction: 3% mean return, high vol, sticky inflation.',
        patch: { mean_return: 0.03, return_std: 0.21, mean_inflation: 0.03 },
      },
      {
        key: 'geopolitical',
        label: 'Geopolitical crisis',
        description: 'Shock-driven volatility with modest returns.',
        patch: { mean_return: 0.04, return_std: 0.23, mean_inflation: 0.035 },
      },
      {
        key: 'high-inflation',
        label: 'High inflation',
        description: 'Persistent 5% inflation, modest real returns.',
        patch: { mean_return: 0.06, return_std: 0.16, mean_inflation: 0.05, inflation_std: 0.015 },
      },
      {
        key: 'tech-boom',
        label: 'Tech boom',
        description: 'Productivity surge: 13% mean return, low inflation.',
        patch: { mean_return: 0.13, return_std: 0.15, mean_inflation: 0.02 },
      },
      {
        key: 'rate-plateau',
        label: 'Rate plateau',
        description: 'Steady rates: average returns, contained inflation.',
        patch: { mean_return: 0.07, return_std: 0.14, mean_inflation: 0.024 },
      },
    ],
  },
  {
    title: 'Crisis scenarios',
    presets: [
      {
        key: 'hyperinflation',
        label: 'Hyperinflation',
        description: 'Runaway prices: 9% inflation erodes real returns.',
        patch: { mean_return: 0.05, return_std: 0.2, mean_inflation: 0.09, inflation_std: 0.03 },
      },
      {
        key: 'deflation',
        label: 'Deflation',
        description: 'Falling prices: weak returns, negative inflation.',
        patch: { mean_return: 0.02, return_std: 0.18, mean_inflation: -0.01, inflation_std: 0.01 },
      },
      {
        key: 'climate-shock',
        label: 'Climate shock',
        description: 'Disruptive shocks: low returns, elevated vol and inflation.',
        patch: { mean_return: 0.03, return_std: 0.22, mean_inflation: 0.04 },
      },
      {
        key: 'ai-displacement',
        label: 'AI displacement',
        description: 'Uneven productivity: wide dispersion, modest returns.',
        patch: { mean_return: 0.06, return_std: 0.24, mean_inflation: 0.025 },
      },
      {
        key: 'housing-collapse',
        label: 'Housing collapse',
        description: 'Credit crunch: negative returns, very high vol.',
        patch: { mean_return: -0.02, return_std: 0.26, mean_inflation: 0.028, retirement_mean_return: 0.02 },
      },
      {
        key: 'dollar-devaluation',
        label: 'Dollar devaluation',
        description: 'Currency stress: higher inflation, choppy returns.',
        patch: { mean_return: 0.05, return_std: 0.21, mean_inflation: 0.06, inflation_std: 0.02 },
      },
      {
        key: 'debt-crisis',
        label: 'Debt crisis',
        description: 'Sovereign stress: suppressed returns, extreme vol.',
        patch: { mean_return: 0.01, return_std: 0.27, mean_inflation: 0.035, retirement_mean_return: 0.015 },
      },
      {
        key: 'pandemic-shock',
        label: 'Pandemic shock',
        description: 'Sudden stop then recovery: low returns, spiking vol.',
        patch: { mean_return: 0.03, return_std: 0.25, mean_inflation: 0.03 },
      },
    ],
  },
];

const EVENT_KINDS: MonteCarloEvent['kind'][] = ['income', 'expense', 'savings', 'withdrawal', 'lump_sum'];
const PLANNER_TABS: Array<{ key: PlannerTab; label: string }> = [
  { key: 'profile', label: 'Profile' },
  { key: 'income', label: 'Income' },
  { key: 'savings', label: 'Savings' },
  { key: 'events', label: 'Events' },
];
const EVENT_TEMPLATES: EventTemplate[] = [
  {
    label: 'Home purchase',
    description: 'One-time down payment or renovation spend.',
    kind: 'lump_sum',
    amount: -75000,
    ageOffset: 5,
  },
  {
    label: 'College funding',
    description: 'Ongoing annual education expense.',
    kind: 'expense',
    amount: 18000,
    ageOffset: 10,
  },
  {
    label: 'Child costs',
    description: 'Ongoing annual family expense.',
    kind: 'expense',
    amount: 12000,
    ageOffset: 3,
  },
  {
    label: 'Medical expense',
    description: 'Unexpected one-time healthcare cost.',
    kind: 'lump_sum',
    amount: -25000,
    ageOffset: 7,
  },
  {
    label: 'Windfall',
    description: 'Inheritance, liquidity event, or bonus.',
    kind: 'lump_sum',
    amount: 50000,
    ageOffset: 8,
  },
  {
    label: 'Career jump',
    description: 'Persistent lift to annual income.',
    kind: 'income',
    amount: 20000,
    ageOffset: 2,
  },
];
const SAVINGS_HINT = /(savings|save|reserve|emergency|retirement|401k|ira|invest)/i;

/* ── Helpers ───────────────────────────────────────────────────────────── */
const fmtMoney = (n: number) => {
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `${n < 0 ? '-' : ''}$${(abs / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `${n < 0 ? '-' : ''}$${(abs / 1_000).toFixed(1)}k`;
  return `${n < 0 ? '-' : ''}$${abs.toFixed(0)}`;
};

const fmtPct = (n: number, digits = 1) => `${(n * 100).toFixed(digits)}%`;

const loadScenarios = (): SavedScenario[] => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const persistScenarios = (scenarios: SavedScenario[]) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(scenarios));
  } catch {
    // no-op
  }
};

const fmtSavedAt = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Saved recently';
  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
};

const calcAgeFromDob = (dateOfBirth?: string): number | null => {
  if (!dateOfBirth) return null;

  const dob = new Date(`${dateOfBirth}T00:00:00`);
  if (Number.isNaN(dob.getTime())) return null;

  const now = new Date();
  let age = now.getFullYear() - dob.getFullYear();
  const monthDiff = now.getMonth() - dob.getMonth();
  const dayDiff = now.getDate() - dob.getDate();

  if (monthDiff < 0 || (monthDiff === 0 && dayDiff < 0)) {
    age -= 1;
  }

  return age > 0 ? age : null;
};

const sumBudgetMonthlyIncome = (budgetData?: BudgetData): number =>
  budgetData?.incomeSources.reduce((sum, source) => sum + source.amount, 0) ?? 0;

const getBudgetOutflowItems = (budgetData?: BudgetData) =>
  budgetData?.outflowCategories.flatMap((category) => category.items) ?? [];

const sumBudgetMonthlySavings = (budgetData?: BudgetData): number => {
  if (!budgetData) return 0;

  const savingsBankIds = new Set(
    budgetData.bankAccounts
      .filter((account) => SAVINGS_HINT.test(account.id) || SAVINGS_HINT.test(account.label))
      .map((account) => account.id),
  );

  const transferSavings = budgetData.allocations
    .filter((allocation) => savingsBankIds.has(allocation.toId))
    .reduce((sum, allocation) => sum + allocation.amount, 0);

  if (transferSavings > 0) return transferSavings;

  return getBudgetOutflowItems(budgetData)
    .filter((item) => SAVINGS_HINT.test(item.id) || SAVINGS_HINT.test(item.label))
    .reduce((sum, item) => sum + item.due, 0);
};

const sumBudgetMonthlyExpenses = (budgetData?: BudgetData): number =>
  getBudgetOutflowItems(budgetData)
    .filter((item) => !SAVINGS_HINT.test(item.id) && !SAVINGS_HINT.test(item.label))
    .reduce((sum, item) => sum + item.due, 0);

const deriveSyncedInputs = (
  user: User | null,
  portfolio?: Portfolio,
  budgetData?: BudgetData,
): SyncedMonteCarloInputs => {
  const monthlyIncome = sumBudgetMonthlyIncome(budgetData);
  const monthlySavings = sumBudgetMonthlySavings(budgetData);
  const monthlyExpenses = sumBudgetMonthlyExpenses(budgetData);

  const currentAge = calcAgeFromDob(user?.dateOfBirth) ?? null;
  const retirementAge =
    currentAge !== null && user?.yearsToRetirement
      ? currentAge + user.yearsToRetirement
      : null;

  const annualIncomeFromBudget = monthlyIncome > 0 ? monthlyIncome * 12 : null;
  const annualExpensesFromBudget = monthlyExpenses > 0 ? monthlyExpenses * 12 : null;
  const annualSavingsFromBudget = monthlySavings > 0 ? monthlySavings * 12 : null;
  const annualSavingsFromCashFlow =
    monthlyIncome > 0 ? Math.max(monthlyIncome - monthlyExpenses - monthlySavings, 0) * 12 : null;

  return {
    initialBalance: portfolio?.totalValue && portfolio.totalValue > 0 ? Math.round(portfolio.totalValue) : null,
    annualIncome: annualIncomeFromBudget ?? user?.annualIncome ?? null,
    annualExpenses: annualExpensesFromBudget,
    annualSavings: annualSavingsFromBudget ?? annualSavingsFromCashFlow,
    currentAge,
    retirementAge,
    planningAge: retirementAge !== null ? Math.max(retirementAge + 25, DEFAULT_REQUEST.planning_age ?? 90) : null,
    sources: {
      balance: portfolio?.totalValue ? 'portfolio' : undefined,
      income: annualIncomeFromBudget ? 'budget' : user?.annualIncome ? 'profile' : undefined,
      expenses: annualExpensesFromBudget ? 'budget' : undefined,
      savings: annualSavingsFromBudget ? 'budget savings flow' : annualSavingsFromCashFlow ? 'budget cash flow' : undefined,
      age: currentAge !== null ? 'profile date of birth' : undefined,
      retirement: retirementAge !== null ? 'profile retirement horizon' : undefined,
    },
  };
};

const mergeSyncedInputsIntoRequest = (
  prev: MonteCarloRequest,
  syncedInputs: SyncedMonteCarloInputs,
): MonteCarloRequest => ({
  ...prev,
  initial_balance: syncedInputs.initialBalance ?? prev.initial_balance,
  monthly_contribution:
    syncedInputs.annualSavings !== null
      ? Number((syncedInputs.annualSavings / 12).toFixed(2))
      : prev.monthly_contribution,
  annual_income: syncedInputs.annualIncome ?? prev.annual_income,
  annual_expenses: syncedInputs.annualExpenses ?? prev.annual_expenses,
  current_age: syncedInputs.currentAge ?? prev.current_age,
  retirement_age: syncedInputs.retirementAge ?? prev.retirement_age,
  planning_age: syncedInputs.planningAge ?? prev.planning_age,
  target_annual_income: syncedInputs.annualExpenses ?? prev.target_annual_income,
  use_cash_flow_contribution:
    syncedInputs.annualIncome !== null && syncedInputs.annualExpenses !== null
      ? true
      : prev.use_cash_flow_contribution,
});

/* ── Number input ──────────────────────────────────────────────────────── */
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
      <span className="block text-xs font-medium text-text-muted mb-1.5 uppercase tracking-wide">
        {label}
      </span>
      <div className="flex items-stretch rounded-lg border-2 border-dark-border bg-transparent focus-within:border-altrion-500 transition-colors">
        {prefix && (
          <span className="pl-3 pr-1.5 flex items-center text-text-muted text-sm">{prefix}</span>
        )}
        <input
          type="number"
          step={step}
          value={value ?? ''}
          onChange={(e) => onChange(Number(e.target.value))}
          className="w-full bg-transparent px-3 py-2.5 text-text-primary text-sm focus:outline-none"
        />
        {suffix && (
          <span className="pr-3 pl-1.5 flex items-center text-text-muted text-sm">{suffix}</span>
        )}
      </div>
    </label>
  );
}

/* ── Slider input ──────────────────────────────────────────────────────── */
function SliderField({
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
  format,
}: {
  label: string;
  value: number | undefined | null;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step?: number;
  format?: (v: number) => string;
}) {
  const current = value ?? min;
  const display = format ? format(current) : `${current}`;
  const pct = max > min ? Math.min(100, Math.max(0, ((current - min) / (max - min)) * 100)) : 0;
  return (
    <label className="block">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm text-text-secondary">{label}</span>
        <span className="text-sm font-semibold text-text-primary tabular-nums">{display}</span>
      </div>
      {/* Custom visible track: gray rail + green fill + thumb, with a transparent native range on top for interaction */}
      <div className="relative mt-3 h-2 w-full">
        <div className="absolute inset-0 rounded-full bg-dark-border" />
        <div className="absolute inset-y-0 left-0 rounded-full bg-altrion-500" style={{ width: `${pct}%` }} />
        <div
          className="pointer-events-none absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-altrion-500 bg-white shadow"
          style={{ left: `${pct}%` }}
        />
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={current}
          onChange={(e) => onChange(Number(e.target.value))}
          className="absolute inset-0 h-full w-full cursor-pointer appearance-none bg-transparent opacity-0"
        />
      </div>
    </label>
  );
}

/* ── Projection chart tooltip (percentile balances + life events) ───────── */
interface ProjectionRow {
  age: number;
  p10: number;
  p25: number;
  p50: number;
  p75: number;
  p90: number;
}
type EventMarker = { label: string; amount: number; kind: string };

function ProjectionTooltip({
  active,
  label,
  rawByAge,
  eventsByAge,
  retirementAge,
}: {
  active?: boolean;
  label?: string | number;
  rawByAge: Map<number, ProjectionRow>;
  eventsByAge: Map<number, EventMarker[]>;
  retirementAge: number;
}) {
  if (!active || label == null) return null;
  const age = Number(label);
  const row = rawByAge.get(age);
  if (!row) return null;
  const evs = eventsByAge.get(age) ?? [];
  const isRetire = age === retirementAge;

  const rows: { value: number; color: string; name: string }[] = [
    { value: row.p90, color: '#38bdf8', name: 'p90 (best 10%)' },
    { value: row.p75, color: '#06b6d4', name: 'p75' },
    { value: row.p50, color: '#10b981', name: 'Median' },
    { value: row.p25, color: '#06b6d4', name: 'p25' },
    { value: row.p10, color: '#38bdf8', name: 'p10 (worst 10%)' },
  ];

  return (
    <div className="rounded-lg border border-dark-border bg-[#0a0e1a] p-3 text-xs text-text-secondary shadow-lg">
      <p className="mb-1.5 font-semibold text-text-primary">Age {age}</p>
      <div className="space-y-1">
        {rows.map((r) => (
          <div key={r.name} className="flex items-center justify-between gap-4">
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full" style={{ background: r.color }} />
              {r.name}
            </span>
            <span className="font-medium text-text-primary">{fmtMoney(r.value)}</span>
          </div>
        ))}
      </div>
      {(evs.length > 0 || isRetire) && (
        <div className="mt-2 border-t border-dark-border pt-2">
          <p className="mb-1 text-[10px] uppercase tracking-wide text-altrion-300">Milestones</p>
          {isRetire && <p className="text-text-primary">Retirement begins</p>}
          {evs.map((e, i) => (
            <p key={i} className="flex items-center justify-between gap-4">
              <span className="text-text-primary">{e.label}</span>
              <span className={e.amount < 0 ? 'text-red-300' : 'text-emerald-300'}>
                {e.amount < 0 ? '-' : '+'}
                {fmtMoney(Math.abs(e.amount))}
              </span>
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Page ──────────────────────────────────────────────────────────────── */
export function MonteCarlo() {
  const user = useAuthStore(selectUser);
  const { data: portfolio } = usePortfolio();
  const { data: budgetData } = useBudgetData();
  const [request, setRequest] = useState<MonteCarloRequest>(DEFAULT_REQUEST);
  const [result, setResult] = useState<MonteCarloResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [activePlannerTab, setActivePlannerTab] = useState<PlannerTab>('profile');
  const [scenarios, setScenarios] = useState<SavedScenario[]>([]);
  const [selectedScenarioId, setSelectedScenarioId] = useState<string | null>(null);
  const [isScenarioPreviewOpen, setIsScenarioPreviewOpen] = useState(false);
  const [scenarioName, setScenarioName] = useState('');
  const [activePreset, setActivePreset] = useState<PresetKey>('baseline');
  const [prefillApplied, setPrefillApplied] = useState(false);
  const [hasManualEdits, setHasManualEdits] = useState(false);

  useEffect(() => {
    setScenarios(loadScenarios());
  }, []);

  useEffect(() => {
    if (scenarios.length === 0) {
      setSelectedScenarioId(null);
      return;
    }

    if (!selectedScenarioId || !scenarios.some((scenario) => scenario.id === selectedScenarioId)) {
      setSelectedScenarioId(scenarios[0].id);
    }
  }, [scenarios, selectedScenarioId]);

  const patch = (next: Partial<MonteCarloRequest>) => {
    setHasManualEdits(true);
    setRequest((prev) => ({ ...prev, ...next }));
  };

  const syncedInputs = useMemo(
    () => deriveSyncedInputs(user, portfolio, budgetData),
    [user, portfolio, budgetData],
  );

  const hasSyncedInputs = useMemo(
    () =>
      Object.values({
        initialBalance: syncedInputs.initialBalance,
        annualIncome: syncedInputs.annualIncome,
        annualExpenses: syncedInputs.annualExpenses,
        annualSavings: syncedInputs.annualSavings,
        currentAge: syncedInputs.currentAge,
        retirementAge: syncedInputs.retirementAge,
      }).some((value) => value !== null),
    [syncedInputs],
  );

  const annualSavings = useMemo(
    () => Math.round((request.monthly_contribution ?? 0) * 12),
    [request.monthly_contribution],
  );

  const savingsRate = useMemo(() => {
    if (!request.annual_income || request.annual_income <= 0) return null;
    return annualSavings / request.annual_income;
  }, [annualSavings, request.annual_income]);

  const monthlyFreeCash = useMemo(() => {
    if (request.annual_income == null || request.annual_expenses == null) return null;
    return (request.annual_income - request.annual_expenses - annualSavings) / 12;
  }, [annualSavings, request.annual_expenses, request.annual_income]);

  const yearsToRetirement = Math.max(request.retirement_age - request.current_age, 0);

  const incomeSources = useMemo(() => budgetData?.incomeSources ?? [], [budgetData]);
  const savingsAccounts = useMemo(
    () =>
      budgetData?.bankAccounts.filter(
        (account) => SAVINGS_HINT.test(account.id) || SAVINGS_HINT.test(account.label),
      ) ?? [],
    [budgetData],
  );
  const recurringExpenses = useMemo(
    () =>
      getBudgetOutflowItems(budgetData).filter(
        (item) => !SAVINGS_HINT.test(item.id) && !SAVINGS_HINT.test(item.label),
      ),
    [budgetData],
  );
  const selectedScenario = useMemo(
    () => scenarios.find((scenario) => scenario.id === selectedScenarioId) ?? null,
    [scenarios, selectedScenarioId],
  );

  const applySyncedData = (markAsManual = false) => {
    if (!hasSyncedInputs) return;

    if (markAsManual) {
      setHasManualEdits(true);
    }

    setRequest((prev) => mergeSyncedInputsIntoRequest(prev, syncedInputs));
    setPrefillApplied(true);
  };

  useEffect(() => {
    if (prefillApplied || hasManualEdits || !hasSyncedInputs) return;
    setRequest((prev) => mergeSyncedInputsIntoRequest(prev, syncedInputs));
    setPrefillApplied(true);
  }, [prefillApplied, hasManualEdits, hasSyncedInputs, syncedInputs]);

  const applyPreset = (preset: Preset) => {
    setActivePreset(preset.key);
    patch(preset.patch);
  };

  const addEvent = () => {
    patch({
      events: [
        ...(request.events ?? []),
        { age: request.current_age + 5, label: 'New event', kind: 'expense', amount: 10000 },
      ],
    });
  };

  const addEventTemplate = (template: EventTemplate) => {
    const age = Math.min(
      request.planning_age ?? DEFAULT_REQUEST.planning_age ?? 90,
      request.current_age + template.ageOffset,
    );
    patch({
      events: [
        ...(request.events ?? []),
        { age, label: template.label, kind: template.kind, amount: template.amount },
      ],
    });
    setActivePlannerTab('events');
  };

  const updateEvent = (idx: number, next: Partial<MonteCarloEvent>) => {
    const events = [...(request.events ?? [])];
    events[idx] = { ...events[idx], ...next };
    patch({ events });
  };

  const removeEvent = (idx: number) => {
    const events = [...(request.events ?? [])];
    events.splice(idx, 1);
    patch({ events });
  };

  const runIdRef = useRef(0);

  const runSimulation = async (req: MonteCarloRequest = request) => {
    const runId = ++runIdRef.current;
    setLoading(true);
    setError(null);
    try {
      const res = await analysisService.runMonteCarlo(req);
      if (runId === runIdRef.current) setResult(res);
    } catch (err) {
      if (runId === runIdRef.current) setError(err instanceof Error ? err.message : 'Simulation failed');
    } finally {
      if (runId === runIdRef.current) setLoading(false);
    }
  };

  // Keep the graph in sync with inputs/events: re-run the simulation (debounced)
  // whenever the request changes, so edits show up without a manual re-run.
  const debouncedRequest = useDebounce(request, 600);
  useEffect(() => {
    void runSimulation(debouncedRequest);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedRequest]);

  const saveCurrent = () => {
    if (!result) return;
    const name = scenarioName.trim() || `Scenario ${scenarios.length + 1}`;
    const next: SavedScenario = {
      id: `mc_${Date.now()}`,
      name,
      savedAt: new Date().toISOString(),
      request,
      result,
    };
    const updated = [next, ...scenarios].slice(0, 10);
    setScenarios(updated);
    setSelectedScenarioId(next.id);
    persistScenarios(updated);
    setScenarioName('');
  };

  const openScenarioPreview = (scenario: SavedScenario) => {
    setSelectedScenarioId(scenario.id);
    setIsScenarioPreviewOpen(true);
  };

  const loadScenario = (scenario: SavedScenario) => {
    setSelectedScenarioId(scenario.id);
    setHasManualEdits(true);
    setRequest(scenario.request);
    setResult(scenario.result);
  };

  const deleteScenario = (id: string) => {
    const updated = scenarios.filter((s) => s.id !== id);
    if (selectedScenarioId === id) {
      setIsScenarioPreviewOpen(false);
    }
    setScenarios(updated);
    persistScenarios(updated);
  };

  const cloneScenario = (scenario: SavedScenario) => {
    setSelectedScenarioId(scenario.id);
    setHasManualEdits(true);
    setRequest(scenario.request);
    setResult(null);
  };

  const chartData = useMemo(() => {
    if (!result?.timeline) return [];
    return result.timeline.map((band) => ({
      age: band.age,
      p10: band.p10,
      p25: band.p25,
      p50: band.p50,
      p75: band.p75,
      p90: band.p90,
    }));
  }, [result]);

  const [scaleMode, setScaleMode] = useState<'linear' | 'log'>('log');

  // Raw percentile values keyed by age (for the tooltip — unclamped).
  const rawByAge = useMemo(() => {
    const map = new Map<number, ProjectionRow>();
    chartData.forEach((d) => map.set(d.age, d));
    return map;
  }, [chartData]);

  // Life events keyed by age (name + signed amount), shown on hover.
  const eventsByAge = useMemo(() => {
    const map = new Map<number, EventMarker[]>();
    for (const ev of request.events ?? []) {
      const list = map.get(ev.age) ?? [];
      list.push({ label: ev.label || 'Event', amount: ev.amount, kind: ev.kind });
      map.set(ev.age, list);
    }
    return map;
  }, [request.events]);

  // Build the chart series. Linear mode draws a shaded p10–p90 / p25–p75 fan
  // (stacked areas from a transparent base). Log mode floors values to a positive
  // number (so log(0) does not break) and renders clean percentile lines.
  const displayData = useMemo(() => {
    const floor = scaleMode === 'log' ? (v: number) => Math.max(v, 1) : (v: number) => v;
    return chartData.map((d) => ({
      age: d.age,
      p10: floor(d.p10),
      p25: floor(d.p25),
      p50: floor(d.p50),
      p75: floor(d.p75),
      p90: floor(d.p90),
      base90: d.p10,
      band90: Math.max(d.p90 - d.p10, 0),
      base75: d.p25,
      band75: Math.max(d.p75 - d.p25, 0),
    }));
  }, [chartData, scaleMode]);

  // Life-event and retirement milestones to overlay on the projection chart.
  // Only ages that exist on the timeline (category axis) are rendered.
  const milestones = useMemo(() => {
    if (chartData.length === 0) return [];
    const ages = new Set(chartData.map((d) => d.age));
    const items: { age: number; label: string; color: string }[] = [];
    if (ages.has(request.retirement_age)) {
      items.push({ age: request.retirement_age, label: 'Retirement', color: '#f59e0b' });
    }
    for (const ev of request.events ?? []) {
      if (ages.has(ev.age)) {
        items.push({ age: ev.age, label: ev.label || 'Event', color: '#38bdf8' });
      }
    }
    return items;
  }, [chartData, request.retirement_age, request.events]);

  const successPct = result ? Math.round(result.success_probability * 100) : null;

  return (
    <DashboardLayout maxWidth="max-w-7xl">
      <div className="space-y-6 pb-12">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25 }}
          className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between"
        >
          <div>
            <h1 className="text-2xl sm:text-3xl font-semibold text-text-primary tracking-tight">
              Monte Carlo Retirement
            </h1>
            <p className="mt-1 text-sm text-text-secondary">
              Simulate thousands of return paths to see the range of retirement outcomes.
            </p>
          </div>
          <Button
            onClick={() => runSimulation()}
            disabled={loading}
            className="flex items-center gap-2"
          >
            {loading ? <Loader2 size={16} className="animate-spin" /> : <Play size={16} />}
            {loading ? 'Simulating…' : 'Run simulation'}
          </Button>
        </motion.div>

        {hasSyncedInputs && (
          <Card variant="bordered">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h2 className="text-sm font-semibold text-text-primary">Synced inputs</h2>
                <p className="mt-1 text-xs text-text-muted">
                  Monte Carlo can start from connected portfolio, budget, and profile data instead of manual-only inputs.
                </p>
                <p className="mt-2 text-[11px] text-text-muted">
                  {incomeSources.length} income stream{incomeSources.length === 1 ? '' : 's'} ·{' '}
                  {savingsAccounts.length} savings account{savingsAccounts.length === 1 ? '' : 's'} ·{' '}
                  {recurringExpenses.length} recurring expense{recurringExpenses.length === 1 ? '' : 's'} detected from synced data.
                </p>
              </div>
              <button
                type="button"
                onClick={() => applySyncedData(true)}
                className="inline-flex items-center gap-2 rounded-lg border border-altrion-500/30 bg-altrion-500/10 px-3 py-2 text-xs font-medium text-altrion-300 transition-colors hover:bg-altrion-500/20"
              >
                <RefreshCcw size={14} />
                Apply synced data
              </button>
            </div>

            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-lg border border-dark-border bg-dark-elevated/40 px-4 py-3">
                <p className="text-[11px] uppercase tracking-[0.16em] text-text-muted">Portfolio balance</p>
                <p className="mt-2 text-sm font-semibold text-text-primary">
                  {syncedInputs.initialBalance !== null ? fmtMoney(syncedInputs.initialBalance) : 'Unavailable'}
                </p>
                <p className="mt-1 text-[11px] text-text-muted">{syncedInputs.sources.balance ?? 'No connected assets'}</p>
              </div>
              <div className="rounded-lg border border-dark-border bg-dark-elevated/40 px-4 py-3">
                <p className="text-[11px] uppercase tracking-[0.16em] text-text-muted">Income</p>
                <p className="mt-2 text-sm font-semibold text-text-primary">
                  {syncedInputs.annualIncome !== null ? `${fmtMoney(syncedInputs.annualIncome)} / yr` : 'Unavailable'}
                </p>
                <p className="mt-1 text-[11px] text-text-muted">{syncedInputs.sources.income ?? 'No synced income source'}</p>
              </div>
              <div className="rounded-lg border border-dark-border bg-dark-elevated/40 px-4 py-3">
                <p className="text-[11px] uppercase tracking-[0.16em] text-text-muted">Expenses</p>
                <p className="mt-2 text-sm font-semibold text-text-primary">
                  {syncedInputs.annualExpenses !== null ? `${fmtMoney(syncedInputs.annualExpenses)} / yr` : 'Unavailable'}
                </p>
                <p className="mt-1 text-[11px] text-text-muted">{syncedInputs.sources.expenses ?? 'No synced expense source'}</p>
              </div>
              <div className="rounded-lg border border-dark-border bg-dark-elevated/40 px-4 py-3">
                <p className="text-[11px] uppercase tracking-[0.16em] text-text-muted">Savings</p>
                <p className="mt-2 text-sm font-semibold text-text-primary">
                  {syncedInputs.annualSavings !== null ? `${fmtMoney(syncedInputs.annualSavings)} / yr` : 'Unavailable'}
                </p>
                <p className="mt-1 text-[11px] text-text-muted">{syncedInputs.sources.savings ?? 'No synced savings flow'}</p>
              </div>
            </div>
          </Card>
        )}

        {/* Inputs */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <Card variant="bordered" className="lg:col-span-2">
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
                <div>
                  <h2 className="text-sm font-semibold text-text-primary">Plan inputs</h2>
                  <p className="mt-1 text-xs text-text-muted">
                    Based on the engineering guide: profile first, then income, savings, life events, and assumptions.
                  </p>
                </div>
                <div className="inline-flex flex-wrap gap-1 rounded-xl border border-dark-border bg-dark-elevated/40 p-1">
                  {PLANNER_TABS.map((tab) => (
                    <button
                      key={tab.key}
                      type="button"
                      onClick={() => setActivePlannerTab(tab.key)}
                      className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                        activePlannerTab === tab.key
                          ? 'bg-altrion-500/15 text-altrion-300'
                          : 'text-text-muted hover:text-text-primary'
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <div className="rounded-lg border border-dark-border bg-dark-elevated/40 px-4 py-3">
                  <p className="text-[11px] uppercase tracking-[0.16em] text-text-muted">Retirement horizon</p>
                  <p className="mt-2 text-sm font-semibold text-text-primary">{yearsToRetirement} years</p>
                  <p className="mt-1 text-[11px] text-text-muted">
                    Age {request.current_age} to {request.retirement_age}
                  </p>
                </div>
                <div className="rounded-lg border border-dark-border bg-dark-elevated/40 px-4 py-3">
                  <p className="text-[11px] uppercase tracking-[0.16em] text-text-muted">Savings rate</p>
                  <p className="mt-2 text-sm font-semibold text-text-primary">
                    {savingsRate !== null ? fmtPct(savingsRate, 0) : 'Unavailable'}
                  </p>
                  <p className="mt-1 text-[11px] text-text-muted">
                    {fmtMoney(annualSavings)} saved each year
                  </p>
                </div>
                <div className="rounded-lg border border-dark-border bg-dark-elevated/40 px-4 py-3">
                  <p className="text-[11px] uppercase tracking-[0.16em] text-text-muted">Monthly free cash</p>
                  <p className="mt-2 text-sm font-semibold text-text-primary">
                    {monthlyFreeCash !== null ? fmtMoney(monthlyFreeCash) : 'Unavailable'}
                  </p>
                  <p className="mt-1 text-[11px] text-text-muted">
                    Income minus expenses and savings
                  </p>
                </div>
                <div className="rounded-lg border border-dark-border bg-dark-elevated/40 px-4 py-3">
                  <p className="text-[11px] uppercase tracking-[0.16em] text-text-muted">Connected data</p>
                  <p className="mt-2 text-sm font-semibold text-text-primary">
                    {incomeSources.length + savingsAccounts.length + recurringExpenses.length} synced items
                  </p>
                  <p className="mt-1 text-[11px] text-text-muted">
                    Plugin-backed budget, account, and profile inputs
                  </p>
                </div>
              </div>

              {activePlannerTab === 'profile' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-5">
                  <SliderField
                    label="Current age"
                    value={request.current_age}
                    onChange={(v) => patch({ current_age: v })}
                    min={18}
                    max={80}
                    step={1}
                    format={(v) => `${v} yrs`}
                  />
                  <SliderField
                    label="Retirement age"
                    value={request.retirement_age}
                    onChange={(v) => patch({ retirement_age: v })}
                    min={40}
                    max={85}
                    step={1}
                    format={(v) => `${v} yrs`}
                  />
                  <SliderField
                    label="Planning age"
                    value={request.planning_age}
                    onChange={(v) => patch({ planning_age: v })}
                    min={70}
                    max={110}
                    step={1}
                    format={(v) => `${v} yrs`}
                  />
                  <SliderField
                    label="Initial balance"
                    value={request.initial_balance}
                    onChange={(v) => patch({ initial_balance: v })}
                    min={0}
                    max={2000000}
                    step={1000}
                    format={fmtMoney}
                  />
                </div>
              )}

              {activePlannerTab === 'income' && (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-5">
                    <SliderField
                      label="Annual gross income"
                      value={request.annual_income ?? 0}
                      onChange={(v) => patch({ annual_income: Math.max(0, v) })}
                      min={0}
                      max={1000000}
                      step={1000}
                      format={fmtMoney}
                    />
                    <SliderField
                      label="Retirement income target"
                      value={request.target_annual_income}
                      onChange={(v) => patch({ target_annual_income: v })}
                      min={0}
                      max={500000}
                      step={1000}
                      format={fmtMoney}
                    />
                    <SliderField
                      label="Annual income growth"
                      value={request.income_growth_rate}
                      onChange={(v) => patch({ income_growth_rate: v })}
                      min={0}
                      max={0.1}
                      step={0.005}
                      format={(v) => fmtPct(v, 1)}
                    />
                    <SliderField
                      label="Social Security / pension"
                      value={request.social_security_income}
                      onChange={(v) => patch({ social_security_income: v })}
                      min={0}
                      max={100000}
                      step={500}
                      format={(v) => `${fmtMoney(v)} / yr`}
                    />
                  </div>

                  <label className="flex items-start gap-2 text-sm text-text-secondary cursor-pointer">
                    <input
                      type="checkbox"
                      checked={request.use_cash_flow_contribution ?? false}
                      onChange={(e) => patch({ use_cash_flow_contribution: e.target.checked })}
                      className="mt-1 accent-altrion-500"
                    />
                    <span>
                      <span className="font-medium text-text-primary">
                        Derive contribution from cash flow
                      </span>
                      <span className="block text-text-muted text-xs">
                        Uses annual income minus annual expenses as the saved amount instead of the manual savings fields.
                      </span>
                    </span>
                  </label>

                  <div className="rounded-lg border border-dark-border bg-dark-elevated/40 px-4 py-3">
                    <p className="text-[11px] uppercase tracking-[0.16em] text-text-muted">Connected income streams</p>
                    {incomeSources.length > 0 ? (
                      <div className="mt-3 space-y-2">
                        {incomeSources.map((source) => (
                          <div key={source.id} className="flex items-center justify-between gap-3 text-sm">
                            <span className="text-text-secondary">{source.label}</span>
                            <span className="font-medium text-text-primary">{fmtMoney(source.amount)} / mo</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="mt-2 text-xs text-text-muted">
                        No recurring income streams were found in synced plugin data. Profile income will be used when available.
                      </p>
                    )}
                  </div>
                </>
              )}

              {activePlannerTab === 'savings' && (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-5">
                    <SliderField
                      label="Annual savings"
                      value={annualSavings}
                      onChange={(v) => patch({ monthly_contribution: Math.max(0, v / 12) })}
                      min={0}
                      max={300000}
                      step={1000}
                      format={fmtMoney}
                    />
                    <SliderField
                      label="Monthly savings"
                      value={request.monthly_contribution}
                      onChange={(v) => patch({ monthly_contribution: Math.max(0, v) })}
                      min={0}
                      max={25000}
                      step={50}
                      format={fmtMoney}
                    />
                    <SliderField
                      label="Annual expenses"
                      value={request.annual_expenses ?? 0}
                      onChange={(v) => patch({ annual_expenses: Math.max(0, v) })}
                      min={0}
                      max={500000}
                      step={1000}
                      format={fmtMoney}
                    />
                    <SliderField
                      label="Expense growth"
                      value={request.expense_growth_rate}
                      onChange={(v) => patch({ expense_growth_rate: v })}
                      min={0}
                      max={0.1}
                      step={0.005}
                      format={(v) => fmtPct(v, 1)}
                    />
                  </div>

                  <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                    <div className="rounded-lg border border-dark-border bg-dark-elevated/40 px-4 py-3">
                      <p className="text-[11px] uppercase tracking-[0.16em] text-text-muted">Savings accounts</p>
                      {savingsAccounts.length > 0 ? (
                        <div className="mt-3 space-y-2">
                          {savingsAccounts.map((account) => (
                            <div key={account.id} className="flex items-center justify-between gap-3 text-sm">
                              <span className="text-text-secondary">{account.label}</span>
                              <span className="font-medium text-text-primary">{fmtMoney(account.balance)}</span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="mt-2 text-xs text-text-muted">
                          No savings-style bank accounts were detected. Manual savings still remain editable above.
                        </p>
                      )}
                    </div>

                    <div className="rounded-lg border border-dark-border bg-dark-elevated/40 px-4 py-3">
                      <p className="text-[11px] uppercase tracking-[0.16em] text-text-muted">Recurring expenses</p>
                      {recurringExpenses.length > 0 ? (
                        <div className="mt-3 space-y-2">
                          {recurringExpenses.slice(0, 5).map((item) => (
                            <div key={item.id} className="flex items-center justify-between gap-3 text-sm">
                              <span className="text-text-secondary">{item.label}</span>
                              <span className="font-medium text-text-primary">{fmtMoney(item.due)} / mo</span>
                            </div>
                          ))}
                          {recurringExpenses.length > 5 && (
                            <p className="text-[11px] text-text-muted">
                              +{recurringExpenses.length - 5} more recurring expense items synced
                            </p>
                          )}
                        </div>
                      ) : (
                        <p className="mt-2 text-xs text-text-muted">
                          No recurring expense streams were found, so annual expenses can be entered manually here.
                        </p>
                      )}
                    </div>
                  </div>
                </>
              )}

              {activePlannerTab === 'events' && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-text-primary">Life events</p>
                      <p className="mt-1 text-xs text-text-muted">
                        Add persistent income or expense changes, retirement withdrawals, and one-time shocks.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={addEvent}
                      className="flex items-center gap-1 text-xs text-altrion-400 hover:text-altrion-300"
                    >
                      <Plus size={14} /> Add event
                    </button>
                  </div>

                  <div className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-3">
                    {EVENT_TEMPLATES.map((template) => (
                      <button
                        key={template.label}
                        type="button"
                        onClick={() => addEventTemplate(template)}
                        className="rounded-lg border border-dark-border bg-dark-elevated/40 p-3 text-left transition-colors hover:border-altrion-500/40 hover:bg-dark-elevated/70"
                      >
                        <p className="text-sm font-medium text-text-primary">{template.label}</p>
                        <p className="mt-1 text-[11px] leading-snug text-text-muted">
                          {template.description}
                        </p>
                      </button>
                    ))}
                  </div>

                  {(request.events?.length ?? 0) > 0 ? (
                    <div className="space-y-2">
                      {request.events!.map((ev, idx) => (
                        <div
                          key={idx}
                          className="grid grid-cols-12 gap-2 items-end p-2 bg-dark-elevated/40 rounded-lg border border-dark-border"
                        >
                          <div className="col-span-3">
                            <NumberField
                              label="Age"
                              value={ev.age}
                              onChange={(v) => updateEvent(idx, { age: v })}
                            />
                          </div>
                          <div className="col-span-3">
                            <span className="block text-xs font-medium text-text-muted mb-1.5 uppercase tracking-wide">
                              Kind
                            </span>
                            <select
                              value={ev.kind}
                              onChange={(e) =>
                                updateEvent(idx, { kind: e.target.value as MonteCarloEvent['kind'] })
                              }
                              className="w-full bg-dark-bg border-2 border-dark-border rounded-lg px-3 py-2.5 text-text-primary text-sm focus:outline-none focus:border-altrion-500"
                            >
                              {EVENT_KINDS.map((k) => (
                                <option key={k} value={k}>
                                  {k.replace('_', ' ')}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div className="col-span-3">
                            <span className="block text-xs font-medium text-text-muted mb-1.5 uppercase tracking-wide">
                              Label
                            </span>
                            <input
                              value={ev.label}
                              onChange={(e) => updateEvent(idx, { label: e.target.value })}
                              className="w-full bg-transparent border-2 border-dark-border focus:border-altrion-500 rounded-lg px-3 py-2.5 text-text-primary text-sm focus:outline-none"
                            />
                          </div>
                          <div className="col-span-2">
                            <NumberField
                              label="Amount"
                              value={ev.amount}
                              onChange={(v) => updateEvent(idx, { amount: v })}
                              prefix="$"
                            />
                          </div>
                          <button
                            type="button"
                            onClick={() => removeEvent(idx)}
                            className="col-span-1 flex items-center justify-center text-text-muted hover:text-red-400 h-12"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-text-muted">
                      No life events added yet. Use a template above or add a custom event to model real-world changes.
                    </p>
                  )}
                </div>
              )}

            </div>
          </Card>

          {/* Saved scenarios */}
          <Card variant="bordered">
            <div className="mb-3 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h2 className="text-sm font-semibold text-text-primary">Saved scenarios</h2>
                <p className="text-xs text-text-muted">Stored in this browser with local storage.</p>
              </div>
              {scenarios.length > 0 && (
                <span className="inline-flex w-fit rounded-full border border-altrion-500/25 bg-altrion-500/10 px-2 py-1 text-[11px] font-medium text-altrion-300">
                  {scenarios.length} local {scenarios.length === 1 ? 'scenario' : 'scenarios'}
                </span>
              )}
            </div>
            <div className="flex gap-2 mb-3">
              <input
                value={scenarioName}
                onChange={(e) => setScenarioName(e.target.value)}
                placeholder="Name this scenario"
                className="flex-1 bg-transparent border-2 border-dark-border focus:border-altrion-500 rounded-lg px-3 py-2 text-text-primary text-sm focus:outline-none"
              />
              <button
                onClick={saveCurrent}
                disabled={!result}
                className="flex items-center gap-1 px-3 py-2 rounded-lg bg-altrion-500/15 border border-altrion-500/30 text-altrion-300 text-xs font-medium hover:bg-altrion-500/25 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Save size={14} /> Save
              </button>
            </div>
            {scenarios.length === 0 ? (
              <p className="text-xs text-text-muted">
                Run a simulation, then save it to compare against later runs.
              </p>
            ) : (
              <ul className="space-y-2 max-h-72 overflow-y-auto">
                {scenarios.map((s) => (
                  <li
                    key={s.id}
                    className={`rounded-lg border p-2 transition-colors ${
                      selectedScenarioId === s.id
                        ? 'border-altrion-500/50 bg-altrion-500/10'
                        : 'border-dark-border bg-dark-elevated/40'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <button
                        type="button"
                        onClick={() => openScenarioPreview(s)}
                        className="flex-1 text-left"
                      >
                        <p className="text-sm font-medium text-text-primary truncate">{s.name}</p>
                        <p className="text-[11px] text-text-muted">
                          Success {Math.round(s.result.success_probability * 100)}% ·{' '}
                          {fmtMoney(s.result.summary.median_final_balance)} median
                        </p>
                        <p className="mt-1 text-[11px] text-text-muted">{fmtSavedAt(s.savedAt)}</p>
                      </button>
                      <button
                        type="button"
                        onClick={() => loadScenario(s)}
                        className="rounded-md border border-altrion-500/25 bg-altrion-500/10 px-2 py-1 text-[11px] font-medium text-altrion-300 transition-colors hover:bg-altrion-500/20"
                      >
                        Load
                      </button>
                      <button
                        type="button"
                        onClick={() => cloneScenario(s)}
                        title="Clone inputs"
                        className="text-text-muted hover:text-altrion-300"
                      >
                        <Copy size={14} />
                      </button>
                      <button
                        type="button"
                        onClick={() => deleteScenario(s.id)}
                        className="text-text-muted hover:text-red-400"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        {/* Presets */}
        <Card variant="bordered">
          <div className="flex items-center gap-2 mb-1">
            <Sparkles size={16} className="text-altrion-400" />
            <h2 className="text-sm font-semibold text-text-primary">Market scenario</h2>
          </div>
          <p className="mb-4 text-xs text-text-muted">
            Pick a regime to apply its return, volatility, and inflation assumptions, then run the simulation.
          </p>
          <div className="grid gap-5 sm:grid-cols-2">
            {PRESET_GROUPS.map((group) => (
              <div key={group.title} className="space-y-2">
                <p className="text-[11px] uppercase tracking-[0.16em] text-text-muted">{group.title}</p>
                <div className="grid grid-cols-2 gap-2">
                  {group.presets.map((preset) => (
                    <button
                      key={preset.key}
                      onClick={() => applyPreset(preset)}
                      title={preset.description}
                      className={`rounded-lg border px-3 py-2 text-left text-xs font-medium transition-colors ${
                        activePreset === preset.key
                          ? 'border-altrion-500 bg-altrion-500/10 text-text-primary'
                          : 'border-dark-border bg-dark-elevated/40 text-text-secondary hover:border-altrion-500/40'
                      }`}
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* Assumptions — fine-tune the regime applied by the presets above */}
          <div className="mt-6 border-t border-dark-border/80 pt-4">
            <p className="mb-1 text-[11px] uppercase tracking-[0.16em] text-text-muted">Assumptions</p>
            <p className="mb-4 text-xs text-text-muted">
              Presets set these for you — adjust the return, volatility, and inflation assumptions directly to refine the scenario.
            </p>
            <div className="grid grid-cols-1 gap-x-4 gap-y-5 sm:grid-cols-2 lg:grid-cols-3">
              <SliderField
                label="Iterations"
                value={request.n_iterations}
                onChange={(v) => patch({ n_iterations: Math.max(100, Math.min(10000, v)) })}
                min={100}
                max={10000}
                step={100}
                format={(v) => v.toLocaleString()}
              />
              <SliderField
                label="Mean return (pre-retire)"
                value={request.mean_return}
                onChange={(v) => patch({ mean_return: v })}
                min={-0.05}
                max={0.2}
                step={0.005}
                format={(v) => fmtPct(v, 1)}
              />
              <SliderField
                label="Return σ (pre-retire)"
                value={request.return_std}
                onChange={(v) => patch({ return_std: v })}
                min={0}
                max={0.4}
                step={0.01}
                format={(v) => fmtPct(v, 1)}
              />
              <SliderField
                label="Mean return (retire)"
                value={request.retirement_mean_return}
                onChange={(v) => patch({ retirement_mean_return: v })}
                min={-0.05}
                max={0.15}
                step={0.005}
                format={(v) => fmtPct(v, 1)}
              />
              <SliderField
                label="Return σ (retire)"
                value={request.retirement_return_std}
                onChange={(v) => patch({ retirement_return_std: v })}
                min={0}
                max={0.4}
                step={0.01}
                format={(v) => fmtPct(v, 1)}
              />
              <SliderField
                label="Mean inflation"
                value={request.mean_inflation}
                onChange={(v) => patch({ mean_inflation: v })}
                min={-0.02}
                max={0.15}
                step={0.005}
                format={(v) => fmtPct(v, 1)}
              />
              <SliderField
                label="Inflation σ"
                value={request.inflation_std}
                onChange={(v) => patch({ inflation_std: v })}
                min={0}
                max={0.1}
                step={0.005}
                format={(v) => fmtPct(v, 1)}
              />
            </div>
          </div>
        </Card>

        {/* Error */}
        {error && (
          <Card variant="bordered" className="border-red-500/40">
            <div className="flex items-start gap-2">
              <AlertTriangle className="text-red-400 mt-0.5" size={18} />
              <div>
                <p className="text-sm font-semibold text-red-300">Simulation error</p>
                <p className="text-xs text-text-muted mt-1">{error}</p>
              </div>
            </div>
          </Card>
        )}

        {/* Results */}
        {result && (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <Card variant="bordered">
                <p className="text-xs uppercase tracking-wider text-text-muted">
                  Success probability
                </p>
                <div className="mt-2 flex items-center gap-2">
                  <p className="text-3xl font-semibold text-text-primary">{successPct}%</p>
                  {successPct! >= 80 ? (
                    <CheckCircle2 className="text-emerald-400" size={20} />
                  ) : successPct! >= 50 ? (
                    <AlertTriangle className="text-amber-400" size={20} />
                  ) : (
                    <AlertTriangle className="text-red-400" size={20} />
                  )}
                </div>
                <p className="mt-1 text-xs text-text-muted">
                  Across {result.n_iterations.toLocaleString()} simulated paths.
                </p>
              </Card>
              <Card variant="bordered">
                <p className="text-xs uppercase tracking-wider text-text-muted">
                  Median final balance
                </p>
                <p className="mt-2 text-3xl font-semibold text-text-primary">
                  {fmtMoney(result.summary.median_final_balance)}
                </p>
                <p className="mt-1 text-xs text-text-muted">
                  Range: {fmtMoney(result.summary.p10_final_balance)} –{' '}
                  {fmtMoney(result.summary.p90_final_balance)} (p10–p90)
                </p>
              </Card>
              <Card variant="bordered">
                <p className="text-xs uppercase tracking-wider text-text-muted">
                  Earliest exhaustion
                </p>
                <p className="mt-2 text-3xl font-semibold text-text-primary">
                  {result.summary.exhaustion_by_percentile.p10_exhaustion_age ?? '—'}
                </p>
                <p className="mt-1 text-xs text-text-muted">
                  10th percentile of paths run out at this age (or never).
                </p>
              </Card>
            </div>

            <Card variant="bordered">
              <div className="mb-1 flex flex-wrap items-center justify-between gap-3">
                <h3 className="text-sm font-semibold text-text-primary">Balance projection</h3>
                <div className="inline-flex gap-1 rounded-lg border border-dark-border bg-dark-elevated/40 p-1">
                  {(['log', 'linear'] as const).map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setScaleMode(m)}
                      className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                        scaleMode === m
                          ? 'bg-altrion-500/15 text-altrion-300'
                          : 'text-text-muted hover:text-text-primary'
                      }`}
                    >
                      {m === 'log' ? 'Log $' : 'Linear $'}
                    </button>
                  ))}
                </div>
              </div>
              {/* Compact, on-theme legend */}
              <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-text-muted">
                <span className="flex items-center gap-1.5">
                  <span className="h-0.5 w-4 rounded-full bg-altrion-500" /> Median
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="h-2.5 w-3 rounded-sm bg-altrion-500/30" /> 50% range
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="h-2.5 w-3 rounded-sm bg-altrion-500/12" /> 80% range
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="h-3 w-0 border-l border-dashed border-sky-400" /> Life event
                </span>
                <span className="ml-auto hidden sm:inline">Hover any point for balances &amp; events</span>
              </div>
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={displayData} margin={{ top: 16, right: 12, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="mcBand90" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#10b981" stopOpacity={0.16} />
                        <stop offset="100%" stopColor="#10b981" stopOpacity={0.02} />
                      </linearGradient>
                      <linearGradient id="mcBand75" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#10b981" stopOpacity={0.34} />
                        <stop offset="100%" stopColor="#10b981" stopOpacity={0.08} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid stroke="#1f2937" strokeOpacity={0.6} vertical={false} />
                    <XAxis dataKey="age" stroke="#475569" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: '#94a3b8' }} tickMargin={8} />
                    <YAxis
                      stroke="#475569"
                      tickLine={false}
                      axisLine={false}
                      tick={{ fontSize: 11, fill: '#94a3b8' }}
                      tickFormatter={(v) => fmtMoney(v)}
                      width={64}
                      scale={scaleMode === 'log' ? 'log' : 'linear'}
                      domain={scaleMode === 'log' ? [1, 'auto'] : [0, 'auto']}
                      allowDataOverflow
                    />
                    <Tooltip
                      cursor={{ stroke: '#334155', strokeDasharray: '3 3' }}
                      content={
                        <ProjectionTooltip
                          rawByAge={rawByAge}
                          eventsByAge={eventsByAge}
                          retirementAge={request.retirement_age}
                        />
                      }
                    />
                    {milestones.map((m, i) => (
                      <ReferenceLine
                        key={`${m.age}-${i}`}
                        x={m.age}
                        stroke={m.color}
                        strokeDasharray="4 3"
                        strokeOpacity={0.7}
                      />
                    ))}
                    {scaleMode === 'linear' ? (
                      <>
                        {/* p10–p90 shaded band */}
                        <Area type="monotone" dataKey="base90" stackId="b90" stroke="none" fill="none" isAnimationActive={false} />
                        <Area type="monotone" dataKey="band90" stackId="b90" stroke="none" fill="url(#mcBand90)" isAnimationActive={false} />
                        {/* p25–p75 shaded band */}
                        <Area type="monotone" dataKey="base75" stackId="b75" stroke="none" fill="none" isAnimationActive={false} />
                        <Area type="monotone" dataKey="band75" stackId="b75" stroke="none" fill="url(#mcBand75)" isAnimationActive={false} />
                        <Area
                          type="monotone"
                          dataKey="p50"
                          stroke="#10b981"
                          strokeWidth={2.5}
                          fill="none"
                          name="Median"
                          dot={false}
                          activeDot={{ r: 4, fill: '#10b981', stroke: '#0a0e1a', strokeWidth: 2 }}
                        />
                      </>
                    ) : (
                      <>
                        <Area type="monotone" dataKey="p90" stroke="#38bdf8" strokeWidth={1} strokeOpacity={0.45} strokeDasharray="2 2" fill="none" dot={false} />
                        <Area type="monotone" dataKey="p75" stroke="#34d399" strokeWidth={1} strokeOpacity={0.7} strokeDasharray="4 3" fill="none" dot={false} />
                        <Area
                          type="monotone"
                          dataKey="p50"
                          stroke="#10b981"
                          strokeWidth={2.5}
                          fill="none"
                          dot={false}
                          activeDot={{ r: 4, fill: '#10b981', stroke: '#0a0e1a', strokeWidth: 2 }}
                        />
                        <Area type="monotone" dataKey="p25" stroke="#34d399" strokeWidth={1} strokeOpacity={0.7} strokeDasharray="4 3" fill="none" dot={false} />
                        <Area type="monotone" dataKey="p10" stroke="#38bdf8" strokeWidth={1} strokeOpacity={0.45} strokeDasharray="2 2" fill="none" dot={false} />
                      </>
                    )}
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </Card>

            <AiExplain
              kind="monte_carlo"
              title="Monte Carlo retirement simulation"
              hint="A plain-English read on these retirement outcomes — what the projection shows, why, and how much you'd end up with."
              context={{
                success_probability: result.success_probability,
                summary: result.summary,
                inputs: {
                  current_age: request.current_age,
                  retirement_age: request.retirement_age,
                  planning_age: request.planning_age,
                  initial_balance: request.initial_balance,
                  annual_income: request.annual_income,
                  annual_savings: annualSavings,
                  mean_return: request.mean_return,
                  return_std: request.return_std,
                  mean_inflation: request.mean_inflation,
                },
                events: request.events,
              }}
            />

            {scenarios.length > 0 && (
              <Card variant="bordered">
                <h3 className="text-sm font-semibold text-text-primary mb-3">
                  Comparison vs. saved scenarios
                </h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-text-muted text-xs uppercase tracking-wider">
                        <th className="pb-2 pr-4">Name</th>
                        <th className="pb-2 pr-4">Success</th>
                        <th className="pb-2 pr-4">Median final</th>
                        <th className="pb-2 pr-4">p10 final</th>
                        <th className="pb-2">Exhaust p10</th>
                      </tr>
                    </thead>
                    <tbody className="text-text-primary">
                      <tr className="border-t border-dark-border">
                        <td className="py-2 pr-4 font-medium text-altrion-300">Current run</td>
                        <td className="py-2 pr-4">{successPct}%</td>
                        <td className="py-2 pr-4">{fmtMoney(result.summary.median_final_balance)}</td>
                        <td className="py-2 pr-4">{fmtMoney(result.summary.p10_final_balance)}</td>
                        <td className="py-2">
                          {result.summary.exhaustion_by_percentile.p10_exhaustion_age ?? '—'}
                        </td>
                      </tr>
                      {scenarios.map((s) => (
                        <tr key={s.id} className="border-t border-dark-border">
                          <td className="py-2 pr-4">{s.name}</td>
                          <td className="py-2 pr-4">
                            {Math.round(s.result.success_probability * 100)}%
                          </td>
                          <td className="py-2 pr-4">
                            {fmtMoney(s.result.summary.median_final_balance)}
                          </td>
                          <td className="py-2 pr-4">
                            {fmtMoney(s.result.summary.p10_final_balance)}
                          </td>
                          <td className="py-2">
                            {s.result.summary.exhaustion_by_percentile.p10_exhaustion_age ?? '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            )}

            <Card variant="bordered">
              <h3 className="text-sm font-semibold text-text-primary mb-2">Narrative</h3>
              <p className="text-sm text-text-secondary leading-relaxed">
                {`Across ${result.n_iterations.toLocaleString()} simulated paths, your plan succeeds ${fmtPct(
                  result.success_probability,
                  0,
                )} of the time. The median path ends at ${fmtMoney(
                  result.summary.median_final_balance,
                )}, with a downside (p10) of ${fmtMoney(
                  result.summary.p10_final_balance,
                )} and an upside (p90) of ${fmtMoney(
                  result.summary.p90_final_balance,
                )}. ${
                  result.summary.exhaustion_by_percentile.p10_exhaustion_age
                    ? `In the worst 10% of outcomes, savings are exhausted by age ${result.summary.exhaustion_by_percentile.p10_exhaustion_age}.`
                    : 'No simulated path runs out of money during the planning horizon.'
                }`}
              </p>
            </Card>
          </>
        )}

        <AnimatePresence>
          {isScenarioPreviewOpen && selectedScenario && (
            <div className="fixed inset-0 z-50 flex items-center justify-center px-4 py-6">
              <motion.button
                type="button"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setIsScenarioPreviewOpen(false)}
                className="absolute inset-0 bg-[#06080F]/75 backdrop-blur-sm"
                aria-label="Close saved scenario preview"
              />

              <motion.div
                initial={{ opacity: 0, y: 14, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 14, scale: 0.97 }}
                transition={{ duration: 0.2 }}
                className="relative z-10 w-full max-w-5xl overflow-hidden rounded-2xl border border-dark-border bg-dark-card shadow-2xl"
              >
                <div className="flex items-start justify-between gap-4 border-b border-dark-border px-5 py-4">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-base font-semibold text-text-primary">{selectedScenario.name}</h3>
                      <span className="rounded-full border border-dark-border px-2 py-0.5 text-[11px] text-text-muted">
                        Local preview
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-text-muted">{fmtSavedAt(selectedScenario.savedAt)}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsScenarioPreviewOpen(false)}
                    className="rounded-lg border border-dark-border p-2 text-text-muted transition-colors hover:text-text-primary"
                    aria-label="Close preview"
                  >
                    <X size={16} />
                  </button>
                </div>

                <div className="max-h-[78vh] overflow-y-auto px-5 py-5">
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        loadScenario(selectedScenario);
                        setIsScenarioPreviewOpen(false);
                      }}
                      className="rounded-lg border border-altrion-500/30 bg-altrion-500/10 px-3 py-2 text-xs font-medium text-altrion-300 transition-colors hover:bg-altrion-500/20"
                    >
                      View in results
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        cloneScenario(selectedScenario);
                        setIsScenarioPreviewOpen(false);
                      }}
                      className="rounded-lg border border-dark-border px-3 py-2 text-xs font-medium text-text-secondary transition-colors hover:text-text-primary"
                    >
                      Clone inputs
                    </button>
                  </div>

                  <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-5">
                    <div className="rounded-lg border border-dark-border bg-dark-bg/40 px-3 py-3">
                      <p className="text-[11px] uppercase tracking-[0.16em] text-text-muted">Success</p>
                      <p className="mt-2 text-sm font-semibold text-text-primary">
                        {Math.round(selectedScenario.result.success_probability * 100)}%
                      </p>
                    </div>
                    <div className="rounded-lg border border-dark-border bg-dark-bg/40 px-3 py-3">
                      <p className="text-[11px] uppercase tracking-[0.16em] text-text-muted">Median final</p>
                      <p className="mt-2 text-sm font-semibold text-text-primary">
                        {fmtMoney(selectedScenario.result.summary.median_final_balance)}
                      </p>
                    </div>
                    <div className="rounded-lg border border-dark-border bg-dark-bg/40 px-3 py-3">
                      <p className="text-[11px] uppercase tracking-[0.16em] text-text-muted">Downside p10</p>
                      <p className="mt-2 text-sm font-semibold text-text-primary">
                        {fmtMoney(selectedScenario.result.summary.p10_final_balance)}
                      </p>
                    </div>
                    <div className="rounded-lg border border-dark-border bg-dark-bg/40 px-3 py-3">
                      <p className="text-[11px] uppercase tracking-[0.16em] text-text-muted">Exhaustion p10</p>
                      <p className="mt-2 text-sm font-semibold text-text-primary">
                        {selectedScenario.result.summary.exhaustion_by_percentile.p10_exhaustion_age ?? 'Never'}
                      </p>
                    </div>
                    <div className="rounded-lg border border-dark-border bg-dark-bg/40 px-3 py-3">
                      <p className="text-[11px] uppercase tracking-[0.16em] text-text-muted">Iterations</p>
                      <p className="mt-2 text-sm font-semibold text-text-primary">
                        {selectedScenario.result.n_iterations.toLocaleString()}
                      </p>
                    </div>
                  </div>

                  <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-2">
                    <div className="rounded-lg border border-dark-border bg-dark-bg/40 px-4 py-3">
                      <p className="text-[11px] uppercase tracking-[0.16em] text-text-muted">Input snapshot</p>
                      <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
                        <div>
                          <p className="text-text-muted">Initial balance</p>
                          <p className="mt-1 font-medium text-text-primary">
                            {fmtMoney(selectedScenario.request.initial_balance)}
                          </p>
                        </div>
                        <div>
                          <p className="text-text-muted">Monthly savings</p>
                          <p className="mt-1 font-medium text-text-primary">
                            {fmtMoney(selectedScenario.request.monthly_contribution)}
                          </p>
                        </div>
                        <div>
                          <p className="text-text-muted">Income</p>
                          <p className="mt-1 font-medium text-text-primary">
                            {selectedScenario.request.annual_income != null
                              ? `${fmtMoney(selectedScenario.request.annual_income)} / yr`
                              : '—'}
                          </p>
                        </div>
                        <div>
                          <p className="text-text-muted">Expenses</p>
                          <p className="mt-1 font-medium text-text-primary">
                            {selectedScenario.request.annual_expenses != null
                              ? `${fmtMoney(selectedScenario.request.annual_expenses)} / yr`
                              : '—'}
                          </p>
                        </div>
                        <div>
                          <p className="text-text-muted">Retirement window</p>
                          <p className="mt-1 font-medium text-text-primary">
                            {selectedScenario.request.current_age} to {selectedScenario.request.retirement_age}
                          </p>
                        </div>
                        <div>
                          <p className="text-text-muted">Planning age</p>
                          <p className="mt-1 font-medium text-text-primary">
                            {selectedScenario.request.planning_age ?? '—'}
                          </p>
                        </div>
                        <div>
                          <p className="text-text-muted">Target income</p>
                          <p className="mt-1 font-medium text-text-primary">
                            {fmtMoney(selectedScenario.request.target_annual_income)} / yr
                          </p>
                        </div>
                        <div>
                          <p className="text-text-muted">Cash-flow mode</p>
                          <p className="mt-1 font-medium text-text-primary">
                            {selectedScenario.request.use_cash_flow_contribution ? 'Derived from cash flow' : 'Manual contribution'}
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="rounded-lg border border-dark-border bg-dark-bg/40 px-4 py-3">
                      <p className="text-[11px] uppercase tracking-[0.16em] text-text-muted">Assumptions and events</p>
                      <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
                        <div>
                          <p className="text-text-muted">Mean return</p>
                          <p className="mt-1 font-medium text-text-primary">
                            {fmtPct(selectedScenario.request.mean_return ?? 0, 1)}
                          </p>
                        </div>
                        <div>
                          <p className="text-text-muted">Return sigma</p>
                          <p className="mt-1 font-medium text-text-primary">
                            {fmtPct(selectedScenario.request.return_std ?? 0, 1)}
                          </p>
                        </div>
                        <div>
                          <p className="text-text-muted">Inflation</p>
                          <p className="mt-1 font-medium text-text-primary">
                            {fmtPct(selectedScenario.request.mean_inflation ?? 0, 1)}
                          </p>
                        </div>
                        <div>
                          <p className="text-text-muted">Inflation sigma</p>
                          <p className="mt-1 font-medium text-text-primary">
                            {fmtPct(selectedScenario.request.inflation_std ?? 0, 1)}
                          </p>
                        </div>
                        <div>
                          <p className="text-text-muted">Retirement return</p>
                          <p className="mt-1 font-medium text-text-primary">
                            {fmtPct(selectedScenario.request.retirement_mean_return ?? 0, 1)}
                          </p>
                        </div>
                        <div>
                          <p className="text-text-muted">Event count</p>
                          <p className="mt-1 font-medium text-text-primary">
                            {(selectedScenario.request.events ?? []).length}
                          </p>
                        </div>
                      </div>
                      {(selectedScenario.request.events ?? []).length > 0 ? (
                        <div className="mt-3 space-y-2 border-t border-dark-border pt-3">
                          {(selectedScenario.request.events ?? []).slice(0, 3).map((event, index) => (
                            <div
                              key={`${selectedScenario.id}-event-${index}`}
                              className="flex items-start justify-between gap-3 text-xs"
                            >
                              <div>
                                <p className="font-medium text-text-primary">{event.label}</p>
                                <p className="mt-0.5 text-text-muted">
                                  Age {event.age} · {event.kind.replace('_', ' ')}
                                </p>
                              </div>
                              <span className="font-medium text-text-primary">{fmtMoney(event.amount)}</span>
                            </div>
                          ))}
                          {(selectedScenario.request.events ?? []).length > 3 && (
                            <p className="text-[11px] text-text-muted">
                              +{(selectedScenario.request.events ?? []).length - 3} more saved events
                            </p>
                          )}
                        </div>
                      ) : (
                        <p className="mt-3 border-t border-dark-border pt-3 text-xs text-text-muted">
                          No one-off income, expense, or withdrawal events were saved in this scenario.
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>
      </div>
    </DashboardLayout>
  );
}

export default MonteCarlo;
