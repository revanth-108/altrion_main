import { motion } from 'framer-motion';

interface ProgressBarProps {
  highWaterMark: number;
  currentIndex: number;
  ratedCount: number;
  total: number;
}

export function ProgressBar({ highWaterMark, currentIndex, ratedCount, total }: ProgressBarProps) {
  return (
    <div className="space-y-2.5">
      <div className="flex gap-1.5">
        {Array.from({ length: total }).map((_, i) => {
          const isCompleted = i < highWaterMark;
          const isActive = i === highWaterMark && i === currentIndex;
          return (
            <motion.div
              key={i}
              className={`relative h-[3px] flex-1 rounded-full ${
                isCompleted
                  ? 'bg-altrion-400'
                  : isActive
                    ? 'bg-altrion-300'
                    : 'bg-dark-elevated'
              }`}
              initial={false}
              animate={{
                backgroundColor: isCompleted
                  ? 'var(--color-altrion-400)'
                  : isActive
                    ? 'var(--color-altrion-300)'
                    : 'var(--color-dark-elevated)',
              }}
              transition={{ duration: 0.3 }}
            >
              {isActive && (
                <motion.div
                  layoutId="progress-dot"
                  className="absolute -top-[3px] right-0 h-[9px] w-[9px] rounded-full bg-altrion-300"
                  transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                />
              )}
            </motion.div>
          );
        })}
      </div>
      <div className="flex items-center justify-between">
        <p className="text-xs text-text-muted">
          <span className="font-semibold text-text-secondary">{ratedCount}</span> of {total} rated this week
        </p>
        <p className="text-xs text-text-muted">← Cut · Keep →</p>
      </div>
    </div>
  );
}
