import { motion } from 'framer-motion';
import { Trophy } from 'lucide-react';
import { SCALE_IN } from '@/constants/animations';

interface StreakBadgeProps {
  streak: number;
}

export function StreakBadge({ streak }: StreakBadgeProps) {
  const isMilestone = streak > 0 && streak % 4 === 0;

  return (
    <div className="flex flex-col items-end gap-1.5">
      {isMilestone && (
        <motion.div
          initial={{ opacity: 0, y: -4, scale: 0.9 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ type: 'spring', stiffness: 320, damping: 22 }}
          className="flex items-center gap-1.5 rounded-full bg-gradient-to-r from-amber-400 to-yellow-300 px-3 py-1 shadow-[0_0_18px_rgba(251,191,36,0.45)]"
        >
          <Trophy size={12} className="text-amber-900" />
          <span className="text-[10px] font-black uppercase tracking-[0.18em] text-amber-900">
            Milestone!
          </span>
        </motion.div>
      )}
      <motion.div
        variants={SCALE_IN}
        initial="hidden"
        animate="visible"
        className="flex items-center gap-2 rounded-full bg-gradient-to-r from-amber-600/80 to-orange-500/80 px-4 py-2 shadow-lg backdrop-blur-sm"
      >
        <span className="text-base leading-none">🔥</span>
        <span className="text-sm font-semibold text-white">Week {streak} streak</span>
      </motion.div>
    </div>
  );
}
