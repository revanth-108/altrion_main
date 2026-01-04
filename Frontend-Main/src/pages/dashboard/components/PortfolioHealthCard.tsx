import { memo } from 'react';
import { Shield } from 'lucide-react';
import { Card } from '@/components/ui';

interface PortfolioHealthCardProps {
  riskScore: number;
}

export const PortfolioHealthCard = memo(function PortfolioHealthCard({
  riskScore,
}: PortfolioHealthCardProps) {
  return (
    <Card variant="bordered">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 rounded-xl bg-accent-cyan/20 flex items-center justify-center">
          <Shield size={20} className="text-accent-cyan" />
        </div>
        <div>
          <h3 className="font-display text-xl font-semibold text-text-primary">
            Portfolio Health
          </h3>
          <p className="text-sm text-text-secondary">Overall performance score</p>
        </div>
      </div>

      {/* Health Score Circle */}
      <div className="flex items-center justify-center mb-4">
        <div className="relative">
          <svg width="140" height="140" viewBox="0 0 140 140" role="img" aria-label={`Portfolio health score: ${riskScore} out of 100`}>
            <title>Portfolio Health Score</title>
            <circle cx="70" cy="70" r="60" fill="none" className="stroke-dark-elevated" strokeWidth="12" />
            <circle
              cx="70"
              cy="70"
              r="60"
              fill="none"
              stroke="#10b981"
              strokeWidth="12"
              strokeDasharray="377"
              strokeDashoffset={377 - (377 * riskScore) / 100}
              transform="rotate(-90 70 70)"
              strokeLinecap="round"
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-4xl font-bold text-text-primary">{riskScore}</span>
            <span className="text-xs text-text-muted">/ 100</span>
          </div>
        </div>
      </div>

      {/* Health Metrics */}
      <div className="space-y-3">
        <HealthMetric label="Diversification" status="Good" statusColor="text-green-400" />
        <HealthMetric label="Risk Exposure" status="Moderate" statusColor="text-amber-400" />
        <HealthMetric label="Performance" status="Strong" statusColor="text-green-400" />
      </div>
    </Card>
  );
});

const HealthMetric = memo(function HealthMetric({
  label,
  status,
  statusColor,
}: {
  label: string;
  status: string;
  statusColor: string;
}) {
  return (
    <div className="flex items-center justify-between p-2 bg-dark-elevated rounded-lg">
      <span className="text-sm text-text-secondary">{label}</span>
      <span className={`text-sm font-semibold ${statusColor}`}>{status}</span>
    </div>
  );
});
