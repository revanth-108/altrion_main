import { memo } from 'react';
import { motion } from 'framer-motion';
import { AlertCircle, X } from 'lucide-react';

interface WarningsBannerProps {
  warnings: Array<{ type: string; message: string }>;
  onDismiss: () => void;
}

export const WarningsBanner = memo(function WarningsBanner({
  warnings,
  onDismiss,
}: WarningsBannerProps) {
  if (warnings.length === 0) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4 flex items-start justify-between gap-4"
    >
      <div className="flex items-start gap-3 flex-1">
        <AlertCircle className="text-amber-400 mt-0.5" size={20} />
        <div className="flex-1">
          <h4 className="text-amber-400 font-semibold mb-1">Portfolio Warnings</h4>
          <ul className="text-sm text-text-secondary space-y-1">
            {warnings.map((warning, idx) => (
              <li key={idx}>• {warning.message}</li>
            ))}
          </ul>
        </div>
      </div>
      <button
        onClick={onDismiss}
        className="text-text-muted hover:text-text-primary transition-colors"
      >
        <X size={18} />
      </button>
    </motion.div>
  );
});
