import { memo, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { TrendingUp, Loader2, Wifi, ArrowUpRight, ArrowDownRight, LineChart, ExternalLink, X } from 'lucide-react';
import { Card } from '@/components/ui';
import { normalizeChartY, normalizeChartX, formatCurrency, formatPercent } from '@/utils';
import { ITEM_VARIANTS } from '@/constants';
import type { ChartPeriod, ChartDataPoint } from '@/utils';
import type { AggregatedAsset } from '@/hooks/useAggregatedAssets';
import { SectionHeading } from './SectionHeading';

interface PortfolioChartProps {
  totalValue: number;
  chartPeriod: ChartPeriod;
  onPeriodChange: (period: ChartPeriod) => void;
  selectedAsset?: AggregatedAsset | null;
  onClearSelection?: () => void;
  onViewDetails?: () => void;
  chartData?: ChartDataPoint[];
  isChartLoading?: boolean;
  isLive?: boolean;
  selectedPlatform?: string | null;
  showStats?: boolean;
}

const PERIODS: ChartPeriod[] = ['1H', '24H', '7D', '1M', '1Y', '5Y', 'ALL'];

const formatChangeValue = (change: number, changePercent: number): string => {
  if (!Number.isFinite(change) || Math.abs(changePercent) < 0.005) return 'No change';
  const sign = change > 0 ? '+' : '-';
  return `${sign}${formatCurrency(Math.abs(change))} (${formatPercent(changePercent)})`;
};

const formatAxisValue = (value: number, range: number): string => {
  const absValue = Math.abs(value);
  if (absValue >= 1_000_000) return `$${(value / 1_000_000).toFixed(range < 100_000 ? 2 : 1)}M`;
  if (absValue >= 1_000) return `$${(value / 1_000).toFixed(range < 1_000 ? 1 : 0)}k`;
  return formatCurrency(value);
};

export const PortfolioChart = memo(function PortfolioChart({
  totalValue,
  chartPeriod,
  onPeriodChange,
  selectedAsset,
  onClearSelection,
  onViewDetails,
  chartData: realChartData,
  isChartLoading = false,
  selectedPlatform,
  showStats = true,
}: PortfolioChartProps) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  const sanitizedRealChartData = useMemo(
    () => (realChartData ?? []).filter((point) => Number.isFinite(point.value)),
    [realChartData],
  );
  const baseChartData = useMemo(
    () => (sanitizedRealChartData.length > 1 ? sanitizedRealChartData : []),
    [sanitizedRealChartData],
  );
  const isRealData = baseChartData.length > 1;

  const chartData = useMemo(() => {
    if (baseChartData.length === 0) return baseChartData;
    if (selectedAsset || !totalValue) return baseChartData;
    const pinned = [...baseChartData];
    pinned[pinned.length - 1] = { ...pinned[pinned.length - 1], value: totalValue };
    return pinned;
  }, [baseChartData, totalValue, selectedAsset]);

  const { maxValue, minValue, yMaxValue, yMinValue, yRange } = useMemo(() => {
    if (chartData.length === 0) return { maxValue: 0, minValue: 0, yMaxValue: 0, yMinValue: 0, yRange: 0 };
    const values = chartData.map((d) => d.value);
    const max = Math.max(...values);
    const min = Math.min(...values);
    const range = max - min;
    const padding = Math.max(range * 0.15, Math.abs(max) * 0.003, 1);
    return { maxValue: max, minValue: min, yMaxValue: max + padding, yMinValue: min - padding, yRange: range + padding * 2 };
  }, [chartData]);

  const periodStats = useMemo(() => {
    const first = chartData[0]?.value ?? 0;
    const current = selectedAsset ? (chartData[chartData.length - 1]?.value ?? totalValue) : totalValue;
    const change = current - first;
    const changePercent = first !== 0 ? (change / first) * 100 : 0;
    return { current, high: maxValue, low: minValue, change, changePercent };
  }, [chartData, totalValue, maxValue, minValue, selectedAsset]);

  const pathD = useMemo(() => {
    if (chartData.length < 2) return '';
    return chartData
      .map((point, i) => `${i === 0 ? 'M' : 'L'} ${normalizeChartX(i, chartData.length)},${normalizeChartY(point.value, yMinValue, yMaxValue)}`)
      .join(' ');
  }, [chartData, yMinValue, yMaxValue]);

  const areaD = useMemo(() => {
    if (chartData.length < 2) return '';
    return `M 0,200 ${chartData.map((point, i) => `L ${normalizeChartX(i, chartData.length)},${normalizeChartY(point.value, yMinValue, yMaxValue)}`).join(' ')} L 800,200 Z`;
  }, [chartData, yMinValue, yMaxValue]);

  const isPositive = chartData.length > 1
    ? (selectedAsset ? chartData[chartData.length - 1].value : totalValue) >= chartData[0].value
    : null;
  const lineColor = isPositive === null ? '#6b7280' : isPositive ? '#22c55e' : '#ef4444';
  const displayValue = selectedAsset?.value ?? totalValue;
  const periodChangeFlat = Math.abs(periodStats.changePercent) < 0.005;

  // Baseline (period open) for reference line — Google Finance style
  const baselineY = chartData.length > 1 ? normalizeChartY(chartData[0].value, yMinValue, yMaxValue) : null;

  // Hover tooltip value
  const hoveredPoint = hoveredIndex !== null ? chartData[hoveredIndex] : null;

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (chartData.length < 2) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const paddingLeft = parseFloat(window.getComputedStyle(e.currentTarget).paddingLeft) || 0;
    const x = e.clientX - rect.left - paddingLeft;
    const chartWidth = rect.width - paddingLeft;
    const raw = Math.round((x / chartWidth) * (chartData.length - 1));
    setHoveredIndex(Math.min(chartData.length - 1, Math.max(0, raw)));
  };

  // Crosshair x position in SVG coords (0–800)
  const crosshairX = hoveredIndex !== null ? normalizeChartX(hoveredIndex, chartData.length) : null;
  const crosshairY = hoveredIndex !== null ? normalizeChartY(chartData[hoveredIndex].value, yMinValue, yMaxValue) : null;

  return (
    <motion.div variants={ITEM_VARIANTS}>
      <Card variant="bordered">
        {/* Header */}
        <div className="mb-5 flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <SectionHeading
              icon={
                selectedAsset ? (
                  <span className="font-display text-[0.72rem] font-semibold tracking-[0.16em] text-text-secondary uppercase">
                    {selectedAsset.symbol.slice(0, 2)}
                  </span>
                ) : (
                  <TrendingUp size={17} strokeWidth={1.75} />
                )
              }
              eyebrow={selectedAsset ? 'Asset view' : selectedPlatform ? 'Filtered view' : 'Performance'}
              title={
                selectedAsset
                  ? `${selectedAsset.name} (${selectedAsset.symbol})`
                  : selectedPlatform
                    ? `${selectedPlatform.charAt(0).toUpperCase() + selectedPlatform.slice(1)} Portfolio`
                    : 'Portfolio Value'
              }
            />
            <div className="pt-1 pl-7">
              <div className="flex items-center gap-2 mb-0.5">
                {isRealData && (chartPeriod === '1H' || chartPeriod === '24H') && (
                  <span className="dashboard-chip flex items-center gap-1 px-2 py-0.5 text-xs text-green-400 border-green-400/20 bg-green-400/8">
                    <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
                    Live
                  </span>
                )}
                {isRealData && chartPeriod !== '1H' && chartPeriod !== '24H' && (
                  <span className="dashboard-chip flex items-center gap-1 px-2 py-0.5 text-xs text-altrion-400 border-altrion-400/20 bg-altrion-400/8">
                    <Wifi size={10} />
                    Real data
                  </span>
                )}
              </div>

              {/* Price + change — updates on hover */}
              <p className="text-2xl font-bold text-text-primary tabular-nums">
                {formatCurrency(hoveredPoint ? hoveredPoint.value : displayValue)}
              </p>
              <p className={`text-sm font-medium mt-0.5 flex items-center gap-1 ${
                periodChangeFlat ? 'text-text-muted' : periodStats.change > 0 ? 'text-green-400' : 'text-red-400'
              }`}>
                {!periodChangeFlat && (periodStats.change > 0 ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />)}
                {periodChangeFlat ? 'No change' : formatChangeValue(periodStats.change, periodStats.changePercent)}
                <span className="text-text-muted font-normal ml-1">{chartPeriod}</span>
              </p>

              {selectedAsset && (
                <div className="flex items-center gap-2 mt-1.5">
                  <button type="button" onClick={onViewDetails} className="flex items-center gap-1 text-xs text-altrion-400 hover:text-altrion-300 transition-colors">
                    <ExternalLink size={11} /> View full details
                  </button>
                  <span className="text-dark-border">·</span>
                  <button type="button" onClick={onClearSelection} className="flex items-center gap-1 text-xs text-text-muted hover:text-text-secondary transition-colors">
                    <X size={11} /> Back to portfolio
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Period selector */}
          <div className="flex gap-0.5 rounded-full border border-white/6 bg-dark-elevated/72 p-1 shrink-0">
            {PERIODS.map((period) => (
              <button
                key={period}
                onClick={() => onPeriodChange(period)}
                className={`rounded-full px-2.5 py-1.5 text-xs font-medium transition-all ${
                  chartPeriod === period
                    ? 'bg-dark-card text-text-primary shadow-[inset_0_0_0_1px_rgba(255,255,255,0.06)]'
                    : 'text-text-muted hover:text-text-primary'
                }`}
              >
                {period}
              </button>
            ))}
          </div>
        </div>

        {/* Stats row */}
        {showStats && isRealData && (
          <div className="grid grid-cols-4 gap-2 mb-4">
            {[
              { label: 'Current', value: formatCurrency(periodStats.current), cls: 'text-text-primary' },
              { label: `${chartPeriod} Change`, value: formatChangeValue(periodStats.change, periodStats.changePercent), cls: periodChangeFlat ? 'text-text-muted' : periodStats.change > 0 ? 'text-green-400' : 'text-red-400' },
              { label: 'High', value: formatCurrency(periodStats.high), cls: 'text-green-400' },
              { label: 'Low', value: formatCurrency(periodStats.low), cls: 'text-red-400' },
            ].map(({ label, value, cls }) => (
              <div key={label} className="bg-dark-elevated/60 rounded-lg px-3 py-2">
                <p className="text-[10px] text-text-muted uppercase tracking-wider mb-0.5">{label}</p>
                <p className={`text-sm font-bold ${cls} flex items-center gap-0.5`}>
                  {label.includes('Change') && !periodChangeFlat && (periodStats.change > 0 ? <ArrowUpRight size={13} /> : <ArrowDownRight size={13} />)}
                  {value}
                </p>
              </div>
            ))}
          </div>
        )}

        {/* Chart area */}
        <div
          className="relative select-none"
          style={{ height: '200px' }}
          onMouseMove={handleMouseMove}
          onMouseLeave={() => setHoveredIndex(null)}
        >
          {/* Y-axis labels */}
          {isRealData && (
            <div className="absolute left-0 top-0 h-full w-14 flex flex-col justify-between py-0 pointer-events-none">
              {[yMaxValue, (yMaxValue * 2 + yMinValue) / 3, (yMaxValue + yMinValue * 2) / 3, yMinValue].map((val, i) => (
                <span key={i} className="text-right text-[10px] text-text-muted leading-none pr-1">
                  {formatAxisValue(val, yRange)}
                </span>
              ))}
            </div>
          )}

          {/* SVG chart */}
          <div className={`absolute inset-0 ${isRealData ? 'pl-14' : ''}`}>
            {isChartLoading && (
              <div className="absolute inset-0 flex items-center justify-center bg-dark-card/50 rounded-lg z-10">
                <div className="flex items-center gap-2 text-text-muted text-sm">
                  <Loader2 size={16} className="animate-spin" />
                  Loading market data…
                </div>
              </div>
            )}

            {isRealData ? (
              <svg
                className="h-full w-full overflow-visible"
                viewBox="0 0 800 200"
                preserveAspectRatio="none"
              >
                <defs>
                  {/* Gradient fill — very subtle, Robinhood style */}
                  <linearGradient id="pcGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={lineColor} stopOpacity="0.18" />
                    <stop offset="75%" stopColor={lineColor} stopOpacity="0.04" />
                    <stop offset="100%" stopColor={lineColor} stopOpacity="0" />
                  </linearGradient>
                  {/* Clip to avoid overflow */}
                  <clipPath id="pcClip">
                    <rect x="0" y="0" width="800" height="200" />
                  </clipPath>
                </defs>

                {/* Subtle grid lines */}
                {[0, 1, 2, 3, 4].map((i) => (
                  <line key={i} x1="0" y1={i * 50} x2="800" y2={i * 50}
                    stroke="rgba(255,255,255,0.05)" strokeWidth="1" />
                ))}

                {/* Baseline — period open price reference (dotted, like Google Finance previous close) */}
                {baselineY !== null && (
                  <line
                    x1="0" y1={baselineY} x2="800" y2={baselineY}
                    stroke="rgba(255,255,255,0.15)"
                    strokeWidth="1"
                    strokeDasharray="3 4"
                  />
                )}

                {/* Clipped area + line */}
                <g clipPath="url(#pcClip)">
                  {/* Area fill */}
                  <path d={areaD} fill="url(#pcGrad)" />

                  {/* Main price line — thin and crisp like Robinhood */}
                  <path
                    d={pathD}
                    fill="none"
                    stroke={lineColor}
                    strokeWidth="1.75"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    style={{ filter: `drop-shadow(0 0 3px ${lineColor}60)` }}
                  />
                </g>

                {/* Crosshair vertical line */}
                {crosshairX !== null && (
                  <line
                    x1={crosshairX} y1="0"
                    x2={crosshairX} y2="200"
                    stroke={lineColor}
                    strokeWidth="1"
                    strokeDasharray="3 3"
                    opacity="0.6"
                  />
                )}

                {/* Hover dot — single circle at hover point */}
                {crosshairX !== null && crosshairY !== null && (
                  <>
                    {/* Outer glow ring */}
                    <circle cx={crosshairX} cy={crosshairY} r="7" fill={lineColor} opacity="0.2" />
                    {/* Inner dot */}
                    <circle cx={crosshairX} cy={crosshairY} r="3.5" fill={lineColor} stroke="white" strokeWidth="1.5" />
                  </>
                )}
              </svg>
            ) : !isChartLoading ? (
              <div className="flex h-full flex-col items-center justify-center rounded-lg border border-dashed border-dark-border bg-dark-elevated/35 px-6 text-center">
                <LineChart size={34} className="mb-3 text-text-muted" strokeWidth={1.5} />
                <p className="font-display text-lg font-semibold text-text-primary">Performance history is building</p>
                <p className="mt-1 max-w-md text-sm leading-6 text-text-muted">
                  Performance data updates as real synced history becomes available.
                </p>
              </div>
            ) : null}
          </div>

          {/* Floating tooltip — Robinhood style: price + timestamp, above crosshair */}
          {hoveredPoint && isRealData && crosshairX !== null && (
            <div
              className="absolute z-20 pointer-events-none"
              style={{
                left: `calc(${(crosshairX / 800) * 100}% + 56px)`, // account for y-axis width
                top: '8px',
                transform: crosshairX > 600 ? 'translateX(calc(-100% - 8px))' : crosshairX < 200 ? 'translateX(8px)' : 'translateX(-50%)',
              }}
            >
              <div className="bg-dark-elevated border border-white/10 rounded-xl px-3 py-2 shadow-2xl backdrop-blur-sm">
                <p className="text-base font-bold text-text-primary tabular-nums leading-tight">
                  {formatCurrency(hoveredPoint.value)}
                </p>
                <p className="text-[11px] text-text-muted mt-0.5 leading-tight">
                  {hoveredPoint.label}
                </p>
              </div>
            </div>
          )}
        </div>

        {/* X-axis timestamps */}
        {isRealData && (
          <div className="flex justify-between mt-2 pl-14 pr-0">
            {chartData.map((point, i) => {
              const isDense = ['1H', '24H', '1M', '1Y', '5Y', 'ALL'].includes(chartPeriod);
              if (isDense) {
                if (i === 0 || i === Math.floor(chartData.length / 2) || i === chartData.length - 1) {
                  return <span key={i} className="text-[10px] text-text-muted">{point.label}</span>;
                }
                return <span key={i} />;
              }
              return <span key={i} className="text-[10px] text-text-muted">{point.label}</span>;
            })}
          </div>
        )}
      </Card>
    </motion.div>
  );
});
