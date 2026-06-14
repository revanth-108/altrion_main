import { useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Activity, Sparkles } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { formatCurrency } from '@/utils/formatters';
import { getCategoryStyle } from './categoryColors';
import type { WorthItTransaction, WorthItRatingValue } from '@/types';

interface SessionPatternsPanelProps {
  transactions: WorthItTransaction[];
  localRatings: Record<string, WorthItRatingValue>;
}

interface RatedRow {
  tx: WorthItTransaction;
  rating: WorthItRatingValue;
  index: number;
}

export function SessionPatternsPanel({ transactions, localRatings }: SessionPatternsPanelProps) {
  // Rated transactions in original order (most recent rating = highest index user reached)
  const ratedRows = useMemo<RatedRow[]>(
    () => {
      const seen = new Set<string>();
      const rows: RatedRow[] = [];
      for (let index = transactions.length - 1; index >= 0; index -= 1) {
        const tx = transactions[index];
        const rating = localRatings[tx.id];
        if (rating === undefined || seen.has(tx.id)) continue;
        seen.add(tx.id);
        rows.unshift({ tx, rating, index });
      }
      return rows;
    },
    [transactions, localRatings],
  );

  const recent = useMemo(() => [...ratedRows].reverse().slice(0, 4), [ratedRows]);

  const categoryBreakdown = useMemo(() => {
    const map = new Map<string, { count: number; cutAmount: number; keepAmount: number }>();
    for (const r of ratedRows) {
      const entry = map.get(r.tx.category) ?? { count: 0, cutAmount: 0, keepAmount: 0 };
      entry.count += 1;
      if (r.rating === 'cut') entry.cutAmount += r.tx.amount;
      if (r.rating === 'keep') entry.keepAmount += r.tx.amount;
      map.set(r.tx.category, entry);
    }
    return Array.from(map.entries()).sort((a, b) => b[1].count - a[1].count);
  }, [ratedRows]);

  const insight = useMemo(() => deriveInsight(ratedRows), [ratedRows]);

  return (
    <div className="flex flex-col gap-4">
      {/* Recent decisions */}
      <Card variant="bordered" padding="md" className="!bg-dark-card/40 backdrop-blur-sm">
        <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.16em] text-text-muted">
          <Activity size={13} className="text-altrion-400" />
          Recent decisions
        </div>
        {recent.length === 0 ? (
          <p className="mt-3 text-xs text-text-muted/70 italic">Your last 4 ratings will appear here.</p>
        ) : (
          <ul className="mt-3 flex flex-col gap-1.5">
            <AnimatePresence initial={false}>
              {recent.map(({ tx, rating }) => (
                <motion.li
                  key={tx.id}
                  layout
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 8 }}
                  transition={{ type: 'spring', stiffness: 380, damping: 28 }}
                  className="flex items-center gap-2.5 rounded-md border border-dark-border/60 bg-dark-bg/40 px-2.5 py-2"
                >
                  <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${decisionDot(rating)}`} />
                  <span className="flex-1 truncate text-xs font-medium text-text-primary">{tx.merchant}</span>
                  <span className="text-xs text-text-muted">{formatCurrency(tx.amount)}</span>
                  <span className={`text-[10px] font-bold uppercase tracking-wider ${decisionLabelColor(rating)}`}>
                    {rating}
                  </span>
                </motion.li>
              ))}
            </AnimatePresence>
          </ul>
        )}
      </Card>

      {/* Categories so far */}
      <Card variant="bordered" padding="md" className="!bg-dark-card/40 backdrop-blur-sm">
        <div className="text-[11px] font-medium uppercase tracking-[0.16em] text-text-muted">Categories so far</div>
        {categoryBreakdown.length === 0 ? (
          <p className="mt-3 text-xs text-text-muted/70 italic">No categories yet.</p>
        ) : (
          <ul className="mt-3 flex flex-col gap-2">
            {categoryBreakdown.map(([category, data]) => {
              const dot = getCategoryStyle(category).dot;
              return (
                <li key={category} className="flex items-center gap-2 text-xs">
                  <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${dot}`} />
                  <span className="flex-1 truncate text-text-secondary">{category}</span>
                  <span className="text-text-muted">
                    {data.count} {data.count === 1 ? 'card' : 'cards'}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      {/* Smart insight */}
      <Card variant="bordered" padding="md" className="!bg-altrion-500/5 !border-altrion-500/20 backdrop-blur-sm">
        <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.16em] text-altrion-400">
          <Sparkles size={13} />
          Insight
        </div>
        <p className="mt-2 text-sm leading-relaxed text-text-secondary">
          {insight}
        </p>
      </Card>
    </div>
  );
}

function decisionDot(rating: WorthItRatingValue): string {
  if (rating === 'keep') return 'bg-altrion-400';
  if (rating === 'cut') return 'bg-red-400';
  return 'bg-text-muted/60';
}

function decisionLabelColor(rating: WorthItRatingValue): string {
  if (rating === 'keep') return 'text-altrion-400';
  if (rating === 'cut') return 'text-red-400';
  return 'text-text-muted';
}

function deriveInsight(rated: RatedRow[]): string {
  if (rated.length === 0) return 'Insights appear as you start rating.';

  // Streak: 3+ same-direction in a row at the tail
  const tail = rated.slice(-3);
  if (tail.length === 3 && tail.every((r) => r.rating === 'keep')) {
    return '3 in a row kept — you’re on a streak of approving spend.';
  }
  if (tail.length === 3 && tail.every((r) => r.rating === 'cut')) {
    return '3 in a row cut — you’re trimming hard right now.';
  }

  // Average cut size when ≥3 cuts
  const cuts = rated.filter((r) => r.rating === 'cut');
  if (cuts.length >= 3) {
    const avg = cuts.reduce((s, r) => s + r.tx.amount, 0) / cuts.length;
    return `Average cut so far: ${formatCurrency(avg)}.`;
  }

  // Category-dominance insight
  const catCounts = new Map<string, { keep: number; cut: number }>();
  for (const r of rated) {
    const e = catCounts.get(r.tx.category) ?? { keep: 0, cut: 0 };
    if (r.rating === 'keep') e.keep += 1;
    if (r.rating === 'cut') e.cut += 1;
    catCounts.set(r.tx.category, e);
  }
  let dominantCutCat: string | null = null;
  let maxCuts = 1;
  for (const [cat, e] of catCounts.entries()) {
    if (e.cut > maxCuts) {
      maxCuts = e.cut;
      dominantCutCat = cat;
    }
  }
  if (dominantCutCat) {
    return `You’re cutting ${dominantCutCat.toLowerCase()} more than other categories.`;
  }

  return 'Keep rating — patterns will surface as you go.';
}
