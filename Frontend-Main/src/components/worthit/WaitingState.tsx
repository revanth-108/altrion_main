import { motion } from 'framer-motion';
import { CalendarClock, PauseCircle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { ROUTES } from '@/constants';
import { FADE_IN_UP } from '@/constants/animations';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { StreakBadge } from './StreakBadge';

interface WaitingStateProps {
  streak: number;
  weekLabel: string;
  keepCount: number;
  cutCount: number;
  skipCount: number;
  sessionId?: string;
  isSkipped?: boolean;
  nextSessionDate?: string;
}

function getNextMondayFallback(): string {
  const now = new Date();
  const daysUntilMonday = (8 - now.getDay()) % 7 || 7;
  const next = new Date(now);
  next.setDate(now.getDate() + daysUntilMonday);
  return next.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

export function WaitingState({
  streak,
  weekLabel,
  keepCount,
  cutCount,
  skipCount,
  sessionId,
  isSkipped = false,
  nextSessionDate,
}: WaitingStateProps) {
  const navigate = useNavigate();
  const nextDate = nextSessionDate || getNextMondayFallback();

  return (
    <motion.div
      variants={FADE_IN_UP}
      initial="hidden"
      animate="visible"
      className="flex min-h-[calc(100vh-8rem)] items-center justify-center"
    >
      <div className="w-full max-w-sm space-y-6 text-center">
        {/* Icon */}
        <div className="flex justify-center">
          <div
            className={`flex h-20 w-20 items-center justify-center rounded-full ${
              isSkipped ? 'bg-amber-500/10' : 'bg-altrion-500/10'
            }`}
          >
            {isSkipped ? (
              <PauseCircle size={40} className="text-amber-400" />
            ) : (
              <CalendarClock size={40} className="text-altrion-400" />
            )}
          </div>
        </div>

        {/* Heading */}
        <div>
          <h1 className="font-display text-2xl font-black text-text-primary">
            {isSkipped ? 'Week skipped' : 'All done for this week!'}
          </h1>
          {isSkipped ? (
            <>
              <p className="mt-2 text-sm text-text-muted">
                Skipped {weekLabel}
              </p>
              <p className="mt-1 text-sm text-text-secondary">
                Next session unlocks <span className="font-semibold text-text-primary">{nextDate}</span>
              </p>
            </>
          ) : (
            <p className="mt-2 text-sm text-text-muted">
              Your next session starts {nextDate}
            </p>
          )}
        </div>

        {/* Streak */}
        {streak > 0 && (
          <div className="flex justify-center">
            <StreakBadge streak={streak} />
          </div>
        )}

        {/* This week's summary */}
        <Card variant="bordered" padding="md">
          <p className="mb-3 text-xs font-medium uppercase tracking-wider text-text-muted">{weekLabel}</p>
          <div className="grid grid-cols-3 divide-x divide-dark-border">
            <div className="pr-4">
              <p className="text-2xl font-black text-altrion-400">{keepCount}</p>
              <p className="mt-0.5 text-xs text-text-muted">Kept</p>
            </div>
            <div className="px-4">
              <p className="text-2xl font-black text-red-400">{cutCount}</p>
              <p className="mt-0.5 text-xs text-text-muted">Cut</p>
            </div>
            <div className="pl-4">
              <p className="text-2xl font-black text-text-secondary">{skipCount}</p>
              <p className="mt-0.5 text-xs text-text-muted">Skipped</p>
            </div>
          </div>
        </Card>

        {/* Actions */}
        <div className="space-y-3">
          {sessionId && (
            <Button
              onClick={() => navigate(`${ROUTES.WORTH_IT}/insights/${sessionId}`)}
              variant="primary"
              fullWidth
            >
              View Insights
            </Button>
          )}
          <Button
            onClick={() => navigate(ROUTES.WORTH_IT_HISTORY)}
            variant="ghost"
            fullWidth
          >
            View Past Sessions
          </Button>
        </div>
      </div>
    </motion.div>
  );
}
