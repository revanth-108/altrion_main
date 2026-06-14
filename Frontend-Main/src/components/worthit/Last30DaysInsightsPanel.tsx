import { motion } from 'framer-motion';
import { CheckCircle, TrendingDown, TrendingUp, Wallet, Sparkles } from 'lucide-react';
import { CONTAINER_VARIANTS, ITEM_VARIANTS } from '@/constants/animations';
import { Card } from '@/components/ui/Card';
import { formatCurrency } from '@/utils/formatters';
import type { Last30DaysInsights } from '@/types';

interface Last30DaysInsightsPanelProps {
  insights?: Last30DaysInsights;
  isLoading?: boolean;
}

export function Last30DaysInsightsPanel({ insights, isLoading }: Last30DaysInsightsPanelProps) {
  if (isLoading) {
    return (
      <motion.div variants={CONTAINER_VARIANTS} initial="hidden" animate="visible">
        <Card variant="bordered" padding="lg" className="border-dark-border bg-dark-card">
          <p className="text-sm text-text-muted">Building your 30-day insights...</p>
        </Card>
      </motion.div>
    );
  }

  if (!insights || insights.total_reviewed_count <= 0) {
    return (
      <motion.div variants={CONTAINER_VARIANTS} initial="hidden" animate="visible">
        <Card variant="bordered" padding="lg" className="border-dark-border bg-dark-card">
          <div className="flex flex-col items-center justify-center gap-3 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-dark-elevated text-altrion-400">
              <Sparkles size={26} />
            </div>
            <div>
              <h3 className="font-display text-xl font-black text-text-primary">Last 30 days</h3>
              <p className="mt-2 text-sm text-text-muted">
                Review transactions to unlock your 30-day insights.
              </p>
            </div>
          </div>
        </Card>
      </motion.div>
    );
  }

  return (
    <motion.div variants={CONTAINER_VARIANTS} initial="hidden" animate="visible" className="space-y-5">
      <motion.div variants={ITEM_VARIANTS}>
        <Card variant="bordered" padding="lg" className="overflow-hidden">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-altrion-500/20 bg-altrion-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-altrion-300">
                <Sparkles size={14} />
                Last 30 days
              </div>
              <h3 className="font-display text-2xl font-black text-text-primary">Rolling Worth It insights</h3>
              <p className="mt-2 max-w-3xl text-sm text-text-muted">{insights.summary_message}</p>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <TinyStat label="Reviewed" value={insights.total_reviewed_count} tone="slate" />
              <TinyStat label="Worth it" value={insights.keep_count} tone="emerald" />
              <TinyStat label="Not worth it" value={insights.cut_count} tone="rose" />
              <TinyStat label="Skipped" value={insights.skip_count} tone="amber" />
            </div>
          </div>
        </Card>
      </motion.div>

      <motion.div variants={ITEM_VARIANTS} className="grid gap-4 md:grid-cols-3">
        <MetricCard label="Kept amount" value={formatCurrency(insights.keep_total_amount)} tone="emerald" helper="What you felt good about" />
        <MetricCard label="Cut amount" value={formatCurrency(insights.cut_total_amount)} tone="rose" helper="What did not feel worth it" />
        <MetricCard label="Skipped amount" value={formatCurrency(insights.skip_total_amount)} tone="amber" helper="Reviewed, but neutral" />
      </motion.div>

      <motion.div variants={ITEM_VARIANTS} className="grid gap-6 lg:grid-cols-2">
        <TransactionCard
          title="What you felt good about"
          accent="emerald"
          emptyLabel="No kept transactions yet."
          transactions={insights.recent_happy_transactions}
        />
        <TransactionCard
          title="What did not feel worth it"
          accent="rose"
          emptyLabel="No cut transactions yet."
          transactions={insights.recent_not_happy_transactions}
        />
      </motion.div>

      <motion.div variants={ITEM_VARIANTS} className="grid gap-6 lg:grid-cols-[0.95fr_1.05fr]">
        <CategoryCard
          title="Top 3 categories you cut"
          accent="rose"
          categories={insights.top_cut_categories}
          emptyLabel="No cut categories yet."
        />
        <CategoryCard
          title="Top 3 categories you kept"
          accent="emerald"
          categories={insights.top_kept_categories}
          emptyLabel="No kept categories yet."
        />
      </motion.div>

      <motion.div variants={ITEM_VARIANTS} className="grid gap-6 md:grid-cols-2">
        <StandoutCard
          label="Biggest worth it purchase"
          accent="emerald"
          transaction={insights.biggest_kept_transaction}
          emptyLabel="No kept purchases yet."
        />
        <StandoutCard
          label="Biggest not worth it purchase"
          accent="rose"
          transaction={insights.biggest_cut_transaction}
          emptyLabel="No cut purchases yet."
        />
      </motion.div>
    </motion.div>
  );
}

function TinyStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: 'slate' | 'emerald' | 'rose' | 'amber';
}) {
  const tones = {
    slate: 'border-dark-border bg-dark-elevated text-text-primary',
    emerald: 'border-emerald-500/20 bg-emerald-500/10 text-emerald-300',
    rose: 'border-rose-500/20 bg-rose-500/10 text-rose-300',
    amber: 'border-amber-500/20 bg-amber-500/10 text-amber-300',
  };
  return (
    <div className={`rounded-2xl border px-4 py-3 text-center ${tones[tone]}`}>
      <p className="text-[10px] uppercase tracking-[0.16em] text-text-muted">{label}</p>
      <p className="mt-1 font-display text-xl font-black">{value}</p>
    </div>
  );
}

