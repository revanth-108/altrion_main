import { api } from './api';

// ── AI explanation (Claude) ───────────────────────────────────────────────
export interface ExplainRequest {
  kind: 'monte_carlo' | 'financial_analysis';
  title?: string;
  context: unknown;
  api_key?: string;
}

export interface ExplainResult {
  explanation: string;
  model: string;
  used_user_key: boolean;
}

// ── Monte Carlo ─────────────────────────────────────────────────────────────
export interface MonteCarloEvent {
  age: number;
  label: string;
  kind: 'income' | 'expense' | 'savings' | 'withdrawal' | 'lump_sum';
  amount: number;
}

export interface MonteCarloRequest {
  initial_balance: number;
  monthly_contribution: number;
  annual_income?: number | null;
  annual_expenses?: number | null;
  use_cash_flow_contribution?: boolean;
  income_growth_rate?: number;
  expense_growth_rate?: number;
  events?: MonteCarloEvent[];
  current_age: number;
  retirement_age: number;
  planning_age?: number;
  target_annual_income: number;
  social_security_income?: number;
  mean_return?: number;
  return_std?: number;
  retirement_mean_return?: number;
  retirement_return_std?: number;
  mean_inflation?: number;
  inflation_std?: number;
  n_iterations?: number;
  random_salt?: number;
}

export interface MonteCarloYearBand {
  age: number;
  year: number;
  p10: number;
  p25: number;
  p50: number;
  p75: number;
  p90: number;
}

export interface MonteCarloResult {
  simulation_id: string;
  computed_at: string;
  n_iterations: number;
  seed: number;
  inputs: Record<string, unknown>;
  inputs_used: Record<string, unknown>;
  success_probability: number;
  year_bands: MonteCarloYearBand[];
  exhaustion_age: { p10: number | null; p25: number | null; p50: number | null };
  summary: {
    success_probability: number;
    median_final_balance: number;
    p10_final_balance: number;
    p90_final_balance: number;
    exhaustion_by_percentile: {
      p10_exhaustion_age: number | null;
      p25_exhaustion_age: number | null;
      p50_exhaustion_age: number | null;
    };
  };
  timeline: MonteCarloYearBand[];
}

// ── DCF ─────────────────────────────────────────────────────────────────────
export interface DCFRequest {
  investment_name: string;
  revenue: number;
  revenue_growth: number | number[];
  profit_margin: number;
  tax_rate: number;
  capex_pct: number;
  working_capital_pct: number;
  discount_rate: number;
  terminal_growth: number;
  projection_years?: number;
}

export interface DCFResult {
  investment_name: string;
  projection_years: number;
  projected_revenue: number[];
  projected_earnings: number[];
  projected_fcf: number[];
  discounted_fcf: number[];
  terminal_value: number;
  discounted_terminal_value: number;
  estimated_value: number;
  sensitivity_matrix: {
    discount_rate_range: number[];
    terminal_growth_range: number[];
    results: Array<{ discount_rate: number; terminal_growth: number; estimated_value: number | null }>;
  };
}

// ── Comps ───────────────────────────────────────────────────────────────────
export interface CompsRequest {
  target_investment: Record<string, unknown>;
  comparison_investments: Array<Record<string, unknown>>;
  multiples_to_use?: string[];
}

export interface CompsResult {
  target_investment: string;
  comps_table: Array<Record<string, unknown>>;
  valuation_range: Record<string, { low: number | null; median: number | null; high: number | null; mean: number | null }>;
  statistics: Record<string, { median: number | null; mean: number | null; q1: number | null; q3: number | null }>;
  narrative_summary: string;
}

// ── LBO ─────────────────────────────────────────────────────────────────────
export interface LBORequest {
  investment_name: string;
  investment_amount: number;
  entry_multiple: number;
  leverage_ratio: number;
  interest_rate: number;
  income_growth: number;
  exit_multiple: number;
  hold_period?: number;
  initial_annual_income?: number | null;
}

export interface LBOResult {
  investment_name: string;
  entry_annual_income: number;
  exit_annual_income: number;
  initial_debt: number;
  user_equity_invested: number;
  debt_paydown_table: Array<{
    year: number;
    annual_income: number;
    beginning_debt: number;
    interest: number;
    income_for_debt_paydown: number;
    ending_debt: number;
  }>;
  exit_investment_value: number;
  exit_equity: number;
  moic: number;
  irr: number;
  scenario_grid: {
    exit_multiples: string[];
    income_growth_rates: string[];
    moic_matrix: Record<string, Record<string, number>>;
  };
  error?: string;
}

