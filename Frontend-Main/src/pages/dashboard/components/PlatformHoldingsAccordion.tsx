import { memo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, Plus, Wallet } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Card } from '@/components/ui';
import { formatCurrency } from '@/utils';
import { ITEM_VARIANTS, ROUTES } from '@/constants';
import type { PlatformHolding } from '@/types';

interface PlatformHoldingsAccordionProps {
  holdings: PlatformHolding[];
  symbol: string;
  totalValue: number;
}

const PLATFORM_LOGOS: Record<string, string> = {
  'Coinbase': '/coinbase.svg',
  'MetaMask': '/metamask.png',
  'Robinhood': '/robinhood.svg',
};

export const PlatformHoldingsAccordion = memo(function PlatformHoldingsAccordion({
  holdings,
  symbol,
  totalValue,
}: PlatformHoldingsAccordionProps) {
  const navigate = useNavigate();
  const [expandedPlatforms, setExpandedPlatforms] = useState<Set<string>>(new Set());
  const liveTotalValue = totalValue;

  const togglePlatform = (platform: string) => {
    setExpandedPlatforms(prev => {
      const next = new Set(prev);
      if (next.has(platform)) {
        next.delete(platform);
      } else {
        next.add(platform);
      }
      return next;
    });
  };

  return (
    <motion.div variants={ITEM_VARIANTS}>
      <Card variant="bordered">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-purple-500/20 flex items-center justify-center">
            <Wallet size={20} className="text-purple-400" />
          </div>
          <h3 className="font-display text-xl font-semibold text-text-primary">
            Your Holdings
          </h3>
        </div>

        <div className="space-y-2">
          {holdings.map((holding) => {
            const isExpanded = expandedPlatforms.has(holding.platform);
            const holdingLiveValue = holding.value;
            const percentage = liveTotalValue > 0 ? (holdingLiveValue / liveTotalValue) * 100 : 0;
            const logoSrc = PLATFORM_LOGOS[holding.platform];

            return (
              <div
                key={holding.platform}
                className="border border-dark-border rounded-xl overflow-hidden bg-dark-elevated/50"
              >
                <button
                  onClick={() => togglePlatform(holding.platform)}
                  className="w-full px-4 py-3 flex items-center justify-between hover:bg-dark-elevated transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-dark-card border border-dark-border flex items-center justify-center overflow-hidden">
                      {logoSrc ? (
                        <img
                          src={logoSrc}
                          alt={holding.platform}
                          className="w-6 h-6 object-contain"
                        />
                      ) : (
                        <span className="text-xs font-bold text-text-muted">
                          {holding.platform.slice(0, 2).toUpperCase()}
                        </span>
                      )}
                    </div>
                    <div className="text-left">
                      <p className="font-medium text-text-primary">{holding.platform}</p>
                      <p className="text-sm text-text-muted">
                        {holding.amount.toLocaleString()} {symbol}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <p className="font-semibold text-text-primary">
                        {formatCurrency(holdingLiveValue)}
                      </p>
                      <p className="text-xs text-text-muted">{percentage.toFixed(1)}%</p>
                    </div>
                    <ChevronDown
                      size={18}
                      className={`text-text-muted transition-transform duration-200 ${
                        isExpanded ? 'rotate-180' : ''
                      }`}
                    />
                  </div>
                </button>

                <AnimatePresence>
                  {isExpanded && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                    >
                      <div className="px-4 pb-4 pt-4 border-t border-dark-border">
                        <div className="mb-5">
                          <div className="flex items-center justify-between text-xs text-text-muted mb-2">
                            <span>Portfolio Share</span>
                            <span>{percentage.toFixed(1)}%</span>
                          </div>
                          <div className="h-1.5 bg-dark-border rounded-full overflow-hidden">
                            <motion.div
                              className="h-full bg-gradient-to-r from-altrion-400 to-altrion-500 rounded-full"
                              initial={{ width: 0 }}
                              animate={{ width: `${percentage}%` }}
                              transition={{ duration: 0.5 }}
                            />
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                          <div className="p-3 bg-dark-card rounded-xl">
                            <p className="text-xs text-text-muted mb-1">Amount</p>
                            <p className="font-semibold text-text-primary">
                              {holding.amount.toLocaleString()} {symbol}
                            </p>
                          </div>
                          <div className="p-3 bg-dark-card rounded-xl">
                            <p className="text-xs text-text-muted mb-1">Value</p>
                            <p className="font-semibold text-altrion-400">
                              {formatCurrency(holdingLiveValue)}
                            </p>
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
        </div>

        <button
          onClick={() => navigate(ROUTES.CONNECT_SELECT)}
          className="mt-4 w-full px-4 py-3 border-2 border-dashed border-dark-border rounded-xl flex items-center justify-center gap-2 text-text-muted hover:text-text-primary hover:border-altrion-500/50 transition-all"
        >
          <Plus size={18} />
          Add from new platform
        </button>
      </Card>
    </motion.div>
  );
});
