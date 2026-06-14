import { memo, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { TrendingUp, Loader2, Wifi } from 'lucide-react';
import { Card } from '@/components/ui';
import { generateChartData, normalizeChartY, normalizeChartX, formatCurrency } from '@/utils';
import { ITEM_VARIANTS } from '@/constants';
import { useAssetMarketChart } from '@/hooks/useMarketChart';
import type { ChartPeriod } from '@/utils';

interface AssetPriceChartProps {
  symbol: string;
  name?: string;
  baseValue: number;
  chartPeriod: ChartPeriod;
  onPeriodChange: (period: ChartPeriod) => void;
  /** Live price from Binance WebSocket */
  livePrice?: number;
}

const PERIODS: ChartPeriod[] = ['1H', '24H', '7D', '1M', '1Y'];

export const AssetPriceChart = memo(function AssetPriceChart({
  symbol,
  name,
  baseValue,
  chartPeriod,
  onPeriodChange,
  livePrice,
}: AssetPriceChartProps) {
  const [hoveredPoint, setHoveredPoint] = useState<{ index: number; x: number; y: number } | null>(null);

  // Real CoinGecko price history
  const { data: realChartData, isLoading: chartLoading } = useAssetMarketChart(symbol, chartPeriod);

  // Use real data if available; fall back to generated data
  const fallbackData = useMemo(() => generateChartData(baseValue, chartPeriod), [baseValue, chartPeriod]);
  const chartData = (realChartData && realChartData.length > 0) ? realChartData : fallbackData;
  const isRealData = !!(realChartData && realChartData.length > 0);

  // If we have a live price, update the last data point so the chart ends at the current price
  const displayChartData = useMemo(() => {
    if (!livePrice || !isRealData || chartData.length === 0) return chartData;
    const updated = [...chartData];
    updated[updated.length - 1] = { ...updated[updated.length - 1], value: livePrice };
    return updated;
  }, [chartData, livePrice, isRealData]);

  const { maxValue, minValue } = useMemo(() => ({
    maxValue: Math.max(...displayChartData.map(d => d.value)),
    minValue: Math.min(...displayChartData.map(d => d.value)),
  }), [displayChartData]);

  const pathD = useMemo(() =>
    displayChartData
      .map((p, i) => `${i === 0 ? 'M' : 'L'} ${normalizeChartX(i, displayChartData.length)},${normalizeChartY(p.value, minValue, maxValue)}`)
      .join(' '),
    [displayChartData, minValue, maxValue],
  );

  const areaD = useMemo(() =>
    `M 0,200 ${displayChartData.map((p, i) => `L ${normalizeChartX(i, displayChartData.length)},${normalizeChartY(p.value, minValue, maxValue)}`).join(' ')} L 800,200 Z`,
    [displayChartData, minValue, maxValue],
  );

  const isPositive = displayChartData.length > 1
    ? displayChartData[displayChartData.length - 1].value >= displayChartData[0].value
    : true;
  const lineColor = isPositive ? '#10b981' : '#ef4444';
  const lineColorEnd = isPositive ? '#34d399' : '#f87171';

  // Y-axis labels: show as price (not "k") for assets under $1000
  const formatYLabel = (val: number) =>
    val >= 1000 ? `$${(val / 1000).toFixed(1)}k` : `$${val.toFixed(2)}`;

  return (
    <motion.div variants={ITEM_VARIANTS}>
      <Card variant="bordered">
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-accent-cyan/20 flex items-center justify-center">
              <TrendingUp size={20} className="text-accent-cyan" />
            </div>
            <div className="flex items-center gap-2">
              <h3 className="font-display text-xl font-semibold text-text-primary">
                {name || symbol} Price Chart
              </h3>
              {livePrice && (
                <span className="flex items-center gap-1 text-xs text-green-400 bg-green-400/10 px-2 py-0.5 rounded-full border border-green-400/20">
                  <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
                  Live
                </span>
              )}
              {isRealData && !livePrice && (
                <span className="flex items-center gap-1 text-xs text-altrion-400 bg-altrion-400/10 px-2 py-0.5 rounded-full border border-altrion-400/20">
                  <Wifi size={10} />
                  Real data
                </span>
              )}
            </div>
          </div>

          <div className="flex gap-1 bg-dark-elevated p-1 rounded-lg">
            {PERIODS.map(period => (
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

        <div
          className="relative h-64 w-full pl-14"
          onMouseMove={e => {
            const rect = e.currentTarget.getBoundingClientRect();
            const x = e.clientX - rect.left - 56;
            const chartWidth = rect.width - 56;
            const index = Math.round((x / chartWidth) * (displayChartData.length - 1));
            if (index >= 0 && index < displayChartData.length) {
              setHoveredPoint({ index, x: e.clientX - rect.left, y: e.clientY - rect.top });
            }
          }}
          onMouseLeave={() => setHoveredPoint(null)}
        >
          {chartLoading && (
            <div className="absolute inset-0 flex items-center justify-center bg-dark-card/50 rounded-lg z-10">
              <div className="flex items-center gap-2 text-text-muted text-sm">
                <Loader2 size={16} className="animate-spin" />
                Loading market data…
              </div>
            </div>
          )}

          <svg className="w-full h-full" viewBox="0 0 800 200" preserveAspectRatio="none">
            <defs>
              <linearGradient id="assetChartGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor={lineColor} stopOpacity="0.3" />
                <stop offset="100%" stopColor={lineColor} stopOpacity="0.0" />
              </linearGradient>
              <linearGradient id="assetLineGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor={lineColorEnd} />
                <stop offset="100%" stopColor={lineColor} />
              </linearGradient>
            </defs>

            {[0, 1, 2, 3, 4].map(i => (
              <line key={i} x1="0" y1={i * 50} x2="800" y2={i * 50}
                stroke="#1f2937" strokeWidth="1" strokeDasharray="4 4" />
            ))}

            <path d={areaD} fill="url(#assetChartGradient)" />
            <path d={pathD} fill="none" stroke="url(#assetLineGradient)"
              strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />

            {hoveredPoint && (
              <line
                x1={normalizeChartX(hoveredPoint.index, displayChartData.length)} y1="0"
                x2={normalizeChartX(hoveredPoint.index, displayChartData.length)} y2="200"
                stroke={lineColor} strokeWidth="1" strokeDasharray="4 4" opacity="0.7"
              />
            )}

            {displayChartData.map((point, i) => (
              <circle key={i}
                cx={normalizeChartX(i, displayChartData.length)}
                cy={normalizeChartY(point.value, minValue, maxValue)}
                r={hoveredPoint?.index === i ? 6 : 4}
                fill={lineColor}
                className={hoveredPoint?.index === i ? 'opacity-100' : 'opacity-0'}
                style={{ transition: 'all 0.15s ease' }}
              />
            ))}

            {hoveredPoint && (
              <circle
                cx={normalizeChartX(hoveredPoint.index, displayChartData.length)}
                cy={normalizeChartY(displayChartData[hoveredPoint.index].value, minValue, maxValue)}
                r="10" fill={lineColor} opacity="0.3"
              />
            )}
          </svg>

          {hoveredPoint && (
            <div className="absolute z-10 pointer-events-none"
              style={{ left: `${hoveredPoint.x}px`, top: '10px', transform: 'translateX(-50%)' }}
            >
              <div className="bg-dark-card border border-dark-border rounded-lg px-3 py-2 shadow-lg">
                <p className="text-lg font-bold text-altrion-400">
                  {formatCurrency(displayChartData[hoveredPoint.index].value)}
                </p>
                <p className="text-xs text-text-muted">
                  {displayChartData[hoveredPoint.index].label}
                </p>
              </div>
            </div>
          )}

          {/* Y-axis labels */}
          <div className="absolute left-0 top-0 h-full flex flex-col justify-between py-2">
            {[maxValue, (maxValue + minValue) / 2, minValue].map((val, i) => (
              <span key={i} className="text-xs text-text-muted w-13 text-right pr-1">
                {formatYLabel(val)}
              </span>
            ))}
          </div>
        </div>

        {/* X-axis labels */}
        <div className="flex justify-between mt-3 pl-14 pr-2">
          {displayChartData.map((point, i) => {
            if (chartPeriod === '1M' || chartPeriod === '24H') {
              if (i === 0 || i === Math.floor(displayChartData.length / 2) || i === displayChartData.length - 1) {
                return <span key={i} className="text-xs text-text-muted">{point.label}</span>;
              }
              return <span key={i} />;
            }
            return <span key={i} className="text-xs text-text-muted">{point.label}</span>;
          })}
        </div>
      </Card>
    </motion.div>
  );
});
