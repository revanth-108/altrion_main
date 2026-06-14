import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import {
  CheckCircle,
  AlertTriangle,
  MinusCircle,
  ArrowLeft,
  Sparkles,
  TrendingDown,
  TrendingUp,
  Wallet,
} from 'lucide-react';
import { ROUTES } from '@/constants';
import { CONTAINER_VARIANTS, ITEM_VARIANTS } from '@/constants/animations';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { formatCurrency } from '@/utils/formatters';
import type { InsightsData } from '@/types';
import type { ReactNode } from 'react';

interface SessionInsightsProps {
  keepCount?: number;
  cutCount?: number;
  skipCount?: number;
  ratedCount?: number;
  insights?: InsightsData;
  title?: string;
  subtitle?: string;
  backRoute?: string;
  backLabel?: string;
  primaryCtaRoute?: string;
  primaryCtaLabel?: string;
  secondaryCtaRoute?: string;
  secondaryCtaLabel?: string;
}

export function SessionInsights({
  keepCount,
  cutCount,
  skipCount,
  ratedCount,
  insights,
  title = 'Your Worth It insights',
  subtitle = 'See what felt worth it and what did not.',
  backRoute = ROUTES.DASHBOARD,
  backLabel = 'Back to Dashboard',
  primaryCtaRoute = ROUTES.WORTH_IT_HISTORY,
  primaryCtaLabel = 'View Past Sessions',
  secondaryCtaRoute,
  secondaryCtaLabel,
}: SessionInsightsProps) {
  const navigate = useNavigate();
  const hasInsights = Boolean(insights && insights.total_reviewed_count > 0);
  const totalReviewed = insights?.total_reviewed_count ?? (keepCount ?? 0) + (cutCount ?? 0) + (skipCount ?? 0);
  const happyCount = insights?.keep_count ?? keepCount ?? 0;
  const notHappyCount = insights?.cut_count ?? cutCount ?? 0;
  const neutralCount = insights?.skip_count ?? skipCount ?? 0;
  const happyAmount = insights?.keep_total_amount ?? 0;
  const notHappyAmount = insights?.cut_total_amount ?? 0;
  const neutralAmount = insights?.skip_total_amount ?? 0;
  const isLoadingInsights = !insights && totalReviewed > 0;
  const summaryMessage = insights?.summary_message
    ?? (totalReviewed > 0
      ? `You reviewed ${totalReviewed} transactions.`
      : 'Review a few transactions first, then your insights will appear here.');

  if (isLoadingInsights) {
    return (
      <motion.div
        variants={CONTAINER_VARIANTS}
        initial="hidden"
        animate="visible"
        className="flex min-h-[calc(100vh-8rem)] items-center justify-center px-4 py-6"
      >
        <Card variant="bordered" padding="lg" className="w-full max-w-xl text-center">
          <div className="mx-auto h-12 w-12 animate-pulse rounded-full bg-dark-elevated" />
          <p className="mt-4 text-sm text-text-muted">Building your insights...</p>
        </Card>
      </motion.div>
    );
  }

  if (!hasInsights) {
    return (
      <motion.div
        variants={CONTAINER_VARIANTS}
        initial="hidden"
        animate="visible"
        className="flex min-h-[calc(100vh-8rem)] items-center justify-center px-4 py-6"
      >
        <Card variant="bordered" padding="lg" className="w-full max-w-xl">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-dark-elevated">
            <Sparkles size={30} className="text-altrion-400" />
          </div>
          <h1 className="mt-5 text-center font-display text-3xl font-black text-text-primary">
            Insights will appear here
          </h1>
          <p className="mx-auto mt-3 max-w-md text-center text-sm text-text-muted">
            Review a few transactions first, then your insights will appear here.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Button onClick={() => navigate(backRoute)} variant="ghost" fullWidth>
              {backLabel}
            </Button>
            <Button onClick={() => navigate(ROUTES.WORTH_IT)} variant="primary" fullWidth>
              Review Transactions
            </Button>
          </div>
        </Card>
      </motion.div>
    );
  }

  return (
    <motion.div
      variants={CONTAINER_VARIANTS}
      initial="hidden"
      animate="visible"
      className="min-h-[calc(100vh-8rem)] px-4 py-6 lg:px-8 lg:py-8"
    >
      <div className="mx-auto w-full max-w-6xl space-y-6">
        <motion.div variants={ITEM_VARIANTS} className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-altrion-500/20 bg-altrion-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-altrion-300">
              <Sparkles size={14} />
              Worth It insights
            </div>
            <h1 className="font-display text-3xl font-black text-text-primary">{title}</h1>
            <p className="mt-2 max-w-2xl text-sm text-text-muted">{subtitle}</p>
          </div>
          <div className="flex items-center gap-3">
            {ratedCount !== undefined && ratedCount > 0 && (
              <div className="rounded-2xl border border-dark-border bg-dark-card px-4 py-3 text-right">
                <p className="text-xs uppercase tracking-[0.16em] text-text-muted">Reviewed</p>
                <p className="font-display text-2xl font-black text-text-primary">{ratedCount}</p>
              </div>
            )}
            <Button onClick={() => navigate(backRoute)} variant="ghost">
              <ArrowLeft size={16} />
              {backLabel}
            </Button>
          </div>
        </motion.div>

        <motion.div variants={ITEM_VARIANTS}>
          <Card variant="bordered" padding="lg" className="overflow-hidden">
            <div className="grid gap-6 lg:grid-cols-[1.4fr_0.9fr]">
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-altrion-500/10 text-altrion-400">
                    <CheckCircle size={22} />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-text-secondary">Friendly summary</p>
                    <p className="text-xs text-text-muted">Generated from the transactions you actually reviewed.</p>
                  </div>
                </div>
                <p className="max-w-3xl text-lg font-medium leading-8 text-text-primary">{summaryMessage}</p>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <StatTile
                  label="Happy"
                  value={happyCount}
                  amount={happyAmount}
                  accent="text-emerald-400"
                  bg="bg-emerald-500/10"
                  iconBg="bg-emerald-500/15 text-emerald-400"
                  icon={<CheckCircle size={18} />}
                />
                <StatTile
                  label="Not worth it"
                  value={notHappyCount}
                  amount={notHappyAmount}
                  accent="text-rose-400"
                  bg="bg-rose-500/10"
                  iconBg="bg-rose-500/15 text-rose-400"
                  icon={<TrendingDown size={18} />}
                />
                <StatTile
                  label="Neutral"
                  value={neutralCount}
                  amount={neutralAmount}
                  accent="text-amber-300"
                  bg="bg-amber-500/10"
                  iconBg="bg-amber-500/15 text-amber-300"
                  icon={<MinusCircle size={18} />}
                />
              </div>
            </div>
          </Card>
        </motion.div>

        <motion.div variants={ITEM_VARIANTS} className="grid gap-4 md:grid-cols-3">
          <MetricCard
            label="Kept amount"
            value={formatCurrency(happyAmount)}
            helper={`${happyCount} worth it purchases`}
            tone="emerald"
          />
          <MetricCard
            label="Cut amount"
            value={formatCurrency(notHappyAmount)}
            helper={`${notHappyCount} not worth it purchases`}
            tone="rose"
          />
          <MetricCard
            label="Skipped amount"
            value={formatCurrency(neutralAmount)}
            helper={`${neutralCount} neutral reviews`}
            tone="amber"
          />
        </motion.div>

        <motion.div variants={ITEM_VARIANTS} className="grid gap-6 lg:grid-cols-2">
          <InsightListCard
            title="Happy transactions"
            subtitle="What you were glad to keep."
            accent="emerald"
            emptyLabel="No happy transactions yet."
            transactions={insights?.recent_happy_transactions ?? []}
            totalLabel={formatCurrency(happyAmount)}
          />
          <InsightListCard
            title="Not worth it"
            subtitle="What felt disappointing or unnecessary."
            accent="rose"
            emptyLabel="No not-worth-it transactions yet."
            transactions={insights?.recent_not_happy_transactions ?? []}
            totalLabel={formatCurrency(notHappyAmount)}
          />
        </motion.div>

        <motion.div variants={ITEM_VARIANTS} className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
          <Card variant="bordered" padding="lg">
            <div className="mb-4 flex items-center gap-2">
              <Wallet size={18} className="text-text-secondary" />
              <h3 className="text-sm font-semibold text-text-secondary">Standout purchases</h3>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <StandoutTransaction
                label="Biggest worth it"
                tone="emerald"
                transaction={insights?.biggest_kept_transaction ?? null}
                emptyLabel="No kept transactions yet."
              />
              <StandoutTransaction
                label="Biggest not worth it"
                tone="rose"
                transaction={insights?.biggest_cut_transaction ?? null}
                emptyLabel="No cut transactions yet."
              />
            </div>
          </Card>

          <Card variant="bordered" padding="lg">
            <div className="mb-4 flex items-center gap-2">
              <TrendingUp size={18} className="text-text-secondary" />
              <h3 className="text-sm font-semibold text-text-secondary">Top categories</h3>
            </div>
            <div className="space-y-4">
              <CategoryBand
                title="Kept most"
                accent="emerald"
                categories={insights?.top_kept_categories ?? []}
                emptyLabel="No kept categories yet."
              />
              <CategoryBand
                title="Cut most"
                accent="rose"
                categories={insights?.top_cut_categories ?? []}
                emptyLabel="No cut categories yet."
              />
            </div>
          </Card>
        </motion.div>

        {insights?.category_breakdown && Object.keys(insights.category_breakdown).length > 0 && (
          <motion.div variants={ITEM_VARIANTS}>
            <Card variant="bordered" padding="lg">
              <div className="mb-4 flex items-center gap-2">
                <AlertTriangle size={18} className="text-text-secondary" />
                <h3 className="text-sm font-semibold text-text-secondary">Category breakdown</h3>
              </div>
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {Object.entries(insights.category_breakdown).map(([category, data]) => {
                  const total = data.keep_count + data.cut_count + data.skip_count;
                  const keepPct = total > 0 ? (data.keep_count / total) * 100 : 0;
                  const cutPct = total > 0 ? (data.cut_count / total) * 100 : 0;
                  const skipPct = total > 0 ? (data.skip_count / total) * 100 : 0;
                  return (
                    <div key={category} className="rounded-2xl border border-dark-border bg-dark-elevated/60 p-4">
                      <div className="mb-3 flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-text-primary">{category}</p>
                          <p className="text-xs text-text-muted">{total} reviewed</p>
                        </div>
                        <p className="text-sm font-semibold text-text-secondary">{formatCurrency(data.total_amount)}</p>
                      </div>
                      <div className="flex h-2 overflow-hidden rounded-full bg-dark-card">
                        {keepPct > 0 && <div className="bg-emerald-400" style={{ width: `${keepPct}%` }} />}
                        {cutPct > 0 && <div className="bg-rose-400" style={{ width: `${cutPct}%` }} />}
                        {skipPct > 0 && <div className="bg-amber-400" style={{ width: `${skipPct}%` }} />}
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>
          </motion.div>
        )}

        <motion.div variants={ITEM_VARIANTS}>
          <Card variant="bordered" padding="lg" className="!bg-altrion-500/5 !border-altrion-500/20">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="text-sm font-semibold text-text-secondary">What you learned</p>
                <p className="mt-1 text-sm text-text-muted">
                  Your keep and cut patterns help show what spending feels worth it and what does not.
                </p>
              </div>
              <div className="flex gap-2">
                <Badge label={`${insights?.week_over_week_trend ?? 'stable'}`} />
                {insights?.recurring_cuts?.length ? <Badge label="Recurring cuts spotted" tone="amber" /> : null}
              </div>
            </div>
          </Card>
        </motion.div>

        <motion.div variants={ITEM_VARIANTS} className="flex flex-col gap-3 sm:flex-row">
          <Button onClick={() => navigate(backRoute)} variant="ghost" fullWidth>
            {backLabel}
          </Button>
          <Button onClick={() => navigate(primaryCtaRoute)} variant="primary" fullWidth>
            {primaryCtaLabel}
          </Button>
          {secondaryCtaRoute && secondaryCtaLabel && (
            <Button onClick={() => navigate(secondaryCtaRoute)} variant="secondary" fullWidth>
              {secondaryCtaLabel}
            </Button>
          )}
        </motion.div>
      </div>
    </motion.div>
  );
}

function StatTile({
  label,
  value,
  amount,
  accent,
  bg,
  iconBg,
  icon,
}: {
  label: string;
  value: number;
  amount: number;
  accent: string;
  bg: string;
  iconBg: string;
  icon: ReactNode;
}) {
  return (
    <div className={`rounded-2xl border border-dark-border p-4 ${bg}`}>
      <div className={`mb-3 flex h-9 w-9 items-center justify-center rounded-full border border-current/10 ${iconBg}`}>
        {icon}
      </div>
      <p className="text-xs uppercase tracking-[0.14em] text-text-muted">{label}</p>
      <p className={`mt-1 text-2xl font-black ${accent}`}>{value}</p>
      <p className="mt-1 text-xs text-text-muted">{formatCurrency(amount)}</p>
    </div>
  );
}

function MetricCard({
  label,
  value,
  helper,
  tone,
}: {
  label: string;
  value: string;
  helper: string;
  tone: 'emerald' | 'rose' | 'amber';
}) {
  const tones = {
    emerald: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
    rose: 'text-rose-400 bg-rose-500/10 border-rose-500/20',
    amber: 'text-amber-300 bg-amber-500/10 border-amber-500/20',
  };
  return (
    <Card variant="bordered" padding="md" className={tones[tone]}>
      <p className="text-xs uppercase tracking-[0.14em] text-text-muted">{label}</p>
      <p className="mt-2 font-display text-2xl font-black text-text-primary">{value}</p>
      <p className="mt-1 text-xs text-text-muted">{helper}</p>
    </Card>
  );
}

function InsightListCard({
  title,
  subtitle,
  accent,
  emptyLabel,
  transactions,
  totalLabel,
}: {
  title: string;
  subtitle: string;
  accent: 'emerald' | 'rose';
  emptyLabel: string;
  transactions: Array<{
    id: string;
    merchant: string;
    description: string;
    amount: number;
    category: string;
    date: string;
    rating: string;
  }>;
  totalLabel: string;
}) {
  const accentClass = accent === 'emerald'
    ? 'border-emerald-500/20 bg-emerald-500/5 text-emerald-300'
    : 'border-rose-500/20 bg-rose-500/5 text-rose-300';
  const dotClass = accent === 'emerald' ? 'bg-emerald-400' : 'bg-rose-400';
  return (
    <Card variant="bordered" padding="lg" className={accentClass}>
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h3 className="text-sm font-semibold text-text-secondary">{title}</h3>
          <p className="mt-1 text-xs text-text-muted">{subtitle}</p>
        </div>
        <p className="text-sm font-semibold text-text-primary">{totalLabel}</p>
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

function StandoutTransaction({
  label,
  tone,
  transaction,
  emptyLabel,
}: {
  label: string;
  tone: 'emerald' | 'rose';
  transaction: {
    merchant: string;
    description: string;
    amount: number;
    category: string;
    date: string;
    initial: string;
  } | null;
  emptyLabel: string;
}) {
  const toneClass = tone === 'emerald'
    ? 'border-emerald-500/20 bg-emerald-500/5'
    : 'border-rose-500/20 bg-rose-500/5';
  const pillClass = tone === 'emerald' ? 'text-emerald-300' : 'text-rose-300';
  return (
    <div className={`rounded-2xl border p-4 ${toneClass}`}>
      <p className="text-xs uppercase tracking-[0.14em] text-text-muted">{label}</p>
      {transaction ? (
        <div className="mt-3 flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="truncate text-base font-semibold text-text-primary">{transaction.merchant}</p>
            <p className="mt-1 text-xs text-text-muted">
              {transaction.category} · {transaction.date}
            </p>
            <p className={`mt-2 text-xs font-medium ${pillClass}`}>{transaction.description}</p>
          </div>
          <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-current/20 ${pillClass} bg-dark-card`}>
            {transaction.initial}
          </div>
        </div>
      ) : (
        <p className="mt-3 text-sm text-text-muted">{emptyLabel}</p>
      )}
      {transaction && <p className="mt-3 text-lg font-black text-text-primary">{formatCurrency(transaction.amount)}</p>}
    </div>
  );
}

function CategoryBand({
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
  const className = accent === 'emerald'
    ? 'border-emerald-500/20 bg-emerald-500/5 text-emerald-300'
    : 'border-rose-500/20 bg-rose-500/5 text-rose-300';
  return (
    <div>
      <p className="text-xs uppercase tracking-[0.14em] text-text-muted">{title}</p>
      {categories.length === 0 ? (
        <p className="mt-2 text-sm text-text-muted">{emptyLabel}</p>
      ) : (
        <div className="mt-2 flex flex-wrap gap-2">
          {categories.map((category) => (
            <span key={category} className={`rounded-full border px-3 py-1 text-xs font-medium ${className}`}>
              {category}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function Badge({ label, tone = 'emerald' }: { label: string; tone?: 'emerald' | 'amber' }) {
  const className = tone === 'emerald'
    ? 'border-altrion-500/20 bg-altrion-500/10 text-altrion-300'
    : 'border-amber-500/20 bg-amber-500/10 text-amber-300';
  return <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${className}`}>{label}</span>;
}
