export interface HealthMetric {
  score: number;
  label: string;
  color: string;
}

export interface DimensionScores {
  d1_liquidity: number | null;
  d2_investment: number | null;
  d3_retirement: number | null;
  d4_crypto: number | null;
  d5_defi: number | null;
  d6_debt: number | null;
  d7_velocity: number | null;
}

export interface PortfolioHealth {
  overall_score: number;
  overall_label: string;
  overall_color: string;
  completeness_pct: number;
  active_dimensions: number;
  life_stage: string;
  solvency_tier: string;
  metrics: {
    diversification: HealthMetric;
    risk_exposure: HealthMetric;
    performance: HealthMetric;
  };
  dimension_scores: DimensionScores;
  breakdown?: Record<string, Record<string, unknown>>;
}

export interface HealthHistoryPoint {
  computed_at: string;
  overall_score: number;
  d1_liquidity: number | null;
  d2_investment: number | null;
  d3_retirement: number | null;
  d4_crypto: number | null;
  d5_defi: number | null;
  d6_debt: number | null;
  d7_velocity: number | null;
  life_stage: string | null;
  solvency_tier: string | null;
}

export interface HealthHistoryResponse {
  days: number;
  data: HealthHistoryPoint[];
}
