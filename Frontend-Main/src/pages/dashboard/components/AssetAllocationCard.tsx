import { memo } from 'react';
import { PieChart } from 'lucide-react';
import { Card } from '@/components/ui';
import { SectionHeading } from './SectionHeading';

interface AssetAllocationCardProps {
  cryptoPercent: number;
  stocksPercent: number;
  cashPercent: number;
}

export const AssetAllocationCard = memo(function AssetAllocationCard({
  cryptoPercent,
  stocksPercent,
  cashPercent,
}: AssetAllocationCardProps) {
  const slices = [
    { color: '#10b981', value: Math.max(0, cryptoPercent) },
    { color: '#3b82f6', value: Math.max(0, stocksPercent) },
    { color: '#f59e0b', value: Math.max(0, cashPercent) },
  ];
  const totalPercent = slices.reduce((sum, slice) => sum + slice.value, 0);
  const hasAllocation = totalPercent > 0;

  return (
    <Card variant="bordered">
      <SectionHeading icon={<PieChart size={17} strokeWidth={1.75} />} title="Asset Allocation" eyebrow="Composition" />

      <div className="mt-5 mb-3 flex items-center justify-center sm:mb-4">
        <svg width="120" height="120" viewBox="0 0 140 140" className="sm:h-[140px] sm:w-[140px]" role="img" aria-label="Asset allocation pie chart">
          <title>Asset Allocation</title>
          <circle cx="70" cy="70" r="60" fill="none" className="stroke-dark-elevated" strokeWidth="20" />
          {hasAllocation ? (
            <>
              <circle cx="70" cy="70" r="60" fill="none" stroke={slices[0].color} strokeWidth="20" strokeDasharray={`${slices[0].value * 3.77} 377`} strokeDashoffset="0" transform="rotate(-90 70 70)" />
              <circle cx="70" cy="70" r="60" fill="none" stroke={slices[1].color} strokeWidth="20" strokeDasharray={`${slices[1].value * 3.77} 377`} strokeDashoffset={`-${slices[0].value * 3.77}`} transform="rotate(-90 70 70)" />
              <circle cx="70" cy="70" r="60" fill="none" stroke={slices[2].color} strokeWidth="20" strokeDasharray={`${slices[2].value * 3.77} 377`} strokeDashoffset={`-${(slices[0].value + slices[1].value) * 3.77}`} transform="rotate(-90 70 70)" />
            </>
          ) : null}
          {!hasAllocation ? (
            <text x="70" y="74" textAnchor="middle" className="fill-text-muted text-[12px]">
              No assets
            </text>
          ) : null}
        </svg>
      </div>

      <div className="mb-1 space-y-1.5 sm:space-y-2">
        <AllocationRow color="bg-green-500" label="Crypto" value={cryptoPercent} />
        <AllocationRow color="bg-blue-500" label="Stocks" value={stocksPercent} />
        <AllocationRow color="bg-amber-500" label="Cash" value={cashPercent} />
      </div>
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
      <div className="flex items-center gap-2.5">
        <div className={`h-2 w-2 rounded-full ${color}`} />
        <span className="text-sm text-text-secondary">{label}</span>
      </div>
      <span className="text-sm font-semibold text-text-primary">{value.toFixed(1)}%</span>
    </div>
  );
});