// ── Portfolio X-Ray ─────────────────────────────────────────────────────────
export interface PortfolioXRayHolding {
  symbol: string;
  name: string;
  bucket: string;
  sector: string | null;
  asset_class: string;
  weight_pct: number;
  value_usd: number;
  true_exposure_pct: number;
  etf_addon_pct: number;
  overlap_risk: 'High' | 'Med' | 'Low' | string;
  is_etf: boolean;
  metadata_status: string;
  valuation_label: string | null;
  valuation_pe: number | null;
  analyst_rating: string | null;
  insider_activity: string | null;
}

export interface PortfolioXRayMacroIndicator {
  key: string;
  label: string;
  value: string;
  meaning: string;
  tone: string;
}

export interface PortfolioXRayMacroImpactCard {
  title: string;
  signal: string;
  description: string;
}

export interface PortfolioXRayMacroSnapshot {
  regime_label: string;
  indicators: PortfolioXRayMacroIndicator[];
  impact_cards: PortfolioXRayMacroImpactCard[];
  source: string;
}

export interface PortfolioXRayMethodology {
  overlap_model: string;
  lookthrough_model: string;
  metadata_coverage_pct?: number;
  status: string;
  disclaimer: string;
  data_quality?: PortfolioXRayDataQuality;
}

export interface PortfolioXRayDataQuality {
  lookthrough_confidence: 'real' | 'partial' | 'unavailable' | 'not_applicable' | string;
  overlap_confidence: 'real' | 'partial' | 'unavailable' | 'not_applicable' | string;
  sector_confidence: 'real' | 'partial' | 'estimated' | string;
  etfs_requested: string[];
  etfs_analyzed: string[];
  etfs_missing: string[];
  covered_etf_weight_pct: number;
  unresolved_etf_weight_pct: number;
  metadata_coverage_pct?: number | null;
}

export interface PortfolioXRaySummaryCard {
  id: string;
  title: string;
  severity: 'high' | 'medium' | 'low' | string;
  metric_label: string;
  metric_value: number;
  unit: string;
  message: string;
  confidence: string;
}

export interface PortfolioXRayActionItem {
  priority: 'high' | 'medium' | 'low' | string;
  title: string;
  message: string;
}

export interface PortfolioXRaySecondaryKpis {
  largest_lookthrough_uplift_pct: number;
  largest_lookthrough_symbol: string | null;
  international_equity_pct: number;
  active_sector_tilt_pct: number;
}

export interface PortfolioXRayResult {
  status: string;
  warnings: string[];
  error?: string;
  computed_at?: string | null;
  kpis: {
    portfolio_value: number;
    true_equity_exposure_pct: number;
    etf_overlap_pct: number;
    concentration_score: number;
    overall_severity: string;
    hhi_label: string;
    top3_pct: number;
    metadata_coverage_pct: number;
    /** Weighted-average beta of direct stock holdings. Null when no beta data is available. */
    portfolio_beta: number | null;
    /** Beta-derived annualised volatility estimate (portfolio_beta × 15.5%). Null when beta unavailable. */
    estimated_volatility_pct: number | null;
    /** Portfolio health letter grade: A / B / C / D / F */
    health_grade: string;
    /** One-line health description (e.g. "Well diversified") */
    health_description: string;
  };
  overlap_heatmap: {
    labels: string[];
    matrix: number[][];
  };
  sector_treemap: Array<{ label: string; weight_pct: number }>;
  sector_active: Array<{
    label: string;
    portfolio_pct: number;
    benchmark_pct: number;
    active_pct: number;
  }>;
  factor_footprint: {
    portfolio: Record<string, number>;
    benchmark: Record<string, number>;
  };
  key_findings: Array<{ severity: string; message: string }>;
  xray_summary: PortfolioXRaySummaryCard[];
  action_items: PortfolioXRayActionItem[];
  data_quality: PortfolioXRayDataQuality;
  secondary_kpis: PortfolioXRaySecondaryKpis;
  methodology: PortfolioXRayMethodology;
  macro_snapshot: PortfolioXRayMacroSnapshot;
  holdings: PortfolioXRayHolding[];
  look_through: Array<{
    symbol: string;
    name: string;
    stated_pct: number;
    etf_addon_pct: number;
    true_exposure_pct: number;
    delta_pct: number;
    overlap_risk: string;
  }>;
  /**
   * Per-ETF sector breakdown from FMP constituent data + KNOWN_SECTOR_MAP.
   * Keys are ETF symbols (e.g. "QQQ", "VOO"). Only populated for ETFs in the portfolio.
   * Values are sorted sector rows (label + weight_pct as % of covered constituents).
   */
  etf_sector_breakdown: Record<string, Array<{ label: string; weight_pct: number }>> | null;
  /** Real ETF look-through using FMP /v3/etf-holder constituent data. Null if no ETFs in portfolio. */
  real_look_through: {
    entries: Array<{
      symbol: string;
      name: string;
      direct_pct: number;
      via_etfs: Array<{
        etf: string;
        etf_portfolio_pct: number;
        holding_weight_in_etf_pct: number;
        contribution_pct: number;
      }>;
      etf_contribution_pct: number;
      total_pct: number;
      is_direct: boolean;
      duplication_count: number;
    }>;
    etf_symbols_analyzed: string[];
    double_counted_stocks: number;
    avg_hidden_exposure_pct: number;
    model: string;
    note: string;
  } | null;
  geographic_allocation: Array<{ label: string; weight_pct: number }>;
  asset_class_allocation: Array<{ label: string; weight_pct: number }>;
  underlying_holdings: PortfolioXRayResult['look_through'];
  largest_hidden_overlap: PortfolioXRayResult['look_through'][number] | null;
  concentration: {
    overall_severity: string;
    hhi_score: number;
    hhi_label: string;
    top3_pct: number;
    summary_flags: ConcentrationResult['summary_flags'];
  };
}

