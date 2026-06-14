import { useMemo, useState } from 'react';
import { formatCurrency } from '@/utils';
import type { ChartPeriod } from '@/utils';
import type { MarketChartPoint } from '@/types';

interface RobinhoodMarketChartProps {
  points: MarketChartPoint[];
  period: ChartPeriod;
  emptyMessage?: string;
}

const WIDTH = 1000;
const HEIGHT = 320;
const PADDING = { top: 12, right: 12, bottom: 18, left: 12 };

function emaSmooth(points: MarketChartPoint[], alpha = 0.25): MarketChartPoint[] {
  if (points.length <= 2) return points;

  const result: MarketChartPoint[] = [];
  let previous = points[0].value;

  for (const point of points) {
    previous = (alpha * point.value) + ((1 - alpha) * previous);
    result.push({ ...point, value: previous });
  }

  return result;
}

function formatTickTime(timestamp: number, period: ChartPeriod): string {
  const date = new Date(timestamp);

  if (period === '1H') return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (period === '24H') return date.toLocaleTimeString([], { hour: '2-digit' });
  if (period === '7D') return date.toLocaleDateString([], { weekday: 'short' });
  if (period === '1M') return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
  return date.toLocaleDateString([], { month: 'short' });
}

export function RobinhoodMarketChart({
  points,
  period,
  emptyMessage = 'No market chart data available for this selection.',
}: RobinhoodMarketChartProps) {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  const processedPoints = useMemo(() => {
    if (points.length === 0) return [];

    const sorted = [...points].sort((a, b) => a.timestamp - b.timestamp);
    return emaSmooth(sorted);
  }, [points]);

  const domain = useMemo(() => {
    if (processedPoints.length === 0) return { min: 0, max: 1 };

    const values = processedPoints.map((point) => point.value);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const pad = Math.max((max - min) * 0.14, max * 0.004, 1);

    return { min: min - pad, max: max + pad };
  }, [processedPoints]);

  const xFor = (index: number): number => {
    if (processedPoints.length <= 1) return PADDING.left;
    const drawable = WIDTH - PADDING.left - PADDING.right;
    return PADDING.left + (index / (processedPoints.length - 1)) * drawable;
  };

  const yFor = (value: number): number => {
    const drawable = HEIGHT - PADDING.top - PADDING.bottom;
    if (domain.max === domain.min) return PADDING.top + (drawable / 2);
    const t = (value - domain.min) / (domain.max - domain.min);
    return HEIGHT - PADDING.bottom - (t * drawable);
  };

  const linePath = useMemo(() => {
    if (processedPoints.length === 0) return '';

    return processedPoints
      .map((point, index) => `${index === 0 ? 'M' : 'L'} ${xFor(index)} ${yFor(point.value)}`)
      .join(' ');
  }, [processedPoints, domain]);

  const areaPath = useMemo(() => {
    if (processedPoints.length === 0) return '';

    const bottom = HEIGHT - PADDING.bottom;
    const line = processedPoints
      .map((point, index) => `L ${xFor(index)} ${yFor(point.value)}`)
      .join(' ');
    return `M ${PADDING.left} ${bottom} ${line} L ${xFor(processedPoints.length - 1)} ${bottom} Z`;
  }, [processedPoints, domain]);

  const yTicks = useMemo(() => {
    const steps = 4;
    return Array.from({ length: steps }, (_, idx) => {
      const t = idx / (steps - 1);
      const value = domain.max - (t * (domain.max - domain.min));
      return {
        value,
        y: yFor(value),
      };
    });
  }, [domain]);

  const xTickIndices = useMemo(() => {
    if (processedPoints.length === 0) return [];
    if (processedPoints.length < 3) return [0, processedPoints.length - 1];
    return [0, Math.floor(processedPoints.length / 2), processedPoints.length - 1];
  }, [processedPoints.length]);

  const isPositiveTrend = useMemo(() => {
    if (processedPoints.length < 2) return true;
    return processedPoints[processedPoints.length - 1].value >= processedPoints[0].value;
  }, [processedPoints]);

  const trendColor = isPositiveTrend ? '#22c55e' : '#ef4444';

  if (processedPoints.length < 2) {
    return (
      <div className="h-72 w-full rounded-xl border border-dark-border bg-dark-elevated/30 flex items-center justify-center text-sm text-text-muted">
        {emptyMessage}
      </div>
    );
  }

  const hoverPoint = hoverIndex !== null ? processedPoints[hoverIndex] : null;

  return (
    <div className="relative">
      <div
        className="relative h-72 w-full"
        onMouseMove={(event) => {
          const rect = event.currentTarget.getBoundingClientRect();
          const x = event.clientX - rect.left;
          const ratio = Math.max(0, Math.min(1, x / rect.width));
          const index = Math.round(ratio * (processedPoints.length - 1));
          setHoverIndex(index);
        }}
        onMouseLeave={() => setHoverIndex(null)}
      >
        <svg className="w-full h-full" viewBox={`0 0 ${WIDTH} ${HEIGHT}`} preserveAspectRatio="none">
          <defs>
            <linearGradient id="marketAreaGradient" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor={trendColor} stopOpacity="0.30" />
              <stop offset="100%" stopColor={trendColor} stopOpacity="0.00" />
            </linearGradient>
          </defs>

          {yTicks.map((tick, idx) => (
            <line
              key={idx}
              x1={PADDING.left}
              y1={tick.y}
              x2={WIDTH - PADDING.right}
              y2={tick.y}
              stroke="#1f2937"
              strokeWidth="1"
              strokeDasharray="3 5"
            />
          ))}

          <path d={areaPath} fill="url(#marketAreaGradient)" />
          <path
            d={linePath}
            fill="none"
            stroke={trendColor}
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {hoverIndex !== null && (
            <>
              <line
                x1={xFor(hoverIndex)}
                y1={PADDING.top}
                x2={xFor(hoverIndex)}
                y2={HEIGHT - PADDING.bottom}
                stroke={trendColor}
                strokeWidth="1"
                strokeDasharray="4 4"
                opacity="0.65"
              />
              <circle
                cx={xFor(hoverIndex)}
                cy={yFor(processedPoints[hoverIndex].value)}
                r="5"
                fill={trendColor}
              />
            </>
          )}
        </svg>

        {hoverPoint && (
          <div className="absolute top-2 right-2 bg-dark-card/95 border border-dark-border rounded-md px-3 py-2">
            <p className="text-sm font-semibold text-text-primary">{formatCurrency(hoverPoint.value)}</p>
            <p className="text-xs text-text-muted">{formatTickTime(hoverPoint.timestamp, period)}</p>
          </div>
        )}

        <div className="absolute left-0 top-0 h-full flex flex-col justify-between py-2 pointer-events-none">
          {yTicks.map((tick, idx) => (
            <span key={idx} className="text-xs text-text-muted pr-2 bg-dark-bg/40 rounded">
              {formatCurrency(tick.value)}
            </span>
          ))}
        </div>
      </div>

      <div className="flex justify-between mt-2">
        {xTickIndices.map((index) => (
          <span key={index} className="text-xs text-text-muted">
            {formatTickTime(processedPoints[index].timestamp, period)}
          </span>
        ))}
      </div>
    </div>
  );
}
