import { memo, useMemo } from 'react';
import { Info, Shield } from 'lucide-react';
import { Card, Tooltip } from '@/components/ui';
import { usePortfolioHealth } from '@/hooks/queries/usePortfolio';

const CIRCUMFERENCE = 2 * Math.PI * 60;
const GAP_DEG = 2.5;
const AVAILABLE_DEG = 360 - GAP_DEG * 7; // 342.5°

const LIFE_STAGE_LABELS: Record<string, string> = {
  early: 'Early Stage',
  mid: 'Mid Career',
  pre_retirement: 'Pre-Retirement',
  retirement: 'Retirement',
};

const SOLVENCY_COLORS: Record<string, string> = {
  solvent: 'text-green-400 bg-green-400/10',
  at_risk: 'text-amber-400 bg-amber-400/10',
  insolvent: 'text-red-400 bg-red-400/10',
};

const DIMENSION_META: {
  key: 'd1_liquidity' | 'd2_investment' | 'd3_retirement' | 'd4_crypto' | 'd5_defi' | 'd6_debt' | 'd7_velocity';
  label: string;
  weight: number;
}[] = [
  { key: 'd1_liquidity',   label: 'Liquidity',   weight: 17 },
  { key: 'd2_investment',  label: 'Investment',  weight: 24 },
  { key: 'd3_retirement',  label: 'Retirement',  weight: 15 },
  { key: 'd4_crypto',      label: 'Crypto',      weight: 19 },
  { key: 'd5_defi',        label: 'DeFi',        weight:  6 },
  { key: 'd6_debt',        label: 'Debt',        weight: 12 },
  { key: 'd7_velocity',    label: 'Velocity',    weight:  7 },
];

function segmentColor(score: number | null): string {
  if (score === null) return '#374151';
  if (score >= 65) return '#10b981';
  if (score >= 45) return '#f59e0b';
  return '#ef4444';
}

function clampScore(score: number): number {
  return Math.min(100, Math.max(0, score));
}

function scoreTextColor(score: number | null): string {
  if (score === null) return 'text-text-muted';
  if (score >= 65) return 'text-green-400';
  if (score >= 45) return 'text-amber-400';
  return 'text-red-400';
}

const DonutSegment = memo(function DonutSegment({
  startDeg,
  degrees,
  color,
  title,
}: {
  startDeg: number;
  degrees: number;
  color: string;
  title: string;
}) {
  const arcLen = (degrees / 360) * CIRCUMFERENCE;
  return (
    <circle
      cx="70"
      cy="70"
      r="60"
      fill="none"
      stroke={color}
      strokeWidth="12"
      strokeDasharray={`${arcLen} ${CIRCUMFERENCE - arcLen}`}
      strokeDashoffset={0}
      transform={`rotate(${-90 + startDeg} 70 70)`}
      strokeLinecap="butt"
    >
      <title>{title}</title>
    </circle>
  );
});

