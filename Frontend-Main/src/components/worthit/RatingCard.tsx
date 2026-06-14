import { motion, useMotionValue, useTransform, AnimatePresence, type PanInfo } from 'framer-motion';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { WorthItTransaction, WorthItRatingValue } from '@/types';
import { getCategoryStyle, getCategoryGradient, getCategoryAccent } from './categoryColors';

const DRAG_THRESHOLD = 100;

interface RatingCardProps {
  transaction: WorthItTransaction;
  cardKey: number;
  onPrev: () => void;
  onNext: () => void;
  onCut: () => void;
  onKeep: () => void;
  canGoPrev: boolean;
  canGoNext: boolean;
  disabled: boolean;
  exitDirection?: 'left' | 'right' | null;
  existingRating?: WorthItRatingValue;
}

export function RatingCard({
  transaction,
  cardKey,
  onPrev,
  onNext,
  onCut,
  onKeep,
  canGoPrev,
  canGoNext,
  disabled,
  exitDirection,
  existingRating,
}: RatingCardProps) {
  const style = getCategoryStyle(transaction.category);
  const logoGradient = getCategoryGradient(transaction.category);

  const x = useMotionValue(0);
  const rotate = useTransform(x, [-200, 0, 200], [-12, 0, 12]);
  const cutOpacity = useTransform(x, [-DRAG_THRESHOLD, 0], [1, 0]);
  const keepOpacity = useTransform(x, [0, DRAG_THRESHOLD], [0, 1]);

  const handleDragEnd = (_: unknown, info: PanInfo) => {
    if (disabled) return;
    if (info.offset.x < -DRAG_THRESHOLD) {
      onCut();
    } else if (info.offset.x > DRAG_THRESHOLD) {
      onKeep();
    }
  };

  const exitX = exitDirection === 'left' ? -300 : exitDirection === 'right' ? 300 : 0;
  const exitRotate = exitDirection === 'left' ? -15 : exitDirection === 'right' ? 15 : 0;

  return (
    <div className="relative flex w-full max-w-sm items-center justify-center">
      {/* Left chevron */}
      <button
        onClick={onPrev}
        disabled={!canGoPrev}
        className="absolute -left-12 flex h-9 w-9 items-center justify-center rounded-full text-text-muted transition-colors hover:text-text-secondary disabled:opacity-20"
        aria-label="Previous card"
      >
        <ChevronLeft size={22} />
      </button>

      {/* Card */}
      <AnimatePresence mode="wait">
        <motion.div
          key={cardKey}
          drag={disabled ? false : 'x'}
          dragConstraints={{ left: 0, right: 0 }}
          dragElastic={0.7}
          onDragEnd={handleDragEnd}
          style={{ x, rotate, touchAction: 'none' }}
          initial={{ x: exitDirection === 'left' ? 80 : -80, opacity: 0, scale: 0.95 }}
          animate={{ x: 0, opacity: 1, scale: 1, rotate: 0 }}
          exit={{ x: exitX, opacity: 0, scale: 0.9, rotate: exitRotate }}
          transition={{ type: 'spring', stiffness: 300, damping: 30 }}
          className={`relative w-full select-none overflow-hidden rounded-2xl border border-dark-border bg-dark-card p-6 card-shell ${
            disabled ? 'cursor-default' : 'cursor-grab active:cursor-grabbing'
          }`}
        >
          {/* Category-tinted accent strip */}
          <div
            className="pointer-events-none absolute inset-x-0 top-0 h-1"
            style={{ background: `linear-gradient(90deg, transparent, ${getCategoryAccent(transaction.category)}, transparent)` }}
          />

          {/* Re-rate banner (shown when user navigates back to a rated card) */}
          {existingRating && existingRating !== 'skip' && (
            <div className="mb-4 flex items-center justify-center gap-2 rounded-lg border border-dark-border bg-dark-elevated/60 px-3 py-2">
              <span className="text-[11px] uppercase tracking-wider text-text-muted">
                You marked this as
              </span>
              <span
                className={`text-xs font-bold uppercase tracking-wider ${
                  existingRating === 'cut' ? 'text-red-400' : 'text-altrion-400'
                }`}
              >
                {existingRating}
              </span>
              <span className="text-[11px] text-text-muted">· tap below to change</span>
            </div>
          )}

          {/* CUT overlay (drag left) */}
          <motion.div
            className="worthit-cut-overlay pointer-events-none absolute inset-0 flex items-center justify-start rounded-2xl border-2 border-red-400 pl-8"
            style={{ opacity: cutOpacity, backgroundColor: 'rgba(127,29,29,0.4)' }}
          >
            <span className="worthit-overlay-label text-2xl font-black tracking-widest text-red-400">CUT</span>
          </motion.div>

          {/* KEEP overlay (drag right) */}
          <motion.div
            className="worthit-keep-overlay pointer-events-none absolute inset-0 flex items-center justify-end rounded-2xl border-2 border-altrion-400 pr-8"
            style={{ opacity: keepOpacity, backgroundColor: 'rgba(6,78,59,0.4)' }}
          >
            <span className="worthit-overlay-label text-2xl font-black tracking-widest text-altrion-400">KEEP</span>
          </motion.div>

          {/* Top row: category + date */}
          <div className="mb-6 flex items-center justify-between">
            <span className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium ${style.bg} ${style.text}`}>
              <span className={`h-1.5 w-1.5 rounded-full ${style.dot}`} />
              {transaction.category}
            </span>
            <span className="text-xs text-text-muted">{transaction.date}</span>
          </div>

          {/* Merchant logo */}
          <div className="mb-5 flex justify-center">
            <div className={`flex h-[72px] w-[72px] items-center justify-center rounded-2xl bg-gradient-to-br ${logoGradient} shadow-lg`}>
              <span className="text-[36px] font-black leading-none text-white">{transaction.initial}</span>
            </div>
          </div>

          {/* Merchant name + description */}
          <div className="mb-10 text-center">
            <h2 className="font-display text-xl font-bold text-text-primary">{transaction.merchant}</h2>
            <p className="mt-1 text-sm text-text-muted">{transaction.description}</p>
          </div>

          {/* Amount — hero */}
          <div className="text-center">
            <p className="font-display text-5xl font-black leading-none tracking-tight text-text-primary sm:text-7xl">
              ${transaction.amount.toFixed(2)}
            </p>
            <motion.p
              animate={{ opacity: [0.5, 1, 0.5] }}
              transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
              className="mt-4 text-[11px] font-medium uppercase tracking-[0.22em] text-text-muted"
            >
              Was it worth it?
            </motion.p>
          </div>
        </motion.div>
      </AnimatePresence>

      {/* Right chevron */}
      <button
        onClick={onNext}
        disabled={!canGoNext}
        className="absolute -right-12 flex h-9 w-9 items-center justify-center rounded-full text-text-muted transition-colors hover:text-text-secondary disabled:opacity-20"
        aria-label="Next card"
      >
        <ChevronRight size={22} />
      </button>
    </div>
  );
}
