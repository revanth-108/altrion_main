import { memo, useMemo } from 'react';
import { PieChart } from 'lucide-react';
import { Button, Card } from '@/components/ui';

interface AssetAllocationCardProps {
  cryptoPercent: number;
  stocksPercent: number;
  cashPercent: number;
  targetAllocation?: { crypto: number; stocks: number; cash: number };
  onRebalance?: () => void;
}

export const AssetAllocationCard = memo(function AssetAllocationCard({
  cryptoPercent,
  stocksPercent,
  cashPercent,
  targetAllocation = { crypto: 60, stocks: 30, cash: 10 },
  onRebalance,
}: AssetAllocationCardProps) {
  const isOutOfBalance = useMemo(() => {
    return (
      Math.abs(cryptoPercent - targetAllocation.crypto) > 5 ||
      Math.abs(stocksPercent - targetAllocation.stocks) > 5 ||
      Math.abs(cashPercent - targetAllocation.cash) > 5
    );
  }, [cryptoPercent, stocksPercent, cashPercent, targetAllocation]);

  return (
    <Card variant="bordered">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 rounded-xl bg-purple-500/20 flex items-center justify-center">
          <PieChart size={20} className="text-purple-400" />
        </div>
        <div>
          <h3 className="font-display text-xl font-semibold text-text-primary">
            Asset Allocation
          </h3>
          <p className="text-sm text-text-secondary">Portfolio distribution</p>
        </div>
      </div>

      {/* Pie Chart */}
      <div className="flex items-center justify-center mb-4">
        <svg width="140" height="140" viewBox="0 0 140 140" role="img" aria-label="Asset allocation pie chart">
          <title>Asset Allocation</title>
          <circle
            cx="70"
            cy="70"
            r="60"
            fill="none"
            stroke="#10b981"
            strokeWidth="20"
            strokeDasharray={`${cryptoPercent * 3.77} 377`}
            strokeDashoffset="0"
            transform="rotate(-90 70 70)"
          />
          <circle
            cx="70"
            cy="70"
            r="60"
            fill="none"
            stroke="#3b82f6"
            strokeWidth="20"
            strokeDasharray={`${stocksPercent * 3.77} 377`}
            strokeDashoffset={`-${cryptoPercent * 3.77}`}
            transform="rotate(-90 70 70)"
          />
          <circle
            cx="70"
            cy="70"
            r="60"
            fill="none"
            stroke="#f59e0b"
            strokeWidth="20"
            strokeDasharray={`${cashPercent * 3.77} 377`}
            strokeDashoffset={`-${(cryptoPercent + stocksPercent) * 3.77}`}
            transform="rotate(-90 70 70)"
          />
        </svg>
      </div>

      {/* Legend */}
      <div className="space-y-2 mb-4">
        <AllocationRow color="bg-green-500" label="Crypto" value={cryptoPercent} />
        <AllocationRow color="bg-blue-500" label="Stocks" value={stocksPercent} />
        <AllocationRow color="bg-amber-500" label="Cash" value={cashPercent} />
      </div>

      {isOutOfBalance && (
        <Button variant="secondary" fullWidth onClick={onRebalance}>
          Rebalance Portfolio
        </Button>
      )}
    </Card>
  );
});

const AllocationRow = memo(function AllocationRow({
  color,
  label,
  value,
}: {
  color: string;
  label: string;
  value: number;
}) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        <div className={`w-3 h-3 rounded-full ${color}`} />
        <span className="text-sm text-text-secondary">{label}</span>
      </div>
      <span className="text-sm font-semibold text-text-primary">{value.toFixed(1)}%</span>
    </div>
  );
});