function MetricCard({
  label,
  value,
  tone,
  helper,
}: {
  label: string;
  value: string;
  tone: 'emerald' | 'rose' | 'amber';
  helper: string;
}) {
  const tones = {
    emerald: 'border-emerald-500/20 bg-emerald-500/5 text-emerald-300',
    rose: 'border-rose-500/20 bg-rose-500/5 text-rose-300',
    amber: 'border-amber-500/20 bg-amber-500/5 text-amber-300',
  };
  return (
    <Card variant="bordered" padding="lg" className={tones[tone]}>
      <p className="text-xs uppercase tracking-[0.14em] text-text-muted">{label}</p>
      <p className="mt-2 font-display text-2xl font-black text-text-primary">{value}</p>
      <p className="mt-1 text-xs text-text-muted">{helper}</p>
    </Card>
  );
}

function TransactionCard({
  title,
  accent,
  transactions,
  emptyLabel,
}: {
  title: string;
  accent: 'emerald' | 'rose';
  transactions: Last30DaysInsights['recent_happy_transactions'];
  emptyLabel: string;
}) {
  const wrapperClass = accent === 'emerald'
    ? 'border-emerald-500/20 bg-emerald-500/5'
    : 'border-rose-500/20 bg-rose-500/5';
  const dotClass = accent === 'emerald' ? 'bg-emerald-400' : 'bg-rose-400';
  return (
    <Card variant="bordered" padding="lg" className={wrapperClass}>
      <div className="mb-4 flex items-center gap-2">
        {accent === 'emerald' ? <CheckCircle size={18} className="text-emerald-300" /> : <TrendingDown size={18} className="text-rose-300" />}
        <h4 className="text-sm font-semibold text-text-secondary">{title}</h4>
      </div>
      {transactions.length === 0 ? (
        <p className="text-sm text-text-muted">{emptyLabel}</p>
      ) : (
        <div className="space-y-3">
          {transactions.slice(0, 5).map((tx) => (
            <div key={tx.id} className="flex items-center justify-between gap-3 rounded-2xl border border-dark-border bg-dark-elevated/60 px-4 py-3">
              <div className="flex min-w-0 items-center gap-3">
                <span className={`h-2.5 w-2.5 rounded-full ${dotClass}`} />
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-text-primary">{tx.merchant}</p>
                  <p className="truncate text-xs text-text-muted">{tx.category} · {tx.date}</p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-sm font-semibold text-text-primary">{formatCurrency(tx.amount)}</p>
                <p className="text-[10px] uppercase tracking-[0.14em] text-text-muted">{tx.description}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

function CategoryCard({
  title,
  accent,
  categories,
  emptyLabel,
}: {
  title: string;
  accent: 'emerald' | 'rose';
  categories: string[];
  emptyLabel: string;
}) {
  const wrapperClass = accent === 'emerald'
    ? 'border-emerald-500/20 bg-emerald-500/5'
    : 'border-rose-500/20 bg-rose-500/5';
  const pillClass = accent === 'emerald'
    ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-300'
    : 'border-rose-500/20 bg-rose-500/10 text-rose-300';

  return (
    <Card variant="bordered" padding="lg" className={wrapperClass}>
      <div className="mb-4 flex items-center gap-2">
        <TrendingUp size={18} className={accent === 'emerald' ? 'text-emerald-300' : 'text-rose-300'} />
        <h4 className="text-sm font-semibold text-text-secondary">{title}</h4>
      </div>
      {categories.length === 0 ? (
        <p className="text-sm text-text-muted">{emptyLabel}</p>
      ) : (
        <div className="space-y-2">
          {categories.slice(0, 3).map((category, index) => (
            <div key={category} className="flex items-center justify-between rounded-2xl border border-dark-border bg-dark-elevated/60 px-4 py-3">
              <p className="text-sm font-semibold text-text-primary">{category}</p>
              <span className={`rounded-full border px-3 py-1 text-[10px] font-bold uppercase tracking-[0.16em] ${pillClass}`}>
                #{index + 1}
              </span>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

function StandoutCard({
  label,
  accent,
  transaction,
  emptyLabel,
}: {
  label: string;
  accent: 'emerald' | 'rose';
  transaction: Last30DaysInsights['biggest_kept_transaction'];
  emptyLabel: string;
}) {
  const wrapperClass = accent === 'emerald'
    ? 'border-emerald-500/20 bg-emerald-500/5'
    : 'border-rose-500/20 bg-rose-500/5';
  const iconClass = accent === 'emerald' ? 'text-emerald-300' : 'text-rose-300';
  return (
    <Card variant="bordered" padding="lg" className={wrapperClass}>
      <div className="mb-4 flex items-center gap-2">
        <Wallet size={18} className={iconClass} />
        <h4 className="text-sm font-semibold text-text-secondary">{label}</h4>
      </div>
      {transaction ? (
        <div className="rounded-2xl border border-dark-border bg-dark-elevated/60 p-4">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="truncate text-base font-semibold text-text-primary">{transaction.merchant}</p>
              <p className="mt-1 text-xs text-text-muted">{transaction.category} · {transaction.date}</p>
              <p className={`mt-2 text-xs font-medium ${iconClass}`}>{transaction.description}</p>
            </div>
            <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-current/20 ${iconClass} bg-dark-card`}>
              {transaction.initial}
            </div>
          </div>
          <p className="mt-3 text-lg font-black text-text-primary">{formatCurrency(transaction.amount)}</p>
        </div>
      ) : (
        <p className="text-sm text-text-muted">{emptyLabel}</p>
      )}
    </Card>
  );
}