export interface PortfolioXRayInsightFinding {
  severity: 'high' | 'medium' | 'low' | string;
  message: string;
}

export interface PortfolioXRayInsightPayload {
  holdings: Array<{
    ticker: string;
    trueExposure: number;
    sector: string | null;
    country?: string | null;
    statedWeight: number;
  }>;
  sector_totals: Array<{ sector: string; pct: number }>;
  geographic_totals: Array<{ region: string; pct: number }>;
  top_overlaps: Array<{
    ticker: string;
    statedWeight: number;
    trueExposure: number;
    delta: number;
  }>;
  xray_summary?: PortfolioXRaySummaryCard[];
  action_items?: PortfolioXRayActionItem[];
  data_quality?: PortfolioXRayDataQuality;
  fallback_findings?: PortfolioXRayInsightFinding[];
}

export interface PortfolioXRayInsightResult {
  findings: PortfolioXRayInsightFinding[];
  source: 'claude' | string;
}

// ── Concentration ───────────────────────────────────────────────────────────
export interface ConcentrationResult {
  total_value: number;
  holdings_sorted: Array<{ ticker: string; asset_name: string; asset_class: string; market_value: number; weight_pct: number }>;
  top3_pct: number;
  top3_holdings: Array<{ ticker: string; weight_pct: number }>;
  hhi_score: number;
  hhi_label: string;
  asset_class_concentration: Array<{ asset_class: string; market_value: number; weight_pct: number; severity: string }>;
  individual_flags: Array<{ ticker: string; asset_name: string; weight_pct: number; severity: string; flag_code: string; message: string }>;
  overall_severity: string;
  risk_metadata: Record<string, unknown>;
  summary_flags: Array<{ severity: string; flag_code: string; title: string; description: string }>;
  error?: string;
  status?: string;
}

// ── Goal Fit ────────────────────────────────────────────────────────────────
export interface GoalFitRequest {
  current_assets: number;
  target_amount: number;
  years_to_goal: number;
  annual_savings: number;
  allocation: Record<string, number>;
  goal_type?: string;
  risk_comfort?: 'low' | 'moderate' | 'high';
}

export interface GoalFitResult {
  tier: 'GREEN' | 'YELLOW' | 'RED';
  tier_reason: string;
  portfolio_vol: number;
  max_drawdown_pct: number;
  required_return: number;
  probability_pct: number;
  risk_band_max_vol: number;
  risk_band_desc: string;
  goal_type: string;
  years_to_goal: number;
  scenarios: Array<{
    name: string;
    allocation: Record<string, number>;
    portfolio_vol: number;
    max_drawdown: number;
    probability_pct: number;
    tier: string;
  }>;
  summary_commentary: string;
}

const DEFAULT_METHODOLOGY_DISCLAIMER =
  'ETF look-through and overlap use FMP constituent data when available. Estimated figures are labeled as estimates and are educational, not investment advice.';

