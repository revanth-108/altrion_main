import { memo, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { TrendingUp } from 'lucide-react';
import { Card } from '@/components/ui';
import { generateChartData, normalizeChartY, normalizeChartX, formatCurrency } from '@/utils';
import { ITEM_VARIANTS } from '@/constants';
import type { ChartPeriod } from '@/utils';

interface PortfolioChartProps {
  totalValue: number;
  chartPeriod: ChartPeriod;
  onPeriodChange: (period: ChartPeriod) => void;
}

const PERIODS: ChartPeriod[] = ['1H', '24H', '7D', '1M', '1Y'];

export const PortfolioChart = memo(function PortfolioChart({
  totalValue,
  chartPeriod,
  onPeriodChange,
}: PortfolioChartProps) {
  const [hoveredPoint, setHoveredPoint] = useState<{ index: number; x: number; y: number } | null>(null);

  const chartData = useMemo(() => generateChartData(totalValue, chartPeriod), [totalValue, chartPeriod]);
  const { maxValue, minValue } = useMemo(() => ({
    maxValue: Math.max(...chartData.map((d) => d.value)),
    minValue: Math.min(...chartData.map((d) => d.value)),
  }), [chartData]);

  const pathD = useMemo(() => {
    return chartData
      .map((point, i) => `${i === 0 ? 'M' : 'L'} ${normalizeChartX(i, chartData.length)},${normalizeChartY(point.value, minValue, maxValue)}`)
      .join(' ');
  }, [chartData, minValue, maxValue]);

  const areaD = useMemo(() => {
    return `M 0,200 ${chartData.map((point, i) => `L ${normalizeChartX(i, chartData.length)},${normalizeChartY(point.value, minValue, maxValue)}`).join(' ')} L 800,200 Z`;
  }, [chartData, minValue, maxValue]);

  return (
    <motion.div variants={ITEM_VARIANTS}>
      <Card variant="bordered">
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-accent-cyan/20 flex items-center justify-center">
              <TrendingUp size={20} className="text-accent-cyan" />
            </div>
            <div>
              <h3 className="font-display text-xl font-semibold text-text-primary">
                Portfolio Value
              </h3>
              <p className="text-sm text-text-secondary">Track your growth over time</p>
            </div>
          </div>

          {/* Time Period Filters */}
          <div className="flex gap-1 bg-dark-elevated p-1 rounded-lg">
            {PERIODS.map((period) => (
              <button
                key={period}
                onClick={() => onPeriodChange(period)}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                  chartPeriod === period
                    ? 'bg-altrion-500 text-text-primary'
                    : 'text-text-muted hover:text-text-primary'
                }`}
              >
                {period}
              </button>
            ))}
          </div>
        </div>

        {/* Chart */}
        <div
          className="relative h-64 w-full pl-10"
          onMouseMove={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            const x = e.clientX - rect.left - 40; // Subtract padding
            const chartWidth = rect.width - 40;
            const index = Math.round((x / chartWidth) * (chartData.length - 1));
            if (index >= 0 && index < chartData.length) {
              setHoveredPoint({ index, x: e.clientX - rect.left, y: e.clientY - rect.top });
            }
          }}
          onMouseLeave={() => setHoveredPoint(null)}
        >
          <svg
            className="w-full h-full"
            viewBox="0 0 800 200"
            preserveAspectRatio="none"
            role="img"
            aria-label="Portfolio value chart"
          >
            <title>Portfolio Value Over Time</title>
            {/* Gradient Definitions */}
            <defs>
              <linearGradient id="portfolioChartGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor="#10b981" stopOpacity="0.3" />
                <stop offset="100%" stopColor="#10b981" stopOpacity="0.0" />
              </linearGradient>
              <linearGradient id="portfolioLineGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#34d399" />
                <stop offset="100%" stopColor="#10b981" />
              </linearGradient>
            </defs>

            {/* Grid Lines */}
            {[0, 1, 2, 3, 4].map((i) => (
              <line
                key={i}
                x1="0"
                y1={i * 50}
                x2="800"
                y2={i * 50}
                stroke="#1f2937"
                strokeWidth="1"
                strokeDasharray="4 4"
              />
            ))}

            {/* Area Fill */}
            <path d={areaD} fill="url(#portfolioChartGradient)" />

            {/* Line */}
            <path
              d={pathD}
              fill="none"
              stroke="url(#portfolioLineGradient)"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
            />

            {/* Crosshair Line */}
            {hoveredPoint && (
              <line
                x1={normalizeChartX(hoveredPoint.index, chartData.length)}
                y1="0"
                x2={normalizeChartX(hoveredPoint.index, chartData.length)}
                y2="200"
                stroke="#10b981"
                strokeWidth="1"
                strokeDasharray="4 4"
                opacity="0.7"
              />
            )}

            {/* Data Points */}
            {chartData.map((point, i) => (
              <circle
                key={i}
                cx={normalizeChartX(i, chartData.length)}
                cy={normalizeChartY(point.value, minValue, maxValue)}
                r={hoveredPoint?.index === i ? 6 : 4}
                fill="#10b981"
                className={hoveredPoint?.index === i ? 'opacity-100' : 'opacity-0'}
                style={{ transition: 'all 0.15s ease' }}
              />
            ))}

            {/* Highlighted Point Glow */}
            {hoveredPoint && (
              <circle
                cx={normalizeChartX(hoveredPoint.index, chartData.length)}
                cy={normalizeChartY(chartData[hoveredPoint.index].value, minValue, maxValue)}
                r="10"
                fill="#10b981"
                opacity="0.3"
              />
            )}
          </svg>

          {/* Tooltip */}
          {hoveredPoint && (
            <div
              className="absolute z-10 pointer-events-none"
              style={{
                left: `${hoveredPoint.x}px`,
                top: '10px',
                transform: 'translateX(-50%)',
              }}
            >
              <div className="bg-dark-card border border-dark-border rounded-lg px-3 py-2 shadow-lg">
                <p className="text-lg font-bold text-altrion-400">
                  {formatCurrency(chartData[hoveredPoint.index].value)}
                </p>
                <p className="text-xs text-text-muted">
                  {chartData[hoveredPoint.index].label}
                </p>
              </div>
            </div>
          )}

          {/* Value Labels on Y-axis */}
          <div className="absolute left-0 top-0 h-full flex flex-col justify-between py-2">
            {[maxValue, (maxValue + minValue) / 2, minValue].map((val, i) => (
              <span key={i} className="text-xs text-text-muted w-9 text-right">
                ${(val / 1000).toFixed(0)}k
              </span>
            ))}
          </div>
        </div>

        {/* X-axis Labels */}
        <div className="flex justify-between mt-3 pl-10 pr-2">
          {chartData.map((point, i) => {
            // Show only first, middle, and last labels to avoid clutter
            if (chartPeriod === '1M' || chartPeriod === '24H') {
              if (i === 0 || i === Math.floor(chartData.length / 2) || i === chartData.length - 1) {
                return (
                  <span key={i} className="text-xs text-text-muted">
                    {point.label}
                  </span>
                );
              }
              return <span key={i} />;
            }
            return (
              <span key={i} className="text-xs text-text-muted">
                {point.label}
              </span>
            );
          })}
        </div>
      </Card>
    </motion.div>
  );
});
