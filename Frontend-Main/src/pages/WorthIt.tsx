import { useState, useCallback, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertCircle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { ROUTES } from '@/constants';
import { CONTAINER_VARIANTS, ITEM_VARIANTS } from '@/constants/animations';
import {
  useWorthItSession,
  useRateTransaction,
  useSkipSession,
  useSessionInsights,
  useWorthItLast30DaysInsights,
  worthItKeys,
} from '@/hooks/queries/useWorthIt';
import { DashboardLayout } from '@/components/layout';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';
import { StreakBadge } from '@/components/worthit/StreakBadge';
import { ProgressBar } from '@/components/worthit/ProgressBar';
import { RatingCard } from '@/components/worthit/RatingCard';
import { ActionButtons } from '@/components/worthit/ActionButtons';
import { WorthItSkeleton } from '@/components/worthit/WorthItSkeleton';
import { WaitingState } from '@/components/worthit/WaitingState';
import { SessionInsights } from '@/components/worthit/SessionInsights';
import { Last30DaysInsightsPanel } from '@/components/worthit/Last30DaysInsightsPanel';
import { WeeklyStatsPanel } from '@/components/worthit/WeeklyStatsPanel';
import { SessionPatternsPanel } from '@/components/worthit/SessionPatternsPanel';
import { CategoryAura } from '@/components/worthit/CategoryAura';
import type { WorthItTransaction, WorthItRatingValue } from '@/types';

/**
 * Worth It — server provides the initial seed; UI is local-first.
 *
 * Transactions array is snapshotted on first load and frozen so background
 * refetches can't swap out the IDs our ratings are keyed by. Rate calls
 * are fire-and-forget. Completion is purely derived from local ratings,
 * so we never get stuck waiting for a server flag.
 */
export function WorthIt() {
  const navigate = useNavigate();
  const toast = useToast();
  const queryClient = useQueryClient();

  // ── Server state (used only as initial seed) ────────────────────────────
  const { data: session, isError, refetch } = useWorthItSession();
  const rateMutation = useRateTransaction();
  const skipMutation = useSkipSession();

  // ── Component-local state (no persistence, no React Query coupling) ─────
  const [snapshotTransactions, setSnapshotTransactions] = useState<WorthItTransaction[] | null>(null);
  const [localRatings, setLocalRatings] = useState<Record<string, WorthItRatingValue>>({});
  const [currentIndexOverride, setCurrentIndexOverride] = useState<number | null>(null);
  const [exitDirection, setExitDirection] = useState<'left' | 'right' | null>(null);
  const [cardKey, setCardKey] = useState(0);
  const [isAnimating, setIsAnimating] = useState(false);
  const [showSkipModal, setShowSkipModal] = useState(false);

  // ── Snapshot transactions on first load (then freeze) ───────────────────
  useEffect(() => {
    if (snapshotTransactions) return;
    if (session) {
      setSnapshotTransactions(session.transactions ?? []);
      if (session.ratings && Object.keys(session.ratings).length > 0) {
        setLocalRatings((prev) => ({ ...session.ratings, ...prev }));
      }
    }
  }, [snapshotTransactions, session]);

  // ── Derived state ───────────────────────────────────────────────────────
  const transactions: WorthItTransaction[] = snapshotTransactions ?? [];
  const mergedRatings = localRatings;

  const firstUnratedIndex = transactions.findIndex(
    (tx) => mergedRatings[tx.id] === undefined,
  );
  const naturalIndex = firstUnratedIndex === -1 ? transactions.length - 1 : firstUnratedIndex;
  const currentIndex = currentIndexOverride ?? naturalIndex;
  const currentTx = transactions[currentIndex];
  const existingRating = currentTx ? mergedRatings[currentTx.id] : undefined;

  const ratedCount = useMemo(
    () => Object.values(mergedRatings).filter((r) => r === 'keep' || r === 'cut').length,
    [mergedRatings],
  );
  const tallies = useMemo(() => {
    const values = Object.values(mergedRatings);
    return {
      keep: values.filter((r) => r === 'keep').length,
      cut: values.filter((r) => r === 'cut').length,
      skip: values.filter((r) => r === 'skip').length,
    };
  }, [mergedRatings]);

  const backendSessionComplete = session?.session_complete ?? false;
  const sessionComplete =
    backendSessionComplete || (transactions.length > 0 && transactions.every((tx) => mergedRatings[tx.id] !== undefined));
  const sessionSkipped = (session?.session_skipped ?? false) && !sessionComplete;

  const streak = session?.streak ?? 0;
  const weekLabel = session?.week_label || getCurrentWeekLabel();
  const sessionId = session?.session_id;
  const TOTAL = transactions.length || 8;

  // ── Skip-week reset ─────────────────────────────────────────────────────
  const skipExpiredInfo = useMemo(() => {
    if (!sessionSkipped) return { expired: false, nextDate: '' };
    const nextDate = computeNextMondayLabel();
    const skippedWeekEnd = parseSundayFromWeekLabel(weekLabel);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const expired = skippedWeekEnd ? today > skippedWeekEnd : false;
    return { expired, nextDate };
  }, [sessionSkipped, weekLabel]);

  useEffect(() => {
    if (skipExpiredInfo.expired) {
      queryClient.invalidateQueries({ queryKey: worthItKeys.session() });
      setLocalRatings({});
      setCurrentIndexOverride(null);
      setSnapshotTransactions(null);
    }
  }, [skipExpiredInfo.expired, queryClient]);

  // ── Insights for completed session ──────────────────────────────────────
  const insightsSessionId = sessionComplete && transactions.length > 0 ? sessionId : undefined;
  const { data: insights } = useSessionInsights(insightsSessionId);
  const { data: rollingInsights, isLoading: isRollingInsightsLoading } = useWorthItLast30DaysInsights();

  // ── Animation helper ────────────────────────────────────────────────────
  const animateCard = useCallback(
    (direction: 'left' | 'right', action: () => void) => {
      if (isAnimating) return;
      setIsAnimating(true);
      setExitDirection(direction);
      setCardKey((k) => k + 1);
      setTimeout(() => {
        action();
        setExitDirection(null);
        setIsAnimating(false);
      }, 200);
    },
    [isAnimating],
  );

  // ── Handlers ────────────────────────────────────────────────────────────
  const persistRate = useCallback(
    async (tx: WorthItTransaction, rating: WorthItRatingValue, previousRating?: WorthItRatingValue) => {
      try {
        await rateMutation.mutateAsync({
          transactionId: tx.id,
          rating,
          merchant: tx.merchant,
          description: tx.description,
          amount: tx.amount,
          category: tx.category,
          date: tx.date,
        });
      } catch (error) {
        console.error('worth_it_rating_save_failed', {
          transactionId: tx.id,
          rating,
          error,
        });
        toast.error('Could not save rating', 'Please try again.');
        setLocalRatings((prev) => {
          const next = { ...prev };
          if (previousRating) {
            next[tx.id] = previousRating;
          } else {
            delete next[tx.id];
          }
          return next;
        });
      }
    },
    [rateMutation, toast],
  );

  const handleRate = useCallback(
    (rating: 'keep' | 'cut') => {
      if (!currentTx || isAnimating) return;
      const direction = rating === 'cut' ? 'left' : 'right';
      const isReRate = Boolean(existingRating);
      const wasOverridden = currentIndexOverride !== null;
      const tx = currentTx;
      const previousRating = mergedRatings[tx.id];

      animateCard(direction, () => {
        setLocalRatings((prev) => ({ ...prev, [tx.id]: rating }));
        void persistRate(tx, rating, previousRating);

        if (wasOverridden) {
          setCurrentIndexOverride(null);
        }

        const verb = isReRate ? 'Updated' : rating === 'keep' ? 'Kept' : 'Cut';
        toast.info(
          `${verb} ${tx.merchant}`,
          `$${tx.amount.toFixed(2)}`,
        );
      });
    },
    [currentTx, isAnimating, animateCard, persistRate, toast, existingRating, currentIndexOverride, mergedRatings],
  );

  const handleCut = useCallback(() => handleRate('cut'), [handleRate]);
  const handleKeep = useCallback(() => handleRate('keep'), [handleRate]);

  const handleSkipCard = useCallback(() => {
    if (!currentTx || isAnimating) return;
    const wasOverridden = currentIndexOverride !== null;
    const tx = currentTx;
    const previousRating = mergedRatings[tx.id];
    animateCard('left', () => {
      setLocalRatings((prev) => ({ ...prev, [tx.id]: 'skip' }));
      void persistRate(tx, 'skip', previousRating);
      if (wasOverridden) {
        setCurrentIndexOverride(null);
      }
    });
  }, [currentTx, isAnimating, animateCard, persistRate, currentIndexOverride, mergedRatings]);

  const handlePrevNav = useCallback(() => {
    if (isAnimating || currentIndex <= 0) return;
    animateCard('right', () => setCurrentIndexOverride(currentIndex - 1));
  }, [isAnimating, currentIndex, animateCard]);

  const handleNextNav = useCallback(() => {
    if (isAnimating || currentIndex >= naturalIndex) return;
    animateCard('left', () => {
      const next = currentIndex + 1;
      setCurrentIndexOverride(next >= naturalIndex ? null : next);
    });
  }, [isAnimating, currentIndex, naturalIndex, animateCard]);

  const handleSkipSession = useCallback(() => {
    skipMutation.mutate();
    setShowSkipModal(false);
  }, [skipMutation]);

  // ── Keyboard shortcuts ──────────────────────────────────────────────────
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (sessionComplete || sessionSkipped || showSkipModal || isAnimating) return;
      if (e.key === 'ArrowLeft') handleCut();
      if (e.key === 'ArrowRight') handleKeep();
      if (e.key === 's' || e.key === 'S') handleSkipCard();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [sessionComplete, sessionSkipped, showSkipModal, isAnimating, handleCut, handleKeep, handleSkipCard]);

  // ── Render branches ─────────────────────────────────────────────────────
  // Skeleton is only shown while the first session response is still pending.
  if (isError && !snapshotTransactions) {
    return (
      <DashboardLayout>
        <div className="flex min-h-[calc(100vh-8rem)] items-center justify-center">
          <Card variant="bordered" padding="lg" className="max-w-sm text-center">
            <AlertCircle size={36} className="mx-auto mb-4 text-red-400" />
            <h2 className="font-display text-xl font-bold text-text-primary">Couldn't load session</h2>
            <p className="mt-2 text-sm text-text-muted">There was a problem fetching your transactions.</p>
            <div className="mt-6 flex gap-3">
              <Button onClick={() => refetch()} variant="primary" fullWidth>
                Try Again
              </Button>
              <Button onClick={() => navigate(ROUTES.DASHBOARD)} variant="ghost" fullWidth>
                Dashboard
              </Button>
            </div>
          </Card>
        </div>
      </DashboardLayout>
    );
  }

  if (!snapshotTransactions) {
    return (
      <DashboardLayout>
        <WorthItSkeleton />
      </DashboardLayout>
    );
  }

  if (sessionComplete && transactions.length === 0) {
    return (
      <DashboardLayout>
        <div className="flex min-h-[calc(100vh-8rem)] items-center justify-center">
          <Card variant="bordered" padding="lg" className="max-w-sm text-center">
            <CalendarIcon />
            <h2 className="mt-4 font-display text-xl font-bold text-text-primary">No new transactions</h2>
            <p className="mt-2 text-sm text-text-muted">
              Everything available has already been reviewed. Check back when new bank activity lands.
            </p>
            <Button onClick={() => navigate(ROUTES.DASHBOARD)} variant="primary" fullWidth className="mt-6">
              Back to Dashboard
            </Button>
          </Card>
        </div>
      </DashboardLayout>
    );
  }

  if (sessionComplete) {
    return (
      <DashboardLayout>
        <div className="space-y-8">
          <SessionInsights
            keepCount={tallies.keep}
            cutCount={tallies.cut}
            skipCount={tallies.skip}
            ratedCount={ratedCount}
            insights={insights}
          />
          <div className="px-4 pb-8 lg:px-8">
            <Last30DaysInsightsPanel insights={rollingInsights} isLoading={isRollingInsightsLoading} />
          </div>
        </div>
      </DashboardLayout>
    );
  }

  if (sessionSkipped) {
    return (
      <DashboardLayout>
        <WaitingState
          streak={streak}
          weekLabel={weekLabel}
          keepCount={tallies.keep}
          cutCount={tallies.cut}
          skipCount={tallies.skip}
          sessionId={sessionId}
          isSkipped
          nextSessionDate={skipExpiredInfo.nextDate}
        />
      </DashboardLayout>
    );
  }

  if (!currentTx) {
    return (
      <DashboardLayout>
        <div className="flex min-h-[calc(100vh-8rem)] items-center justify-center">
          <Card variant="bordered" padding="lg" className="max-w-sm text-center">
            <CalendarIcon />
            <h2 className="mt-4 font-display text-xl font-bold text-text-primary">No transactions to review</h2>
            <p className="mt-2 text-sm text-text-muted">Check back next Monday for a new session.</p>
            <Button onClick={() => navigate(ROUTES.DASHBOARD)} variant="primary" fullWidth className="mt-6">
              Back to Dashboard
            </Button>
          </Card>
        </div>
      </DashboardLayout>
    );
  }

  // ── Active session (full-page 3-column layout) ──────────────────────────
  return (
    <DashboardLayout padding="px-4 py-6 lg:px-8 lg:py-8" maxWidth="">
      <CategoryAura category={currentTx?.category} />

      <motion.div variants={CONTAINER_VARIANTS} initial="hidden" animate="visible" className="flex flex-col gap-6">
        {/* Header bar — full width */}
        <motion.div variants={ITEM_VARIANTS} className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-text-muted">
              Review session · {weekLabel}
            </p>
            <h1 className="font-display mt-1 text-[28px] font-black text-text-primary">Worth it?</h1>
          </div>
          {streak > 0 && <StreakBadge streak={streak} />}
        </motion.div>

        {/* Progress bar — full width */}
        <motion.div variants={ITEM_VARIANTS}>
          <ProgressBar
            highWaterMark={naturalIndex}
            currentIndex={currentIndex}
            ratedCount={ratedCount}
            total={TOTAL}
          />
        </motion.div>

        {/* 3-column grid: stats | card+actions | patterns */}
        <motion.div
          variants={ITEM_VARIANTS}
          className="grid grid-cols-1 gap-6 lg:grid-cols-[300px_minmax(0,1fr)_320px]"
        >
          {/* Left rail — stats */}
          <div className="order-2 lg:order-1">
            <WeeklyStatsPanel transactions={transactions} localRatings={localRatings} />
          </div>

          {/* Center — card + action buttons */}
          <div className="order-1 flex min-h-[60vh] flex-col items-center justify-center gap-8 lg:order-2">
            <RatingCard
              transaction={currentTx}
              cardKey={cardKey}
              onPrev={handlePrevNav}
              onNext={handleNextNav}
              onCut={handleCut}
              onKeep={handleKeep}
              canGoPrev={currentIndex > 0 && !isAnimating}
              canGoNext={currentIndex < naturalIndex && !isAnimating}
              disabled={isAnimating}
              exitDirection={exitDirection}
              existingRating={existingRating}
            />
            <ActionButtons
              onCut={handleCut}
              onKeep={handleKeep}
              onSkip={handleSkipCard}
              onSkipSession={() => setShowSkipModal(true)}
              disabled={isAnimating}
              existingRating={existingRating}
            />
          </div>

          {/* Right rail — patterns */}
          <div className="order-3">
            <SessionPatternsPanel transactions={transactions} localRatings={localRatings} />
          </div>
        </motion.div>
      </motion.div>

      <AnimatePresence>
        {showSkipModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-6"
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            >
              <Card variant="bordered" padding="lg" className="w-full max-w-sm shadow-2xl">
                <h2 className="text-lg font-bold text-text-primary">Skip this session?</h2>
                <p className="mt-2 text-sm text-text-muted">
                  Are you sure? Your progress for this session will pause.
                </p>
                <div className="mt-6 flex gap-3">
                  <Button onClick={() => setShowSkipModal(false)} variant="ghost" fullWidth>
                    Cancel
                  </Button>
                  <Button
                    onClick={handleSkipSession}
                    variant="secondary"
                    fullWidth
                    className="!bg-red-500/10 !border-red-500/30 !text-red-400 hover:!bg-red-500/20"
                  >
                    Skip Session
                  </Button>
                </div>
              </Card>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </DashboardLayout>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────

function getCurrentWeekLabel(): string {
  const now = new Date();
  const monday = new Date(now);
  monday.setDate(now.getDate() - now.getDay() + 1);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  const month = monday.toLocaleString('en-US', { month: 'short' }).toUpperCase();
  if (monday.getMonth() === sunday.getMonth()) {
    return `${month} ${monday.getDate()}–${sunday.getDate()}`;
  }
  const endMonth = sunday.toLocaleString('en-US', { month: 'short' }).toUpperCase();
  return `${month} ${monday.getDate()} – ${endMonth} ${sunday.getDate()}`;
}

function parseSundayFromWeekLabel(label: string): Date | null {
  if (!label) return null;
  const cleaned = label.replace(/–/g, '-');
  const match = cleaned.match(/^([A-Z]{3})\s+(\d{1,2})\s*-\s*(?:([A-Z]{3})\s+)?(\d{1,2})$/i);
  if (!match) return null;
  const [, startMonth, , endMonthMaybe, endDay] = match;
  const month = endMonthMaybe || startMonth;
  const year = new Date().getFullYear();
  const parsed = new Date(`${month} ${endDay}, ${year}`);
  if (Number.isNaN(parsed.getTime())) return null;
  parsed.setHours(23, 59, 59, 999);
  return parsed;
}

function computeNextMondayLabel(): string {
  const now = new Date();
  const daysUntilMonday = (8 - now.getDay()) % 7 || 7;
  const next = new Date(now);
  next.setDate(now.getDate() + daysUntilMonday);
  return next.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

function CalendarIcon() {
  return (
    <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-altrion-500/10">
      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-altrion-400">
        <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
        <line x1="16" y1="2" x2="16" y2="6" />
        <line x1="8" y1="2" x2="8" y2="6" />
        <line x1="3" y1="10" x2="21" y2="10" />
      </svg>
    </div>
  );
}