const DEFAULT_MACRO_SNAPSHOT: PortfolioXRayMacroSnapshot = {
  regime_label: 'Mixed Macro',
  indicators: [],
  impact_cards: [],
  source: 'fallback',
};

function normalizePortfolioXRay(data: PortfolioXRayResult): PortfolioXRayResult {
  if (data.error) {
    return data;
  }

  const largestHidden = data.largest_hidden_overlap;
  const developedPct =
    data.geographic_allocation?.find((row) => row.label === 'International Developed')?.weight_pct ?? 0;
  const emergingPct =
    data.geographic_allocation?.find((row) => row.label === 'Emerging Markets')?.weight_pct ?? 0;
  const activeSectorTiltPct = Math.max(
    ...(data.sector_active ?? []).map((row) => Math.abs(row.active_pct)),
    0,
  );

  const secondary_kpis: PortfolioXRaySecondaryKpis = data.secondary_kpis ?? {
    largest_lookthrough_uplift_pct: largestHidden?.delta_pct ?? 0,
    largest_lookthrough_symbol: largestHidden?.symbol ?? null,
    international_equity_pct: developedPct + emergingPct,
    active_sector_tilt_pct: activeSectorTiltPct,
  };

  const methodology: PortfolioXRayMethodology = data.methodology ?? {
    overlap_model: 'estimated_pairwise',
    lookthrough_model: 'sector_etf_heuristic',
    metadata_coverage_pct: data.kpis?.metadata_coverage_pct,
    status: data.status,
    disclaimer: DEFAULT_METHODOLOGY_DISCLAIMER,
  };
  const data_quality: PortfolioXRayDataQuality = data.data_quality ?? methodology.data_quality ?? {
    lookthrough_confidence: data.real_look_through ? 'real' : 'unavailable',
    overlap_confidence: methodology.overlap_model === 'fmp_constituent_intersection' ? 'real' : 'estimated',
    sector_confidence: data.real_look_through ? 'partial' : 'estimated',
    etfs_requested: data.real_look_through?.etf_symbols_analyzed ?? [],
    etfs_analyzed: data.real_look_through?.etf_symbols_analyzed ?? [],
    etfs_missing: [],
    covered_etf_weight_pct: 0,
    unresolved_etf_weight_pct: 0,
    metadata_coverage_pct: data.kpis?.metadata_coverage_pct,
  };

  const macro_snapshot: PortfolioXRayMacroSnapshot = data.macro_snapshot ?? DEFAULT_MACRO_SNAPSHOT;

  const holdings = (data.holdings ?? []).map((holding) => ({
    ...holding,
    valuation_label: holding.valuation_label ?? (holding.is_etf ? 'Index' : '—'),
    valuation_pe: holding.valuation_pe ?? null,
    analyst_rating: holding.analyst_rating ?? null,
    insider_activity: holding.insider_activity ?? null,
  }));

  return {
    ...data,
    secondary_kpis,
    macro_snapshot,
    holdings,
    key_findings: (data.key_findings ?? []).slice(0, 4),
    xray_summary: data.xray_summary ?? [],
    action_items: data.action_items ?? [],
    data_quality,
    methodology: { ...methodology, data_quality },
    etf_sector_breakdown: data.etf_sector_breakdown ?? null,
    real_look_through: data.real_look_through ?? null,
  };
}

// ── Holding Valuation ────────────────────────────────────────────────────────
export interface HoldingValuation {
  trailing_pe:    number | null;
  forward_pe:     number | null;
  price_to_book:  number | null;
  ev_to_ebitda:   number | null;
  peg_ratio:      number | null;
  market_cap:     number | null;
  dividend_yield: number | null;
  roe:            number | null;
  revenue_growth: number | null;
  profit_margins: number | null;
}

// ── Asset Search & Data ─────────────────────────────────────────────────────
export interface AssetSearchResult {
  symbol: string;
  name: string;
  currency: string;
  stockExchange: string;
  exchangeShortName: string;
}

export interface AssetData {
  symbol: string;
  profile: {
    companyName: string;
    sector: string;
    industry: string;
    description: string;
    website: string;
    image: string;
  } | null;
  quote: {
    price: number;
    changesPercentage: number;
    marketCap: number;
    pe: number | null;
    eps: number | null;
    yearHigh: number;
    yearLow: number;
    avgVolume: number;
  } | null;
  metrics: {
    peRatioTTM: number | null;
    enterpriseValueOverEBITDATTM: number | null;
    priceToSalesRatioTTM: number | null;
    pbRatioTTM: number | null;
    roeTTM: number | null;
    roicTTM: number | null;
    debtToEquityTTM: number | null;
    freeCashFlowYieldTTM: number | null;
    netProfitMarginTTM: number | null;
  } | null;
  grades: Array<{
    date: string;
    gradingCompany: string;
    previousGrade: string;
    newGrade: string;
  }>;
  price_target: {
    targetConsensus: number | null;
    targetHigh: number | null;
    targetLow: number | null;
    numberOfAnalysts: number | null;
  } | null;
  news: Array<{ title: string; publishedDate: string; url: string }>;
}

