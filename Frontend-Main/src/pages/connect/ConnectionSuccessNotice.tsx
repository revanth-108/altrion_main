import { motion } from 'framer-motion';
import { CheckCircle2, Loader2 } from 'lucide-react';

interface ConnectionSuccessNoticeProps {
  title: string;
  message: string;
  destinationLabel: string;
}

export function ConnectionSuccessNotice({
  title,
  message,
  destinationLabel,
}: ConnectionSuccessNoticeProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      role="status"
      aria-live="polite"
      className="rounded-lg border border-green-500/30 bg-green-500/10 p-5"
    >
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 flex-none items-center justify-center rounded-lg bg-green-500/15">
          <CheckCircle2 size={22} className="text-green-400" />
        </span>
        <div>
          <h2 className="font-display text-lg font-semibold text-text-primary">
            {title}
          </h2>
          <p className="mt-1 text-sm leading-6 text-text-secondary">{message}</p>
          <p className="mt-3 inline-flex items-center gap-2 text-xs font-medium text-green-400">
            <Loader2 size={13} className="animate-spin" />
            Redirecting to {destinationLabel}
          </p>
        </div>
      </div>
    </motion.div>
  );
}
