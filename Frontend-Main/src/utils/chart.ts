export type ChartPeriod = '1H' | '24H' | '7D' | '1M' | '1Y' | '5Y' | 'ALL';

export interface ChartDataPoint {
  value: number;
  label: string;
}

const PERIOD_POINT_COUNTS: Record<ChartPeriod, number> = {
  '1H': 13,
  '24H': 25,
  '7D': 15,
  '1M': 31,
  '1Y': 12,
  '5Y': 12,
  ALL: 12,
};

const PERIOD_LABELS: Record<ChartPeriod, Intl.DateTimeFormatOptions> = {
  '1H': { hour: '2-digit', minute: '2-digit' },
  '24H': { hour: '2-digit' },
  '7D': { weekday: 'short' },
  '1M': { month: 'short', day: 'numeric' },
  '1Y': { month: 'short' },
  '5Y': { month: 'short', year: '2-digit' },
  ALL: { month: 'short', year: '2-digit' },
};

function getLabelForPoint(date: Date, period: ChartPeriod): string {
  return new Intl.DateTimeFormat('en-US', PERIOD_LABELS[period]).format(date);
}

function getStepMs(period: ChartPeriod): number {
  switch (period) {
    case '1H':
      return 5 * 60 * 1000;
    case '24H':
      return 60 * 60 * 1000;
    case '7D':
      return 12 * 60 * 60 * 1000;
    case '1M':
      return 24 * 60 * 60 * 1000;
    case '1Y':
      return 30 * 24 * 60 * 60 * 1000;
    case '5Y':
    case 'ALL':
      return 90 * 24 * 60 * 60 * 1000;
  }
}

export function generateChartData(baseValue: number, period: ChartPeriod): ChartDataPoint[] {
  const pointCount = PERIOD_POINT_COUNTS[period];
  const now = Date.now();
  const stepMs = getStepMs(period);
  const values: ChartDataPoint[] = [];
  const volatility = Math.max(Math.abs(baseValue) * 0.02, 0.5);
  const drift = Math.max(Math.abs(baseValue) * 0.01, 0.25);

  for (let index = 0; index < pointCount; index += 1) {
    const progress = pointCount <= 1 ? 0 : index / (pointCount - 1);
    const offset = progress - 0.5;
    const wave = Math.sin(progress * Math.PI * 3) * volatility;
    const trend = offset * drift;
    const value = Math.max(0.01, baseValue + wave + trend);
    const timestamp = new Date(now - (pointCount - index - 1) * stepMs);

    values.push({
      value,
      label: getLabelForPoint(timestamp, period),
    });
  }

  return values;
}

export function normalizeChartY(value: number, minValue: number, maxValue: number): number {
  if (maxValue === minValue) return 100;
  return 200 - ((value - minValue) / (maxValue - minValue)) * 180;
}

export function normalizeChartX(index: number, totalPoints: number): number {
  const padding = 10;
  return padding + (index / (totalPoints - 1)) * (800 - padding * 2);
}
