import { memo } from 'react';
import { motion } from 'framer-motion';
import { TrendingUp, TrendingDown, Wallet, PiggyBank } from 'lucide-react';
import { ITEM_VARIANTS } from '@/constants';
import { Card } from '@/components/ui/Card';
import { fmtCurrency } from '@/constants/cashflow';
import type { CashFlowTransaction } from '@/types/cashflow.types';

interface KpiCardData {
  label: string;
  value: string;
  sub: string;
  icon: typeof TrendingUp;
  iconBg: string;
  iconColor: string;
  valueColor?: string;
  barPct: number;
  barColor: string;
}

interface KpiCardsProps {
  transactions: CashFlowTransaction[];
  income: number;
}

export const KpiCards = memo(function KpiCards({ transactions, income }: KpiCardsProps) {
  const savings = transactions
    .filter(t => t.catId === 'savings')
    .reduce((s, t) => s + Math.abs(t.amount), 0);
  const expenses = transactions
    .filter(t => t.amount < 0 && t.catId !== 'savings')
    .reduce((s, t) => s + Math.abs(t.amount), 0);
  const net = income - expenses - savings;
  const savingsPct = income > 0 ? parseFloat((savings / income * 100).toFixed(1)) : 0;
  const expPct    = income > 0 ? parseFloat((expenses / income * 100).toFixed(1)) : 0;
  const netPct    = income > 0 ? parseFloat(Math.abs(net / income * 100).toFixed(1)) : 0;

  const cards: KpiCardData[] = [
    {
      label: 'Income',
      value: income > 0 ? fmtCurrency(income) : '$0.00',
      sub: 'Monthly salary',
      icon: TrendingUp,
      iconBg: 'bg-emerald-500/20',
      iconColor: 'text-emerald-400',
      valueColor: 'text-emerald-400',
      barPct: 100,
      barColor: 'bg-emerald-500',
    },
    {
      label: 'Savings',
      value: fmtCurrency(savings),
      sub: income > 0 ? `${savingsPct}% of income` : '—',
      icon: PiggyBank,
      iconBg: 'bg-emerald-500/20',
      iconColor: 'text-emerald-400',
      valueColor: 'text-emerald-400',
      barPct: savingsPct,
      barColor: 'bg-emerald-500',
    },
    {
      label: 'Expenses',
      value: expenses > 0 ? `−${fmtCurrency(expenses)}` : '$0.00',
      sub: income > 0 ? `${expPct}% of income` : '—',
      icon: Wallet,
      iconBg: 'bg-amber-500/20',
      iconColor: 'text-amber-400',
      barPct: Math.min(expPct, 100),
      barColor: 'bg-amber-500',
    },
    {
      label: 'Net',
      value: income > 0 ? `${net >= 0 ? '+' : '−'}${fmtCurrency(net)}` : '$0.00',
      sub: income > 0 ? `${netPct}% ${net >= 0 ? 'surplus' : 'deficit'}` : '—',
      icon: net >= 0 ? TrendingUp : TrendingDown,
      iconBg: net >= 0 ? 'bg-emerald-500/20' : 'bg-red-500/20',
      iconColor: net >= 0 ? 'text-emerald-400' : 'text-red-400',
      valueColor: net >= 0 ? 'text-emerald-400' : 'text-red-400',
      barPct: Math.min(netPct * 4, 100),
      barColor: net >= 0 ? 'bg-emerald-500' : 'bg-red-500',
    },
  ];

  return (
    <motion.div variants={ITEM_VARIANTS}>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {cards.map((card) => {
          const Icon = card.icon;
          return (
            <Card key={card.label} variant="bordered" padding="sm">
              <div className="flex items-start justify-between mb-3">
                <div className={`w-9 h-9 rounded-xl ${card.iconBg} flex items-center justify-center`}>
                  <Icon size={18} className={card.iconColor} />
                </div>
              </div>
              <p className="text-xs text-text-muted font-medium uppercase tracking-wider mb-1">
                {card.label}
              </p>
              <p className={`font-display text-lg sm:text-2xl font-bold leading-tight ${card.valueColor || 'text-text-primary'}`}>
                {card.value}
              </p>
              <p className="text-xs text-text-muted mt-1">{card.sub}</p>
              <div className="h-[3px] bg-dark-elevated rounded-full mt-3 overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-700 ${card.barColor}`}
                  style={{ width: `${card.barPct}%` }}
                />
              </div>
            </Card>
          );
        })}
      </div>
    </motion.div>
  );
});