// ── Research Lab ─────────────────────────────────────────────────────────────
export type AssetHistoryPeriod = '1D' | '1W' | '1M' | '6M' | '1Y' | '5Y' | 'MAX';

export interface AssetPricePoint {
  date: string;
  close: number;
}

export interface AssetHistory {
  symbol: string;
  period: AssetHistoryPeriod;
  prices: AssetPricePoint[];
}

export type ResearchLabMode =
  | 'investment_thesis'
  | 'earnings_analysis'
  | 'earnings_preview'
  | 'comps_valuation'
  | 'bull_bear_memo'
  | 'catalyst_tracker'
  | 'insider_activity_analysis'
  | 'protocol_deep_dive';

export interface ResearchLabRequest {
  symbol: string;
  mode: ResearchLabMode;
  asset_type?: string;
}

export interface ResearchLabResult {
  symbol: string;
  mode: string;
  analysis: string;
}

// ── Service ─────────────────────────────────────────────────────────────────
export const analysisService = {
  async runMonteCarlo(payload: MonteCarloRequest): Promise<MonteCarloResult> {
    const { data } = await api.post<MonteCarloResult>('/analysis/monte-carlo', payload);
    return data;
  },
  async runDcf(payload: DCFRequest): Promise<DCFResult> {
    const { data } = await api.post<DCFResult>('/analysis/dcf', payload);
    return data;
  },
  async runComps(payload: CompsRequest): Promise<CompsResult> {
    const { data } = await api.post<CompsResult>('/analysis/comps', payload);
    return data;
  },
  async runLbo(payload: LBORequest): Promise<LBOResult> {
    const { data } = await api.post<LBOResult>('/analysis/lbo', payload);
    return data;
  },
  async runGoalFit(payload: GoalFitRequest): Promise<GoalFitResult> {
    const { data } = await api.post<GoalFitResult>('/analysis/goal-fit', payload);
    return data;
  },
  async getConcentration(): Promise<ConcentrationResult> {
    const { data } = await api.get<ConcentrationResult>('/analysis/concentration');
    return data;
  },
  async getPortfolioXRay(options?: { refresh?: boolean }): Promise<PortfolioXRayResult> {
    const { data } = await api.get<PortfolioXRayResult>('/analysis/portfolio-xray', {
      timeout: 120000,
      params: options?.refresh ? { refresh: 'true' } : undefined,
    });
    return normalizePortfolioXRay(data);
  },
  async getPortfolioXRayInsights(payload: PortfolioXRayInsightPayload): Promise<PortfolioXRayInsightResult> {
    const { data } = await api.post<PortfolioXRayInsightResult>('/analysis/portfolio-xray/insights', payload);
    return data;
  },
  async getHoldingValuation(symbol: string): Promise<HoldingValuation> {
    const { data } = await api.get<HoldingValuation>(`/analysis/holding/${encodeURIComponent(symbol)}/valuation`);
    return data;
  },
  async searchAsset(q: string): Promise<AssetSearchResult[]> {
    const { data } = await api.get<{ results: AssetSearchResult[] }>('/analysis/asset/search', { params: { q } });
    return data.results ?? [];
  },
  async getAssetData(symbol: string): Promise<AssetData> {
    const { data } = await api.get<AssetData>(`/analysis/asset/${symbol}`);
    return data;
  },
  async runResearchLab(payload: ResearchLabRequest): Promise<ResearchLabResult> {
    const { data } = await api.post<ResearchLabResult>('/analysis/research-lab', payload);
    return data;
  },
  async getAssetHistory(symbol: string, period: AssetHistoryPeriod): Promise<AssetHistory> {
    const { data } = await api.get<AssetHistory>(`/analysis/asset/${symbol}/history`, { params: { period } });
    return data;
  },
  async explainAnalysis(payload: ExplainRequest): Promise<ExplainResult> {
    const { data } = await api.post<ExplainResult>('/analysis/explain', payload);
    return data;
  },
};
