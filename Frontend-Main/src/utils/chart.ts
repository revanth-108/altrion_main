export type ChartPeriod = '1H' | '24H' | '7D' | '1M' | '1Y';

export interface ChartDataPoint {
  value: number;
  label: string;
}

interface PeriodConfig {
  points: number;
  variance: number;
  labels: string[];
}

const PERIOD_CONFIGS: Record<ChartPeriod, PeriodConfig> = {
  '1H': {
    points: 12,
    variance: 0.002,
    labels: ['5m', '10m', '15m', '20m', '25m', '30m', '35m', '40m', '45m', '50m', '55m', 'Now'],
  },
  '24H': {
    points: 24,
    variance: 0.01,
    labels: Array.from({ length: 24 }, (_, i) => `${i}h`),
  },
  '7D': {
    points: 7,
    variance: 0.03,
    labels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
  },
  '1M': {
    points: 30,
    variance: 0.05,
    labels: Array.from({ length: 30 }, (_, i) => `${i + 1}`),
  },
  '1Y': {
    points: 12,
    variance: 0.15,
    labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
  },
};

export function generateChartData(baseValue: number, period: ChartPeriod): ChartDataPoint[] {
  const config = PERIOD_CONFIGS[period];
  const dataPoints: ChartDataPoint[] = [];
  let currentValue = baseValue * 0.95;

  for (let i = 0; i < config.points; i++) {
    const change = (Math.random() - 0.45) * baseValue * config.variance;
    currentValue += change;
    dataPoints.push({
      value: currentValue,
      label: config.labels[i],
    });
  }

  return dataPoints;
}

export function normalizeChartY(value: number, minValue: number, maxValue: number): number {
  if (maxValue === minValue) return 100;
  return 200 - ((value - minValue) / (maxValue - minValue)) * 180;
}

export function normalizeChartX(index: number, totalPoints: number): number {
  return (index / (totalPoints - 1)) * 800;
}
