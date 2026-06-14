import { memo, useMemo } from 'react';
import { motion } from 'framer-motion';
import { ITEM_VARIANTS } from '@/constants';
import { buildSankeyLayout } from '@/constants/cashflow';
import type { CashFlowCategory } from '@/types/cashflow.types';

interface SankeyLegendProps {
  categories: CashFlowCategory[];
  income: number;
  highlightedCat: string | null;
  onHighlight: (catId: string | null) => void;
}

export const SankeyLegend = memo(function SankeyLegend({ categories, income, highlightedCat, onHighlight }: SankeyLegendProps) {
  const layout = useMemo(() => buildSankeyLayout(categories, income), [categories, income]);

  if (layout.length === 0) return null;

  return (
    <motion.div variants={ITEM_VARIANTS}>
      <div className="flex gap-3 sm:gap-4 flex-wrap items-center">
        {layout.map(cat => {
          const dimmed = !!highlightedCat && highlightedCat !== cat.id;
          return (
            <div
              key={cat.id}
              className="flex items-center gap-2 cursor-pointer transition-opacity duration-200 px-3 py-1.5 rounded-lg hover:bg-dark-elevated"
              style={{ opacity: dimmed ? 0.2 : 1 }}
              onMouseEnter={() => onHighlight(cat.id)}
              onMouseLeave={() => onHighlight(null)}
            >
              <div className="w-2.5 h-2.5 rounded-md shrink-0" style={{ background: cat.color }} />
              <span className="text-xs font-medium text-text-secondary">{cat.name}</span>
              <span className="text-xs text-text-muted">{cat.pct}%</span>
            </div>
          );
        })}
      </div>
    </motion.div>
  );
});
