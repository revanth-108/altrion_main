import { motion } from 'framer-motion';
import { ArrowLeft, CheckCircle, SkipForward, Clock, ChevronRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { ROUTES } from '@/constants';
import { CONTAINER_VARIANTS, ITEM_VARIANTS } from '@/constants/animations';
import { useWorthItHistory, useWorthItStreak } from '@/hooks/queries/useWorthIt';
import { DashboardLayout } from '@/components/layout';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { CardSkeleton } from '@/components/ui/Skeleton';
import { StreakBadge } from '@/components/worthit/StreakBadge';

const STATUS_CONFIG: Record<string, { icon: typeof CheckCircle; color: string; label: string }> = {
  completed: { icon: CheckCircle, color: 'text-altrion-400 bg-altrion-500/10 border-altrion-500/20', label: 'Completed' },
  skipped: { icon: SkipForward, color: 'text-amber-400 bg-amber-500/10 border-amber-500/20', label: 'Skipped' },
  active: { icon: Clock, color: 'text-blue-400 bg-blue-500/10 border-blue-500/20', label: 'Active' },
};

export function WorthItHistory() {
  const navigate = useNavigate();
  const { data: history, isLoading } = useWorthItHistory();
  const { data: streakData } = useWorthItStreak();

  return (
    <DashboardLayout padding="px-6 py-6" maxWidth="max-w-2xl">
      <motion.div variants={CONTAINER_VARIANTS} initial="hidden" animate="visible">
        {/* Header */}
        <motion.div variants={ITEM_VARIANTS} className="flex items-center gap-4">
          <button
            onClick={() => navigate(ROUTES.WORTH_IT)}
            className="flex h-9 w-9 items-center justify-center rounded-full text-text-muted transition-colors hover:bg-dark-elevated hover:text-text-primary"
          >
            <ArrowLeft size={20} />
          </button>
          <div>
            <h1 className="font-display text-2xl font-black text-text-primary">Worth It? History</h1>
            <p className="text-sm text-text-muted">Your past review sessions</p>
          </div>
        </motion.div>

        {/* Streak summary */}
        {streakData && (
          <motion.div variants={ITEM_VARIANTS} className="mt-6">
            <Card variant="bordered" padding="md">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <StreakBadge streak={streakData.streak} />
                  <div className="text-sm text-text-muted">
                    <p>Longest: <span className="font-semibold text-text-secondary">{streakData.longest_streak} weeks</span></p>
                    <p>Total sessions: <span className="font-semibold text-text-secondary">{streakData.total_sessions_completed}</span></p>
                  </div>
                </div>
              </div>
            </Card>
          </motion.div>
        )}

        {/* Session list */}
        <motion.div variants={ITEM_VARIANTS} className="mt-6 space-y-3">
          {isLoading ? (
            <>
              {Array.from({ length: 4 }).map((_, i) => (
                <CardSkeleton key={i} />
              ))}
            </>
          ) : !history?.sessions.length ? (
            <Card variant="bordered" padding="lg" className="text-center">
              <Clock size={36} className="mx-auto mb-4 text-text-muted" />
              <h3 className="font-display text-lg font-bold text-text-primary">No past sessions yet</h3>
              <p className="mt-2 text-sm text-text-muted">
                Complete a few reviews to see what felt worth it and what did not.
              </p>
              <Button
                onClick={() => navigate(ROUTES.WORTH_IT)}
                variant="primary"
                className="mt-6"
              >
                Start a Session
              </Button>
            </Card>
          ) : (
            history.sessions.map((s) => {
              const config = STATUS_CONFIG[s.status] ?? STATUS_CONFIG.active;
              const Icon = config.icon;
              const completed = s.status === 'completed';

              return (
                <motion.div key={s.session_id} variants={ITEM_VARIANTS}>
                  <Card
                    variant="bordered"
                    padding="md"
                    hover={completed}
                    className={completed ? 'cursor-pointer' : ''}
                    onClick={completed ? () => navigate(ROUTES.WORTH_IT_SESSION_INSIGHTS.replace(':sessionId', s.session_id)) : undefined}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className={`flex h-10 w-10 items-center justify-center rounded-full border ${config.color}`}>
                          <Icon size={18} />
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-text-primary">{s.week_label}</p>
                          <p className="text-xs text-text-muted">
                            {completed
                              ? `${s.reviewed_count} reviewed · ${s.keep_count} happy · ${s.cut_count} not worth it · ${s.skip_count} neutral`
                              : config.label}
                          </p>
                          {completed && (
                            <p className="mt-1 max-w-2xl text-xs leading-5 text-text-muted">
                              {s.summary_message}
                            </p>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-3">
                        {completed && (
                          <div className="hidden gap-3 text-center sm:flex">
                            <div>
                              <p className="text-lg font-black text-altrion-400">{s.keep_count}</p>
                              <p className="text-[10px] text-text-muted">Happy</p>
                            </div>
                            <div>
                              <p className="text-lg font-black text-red-400">{s.cut_count}</p>
                              <p className="text-[10px] text-text-muted">Cut</p>
                            </div>
                          </div>
                        )}
                        {completed ? <ChevronRight size={18} className="text-text-muted" /> : null}
                      </div>
                    </div>
                  </Card>
                </motion.div>
              );
            })
          )}
        </motion.div>
      </motion.div>
    </DashboardLayout>
  );
}