export const PortfolioHealthCard = memo(function PortfolioHealthCard() {
  const { data: health, isLoading } = usePortfolioHealth();
  const overallScore = health?.overall_score ?? null;
  // Only clamp when we actually have a score; keep null so we don't show "0 / 100"
  const score = overallScore !== null ? clampScore(overallScore) : 0;
  const completeness = Math.max(0, Math.min(100, health?.completeness_pct ?? 0));
  const lifeStage = health?.life_stage ?? '';
  const solvencyTier = health?.solvency_tier ?? 'solvent';
  const solvencyClass = SOLVENCY_COLORS[solvencyTier] ?? SOLVENCY_COLORS.solvent;

  const segments = useMemo(() => {
    let cumDeg = 0;
    return DIMENSION_META.map((d) => {
      const degrees = (d.weight / 100) * AVAILABLE_DEG;
      const startDeg = cumDeg;
      cumDeg += degrees + GAP_DEG;
      const dimScore = health?.dimension_scores?.[d.key] ?? null;
      return {
        ...d,
        startDeg,
        degrees,
        color: segmentColor(dimScore),
        score: dimScore,
      };
    });
  }, [health]);

  return (
    <Card variant="bordered">
      {/* Header */}
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent-cyan/20">
            <Shield size={20} className="text-accent-cyan" />
          </div>
          <div>
            <p className="text-xs uppercase tracking-[0.16em] text-text-muted">AFHS</p>
            <div className="flex items-center gap-2">
              <h3 className="font-display text-lg font-bold text-text-primary sm:text-2xl">Portfolio Health</h3>
              <Tooltip
                content="AFHS combines available portfolio data across liquidity, investments, retirement, crypto, DeFi, debt, and velocity. Missing dimensions are excluded until enough data is connected."
                position="bottom"
              >
                <button
                  type="button"
                  className="text-text-muted transition-colors hover:text-text-secondary"
                  aria-label="What contributes to portfolio health score"
                >
                  <Info size={15} />
                </button>
              </Tooltip>
            </div>
          </div>
        </div>
        {!isLoading && lifeStage && (
          <span className="hidden rounded-full bg-accent-cyan/10 px-2.5 py-1 text-xs font-medium text-accent-cyan sm:inline-flex">
            {LIFE_STAGE_LABELS[lifeStage] ?? lifeStage}
          </span>
        )}
      </div>

      {/* Empty state */}
      {!isLoading && !health ? (
        <div className="flex min-h-[17rem] flex-col items-center justify-center px-4 text-center">
          <Shield size={34} className="mb-3 text-text-muted" strokeWidth={1.5} />
          <p className="font-display text-lg font-semibold text-text-primary">Not enough data yet</p>
          <p className="mt-2 max-w-sm text-sm leading-6 text-text-muted">
            Connect accounts and sync holdings before the health score is calculated.
          </p>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-4">
          {/* Donut ring */}
          <div className="relative">
            {isLoading ? (
              <div className="flex h-[140px] w-[140px] items-center justify-center">
                <div className="h-16 w-16 animate-spin rounded-full border-4 border-dark-elevated border-t-accent-cyan" />
              </div>
            ) : (
              <svg
                width="140"
                height="140"
                viewBox="0 0 140 140"
                role="img"
                aria-label={`AFHS score: ${score} out of 100`}
              >
                <title>AFHS Score</title>
                {/* Track */}
                <circle cx="70" cy="70" r="60" fill="none" className="stroke-dark-elevated" strokeWidth="12" />
                {/* Colored segments */}
                {segments.map((seg) => (
                  <DonutSegment
                    key={seg.key}
                    startDeg={seg.startDeg}
                    degrees={seg.degrees}
                    color={seg.color}
                    title={`${seg.label}: ${seg.score !== null ? Math.round(seg.score) : 'N/A'}`}
                  />
                ))}
              </svg>
            )}
            {/* Score in center */}
            {!isLoading && (
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className={`text-3xl font-bold sm:text-4xl ${scoreTextColor(overallScore)}`}>{score}</span>
                <span className="text-xs text-text-muted">/ 100</span>
              </div>
            )}
          </div>

          {/* Solvency + label */}
          {!isLoading && health && (
            <div className="flex flex-wrap items-center justify-center gap-2">
              <div className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${solvencyClass}`}>
                {solvencyTier === 'solvent' ? 'Solvent' : solvencyTier === 'at_risk' ? 'At Risk' : 'Insolvent'}
              </div>
              <span className="text-xs text-text-muted">{health.active_dimensions} of 7 active</span>
              {health.overall_label && (
                <span className="text-xs text-text-muted">{health.overall_label}</span>
              )}
            </div>
          )}

          {/* Compact legend */}
          {isLoading ? (
            <div className="grid w-full grid-cols-4 gap-x-4 gap-y-1.5 px-2">
              {DIMENSION_META.map((d) => (
                <div key={d.key} className="flex animate-pulse items-center gap-1.5">
                  <span className="h-2 w-2 flex-shrink-0 rounded-full bg-dark-elevated" />
                  <span className="h-2.5 w-12 rounded bg-dark-elevated" />
                </div>
              ))}
            </div>
          ) : (
            <div className="grid w-full grid-cols-4 gap-x-4 gap-y-2 px-2">
              {segments.map((seg) => (
                <div key={seg.key} className="flex items-center gap-1.5" title={seg.label}>
                  <span
                    className="h-2 w-2 flex-shrink-0 rounded-full"
                    style={{ backgroundColor: seg.color }}
                  />
                  <span className="truncate text-xs text-text-muted">{seg.label}</span>
                </div>
              ))}
            </div>
          )}

          {/* Completeness note */}
          {!isLoading && health && completeness < 100 && (
            <p className="text-center text-xs text-text-muted">
              {completeness}% data completeness · Connect more accounts to improve accuracy
            </p>
          )}
        </div>
      )}
    </Card>
  );
});
