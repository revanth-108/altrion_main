import { useMemo, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { TrendingDown, TrendingUp, Layers } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { formatCurrency } from '@/utils/formatters';
import type { WorthItTransaction, WorthItRatingValue } from '@/types';

interface WeeklyStatsPanelProps {
  transactions: WorthItTransaction[];
  localRatings: Record<string, WorthItRatingValue>;
}

export function WeeklyStatsPanel({ transactions, localRatings }: WeeklyStatsPanelProps) {
  const stats = useMemo(() => {
    let saved = 0;
    let approved = 0;
    let kept = 0;
    let cut = 0;
    let skipped = 0;
    for (const tx of transactions) {
      const rating = localRatings[tx.id];
      if (rating === 'cut') {
        saved += tx.amount;
        cut += 1;
      } else if (rating === 'keep') {
        approved += tx.amount;
        kept += 1;
      } else if (rating === 'skip') {
        skipped += 1;
      }
    }
    const remaining = transactions.length - kept - cut - skipped;
    return { saved, approved, kept, cut, skipped, remaining };
  }, [transactions, localRatings]);

  return (
    <div className="flex flex-col gap-4">
      {/* Saved this session */}
      <Card variant="bordered" padding="md" className="!bg-dark-card/40 backdrop-blur-sm">
        <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.16em] text-text-muted">
          <TrendingDown size={13} className="text-red-400" />
          Saved this session
        </div>
        <AnimatedAmount value={stats.saved} className="mt-2 font-display text-3xl font-black text-red-400" />
        <p className="mt-1 text-xs text-text-muted">Money you'd be wasting</p>
      </Card>

      {/* Approved this session */}
      <Card variant="bordered" padding="md" className="!bg-dark-card/40 backdrop-blur-sm">
        <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.16em] text-text-muted">
          <TrendingUp size={13} className="text-altrion-400" />
          Approved this session
        </div>
        <AnimatedAmount value={stats.approved} className="mt-2 font-display text-3xl font-black text-altrion-400" />
        <p className="mt-1 text-xs text-text-muted">Locked in spend</p>
      </Card>

      {/* Counts */}
      <Card variant="bordered" padding="md" className="!bg-dark-card/40 backdrop-blur-sm">
        <div className="grid grid-cols-3 divide-x divide-dark-border">
          <CountTile label="Kept" value={stats.kept} color="text-altrion-400" />
          <CountTile label="Cut" value={stats.cut} color="text-red-400" />
          <CountTile label="Skipped" value={stats.skipped} color="text-text-secondary" />
        </div>
      </Card>

      {/* Remaining */}
      <div className="flex items-center justify-center gap-2 text-xs text-text-muted">
        <Layers size={13} />
        <span>
          <span className="font-semibold text-text-secondary">{stats.remaining}</span>{' '}
          {stats.remaining === 1 ? 'card' : 'cards'} left this week
        </span>
      </div>
    </div>
  );
}

function CountTile({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="px-2 text-center">
      <p className={`font-display text-2xl font-black ${color}`}>{value}</p>
      <p className="mt-0.5 text-[10px] uppercase tracking-wider text-text-muted">{label}</p>
    </div>
  );
}

/**
 * Smoothly tweens the displayed currency amount when `value` changes,
 * giving the totals a satisfying tick-up after each rating.
 */
function AnimatedAmount({ value, className }: { value: number; className?: string }) {
  const [displayed, setDisplayed] = useState(value);
  useEffect(() => {
    if (value === displayed) return;
    const start = displayed;
    const delta = value - start;
    const duration = 450;
    const startTime = performance.now();
    let frame: number;
    const tick = (now: number) => {
      const t = Math.min(1, (now - startTime) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplayed(start + delta * eased);
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value, displayed]);
  return (
    <motion.p key={value} className={className} initial={{ scale: 0.96 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 320, damping: 22 }}>
      {formatCurrency(displayed)}
    </motion.p>
  );
}
