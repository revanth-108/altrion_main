import { useState, useCallback, useMemo } from 'react';
import { motion } from 'framer-motion';
import { ChevronLeft, ChevronRight, CalendarDays } from 'lucide-react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { CONTAINER_VARIANTS, ITEM_VARIANTS } from '@/constants';
import {
  CASHFLOW_WEEKS,
  parseCashflowDay,
  buildIncomeSourcesFromTransactions,
  buildCategoriesFromTransactions,
  CASHFLOW_TRANSACTIONS,
  getTransactionsForMonth,
} from '@/constants/cashflow';
import { KpiCards } from './components/KpiCards';
import { SankeyChart } from './components/SankeyChart';
import { SankeyLegend } from './components/SankeyLegend';
import { TransactionsTable } from './components/TransactionsTable';
import { buildCategoriesFromPlaidTransactions, formatPlaidCategoryName } from '@/constants/cashflow';
import { usePlaidTransactions } from '@/hooks/queries/usePlaid';
import type { CashFlowTransaction } from '@/types/cashflow.types';
import type { PlaidTransactionsResponse } from '@/types';

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function daysInMonth(month: number, year: number) {
  return new Date(year, month, 0).getDate();
}

function toDateStr(year: number, month: number, day: number) {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

// Convert a Plaid transaction to CashFlowTransaction format for the overview table.
// Plaid: positive = debit (expense) → our convention: negative
// Plaid: negative = credit (income) → our convention: positive
function plaidToOverviewTxn(t: any): CashFlowTransaction {
  const d = new Date(t.date + 'T00:00:00');
  const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return {
    date: `${monthNames[d.getMonth()]} ${d.getDate()}`,
    month: d.getMonth() + 1,
    year: d.getFullYear(),
    desc: t.merchant_name || t.name || 'Unknown',
    cat: formatPlaidCategoryName(t.category_detailed || t.category_primary || 'OTHER'),
    catId: t.category_primary || 'OTHER',
    amount: t.amount > 0 ? -t.amount : Math.abs(t.amount),
    pfcP: t.category_primary || 'OTHER',
    pfcD: t.category_detailed || t.category_primary || 'OTHER',
  };
}

export function CashFlowOverview() {
  const now = new Date();
  const [selectedMonth, setSelectedMonth] = useState({ month: now.getMonth() + 1, year: now.getFullYear() });
  const [highlightedCat, setHighlightedCat] = useState<string | null>(null);
  const [selectedWeek, setSelectedWeek] = useState<string>('all');

  const handleHighlight = useCallback((catId: string | null) => setHighlightedCat(catId), []);

  const canGoNext = selectedMonth.year < now.getFullYear() ||
    (selectedMonth.year === now.getFullYear() && selectedMonth.month < now.getMonth() + 1);

  const goToPrev = useCallback(() => {
    setSelectedMonth(prev =>
      prev.month === 1
        ? { month: 12, year: prev.year - 1 }
        : { month: prev.month - 1, year: prev.year },
    );
  }, []);

  const goToNext = useCallback(() => {
    if (!canGoNext) return;
    setSelectedMonth(prev =>
      prev.month === 12
        ? { month: 1, year: prev.year + 1 }
        : { month: prev.month + 1, year: prev.year },
    );
  }, [canGoNext]);

  const startDate = toDateStr(selectedMonth.year, selectedMonth.month, 1);
  const endDate   = toDateStr(selectedMonth.year, selectedMonth.month, daysInMonth(selectedMonth.month, selectedMonth.year));

  const { data, isLoading } = usePlaidTransactions({ start_date: startDate, end_date: endDate }, true);

  const plaidTxns = useMemo<PlaidTransactionsResponse['transactions']>(() => {
    return data?.transactions ?? [];
  }, [data]);

  const usePlaid = plaidTxns.length > 0;

  // Demo fallback: when Plaid returns nothing, use the hardcoded CASHFLOW_TRANSACTIONS
  // so the Sankey + KPIs are populated. Prefer the selected month; fall back to all.
  const overviewTransactions = useMemo<CashFlowTransaction[]>(() => {
    if (usePlaid) return plaidTxns.map(plaidToOverviewTxn);
    const monthly = getTransactionsForMonth(selectedMonth.month, selectedMonth.year);
    return monthly.length > 0 ? monthly : CASHFLOW_TRANSACTIONS;
  }, [usePlaid, plaidTxns, selectedMonth]);

  const { categories, income } = useMemo(() => {
    if (usePlaid) {
      return buildCategoriesFromPlaidTransactions(plaidTxns);
    }
    const cats = buildCategoriesFromTransactions(overviewTransactions);
    const inc = overviewTransactions
      .filter(t => t.amount > 0)
      .reduce((s, t) => s + t.amount, 0);
    return { categories: cats, income: inc };
  }, [usePlaid, plaidTxns, overviewTransactions]);

  // Income sources for the new leftmost Sankey column. Derived from positive-amount
  // transactions, grouped by description (Paycheck, Tax Refund, Dividends, ...).
  const incomeSources = useMemo(
    () => buildIncomeSourcesFromTransactions(overviewTransactions),
    [overviewTransactions],
  );

  // Week-of-month filter applied on top of the month-scoped Plaid result.
  // KPI cards & sankey continue to use the full month; only the transactions table is week-filtered.
  const activeWeek = CASHFLOW_WEEKS.find(w => w.id === selectedWeek) ?? CASHFLOW_WEEKS[0];
  const filteredOverviewTransactions = useMemo(() => {
    if (activeWeek.id === 'all') return overviewTransactions;
    return overviewTransactions.filter(t => {
      const day = parseCashflowDay(t.date);
      return day >= activeWeek.start && day <= activeWeek.end;
    });
  }, [activeWeek, overviewTransactions]);

  const monthName = MONTH_NAMES[selectedMonth.month - 1];

  const lastDay   = daysInMonth(selectedMonth.month, selectedMonth.year);
  const dateRange = activeWeek.id === 'all'
    ? `${monthName.slice(0, 3)} 1 – ${monthName.slice(0, 3)} ${lastDay}, ${selectedMonth.year}`
    : `${activeWeek.label}, ${selectedMonth.year}`;

  return (
    <DashboardLayout maxWidth="">
      <motion.div
        variants={CONTAINER_VARIANTS}
        initial="hidden"
        animate="visible"
        className="space-y-6"
      >
        {/* Header */}
        <motion.div variants={ITEM_VARIANTS} className="flex items-end justify-between gap-3">
          <div>
            <h1 className="font-display text-2xl sm:text-4xl font-black leading-tight">
              <span className="text-text-primary">Cash Flow</span>
              <br />
              <span className="text-altrion-400">Overview</span>
            </h1>
            <p className="text-sm text-text-secondary mt-2">{dateRange}</p>
          </div>

          <div className="flex items-center gap-2 flex-wrap justify-end">
            {/* Month navigator */}
            <div className="flex items-center gap-1 px-2 py-1.5 rounded-lg bg-dark-elevated border border-dark-border">
              <button
                onClick={goToPrev}
                className="p-1 rounded-md hover:bg-dark-card transition-colors text-text-muted hover:text-text-primary"
                aria-label="Previous month"
              >
                <ChevronLeft size={15} />
              </button>
              <span className="text-xs text-text-muted font-medium px-2 min-w-[96px] text-center">
                {monthName} {selectedMonth.year}
              </span>
              <button
                onClick={goToNext}
                disabled={!canGoNext}
                className="p-1 rounded-md hover:bg-dark-card transition-colors text-text-muted hover:text-text-primary disabled:opacity-30 disabled:cursor-not-allowed"
                aria-label="Next month"
              >
                <ChevronRight size={15} />
              </button>
            </div>

            {/* Week-of-month dropdown */}
            <label className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-dark-elevated border border-dark-border cursor-pointer hover:border-dark-border-hover transition-colors">
              <CalendarDays size={14} className="text-text-muted" />
              <select
                value={selectedWeek}
                onChange={(e) => setSelectedWeek(e.target.value)}
                className="bg-transparent text-xs text-text-secondary font-medium focus:outline-none cursor-pointer"
              >
                {CASHFLOW_WEEKS.map(w => (
                  <option key={w.id} value={w.id} className="bg-dark-elevated">
                    {w.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </motion.div>

        {/* KPI Cards */}
        <KpiCards transactions={overviewTransactions} income={income} />

        {/* Sankey Diagram */}
        <SankeyChart
          categories={categories}
          income={income}
          incomeSources={incomeSources}
          highlightedCat={highlightedCat}
          onHighlight={handleHighlight}
          isLoading={isLoading}
        />

        {/* Legend */}
        <SankeyLegend
          categories={categories}
          income={income}
          highlightedCat={highlightedCat}
          onHighlight={handleHighlight}
        />

        {/* Transactions (week filter applied to month-scoped Plaid data) */}
        <TransactionsTable transactions={filteredOverviewTransactions} highlightedCat={highlightedCat} />
      </motion.div>
    </DashboardLayout>
  );
}
