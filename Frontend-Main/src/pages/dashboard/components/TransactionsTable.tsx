import { memo, useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { Receipt, Wallet } from 'lucide-react';
import { ITEM_VARIANTS } from '@/constants';
import { Card } from '@/components/ui/Card';
import {
  CASHFLOW_CATEGORIES,
  CASHFLOW_CAT_COLOR_MAP,
  CASHFLOW_ACCOUNTS,
  fmtCurrency,
} from '@/constants/cashflow';
import type { CashFlowTransaction } from '@/types/cashflow.types';

interface TransactionsTableProps {
  transactions: CashFlowTransaction[];
  highlightedCat: string | null;
}

const FILTERS = [
  { id: 'all', name: 'All' },
  ...CASHFLOW_CATEGORIES.map(c => ({ id: c.id, name: c.name })),
];

export const TransactionsTable = memo(function TransactionsTable({ transactions, highlightedCat }: TransactionsTableProps) {
  const [activeFilter, setActiveFilter] = useState('all');
  const [accountFilter, setAccountFilter] = useState<string>('all');

  const rows = useMemo(() => {
    let filtered = transactions;
    if (activeFilter !== 'all') {
      filtered = filtered.filter(t => t.catId === activeFilter);
    }
    if (accountFilter !== 'all') {
      filtered = filtered.filter(t => t.account === accountFilter);
    }
    return filtered;
  }, [transactions, activeFilter, accountFilter]);

  const summary = useMemo(() => {
    const income   = rows.filter(t => t.amount > 0).reduce((s, t) => s + t.amount, 0);
    const expenses = rows.filter(t => t.amount < 0).reduce((s, t) => s + Math.abs(t.amount), 0);
    return { income, expenses, net: income - expenses };
  }, [rows]);

  return (
    <motion.div variants={ITEM_VARIANTS}>
      <Card variant="bordered" padding="none">
        {/* Header */}
        <div className="p-4 sm:p-6 pb-0">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-altrion-500/20 flex items-center justify-center">
                <Receipt size={20} className="text-altrion-400" />
              </div>
              <div>
                <h2 className="font-display text-xl font-semibold text-text-primary">Transactions</h2>
                <p className="text-xs text-text-muted">
                  {rows.length} transaction{rows.length !== 1 ? 's' : ''}
                </p>
              </div>
            </div>
          </div>

          {/* Filter row: category tabs + account dropdown */}
          <div className="flex flex-wrap gap-2 items-center">
            <div className="flex gap-1 bg-dark-elevated p-1 rounded-lg overflow-x-auto flex-1 min-w-0">
              {FILTERS.map(f => (
                <button
                  key={f.id}
                  onClick={() => setActiveFilter(f.id)}
                  className={`px-4 py-1.5 rounded-md text-sm font-medium whitespace-nowrap transition-all ${
                    activeFilter === f.id
                      ? 'bg-dark-card text-text-primary'
                      : 'text-text-muted hover:text-text-secondary'
                  }`}
                >
                  {f.name}
                </button>
              ))}
            </div>
            <label className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-dark-elevated border border-dark-border cursor-pointer hover:border-dark-border-hover transition-colors shrink-0">
              <Wallet size={14} className="text-text-muted" />
              <select
                value={accountFilter}
                onChange={(e) => setAccountFilter(e.target.value)}
                className="bg-transparent text-sm text-text-secondary font-medium focus:outline-none cursor-pointer"
              >
                <option value="all" className="bg-dark-elevated">All accounts</option>
                {CASHFLOW_ACCOUNTS.map(a => (
                  <option key={a} value={a} className="bg-dark-elevated">{a}</option>
                ))}
              </select>
            </label>
          </div>
        </div>

        {/* Table or empty state */}
        {rows.length === 0 ? (
          <div className="flex items-center justify-center py-16 text-text-muted text-sm">
            No transactions for this period
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-dark-border">
                  <th className="font-display text-left text-text-muted text-sm font-medium px-4 sm:px-6 py-3 w-[100px]">Date</th>
                  <th className="font-display text-left text-text-muted text-sm font-medium px-4 sm:px-6 py-3">Description</th>
                  <th className="font-display text-left text-text-muted text-sm font-medium px-4 sm:px-6 py-3 w-[140px]">Category</th>
                  <th className="font-display text-left text-text-muted text-sm font-medium px-4 sm:px-6 py-3 w-[140px]">Account</th>
                  <th className="font-display text-left text-text-muted text-sm font-medium px-4 sm:px-6 py-3 w-[200px]">PFC Code</th>
                  <th className="font-display text-right text-text-muted text-sm font-medium px-4 sm:px-6 py-3 w-[120px]">Amount</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((t, i) => {
                  const color = CASHFLOW_CAT_COLOR_MAP[t.catId] || '#9E9690';
                  const pos = t.amount > 0;
                  const dimmed = !!highlightedCat && highlightedCat !== t.catId;

                  return (
                    <tr
                      key={`${t.date}-${t.desc}-${i}`}
                      className="border-b border-dark-border/50 hover:bg-dark-elevated/50 transition-all duration-200"
                      style={{ opacity: dimmed ? 0.12 : 1 }}
                    >
                      <td className="text-sm text-text-muted px-4 sm:px-6 py-3">{t.date}</td>
                      <td className="text-sm text-text-primary font-medium px-4 sm:px-6 py-3">
                        <span className="inline-block w-2 h-2 rounded-full mr-2.5 align-middle" style={{ background: color }} />
                        {t.desc}
                      </td>
                      <td className="text-xs text-text-secondary px-4 sm:px-6 py-3">{t.cat}</td>
                      <td className="px-4 sm:px-6 py-3">
                        <span className="text-xs text-text-secondary">{t.account ?? '—'}</span>
                      </td>
                      <td className="px-4 sm:px-6 py-3">
                        <span className="inline-flex items-center text-[10px] font-semibold uppercase tracking-wider text-text-muted bg-dark-elevated border border-dark-border rounded-full px-2.5 py-0.5 whitespace-nowrap">
                          {t.pfcD.replace(/_/g, ' ')}
                        </span>
                      </td>
                      <td className={`text-sm font-semibold px-4 sm:px-6 py-3 text-right ${pos ? 'text-green-400' : 'text-text-primary'}`}>
                        {pos ? '+' : '−'}{fmtCurrency(t.amount)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Summary */}
        <div className="flex gap-8 sm:gap-12 flex-wrap p-4 sm:p-6 border-t border-dark-border">
          <div className="flex flex-col gap-1">
            <span className="text-xs text-text-muted font-medium uppercase tracking-wider">Income</span>
            <span className="font-display text-lg sm:text-2xl font-bold text-green-400">
              +{fmtCurrency(summary.income)}
            </span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs text-text-muted font-medium uppercase tracking-wider">Expenses</span>
            <span className="font-display text-lg sm:text-2xl font-bold text-text-primary">
              −{fmtCurrency(summary.expenses)}
            </span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs text-text-muted font-medium uppercase tracking-wider">Net</span>
            <span className={`font-display text-lg sm:text-2xl font-bold ${summary.net >= 0 ? 'text-green-400' : 'text-red-400'}`}>
              {summary.net >= 0 ? '+' : '−'}{fmtCurrency(summary.net)}
            </span>
          </div>
        </div>
      </Card>
    </motion.div>
  );
});
