import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Bar,
  BarChart,
  CartesianGrid,
  PolarAngleAxis,
  PolarGrid,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { AlertTriangle, Loader2, RefreshCcw, Search, X } from 'lucide-react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { useDebounce } from '@/hooks/useDebounce';
import { Card, Button } from '@/components/ui';
import { ConcentrationPanel } from './financial-analysis/ConcentrationPanel';
import {
  analysisService,
  type AssetData,
  type AssetSearchResult,
  type HoldingValuation,
  type PortfolioXRayInsightFinding,
  type PortfolioXRayInsightPayload,
  type PortfolioXRayHolding,
  type PortfolioXRayMacroSnapshot,
  type PortfolioXRayResult,
} from '@/services';

// -- Types --------------------------------------------------------------------
type TabKey = 'xray' | 'concentration' | 'macro';
type SortKey = 'weight' | 'overlap';

// -- Constants ----------------------------------------------------------------
const TABS: { key: TabKey; label: string }[] = [
  { key: 'xray', label: 'X-Ray' },
  { key: 'concentration', label: 'Concentration' },
  { key: 'macro', label: 'Macro' },
];

// Local-storage key for recent Research Lab searches

const TREEMAP_COLORS = [
  'rgba(14,165,233,0.72)',
  'rgba(168,224,99,0.62)',
  'rgba(0,212,200,0.62)',
  'rgba(245,166,35,0.62)',
  'rgba(240,98,146,0.52)',
  'rgba(139,92,246,0.52)',
  'rgba(20,184,166,0.52)',
  'rgba(249,115,22,0.52)',
];

// -- Formatters ---------------------------------------------------------------
const fmtMoney = (value: number | null | undefined) => {
  if (value === null || value === undefined || Number.isNaN(value)) return '-';
  const abs = Math.abs(value);
  if (abs >= 1_000_000_000) return `$${(value / 1_000_000_000).toFixed(2)}B`;
  if (abs >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `$${(value / 1_000).toFixed(1)}k`;
  return `$${value.toFixed(2)}`;
};

const fmtPct = (value: number | null | undefined, digits = 1) =>
  value === null || value === undefined || Number.isNaN(value) ? '-' : `${value.toFixed(digits)}%`;

const fmtNum = (value: number | null | undefined, digits = 2) =>
  value === null || value === undefined || Number.isNaN(value) ? '-' : value.toFixed(digits);

const overlapBadgeClass = (risk: string) => {
  if (risk === 'High') return 'bg-rose-500/15 text-rose-300 border border-rose-500/25';
  if (risk === 'Med') return 'bg-amber-500/15 text-amber-300 border border-amber-500/25';
  return 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/25';
};

const findingDotClass = (severity: string) => {
  const normalized = severity.toLowerCase();
  if (severity === 'CRITICAL' || severity === 'RED' || normalized === 'high') return 'bg-rose-400';
  if (severity === 'YELLOW' || normalized === 'medium') return 'bg-amber-400';
  return 'bg-altrion-400';
};

/**
 * Heat-cell colour for the overlap matrix.
 * Real FMP-based overlap values are typically 0-3% for ETFxstock pairs.
 * Normalise to that range so the heatmap has visible contrast with real data.
 */
const heatCellStyle = (value: number, useRealData = false) => {
  const scale = useRealData ? 3 : 12;   // FMP real values are small; heuristic values can reach ~15%
  const alpha = value <= 0 ? 0.04 : Math.max(0.10, Math.min(0.9, value / scale));
  return { backgroundColor: `rgba(14,165,233,${alpha})` };
};

// -- Chart helpers -------------------------------------------------------------
function factorChartData(report: PortfolioXRayResult) {
  return Object.keys(report.factor_footprint.portfolio).map((label) => ({
    factor: label,
    portfolio: report.factor_footprint.portfolio[label],
    benchmark: report.factor_footprint.benchmark[label],
  }));
}

function sectorChartData(report: PortfolioXRayResult) {
  return report.sector_active.map((row) => ({
    label: row.label.length > 12 ? `${row.label.slice(0, 12)}...` : row.label,
    portfolio: row.portfolio_pct,
    benchmark: row.benchmark_pct,
  }));
}

// -- Simple Markdown renderer --------------------------------------------------
function buildInsightPayload(report: PortfolioXRayResult): PortfolioXRayInsightPayload {
  return {
    holdings: report.holdings.map((holding) => ({
      ticker: holding.symbol,
      trueExposure: holding.true_exposure_pct,
      sector: holding.sector,
      statedWeight: holding.weight_pct,
    })),
    sector_totals: report.sector_treemap.map((row) => ({
      sector: row.label,
      pct: row.weight_pct,
    })),
    geographic_totals: report.geographic_allocation.map((row) => ({
      region: row.label,
      pct: row.weight_pct,
    })),
    top_overlaps: report.look_through.map((row) => ({
      ticker: row.symbol,
      statedWeight: row.stated_pct,
      trueExposure: row.true_exposure_pct,
      delta: row.delta_pct,
    })),
    xray_summary: report.xray_summary,
    action_items: report.action_items,
    data_quality: report.data_quality,
    fallback_findings: report.key_findings,
  };
}


// -- Main Page -----------------------------------------------------------------
export function PortfolioXRay() {
  const [activeTab, setActiveTab] = useState<TabKey>('xray');
  const [sortKey, setSortKey] = useState<SortKey>('weight');
  const [sortAsc, setSortAsc] = useState(false);
  const [selectedHoldingSymbol, setSelectedHoldingSymbol] = useState<string | null>(null);

  // Search state
  const [searchInput, setSearchInput] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [activeAssetSymbol, setActiveAssetSymbol] = useState<string | null>(null);
  const searchRef = useRef<HTMLDivElement>(null);
  const forceRefreshRef = useRef(false);


  const debouncedSearch = useDebounce(searchInput, 300);

  // Portfolio X-Ray - heavy computation; 15-min stale window prevents redundant refetches.
  // Portfolio holdings change at most a few times per day, so this is safe.
  const { data, isLoading, isFetching, error, refetch } = useQuery({
    queryKey: ['analysis', 'portfolio-xray'],
    queryFn: () => {
      const refresh = forceRefreshRef.current;
      forceRefreshRef.current = false;
      return analysisService.getPortfolioXRay({ refresh });
    },
    staleTime: 15 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    retry: 0,                    // no auto-retry - Refresh button is the explicit user retry
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

  const insightPayload = useMemo(() => (data && !data.error ? buildInsightPayload(data) : null), [data]);

  // AI Insights - same stale window as X-Ray; re-runs only when X-Ray data changes.
  const { data: aiInsights, isFetching: aiInsightsLoading } = useQuery({
    queryKey: ['analysis', 'portfolio-xray-insights', data?.computed_at ?? data?.kpis?.portfolio_value ?? 'current'],
    queryFn: () => analysisService.getPortfolioXRayInsights(insightPayload!),
    enabled: !!insightPayload,
    staleTime: 15 * 60 * 1000,  // 15 min - Claude call costs money; don't redo unless data changed
    gcTime: 30 * 60 * 1000,
    retry: 1,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

  // Asset search query
  const { data: searchData, isFetching: searchFetching } = useQuery({
    queryKey: ['analysis', 'asset-search', debouncedSearch],
    queryFn: () => analysisService.searchAsset(debouncedSearch),
    enabled: debouncedSearch.length >= 1 && searchOpen,
    staleTime: 30_000,
  });

  // Asset data query (when a ticker is selected)
  const { data: assetData, isLoading: assetLoading } = useQuery({
    queryKey: ['analysis', 'asset', activeAssetSymbol],
    queryFn: () => analysisService.getAssetData(activeAssetSymbol!),
    enabled: !!activeAssetSymbol,
    staleTime: 60_000,
  });


  // Click-outside to close search dropdown
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setSearchOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const holdings = useMemo(() => {
    if (!data?.holdings?.length) return [];
    const overlapRank = { High: 3, Med: 2, Low: 1 };
    return [...data.holdings].sort((a, b) => {
      const av = sortKey === 'weight' ? a.weight_pct : (overlapRank[a.overlap_risk as keyof typeof overlapRank] ?? 0);
      const bv = sortKey === 'weight' ? b.weight_pct : (overlapRank[b.overlap_risk as keyof typeof overlapRank] ?? 0);
      if (av === bv) return a.symbol.localeCompare(b.symbol);
      return sortAsc ? av - bv : bv - av;
    });
  }, [data?.holdings, sortAsc, sortKey]);

  const selectedHolding = useMemo<PortfolioXRayHolding | null>(() => {
    if (!data?.holdings?.length || !selectedHoldingSymbol) return null;
    return data.holdings.find((h) => h.symbol === selectedHoldingSymbol) ?? null;
  }, [data?.holdings, selectedHoldingSymbol]);

  // Portfolio holding that matches the currently searched/active symbol
  const activePortfolioHolding = useMemo<PortfolioXRayHolding | null>(() => {
    if (!data?.holdings?.length || !activeAssetSymbol) return null;
    const sym = activeAssetSymbol.toUpperCase();
    return (
      data.holdings.find((h) => {
        const hs = h.symbol.toUpperCase();
        return hs === sym || hs === sym.replace('-USD', '') || sym === hs.replace('-USD', '');
      }) ?? null
    );
  }, [data?.holdings, activeAssetSymbol]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortAsc((v) => !v);
    else { setSortKey(key); setSortAsc(false); }
  };

  const selectSearchResult = (result: AssetSearchResult) => {
    const sym = result.symbol.toUpperCase();
    setActiveAssetSymbol(result.symbol);
    setSearchInput(result.symbol);
    setSearchOpen(false);
    // If the searched ticker is in the portfolio, highlight that row automatically
    if (data?.holdings) {
      const match = data.holdings.find((h) => {
        const hs = h.symbol.toUpperCase();
        return hs === sym || hs === sym.replace('-USD', '') || sym === hs.replace('-USD', '');
      });
      if (match) setSelectedHoldingSymbol(match.symbol);
    }
  };

  const clearSearch = () => {
    setSearchInput('');
    setActiveAssetSymbol(null);
    setSearchOpen(false);
  };

  const searchResults: AssetSearchResult[] = searchData ?? [];

  return (
    <DashboardLayout maxWidth="max-w-7xl">
      {/* Header */}
      <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-[10px] uppercase tracking-[0.18em] text-altrion-400">Portfolio Intelligence</p>
          <h1 className="text-2xl font-semibold text-text-primary">Portfolio X-Ray</h1>
          <p className="mt-1 text-sm text-text-muted">
            Uncover overlap, concentration, and macro exposure - or search any ticker for deep research.
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* Search bar */}
          <div ref={searchRef} className="relative w-72">
            <div className="relative flex items-center">
              <Search className="pointer-events-none absolute left-3 h-4 w-4 text-text-muted" />
              <input
                type="text"
                value={searchInput}
                placeholder="Search ticker or company..."
                onChange={(e) => { setSearchInput(e.target.value); setSearchOpen(true); }}
                onFocus={() => setSearchOpen(true)}
                className="w-full rounded-xl border border-white/8 bg-dark-surface/70 py-2 pl-9 pr-8 text-sm text-text-primary placeholder:text-text-muted focus:border-altrion-500/40 focus:outline-none focus:ring-1 focus:ring-altrion-500/20"
              />
              {searchInput && (
                <button type="button" onClick={clearSearch} className="absolute right-2.5 text-text-muted hover:text-text-primary">
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            {/* Search dropdown */}
            {searchOpen && (searchFetching || searchResults.length > 0) && (
              <div className="absolute left-0 top-full z-50 mt-1.5 w-full overflow-hidden rounded-xl border border-white/10 bg-dark-surface shadow-xl">
                {searchFetching && (
                  <div className="flex items-center gap-2 px-4 py-3 text-sm text-text-muted">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" /> Searching...
                  </div>
                )}
                {!searchFetching && searchResults.map((r) => (
                  <button
                    key={r.symbol}
                    type="button"
                    onClick={() => selectSearchResult(r)}
                    className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-white/5"
                  >
                    <span className="w-14 shrink-0 font-mono text-sm text-text-primary">{r.symbol}</span>
                    <span className="truncate text-xs text-text-muted">{r.name}</span>
                    <span className="ml-auto shrink-0 rounded bg-white/6 px-1.5 py-0.5 text-[10px] text-text-muted">
                      {r.exchangeShortName}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <Button
            variant="ghost"
            onClick={() => {
              forceRefreshRef.current = true;
              refetch();
            }}
            disabled={isFetching}
          >
            {isFetching ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCcw className="h-4 w-4" />}
            Refresh
          </Button>
        </div>
      </div>

      {/* Active asset panel - compact header bar shown above tabs */}
      {activeAssetSymbol && (
        <AssetPanel
          symbol={activeAssetSymbol}
          data={assetData ?? null}
          loading={assetLoading}
          portfolioHolding={activePortfolioHolding}
          onClose={clearSearch}
        />
      )}

      {/* Portfolio loading / error */}
      {isLoading ? (
        <Card className="flex min-h-[320px] items-center justify-center border-white/8 bg-dark-surface/70">
          <Loader2 className="h-6 w-6 animate-spin text-altrion-400" />
        </Card>
      ) : error || data?.error ? (
        <Card className="border-amber-500/25 bg-amber-500/10 p-5 text-sm text-amber-100">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
            <div>
              <p className="font-medium">Portfolio X-Ray is unavailable.</p>
              <p className="mt-1 text-amber-100/80">
                {data?.error ?? (error instanceof Error ? error.message : 'Unable to load portfolio diagnostics.')}
              </p>
            </div>
          </div>
        </Card>
      ) : data ? (
        <div className="space-y-5">
            {/* Portfolio Health hero card */}
            {(() => {
              const grade = data.kpis.health_grade ?? 'C';
              const gradeColor =
                grade === 'A' ? 'text-emerald-300 border-emerald-500/30 bg-emerald-500/10' :
                grade === 'B' ? 'text-sky-300 border-sky-500/30 bg-sky-500/10' :
                grade === 'C' ? 'text-amber-300 border-amber-500/30 bg-amber-500/10' :
                grade === 'D' ? 'text-orange-300 border-orange-500/30 bg-orange-500/10' :
                'text-rose-300 border-rose-500/30 bg-rose-500/10';
              return (
                <div className="flex flex-wrap items-center gap-4 rounded-2xl border border-white/8 bg-dark-surface/70 px-5 py-4">
                  {/* Letter grade circle */}
                  <div className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-full border-2 ${gradeColor}`}>
                    <span className="text-2xl font-bold">{grade}</span>
                  </div>
                  <div className="min-w-0">
                    <p className="text-[10px] uppercase tracking-widest text-text-muted">Portfolio Health</p>
                    <p className="text-base font-semibold text-text-primary">{data.kpis.health_description}</p>
                    <p className="text-xs text-text-muted">Concentration - overlap - geographic diversification</p>
                  </div>
                  <div className="ml-auto flex flex-wrap gap-6">
                    {data.kpis.portfolio_beta != null && (
                      <div className="text-right">
                        <p className="text-[10px] uppercase tracking-widest text-text-muted">Portfolio beta</p>
                        <p className="text-xl font-semibold text-text-primary">{data.kpis.portfolio_beta.toFixed(2)}</p>
                        <p className="text-[10px] text-text-muted">vs S&amp;P 500</p>
                      </div>
                    )}
                    {data.kpis.estimated_volatility_pct != null && (
                      <div className="text-right">
                        <p className="text-[10px] uppercase tracking-widest text-text-muted">Est. Volatility</p>
                        <p className="text-xl font-semibold text-text-primary">{fmtPct(data.kpis.estimated_volatility_pct)}</p>
                        <p className="text-[10px] text-text-muted">annualized (beta-derived)</p>
                      </div>
                    )}
                  </div>
                </div>
              );
            })()}

            {/* Portfolio KPI cards */}
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              <KpiCard label="Portfolio Value" value={fmtMoney(data.kpis.portfolio_value)} note="Connected holdings" />
              <KpiCard label="True Equity Exposure" value={fmtPct(data.kpis.true_equity_exposure_pct)} note="Stated equity allocation" />
              <KpiCard
                label="ETF Overlap"
                value={fmtPct(data.kpis.etf_overlap_pct)}
                note={data.methodology.overlap_model === 'fmp_constituent_intersection' ? 'Real constituent overlap' : 'Estimated overlap'}
                noteClassName={data.kpis.etf_overlap_pct >= 25 ? 'text-amber-300' : undefined}
              />
              <KpiCard
                label="Concentration Score"
                value={`${data.kpis.concentration_score.toFixed(1)}/10`}
                note={data.kpis.hhi_label}
                noteClassName={data.kpis.concentration_score >= 7 ? 'text-rose-300' : undefined}
              />
              <KpiCard
                label="Largest Look-Through Uplift"
                value={
                  data.secondary_kpis.largest_lookthrough_symbol
                    ? `${data.secondary_kpis.largest_lookthrough_symbol} +${fmtPct(data.secondary_kpis.largest_lookthrough_uplift_pct)}`
                    : fmtPct(data.secondary_kpis.largest_lookthrough_uplift_pct)
                }
                note="Estimated hidden exposure above stated weight"
              />
              <KpiCard
                label="International Equity"
                value={fmtPct(data.secondary_kpis.international_equity_pct)}
                note={`Largest sector tilt: ${fmtPct(data.secondary_kpis.active_sector_tilt_pct)} vs benchmark`}
              />
            </div>

            {/* Tab switcher */}
            <div className="flex flex-wrap gap-1 rounded-2xl border border-white/8 bg-white/4 p-1">
              {TABS.map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setActiveTab(tab.key)}
                  className={`flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-medium transition ${
                    activeTab === tab.key
                      ? 'border border-altrion-500/20 bg-altrion-500/12 text-text-primary'
                      : 'text-text-muted hover:text-text-primary'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {activeTab === 'xray' && (
              <XRayTab
                data={data}
                holdings={holdings}
                selectedHolding={selectedHolding}
                sortKey={sortKey}
                sortAsc={sortAsc}
                onSelect={(sym) => setSelectedHoldingSymbol((prev) => (prev === sym ? null : sym))}
                onSort={toggleSort}
                activeAssetSymbol={activeAssetSymbol}
                activePortfolioHolding={activePortfolioHolding}
                assetData={assetData ?? null}
                assetLoading={assetLoading}
                aiFindings={aiInsights?.findings ?? null}
                aiFindingsLoading={aiInsightsLoading}
              />
            )}
            {activeTab === 'concentration' && <ConcentrationPanel />}
            {activeTab === 'macro' && <MacroTab snapshot={data.macro_snapshot} />}
            <p className="text-xs leading-relaxed text-text-muted">
              {data.methodology.disclaimer} Valuation data, when shown, is sourced from third-party providers and is not a
              recommendation to buy or sell.
            </p>
        </div>
      ) : null}
    </DashboardLayout>
  );
}

// -- Asset Panel ---------------------------------------------------------------
function AssetPanel({
  symbol,
  data,
  loading,
  portfolioHolding,
  onClose,
}: {
  symbol: string;
  data: AssetData | null;
  loading: boolean;
  portfolioHolding: PortfolioXRayHolding | null;
  onClose: () => void;
}) {
  const displayName = data?.profile?.companyName ?? portfolioHolding?.name ?? symbol;
  const displaySector = data?.profile?.sector ?? portfolioHolding?.sector;
  const hasFmpData = !loading && (data?.quote || data?.metrics);

  return (
    <Card className="mb-5 border-altrion-500/20 bg-dark-surface/70 p-4">
      {/* Header row */}
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-altrion-500/20 font-bold text-sm text-altrion-300">
            {symbol.slice(0, 2).toUpperCase()}
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono font-semibold text-text-primary">{symbol}</span>
              {portfolioHolding && (
                <span className="rounded-full border border-altrion-500/30 bg-altrion-500/12 px-2 py-0.5 text-[10px] text-altrion-300">
                  In portfolio - {fmtPct(portfolioHolding.weight_pct)} - {fmtMoney(portfolioHolding.value_usd)}
                </span>
              )}
              {loading && <Loader2 className="h-3.5 w-3.5 animate-spin text-altrion-400" />}
            </div>
            <p className="text-xs text-text-muted">
              {displayName !== symbol ? displayName : ''}
              {displaySector ? (displayName !== symbol ? ` - ${displaySector}` : displaySector) : ''}
            </p>
          </div>
        </div>
        <button type="button" onClick={onClose} className="shrink-0 text-text-muted hover:text-text-primary">
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Data grid - FMP when available, portfolio data as fallback */}
      {hasFmpData ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {data!.quote && (
            <div className="space-y-1">
              <p className="text-[10px] uppercase tracking-wider text-text-muted">Price</p>
              <p className="text-2xl font-semibold text-text-primary">${data!.quote.price?.toFixed(2) ?? '-'}</p>
              <p className={`text-xs font-medium ${(data!.quote.changesPercentage ?? 0) >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>
                {(data!.quote.changesPercentage ?? 0) >= 0 ? '+' : '-'} {Math.abs(data!.quote.changesPercentage ?? 0).toFixed(2)}% today
              </p>
              <div className="mt-2 space-y-1 text-xs">
                <div className="flex justify-between"><span className="text-text-muted">52w High</span><span className="font-mono text-text-primary">${data!.quote.yearHigh?.toFixed(2) ?? '-'}</span></div>
                <div className="flex justify-between"><span className="text-text-muted">52w Low</span><span className="font-mono text-text-primary">${data!.quote.yearLow?.toFixed(2) ?? '-'}</span></div>
                <div className="flex justify-between"><span className="text-text-muted">Mkt Cap</span><span className="font-mono text-text-primary">{fmtMoney(data!.quote.marketCap)}</span></div>
                <div className="flex justify-between"><span className="text-text-muted">P/E - EPS</span><span className="font-mono text-text-primary">{fmtNum(data!.quote.pe)} - {fmtNum(data!.quote.eps)}</span></div>
              </div>
            </div>
          )}
          {data!.metrics && (
            <div className="space-y-1">
              <p className="text-[10px] uppercase tracking-wider text-text-muted">Key Metrics (TTM)</p>
              <div className="space-y-1 text-xs">
                <div className="flex justify-between"><span className="text-text-muted">P/E</span><span className="font-mono text-text-primary">{fmtNum(data!.metrics.peRatioTTM)}</span></div>
                <div className="flex justify-between"><span className="text-text-muted">EV/EBITDA</span><span className="font-mono text-text-primary">{fmtNum(data!.metrics.enterpriseValueOverEBITDATTM)}</span></div>
                <div className="flex justify-between"><span className="text-text-muted">P/B</span><span className="font-mono text-text-primary">{fmtNum(data!.metrics.pbRatioTTM)}</span></div>
                <div className="flex justify-between"><span className="text-text-muted">ROE</span><span className="font-mono text-text-primary">{fmtPct(data!.metrics.roeTTM ? data!.metrics.roeTTM * 100 : null)}</span></div>
                <div className="flex justify-between"><span className="text-text-muted">Debt/Eq</span><span className="font-mono text-text-primary">{fmtNum(data!.metrics.debtToEquityTTM)}</span></div>
              </div>
            </div>
          )}
          <div className="space-y-1">
            <p className="text-[10px] uppercase tracking-wider text-text-muted">Analyst Views</p>
            {data!.price_target?.targetConsensus && (
              <div className="space-y-1 text-xs">
                <p className="text-text-secondary">
                  Target <span className="font-mono text-altrion-300">${fmtNum(data!.price_target.targetConsensus)}</span>
                  <span className="text-text-muted"> ({data!.price_target.numberOfAnalysts ?? '-'} analysts)</span>
                </p>
                <p className="text-text-muted">Range ${fmtNum(data!.price_target.targetLow)} - ${fmtNum(data!.price_target.targetHigh)}</p>
              </div>
            )}
            {data!.grades.slice(0, 3).map((g, i) => (
              <p key={i} className="text-xs text-text-muted">
                <span className="text-text-secondary">{g.gradingCompany}</span> {g.previousGrade} {'->'} <span className="text-altrion-300">{g.newGrade}</span>
              </p>
            ))}
          </div>
          {data!.news.length > 0 && (
            <div className="space-y-1">
              <p className="text-[10px] uppercase tracking-wider text-text-muted">Recent News</p>
              {data!.news.slice(0, 3).map((n, i) => (
                <a key={i} href={n.url} target="_blank" rel="noopener noreferrer" className="block text-xs leading-snug text-text-secondary hover:text-text-primary">
                  {n.title}
                </a>
              ))}
            </div>
          )}
        </div>
      ) : portfolioHolding ? (
        /* Portfolio data fallback - shown when FMP is loading or unavailable */
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-1">
            <p className="text-[10px] uppercase tracking-wider text-text-muted">Position Value</p>
            <p className="text-2xl font-semibold text-text-primary">{fmtMoney(portfolioHolding.value_usd)}</p>
            <p className="text-xs text-text-muted">{fmtPct(portfolioHolding.weight_pct)} of portfolio</p>
          </div>
          <div className="space-y-1">
            <p className="text-[10px] uppercase tracking-wider text-text-muted">True Exposure</p>
            <p className="text-2xl font-semibold text-altrion-300">{fmtPct(portfolioHolding.true_exposure_pct)}</p>
            {portfolioHolding.true_exposure_pct > portfolioHolding.weight_pct && (
              <p className="text-xs text-amber-400">+{fmtPct(portfolioHolding.true_exposure_pct - portfolioHolding.weight_pct)} hidden via ETFs</p>
            )}
          </div>
          <div className="space-y-1">
            <p className="text-[10px] uppercase tracking-wider text-text-muted">Classification</p>
            <p className="text-sm font-medium text-text-primary">{portfolioHolding.sector ?? '-'}</p>
            <p className="text-xs text-text-muted">{portfolioHolding.asset_class}</p>
          </div>
          <div className="space-y-1">
            <p className="text-[10px] uppercase tracking-wider text-text-muted">Overlap Risk</p>
            <span className={`inline-block rounded-full px-2 py-0.5 text-sm font-medium ${overlapBadgeClass(portfolioHolding.overlap_risk)}`}>
              {portfolioHolding.overlap_risk}
            </span>
            {loading && <p className="text-[10px] text-text-muted">Loading live data...</p>}
          </div>
        </div>
      ) : loading ? (
        <div className="flex items-center gap-2 py-2 text-xs text-text-muted">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading market data...
        </div>
      ) : (
        <p className="py-1 text-xs text-text-muted">Market data unavailable. Switch to Research Lab to run an AI analysis.</p>
      )}
    </Card>
  );
}

// -- KPI Card ------------------------------------------------------------------
function KpiCard({ label, value, note, noteClassName }: { label: string; value: string; note: string; noteClassName?: string }) {
  return (
    <Card className="border-white/8 bg-dark-surface/70 p-4">
      <p className="text-[10px] uppercase tracking-[0.15em] text-text-muted">{label}</p>
      <p className="mt-2 text-xl font-semibold text-text-primary">{value}</p>
      <p className={`mt-1 text-xs text-text-muted ${noteClassName ?? ''}`}>{note}</p>
    </Card>
  );
}

// -- Stat Row ------------------------------------------------------------------
function StatRow({ label, value, valueClassName }: { label: string; value: string; valueClassName?: string }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-white/5 py-1.5 last:border-b-0">
      <span className="text-xs text-text-muted">{label}</span>
      <span className={`font-mono text-xs text-text-primary ${valueClassName ?? ''}`}>{value}</span>
    </div>
  );
}

// -- Asset Context Section (shown at top of X-Ray when a ticker is searched) ---
const summarySeverityClass = (severity: string) => {
  const normalized = severity.toLowerCase();
  if (normalized === 'high' || normalized === 'red') return 'border-rose-500/25 bg-rose-500/8 text-rose-300';
  if (normalized === 'medium' || normalized === 'yellow') return 'border-amber-500/25 bg-amber-500/8 text-amber-300';
  return 'border-emerald-500/20 bg-emerald-500/8 text-emerald-300';
};

const confidenceLabel = (confidence: string) => {
  if (confidence === 'not_applicable') return 'N/A';
  return confidence.replace(/_/g, ' ');
};

function XRayExecutiveSummary({ data }: { data: PortfolioXRayResult }) {
  const cards = data.xray_summary ?? [];
  const actions = data.action_items ?? [];
  const quality = data.data_quality;
  const qualityTone =
    quality.lookthrough_confidence === 'real'
      ? 'text-emerald-300'
      : quality.lookthrough_confidence === 'partial'
      ? 'text-amber-300'
      : 'text-text-muted';

  if (!cards.length && !actions.length) return null;

  return (
    <Card className="border-white/8 bg-dark-surface/70 p-4">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-text-primary">Portfolio X-Ray Summary</p>
          <p className="text-xs text-text-muted">Actual exposure, concentration, duplication, and data confidence.</p>
        </div>
        <div className="flex flex-wrap gap-2 text-[10px]">
          <span className={`rounded-full border border-white/10 bg-white/5 px-2 py-1 capitalize ${qualityTone}`}>
            Look-through: {confidenceLabel(quality.lookthrough_confidence)}
          </span>
          <span className="rounded-full border border-white/10 bg-white/5 px-2 py-1 text-text-muted">
            ETFs: {quality.etfs_analyzed.length}/{quality.etfs_requested.length}
          </span>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {cards.map((card) => (
          <div key={card.id} className={`rounded-lg border p-3 ${summarySeverityClass(card.severity)}`}>
            <div className="mb-3 flex items-start justify-between gap-2">
              <p className="text-[10px] uppercase tracking-widest text-current/80">{card.title}</p>
              <span className="rounded-full bg-black/20 px-1.5 py-0.5 text-[9px] capitalize">
                {confidenceLabel(card.confidence)}
              </span>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="font-mono text-lg font-semibold text-text-primary">
                {card.unit === '%' ? fmtPct(card.metric_value) : fmtNum(card.metric_value)}
              </span>
              <span className="truncate text-xs text-text-muted">{card.metric_label}</span>
            </div>
            <p className="mt-2 text-[11px] leading-relaxed text-text-secondary">{card.message}</p>
          </div>
        ))}
      </div>

      {actions.length > 0 && (
        <div className="mt-4 grid gap-2 md:grid-cols-2">
          {actions.map((action) => (
            <div key={`${action.title}-${action.message}`} className="rounded-lg border border-white/8 bg-white/3 px-3 py-2">
              <div className="mb-1 flex items-center justify-between gap-2">
                <p className="text-xs font-medium text-text-primary">{action.title}</p>
                <span className={`rounded-full px-1.5 py-0.5 text-[9px] capitalize ${summarySeverityClass(action.priority)}`}>
                  {action.priority}
                </span>
              </div>
              <p className="text-[11px] leading-relaxed text-text-muted">{action.message}</p>
            </div>
          ))}
        </div>
      )}

      {quality.etfs_missing.length > 0 && (
        <p className="mt-3 text-[10px] text-amber-300">
          Missing ETF constituents: <span className="font-mono">{quality.etfs_missing.join(', ')}</span>
        </p>
      )}
    </Card>
  );
}

function AssetContextSection({
  symbol,
  assetData,
  assetLoading,
  portfolioHolding,
  portfolioSectors,
  realLookThrough,
}: {
  symbol: string;
  assetData: AssetData | null;
  assetLoading: boolean;
  portfolioHolding: PortfolioXRayHolding | null;
  portfolioSectors: PortfolioXRayResult['sector_treemap'];
  realLookThrough: PortfolioXRayResult['real_look_through'];
}) {
  const displaySector = assetData?.profile?.sector ?? portfolioHolding?.sector ?? null;
  const portfolioSectorMatch = displaySector
    ? portfolioSectors.find((s) => s.label.toLowerCase().includes(displaySector.toLowerCase()))
    : null;
  const ltEntry = realLookThrough?.entries.find(
    (e) => e.symbol.toUpperCase() === symbol.toUpperCase(),
  );

  return (
    <div className="space-y-4">
      {/* Divider */}
      <div className="flex items-center gap-2">
        <div className="h-px flex-1 bg-white/8" />
        <span className="text-[10px] uppercase tracking-widest text-altrion-400">Asset Context - {symbol}</span>
        <div className="h-px flex-1 bg-white/8" />
      </div>

      <div className="grid gap-3 lg:grid-cols-3">
        {/* -- Card 1: Market data (FMP) with portfolio fallback -- */}
        <Card className="border-white/8 bg-dark-surface/70 p-4">
          <p className="mb-3 text-[10px] uppercase tracking-widest text-text-muted">
            {assetData?.quote ? 'Live Market Data' : 'Position Overview'}
          </p>

          {assetData?.quote ? (
            <div className="space-y-3">
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-semibold text-text-primary">${assetData.quote.price?.toFixed(2) ?? '-'}</span>
                <span className={`text-sm font-medium ${(assetData.quote.changesPercentage ?? 0) >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>
                  {(assetData.quote.changesPercentage ?? 0) >= 0 ? '+' : '-'} {Math.abs(assetData.quote.changesPercentage ?? 0).toFixed(2)}%
                </span>
              </div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
                <div><p className="text-text-muted">Market Cap</p><p className="font-mono text-text-primary">{fmtMoney(assetData.quote.marketCap)}</p></div>
                <div><p className="text-text-muted">P/E Ratio</p><p className="font-mono text-text-primary">{fmtNum(assetData.quote.pe)}</p></div>
                <div><p className="text-text-muted">52w High</p><p className="font-mono text-text-primary">${assetData.quote.yearHigh?.toFixed(2) ?? '-'}</p></div>
                <div><p className="text-text-muted">52w Low</p><p className="font-mono text-text-primary">${assetData.quote.yearLow?.toFixed(2) ?? '-'}</p></div>
                {assetData.metrics && (
                  <>
                    <div><p className="text-text-muted">EV/EBITDA</p><p className="font-mono text-text-primary">{fmtNum(assetData.metrics.enterpriseValueOverEBITDATTM)}</p></div>
                    <div><p className="text-text-muted">ROE</p><p className="font-mono text-text-primary">{fmtPct(assetData.metrics.roeTTM ? assetData.metrics.roeTTM * 100 : null)}</p></div>
                  </>
                )}
              </div>
              {assetData.profile?.description && (
                <p className="line-clamp-2 text-[11px] leading-relaxed text-text-muted">
                  {assetData.profile.description.split('.')[0]}.
                </p>
              )}
            </div>
          ) : portfolioHolding ? (
            /* Portfolio-data fallback when FMP is unavailable */
            <div className="space-y-3">
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-semibold text-text-primary">{fmtMoney(portfolioHolding.value_usd)}</span>
                <span className="text-xs text-text-muted">position value</span>
              </div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
                <div><p className="text-text-muted">Weight</p><p className="font-mono text-text-primary">{fmtPct(portfolioHolding.weight_pct)}</p></div>
                <div><p className="text-text-muted">True Exposure</p><p className="font-mono text-altrion-300">{fmtPct(portfolioHolding.true_exposure_pct)}</p></div>
                <div><p className="text-text-muted">Asset Class</p><p className="text-text-primary">{portfolioHolding.asset_class}</p></div>
                <div><p className="text-text-muted">Sector</p><p className="text-text-primary">{portfolioHolding.sector ?? '-'}</p></div>
              </div>
              {assetLoading ? (
                <p className="text-[10px] text-text-muted">Loading live market data...</p>
              ) : (
                <p className="text-[10px] text-text-muted">Live data unavailable - use Research Lab for AI analysis.</p>
              )}
            </div>
          ) : assetLoading ? (
            <div className="flex items-center gap-2 py-4 text-xs text-text-muted">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading market data...
            </div>
          ) : (
            <p className="py-4 text-xs text-text-muted">This asset isn't in your portfolio and live data is unavailable.</p>
          )}
        </Card>

        {/* -- Card 2: Your Exposure -- */}
        <Card className="border-white/8 bg-dark-surface/70 p-4">
          <p className="mb-3 text-[10px] uppercase tracking-widest text-text-muted">Your Exposure</p>

          {portfolioHolding ? (
            <div className="space-y-3">
              {/* In-portfolio badge */}
              <div className="flex items-center gap-2 rounded-lg bg-altrion-500/10 px-3 py-2">
                <div className="h-2 w-2 rounded-full bg-altrion-400" />
                <span className="text-xs text-altrion-300">Currently in your portfolio</span>
              </div>

              {/* Exposure breakdown */}
              <div className="space-y-1.5">
                <div className="flex justify-between text-xs">
                  <span className="text-text-muted">Stated weight</span>
                  <span className="font-mono text-text-primary">{fmtPct(portfolioHolding.weight_pct)}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-text-muted">True exposure</span>
                  <span className={`font-mono font-semibold ${portfolioHolding.true_exposure_pct > portfolioHolding.weight_pct ? 'text-altrion-300' : 'text-text-primary'}`}>
                    {fmtPct(portfolioHolding.true_exposure_pct)}
                  </span>
                </div>
                {portfolioHolding.true_exposure_pct > portfolioHolding.weight_pct && (
                  <div className="flex justify-between text-xs">
                    <span className="text-text-muted">Hidden via ETFs</span>
                    <span className="font-mono text-amber-400">+{fmtPct(portfolioHolding.true_exposure_pct - portfolioHolding.weight_pct)}</span>
                  </div>
                )}
                <div className="flex justify-between text-xs">
                  <span className="text-text-muted">Value</span>
                  <span className="font-mono text-text-primary">{fmtMoney(portfolioHolding.value_usd)}</span>
                </div>
              </div>

              {/* Sector allocation bar */}
              {displaySector && (
                <div className="border-t border-white/8 pt-2">
                  <p className="mb-1.5 text-[10px] text-text-muted">
                    {displaySector} sector - {fmtPct(portfolioSectorMatch?.weight_pct ?? 0)} of portfolio
                  </p>
                  <div className="h-1.5 overflow-hidden rounded-full bg-white/8">
                    <div
                      className="h-1.5 rounded-full bg-altrion-400"
                      style={{ width: `${Math.min((portfolioSectorMatch?.weight_pct ?? 0) * 3, 100)}%` }}
                    />
                  </div>
                </div>
              )}

              {/* Overlap risk */}
              <div className="flex items-center justify-between">
                <span className="text-xs text-text-muted">Overlap risk</span>
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${overlapBadgeClass(portfolioHolding.overlap_risk)}`}>
                  {portfolioHolding.overlap_risk}
                </span>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center gap-2 rounded-lg bg-white/5 px-3 py-2">
                <div className="h-2 w-2 rounded-full bg-text-muted" />
                <span className="text-xs text-text-muted">Not in your portfolio</span>
              </div>
              {displaySector && (
                <div>
                  <p className="mb-1.5 text-[10px] text-text-muted">
                    Your exposure to {displaySector}: {fmtPct(portfolioSectorMatch?.weight_pct ?? 0)}
                  </p>
                  <div className="h-1.5 overflow-hidden rounded-full bg-white/8">
                    <div
                      className="h-1.5 rounded-full bg-altrion-400/60"
                      style={{ width: `${Math.min((portfolioSectorMatch?.weight_pct ?? 0) * 3, 100)}%` }}
                    />
                  </div>
                  <p className="mt-1 text-[10px] text-text-muted">via existing holdings in this sector</p>
                </div>
              )}
              {assetData?.price_target?.targetConsensus && (
                <p className="text-xs text-text-muted">
                  Analyst target: <span className="font-mono text-altrion-300">${fmtNum(assetData.price_target.targetConsensus)}</span>
                  <span className="text-text-muted"> ({assetData.price_target.numberOfAnalysts} analysts)</span>
                </p>
              )}
            </div>
          )}
        </Card>

        {/* -- Card 3: ETF Look-Through or Analyst views -- */}
        <Card className="border-white/8 bg-dark-surface/70 p-4">
          {ltEntry && ltEntry.via_etfs.length > 0 ? (
            <>
              <p className="mb-3 text-[10px] uppercase tracking-widest text-text-muted">Where You Hold {symbol}</p>
              <div className="space-y-2">
                {ltEntry.is_direct && (
                  <div className="flex items-center justify-between rounded-lg bg-white/4 px-3 py-2 text-xs">
                    <span className="text-text-secondary">Direct position</span>
                    <span className="font-mono text-text-primary">{fmtPct(ltEntry.direct_pct)}</span>
                  </div>
                )}
                {ltEntry.via_etfs.map((v) => (
                  <div key={v.etf} className="flex items-center justify-between rounded-lg bg-altrion-500/6 px-3 py-2 text-xs">
                    <div>
                      <p className="font-medium text-altrion-300">via {v.etf}</p>
                      <p className="text-[10px] text-text-muted">
                        {v.etf} is {fmtPct(v.etf_portfolio_pct)} of portfolio - {symbol} is {fmtPct(v.holding_weight_in_etf_pct)} of {v.etf}
                      </p>
                    </div>
                    <span className="font-mono text-altrion-300">+{fmtPct(v.contribution_pct)}</span>
                  </div>
                ))}
                <div className="flex items-center justify-between border-t border-white/8 pt-2">
                  <span className="text-xs font-semibold text-text-primary">Total true exposure</span>
                  <span className="font-mono font-semibold text-altrion-300">{fmtPct(ltEntry.total_pct)}</span>
                </div>
                {ltEntry.etf_contribution_pct > 0 && (
                  <p className="text-[10px] text-amber-400">
                    +{fmtPct(ltEntry.etf_contribution_pct)} above the {fmtPct(ltEntry.direct_pct)} stated weight
                  </p>
                )}
              </div>
            </>
          ) : assetData?.grades?.length || assetData?.price_target ? (
            <>
              <p className="mb-3 text-[10px] uppercase tracking-widest text-text-muted">Analyst Views</p>
              {assetData.price_target?.targetConsensus && (
                <div className="mb-3">
                  <p className="text-[10px] text-text-muted">Consensus price target</p>
                  <p className="text-xl font-semibold text-altrion-300">${fmtNum(assetData.price_target.targetConsensus)}</p>
                  <p className="text-[10px] text-text-muted">
                    ${fmtNum(assetData.price_target.targetLow)} - ${fmtNum(assetData.price_target.targetHigh)} - {assetData.price_target.numberOfAnalysts} analysts
                  </p>
                </div>
              )}
              {assetData.grades?.slice(0, 4).map((g, i) => (
                <p key={i} className="text-xs text-text-muted">
                  <span className="text-text-secondary">{g.gradingCompany}</span> {g.previousGrade} {'->'} <span className="text-altrion-300">{g.newGrade}</span>
                </p>
              ))}
            </>
          ) : assetData?.news?.length ? (
            <>
              <p className="mb-3 text-[10px] uppercase tracking-widest text-text-muted">Recent News</p>
              <div className="space-y-2">
                {assetData.news.slice(0, 4).map((n, i) => (
                  <a key={i} href={n.url} target="_blank" rel="noopener noreferrer" className="block text-xs leading-snug text-text-secondary hover:text-text-primary">
                    {n.title}
                  </a>
                ))}
              </div>
            </>
          ) : (
            <>
              <p className="mb-3 text-[10px] uppercase tracking-widest text-text-muted">Deep Research</p>
              <p className="text-xs leading-relaxed text-text-muted">
                Switch to the <span className="text-text-secondary">Research Lab</span> tab to run an AI-powered investment thesis, earnings analysis, or bull/bear memo for{' '}
                <span className="font-mono text-altrion-300">{symbol}</span>.
              </p>
            </>
          )}
        </Card>
      </div>

      <div className="flex items-center gap-2">
        <div className="h-px flex-1 bg-white/8" />
        <span className="text-[10px] uppercase tracking-widest text-text-muted">Portfolio X-Ray</span>
        <div className="h-px flex-1 bg-white/8" />
      </div>
    </div>
  );
}

// -- True Exposure Section -----------------------------------------------------
function TrueExposureSection({ data }: { data: PortfolioXRayResult }) {
  const lt = data.real_look_through;
  if (!lt || lt.entries.length === 0) return null;

  // Top 8 by total_pct, but only those with ETF contribution
  const visible = lt.entries.filter((e) => e.etf_contribution_pct > 0).slice(0, 8);
  if (visible.length === 0) return null;

  // Find the max total_pct for bar scaling
  const maxPct = Math.max(...visible.map((e) => e.total_pct), 1);

  // Color palette for up to 6 ETFs
  const ETF_COLORS = [
    'rgba(14,165,233,0.75)',   // sky
    'rgba(168,85,247,0.75)',   // violet
    'rgba(34,197,94,0.75)',    // emerald
    'rgba(251,146,60,0.75)',   // orange
    'rgba(236,72,153,0.75)',   // pink
    'rgba(234,179,8,0.75)',    // yellow
  ];
  const etfColorMap: Record<string, string> = {};
  lt.etf_symbols_analyzed.forEach((sym, i) => {
    etfColorMap[sym] = ETF_COLORS[i % ETF_COLORS.length];
  });

  return (
    <Card className="border-white/8 bg-dark-surface/70 p-4">
      {/* Header */}
      <div className="mb-1 flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-text-primary">True Exposure - ETF Look-Through</p>
          <p className="text-xs text-text-muted">
            Real constituent data from FMP &middot; ETFs analyzed:{' '}
            <span className="font-mono text-altrion-300">{lt.etf_symbols_analyzed.join(', ')}</span>
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <span className="rounded-full border border-amber-500/25 bg-amber-500/10 px-2 py-0.5 text-[10px] text-amber-300">
            {lt.double_counted_stocks} stocks double-counted
          </span>
          <span className="text-[10px] text-text-muted">
            avg hidden +{fmtPct(lt.avg_hidden_exposure_pct)} per holding
          </span>
        </div>
      </div>

      {/* Legend */}
      <div className="mb-3 mt-2 flex flex-wrap gap-3">
        <div className="flex items-center gap-1.5">
          <div className="h-2.5 w-2.5 rounded-sm bg-white/20" />
          <span className="text-[11px] text-text-muted">Direct</span>
        </div>
        {lt.etf_symbols_analyzed.map((sym) => (
          <div key={sym} className="flex items-center gap-1.5">
            <div className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: etfColorMap[sym] }} />
            <span className="text-[11px] text-text-muted">via {sym}</span>
          </div>
        ))}
      </div>

      {/* Stacked bar rows */}
      <div className="space-y-2">
        {visible.map((entry) => {
          const barWidthPct = (entry.total_pct / maxPct) * 100;
          const directFrac = entry.total_pct > 0 ? entry.direct_pct / entry.total_pct : 0;

          // Build ETF segments sorted by contribution desc
          const etfSegments = entry.via_etfs
            .slice(0, 6)
            .map((v) => ({ etf: v.etf, frac: entry.total_pct > 0 ? v.contribution_pct / entry.total_pct : 0, pct: v.contribution_pct }));

          const isDuplicated = entry.is_direct && entry.etf_contribution_pct > 0;

          return (
            <div key={entry.symbol} className="flex items-center gap-3">
              {/* Symbol + name */}
              <div className="w-16 shrink-0">
                <p className="font-mono text-xs font-medium text-text-primary">{entry.symbol}</p>
                <p className="truncate text-[10px] text-text-muted">{entry.name.split(' ').slice(0, 2).join(' ')}</p>
              </div>

              {/* Stacked bar */}
              <div className="relative flex-1 overflow-hidden rounded-full bg-white/8" style={{ height: 18 }}>
                <div
                  className="absolute left-0 top-0 flex h-full overflow-hidden rounded-full"
                  style={{ width: `${barWidthPct}%` }}
                >
                  {/* Direct segment */}
                  {entry.direct_pct > 0 && (
                    <div
                      className="h-full shrink-0"
                      style={{ width: `${directFrac * 100}%`, backgroundColor: 'rgba(255,255,255,0.25)' }}
                      title={`Direct: ${fmtPct(entry.direct_pct)}`}
                    />
                  )}
                  {/* ETF segments */}
                  {etfSegments.map((seg) => (
                    <div
                      key={seg.etf}
                      className="h-full shrink-0"
                      style={{ width: `${seg.frac * 100}%`, backgroundColor: etfColorMap[seg.etf] ?? 'rgba(14,165,233,0.6)' }}
                      title={`via ${seg.etf}: ${fmtPct(seg.pct)}`}
                    />
                  ))}
                </div>
              </div>

              {/* Total pct */}
              <div className="w-14 shrink-0 text-right">
                <span className="font-mono text-xs text-altrion-300">{fmtPct(entry.total_pct)}</span>
                {isDuplicated && (
                  <span className="ml-1 text-[10px] text-amber-400">
                    +{fmtPct(entry.etf_contribution_pct)}
                  </span>
                )}
              </div>

              {/* Duplication badge */}
              <div className="w-12 shrink-0 text-right">
                {entry.duplication_count >= 3 && (
                  <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 text-[9px] text-amber-300">
                    {entry.duplication_count}x
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <p className="mt-3 text-[10px] text-text-muted">{lt.note}</p>
    </Card>
  );
}

// -- X-Ray Tab -----------------------------------------------------------------
function FocusedOverlapView({
  activeSymbol,
  activeIsEtf,
  rows,
  hasRealLookThrough,
}: {
  activeSymbol: string;
  activeIsEtf: boolean;
  rows: Array<{ symbol: string; name: string; overlap: number; detail: string }>;
  hasRealLookThrough: boolean;
}) {
  // For bar chart normalization: scale to the max value so the widest bar is always 100%
  const maxOverlap = rows.length > 0 ? Math.max(...rows.map((r) => r.overlap), 0.01) : 1;

  return (
    <Card className="border-white/8 bg-dark-surface/70 p-4">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-text-primary">
            {activeIsEtf ? 'Top Underlying Exposure' : 'ETF Look-Through'} -{' '}
            <span className="text-altrion-300">{activeSymbol}</span>
          </p>
          <p className="mt-0.5 text-xs text-text-muted">
            {hasRealLookThrough
              ? activeIsEtf
                ? `Portfolio exposure created by ${activeSymbol}'s ETF constituents (FMP data)`
                : `Your portfolio ETFs that hold ${activeSymbol} - actual FMP constituent data`
              : `ETF constituent data not yet loaded - real values will appear after first X-Ray load`}
          </p>
        </div>
        {hasRealLookThrough && (
          <span className="shrink-0 rounded-full border border-altrion-500/25 bg-altrion-500/10 px-2 py-0.5 text-[10px] text-altrion-300">
            FMP real data
          </span>
        )}
      </div>

      {rows.length > 0 ? (
        <div className="space-y-2.5">
          {rows.map((entry) => {
            // Thresholds in % of portfolio exposure
            const risk = entry.overlap >= 2.0 ? 'High' : entry.overlap >= 0.5 ? 'Med' : 'Low';
            const barPct = Math.min((entry.overlap / maxOverlap) * 100, 100);
            const barColor =
              entry.overlap >= 2.0
                ? 'rgba(244,63,94,0.65)'
                : entry.overlap >= 0.5
                ? 'rgba(251,146,60,0.65)'
                : 'rgba(14,165,233,0.5)';
            return (
              <div key={entry.symbol} className="flex items-center gap-3">
                <div className="w-28 shrink-0">
                  <p className="font-mono text-xs font-medium text-text-primary">{entry.symbol}</p>
                  <p className="truncate text-[9px] text-text-muted">{entry.detail}</p>
                </div>
                <div className="flex-1 overflow-hidden rounded-full bg-white/8" style={{ height: 14 }}>
                  <div
                    className="h-full rounded-full transition-all"
                    style={{ width: `${barPct}%`, backgroundColor: barColor }}
                  />
                </div>
                <span className="w-14 shrink-0 text-right font-mono text-xs text-text-secondary">
                  {fmtPct(entry.overlap, 2)}
                </span>
                <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-medium ${overlapBadgeClass(risk)}`}>
                  {risk}
                </span>
              </div>
            );
          })}
          <p className="mt-1 text-[10px] text-text-muted">
            Values are portfolio % (ETF's portfolio weight x {activeSymbol}'s weight inside that ETF).
          </p>
        </div>
      ) : (
        <div className="rounded-lg border border-white/8 bg-white/3 px-4 py-3">
          <p className="text-xs text-text-muted">
            {hasRealLookThrough
              ? activeIsEtf
                ? `${activeSymbol} constituent data is not yet available. Try refreshing.`
                : `None of your portfolio ETFs appear to contain ${activeSymbol} in their top-100 holdings.`
              : `ETF constituent data hasn't loaded yet. Click Refresh to fetch ETF holdings from FMP.`}
          </p>
        </div>
      )}
    </Card>
  );
}

function XRayTab({
  data,
  holdings,
  selectedHolding,
  sortKey,
  sortAsc,
  onSelect,
  onSort,
  activeAssetSymbol,
  activePortfolioHolding,
  assetData,
  assetLoading,
  aiFindings,
  aiFindingsLoading,
}: {
  data: PortfolioXRayResult;
  holdings: PortfolioXRayHolding[];
  selectedHolding: PortfolioXRayHolding | null;
  sortKey: SortKey;
  sortAsc: boolean;
  onSelect: (symbol: string) => void;
  onSort: (key: SortKey) => void;
  activeAssetSymbol: string | null;
  activePortfolioHolding: PortfolioXRayHolding | null;
  assetData: AssetData | null;
  assetLoading: boolean;
  aiFindings: PortfolioXRayInsightFinding[] | null;
  aiFindingsLoading: boolean;
}) {
  // Fetch valuation metrics lazily when a holding row is selected
  const isCashOrEtf = !!(
    selectedHolding?.is_etf
    || selectedHolding?.bucket === 'cash_equivalent'
    || selectedHolding?.bucket === 'crypto'
  );
  const { data: holdingValuation, isFetching: valuationLoading } = useQuery<HoldingValuation>({
    queryKey: ['holding-valuation', selectedHolding?.symbol],
    queryFn: () => analysisService.getHoldingValuation(selectedHolding!.symbol),
    enabled: !!selectedHolding && !isCashOrEtf,
    staleTime: 10 * 60 * 1000,  // 10 min - valuation doesn't change intra-day
    gcTime: 30 * 60 * 1000,
  });

  const labels = data.overlap_heatmap.labels;
  const matrix = data.overlap_heatmap.matrix;
  const keyFindings = aiFindings?.length ? aiFindings : data.key_findings;
  const activeSymbol = activeAssetSymbol?.toUpperCase() ?? null;
  const activeHolding = activeSymbol
    ? data.holdings.find((h) => h.symbol.toUpperCase() === activeSymbol) ?? activePortfolioHolding
    : null;
  const activeIsEtf = !!(
    activeHolding?.is_etf
    || (activeSymbol && data.etf_sector_breakdown?.[activeSymbol])
  );
  const activeLookThrough = activeSymbol
    ? data.real_look_through?.entries.find((entry) => entry.symbol.toUpperCase() === activeSymbol) ?? null
    : null;

  // Index of the searched symbol inside the overlap matrix (-1 if not found)
  const focusedIdx = activeAssetSymbol
    ? labels.findIndex((l) => l.toUpperCase() === activeAssetSymbol.toUpperCase())
    : -1;

  const focusedOverlaps = activeSymbol && data.real_look_through
    ? activeIsEtf
      ? data.real_look_through.entries
          .map((entry) => {
            const viaEtf = entry.via_etfs.find((via) => via.etf.toUpperCase() === activeSymbol);
            return viaEtf
              ? {
                  symbol: entry.symbol,
                  name: entry.name,
                  overlap: viaEtf.contribution_pct,
                  detail: `${fmtPct(viaEtf.holding_weight_in_etf_pct)} of ${activeSymbol}`,
                }
              : null;
          })
          .filter((row): row is { symbol: string; name: string; overlap: number; detail: string } => !!row)
          .sort((a, b) => b.overlap - a.overlap)
          .slice(0, 8)
      : (activeLookThrough?.via_etfs ?? [])
          .map((via) => ({
            symbol: via.etf,
            name: `via ${via.etf}`,
            overlap: via.contribution_pct,
            detail: `${fmtPct(activeLookThrough?.direct_pct ?? 0)} direct + ${fmtPct(via.contribution_pct)} hidden`,
          }))
          .sort((a, b) => b.overlap - a.overlap)
    : focusedIdx >= 0
    ? labels
        .map((sym, i) => ({ symbol: sym, name: sym, overlap: matrix[focusedIdx][i], detail: 'estimated proxy' }))
        .filter((e) => e.symbol !== labels[focusedIdx] && e.overlap > 0)
        .sort((a, b) => b.overlap - a.overlap)
    : [];

  return (
    <div className="space-y-4">
      <XRayExecutiveSummary data={data} />
      {/* Asset context section - shown when a ticker is searched */}
      {activeAssetSymbol && (
        <AssetContextSection
          symbol={activeAssetSymbol}
          assetData={assetData}
          assetLoading={assetLoading}
          portfolioHolding={activePortfolioHolding}
          portfolioSectors={data.sector_treemap}
          realLookThrough={data.real_look_through}
        />
      )}
      {activeSymbol && (
        <FocusedOverlapView
          activeSymbol={activeSymbol}
          activeIsEtf={activeIsEtf}
          rows={focusedOverlaps}
          hasRealLookThrough={!!data.real_look_through}
        />
      )}
      <div className={`grid gap-4 ${activeSymbol ? '' : 'lg:grid-cols-2'}`}>
        {/* Position Overlap card - focused when a holding is searched, full matrix otherwise */}
        {!activeSymbol && (
        <Card className="border-white/8 bg-dark-surface/70 p-4">
          {focusedIdx >= 0 ? (
            /* -- Focused view: searched symbol vs every other holding -- */
            <>
              <p className="text-sm font-semibold text-text-primary">
                Overlap - <span className="text-altrion-300">{labels[focusedIdx]}</span>
              </p>
              <p className="mb-4 text-xs text-text-muted">
                Estimated pairwise overlap vs each holding - higher = more correlated movement
              </p>
              <div className="space-y-2.5">
                {focusedOverlaps.map((entry) => {
                  const risk = entry.overlap >= 18 ? 'High' : entry.overlap >= 10 ? 'Med' : 'Low';
                  const barPct = entry.overlap > 0 ? Math.min((entry.overlap / 30) * 100, 100) : 0;
                  const barColor =
                    entry.overlap >= 18
                      ? 'rgba(244,63,94,0.65)'
                      : entry.overlap >= 10
                      ? 'rgba(251,146,60,0.65)'
                      : 'rgba(14,165,233,0.5)';
                  return (
                    <div key={entry.symbol} className="flex items-center gap-3">
                      <span className="w-14 shrink-0 font-mono text-xs font-medium text-text-primary">
                        {entry.symbol}
                      </span>
                      <div className="flex-1 overflow-hidden rounded-full bg-white/8" style={{ height: 14 }}>
                        <div
                          className="h-full rounded-full transition-all"
                          style={{ width: `${barPct}%`, backgroundColor: barColor }}
                        />
                      </div>
                      <span className="w-10 shrink-0 text-right font-mono text-xs text-text-secondary">
                        {entry.overlap > 0 ? `${entry.overlap}%` : '-'}
                      </span>
                      <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-medium ${overlapBadgeClass(risk)}`}>
                        {risk}
                      </span>
                    </div>
                  );
                })}
                {focusedOverlaps.every((e) => e.overlap === 0) && (
                  <p className="text-xs text-text-muted">
                    No measurable overlap detected. {labels[focusedIdx]} moves independently from the rest of the portfolio.
                  </p>
                )}
              </div>
              <button
                type="button"
                className="mt-4 text-[10px] text-text-muted hover:text-text-primary"
                onClick={() => {/* handled by clearing search in parent */}}
              >
                Back to full matrix
              </button>
            </>
          ) : (
            /* -- Full NxN matrix view -- */
            <>
              {(() => {
                const useRealData = data.methodology.overlap_model === 'fmp_constituent_intersection';
                return (
                  <>
                    <p className="text-sm font-semibold text-text-primary">Position Overlap Matrix</p>
                    <p className="mb-3 text-xs text-text-muted">
                      {useRealData ? (
                        <>
                          <span className="text-altrion-300">Real ETF look-through data (FMP)</span>
                          {' '}- values show portfolio % contributed by each ETF to the paired holding
                        </>
                      ) : (
                        <>
                          <span className="text-amber-400">Estimated only</span>
                          {' '}- ETF constituent data not yet loaded; stock-stock overlap is zero by definition
                        </>
                      )}
                      {' '}- search a holding to see its exposures
                      {activeAssetSymbol && focusedIdx < 0 && (
                        <span className="ml-1 text-amber-400">
                          - {activeAssetSymbol} is not a direct holding (below 0.5% threshold)
                        </span>
                      )}
                    </p>
                    {labels.length ? (
                      <div className="overflow-x-auto">
                        <div
                          className="inline-grid gap-0.5"
                          style={{
                            gridTemplateColumns: `max-content repeat(${labels.length}, minmax(0,1fr))`,
                            minWidth: `${Math.max(labels.length * 44 + 52, 300)}px`,
                          }}
                        >
                          {/* Column headers */}
                          <div />
                          {labels.map((label) => (
                            <div
                              key={`col-${label}`}
                              className="px-0.5 text-center font-mono text-[9px] text-text-muted truncate"
                              title={label}
                            >
                              {label.length > 5 ? `${label.slice(0, 5)}...` : label}
                            </div>
                          ))}
                          {/* Rows */}
                          {labels.map((rowLabel, rowIndex) => (
                            <Fragment key={rowLabel}>
                              <div className="flex items-center pr-1.5 font-mono text-[9px] text-text-muted whitespace-nowrap">
                                {rowLabel.length > 5 ? `${rowLabel.slice(0, 5)}...` : rowLabel}
                              </div>
                              {matrix[rowIndex]?.map((value, colIndex) => (
                                <div
                                  key={`${rowLabel}-${labels[colIndex]}`}
                                  className="flex items-center justify-center rounded text-[9px] font-medium text-white"
                                  style={{ ...heatCellStyle(value, useRealData), height: 28 }}
                                  title={`${rowLabel} x ${labels[colIndex]}: ${value > 0 ? value.toFixed(2) + '%' : '0%'}`}
                                >
                                  {value >= 0.01 ? `${value.toFixed(1)}%` : ''}
                                </div>
                              ))}
                            </Fragment>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <p className="text-sm text-text-muted">Not enough positions for an overlap matrix.</p>
                    )}
                  </>
                );
              })()}
            </>
          )}
        </Card>
        )}

        <Card className="border-white/8 bg-dark-surface/70 p-4">
          {(() => {
            // When a portfolio ETF is searched, show its own sector breakdown.
            // Otherwise show the portfolio-level sector allocation.
            const etfKey = activeAssetSymbol?.toUpperCase() ?? '';
            const etfSectors =
              etfKey && data.etf_sector_breakdown
                ? (data.etf_sector_breakdown[etfKey] ?? null)
                : null;
            const isEtfView = !!etfSectors;
            const sectorData = etfSectors ?? data.sector_treemap;

            return (
              <>
                <div className="mb-3 flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold text-text-primary">
                      {isEtfView ? (
                        <>
                          Sector Allocation -{' '}
                          <span className="text-altrion-300">{activeAssetSymbol}</span>
                        </>
                      ) : (
                        'Sector Allocation'
                      )}
                    </p>
                    <p className="text-xs text-text-muted">
                      {isEtfView
                        ? `${activeAssetSymbol}'s holdings by sector (FMP constituent data)`
                        : data.real_look_through
                        ? 'Portfolio - look-through via ETF constituents'
                        : 'Portfolio - based on holding sectors'}
                    </p>
                  </div>
                  {isEtfView && (
                    <span className="shrink-0 rounded-full border border-altrion-500/25 bg-altrion-500/10 px-2 py-0.5 text-[10px] text-altrion-300">
                      ETF view
                    </span>
                  )}
                </div>

                {sectorData.length === 0 ? (
                  <p className="text-xs text-text-muted">
                    {isEtfView
                      ? 'Sector data not yet available - constituent sectors will populate after the first X-Ray load.'
                      : 'No sector data available.'}
                  </p>
                ) : (
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {sectorData.map((sector, index) => (
                      <div
                        key={sector.label}
                        className="rounded-lg p-3 text-white"
                        style={{ backgroundColor: TREEMAP_COLORS[index % TREEMAP_COLORS.length] }}
                      >
                        <p className="text-[10px] leading-tight text-white/80">{sector.label}</p>
                        <p className="mt-2 text-lg font-semibold">{fmtPct(sector.weight_pct)}</p>
                        {isEtfView && (
                          <p className="mt-0.5 text-[9px] text-white/50">of {activeAssetSymbol}</p>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {isEtfView && (
                  <p className="mt-3 text-[10px] text-text-muted">
                    Based on top constituents from FMP. Weights sum to covered holdings only.
                    Search a different symbol or clear to see portfolio sectors.
                  </p>
                )}
              </>
            );
          })()}
        </Card>
      </div>

      {/* Real ETF look-through - only renders when FMP constituent data is available */}
      <TrueExposureSection data={data} />

      {/* Geographic Allocation + Asset Class Breakdown */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Geographic Allocation */}
        <Card className="border-white/8 bg-dark-surface/70 p-4">
          <p className="mb-1 text-sm font-semibold text-text-primary">Geographic Allocation</p>
          <p className="mb-4 text-xs text-text-muted">
            Regional split - known international ETFs are mapped directly; direct stocks assumed US-listed
          </p>
          {data.geographic_allocation.filter((r) => r.weight_pct > 0).length === 0 ? (
            <p className="text-sm text-text-muted">No geographic data available.</p>
          ) : (
            <div className="space-y-2.5">
              {data.geographic_allocation
                .filter((r) => r.weight_pct > 0)
                .sort((a, b) => b.weight_pct - a.weight_pct)
                .map((row, idx) => {
                  const colors = [
                    'rgba(14,165,233,0.75)',
                    'rgba(168,85,247,0.75)',
                    'rgba(34,197,94,0.75)',
                    'rgba(251,146,60,0.75)',
                  ];
                  const barPct = Math.min((row.weight_pct / 100) * 100, 100);
                  return (
                    <div key={row.label} className="flex items-center gap-3">
                      <div className="w-36 shrink-0 text-xs text-text-secondary truncate">{row.label}</div>
                      <div className="flex-1 overflow-hidden rounded-full bg-white/8" style={{ height: 16 }}>
                        <div
                          className="h-full rounded-full transition-all"
                          style={{ width: `${barPct}%`, backgroundColor: colors[idx % colors.length] }}
                        />
                      </div>
                      <span className="w-12 shrink-0 text-right font-mono text-xs text-text-secondary">
                        {fmtPct(row.weight_pct)}
                      </span>
                    </div>
                  );
                })}
            </div>
          )}
          <p className="mt-3 text-[10px] text-text-muted">
            International ETFs (VXUS, VEA, VWO, VT, etc.) are mapped by region. Direct stocks assumed US. Estimates only.
          </p>
        </Card>

        {/* Asset Class Breakdown */}
        <Card className="border-white/8 bg-dark-surface/70 p-4">
          <p className="mb-1 text-sm font-semibold text-text-primary">Asset Class Breakdown</p>
          <p className="mb-4 text-xs text-text-muted">
            How your portfolio is split across Direct Stocks, ETFs/Funds, Crypto, and Cash
          </p>
          {data.asset_class_allocation.filter((r) => r.weight_pct > 0).length === 0 ? (
            <p className="text-sm text-text-muted">No asset class data available.</p>
          ) : (
            <div className="space-y-2.5">
              {[...data.asset_class_allocation]
                .sort((a, b) => b.weight_pct - a.weight_pct)
                .map((row, idx) => {
                  const colors = [
                    'rgba(14,165,233,0.75)',
                    'rgba(0,212,200,0.72)',
                    'rgba(245,166,35,0.72)',
                    'rgba(168,85,247,0.70)',
                  ];
                  const barPct = Math.min((row.weight_pct / 100) * 100, 100);
                  return (
                    <div key={row.label} className="flex items-center gap-3">
                      <div className="w-36 shrink-0 text-xs text-text-secondary truncate">{row.label}</div>
                      <div className="flex-1 overflow-hidden rounded-full bg-white/8" style={{ height: 16 }}>
                        <div
                          className="h-full rounded-full transition-all"
                          style={{ width: `${barPct}%`, backgroundColor: colors[idx % colors.length] }}
                        />
                      </div>
                      <span className="w-12 shrink-0 text-right font-mono text-xs text-text-secondary">
                        {fmtPct(row.weight_pct)}
                      </span>
                    </div>
                  );
                })}
            </div>
          )}
          <p className="mt-3 text-[10px] text-text-muted">
            Direct Stocks = equities held individually. ETFs/Funds = pooled vehicles including mutual funds.
          </p>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="border-white/8 bg-dark-surface/70 p-4">
          <p className="text-sm font-semibold text-text-primary">Active Exposure vs S&amp;P 500</p>
          <p className="mb-3 text-xs text-text-muted">Portfolio sector weights vs benchmark (cyan = portfolio, green = S&amp;P 500)</p>
          {sectorChartData(data).length > 0 ? (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={sectorChartData(data)} layout="vertical" margin={{ left: 8, right: 16 }}>
                  <CartesianGrid stroke="rgba(255,255,255,0.06)" horizontal={false} />
                  <XAxis type="number" tick={{ fill: '#71717a', fontSize: 10 }} tickFormatter={(v) => `${v}%`} />
                  <YAxis type="category" dataKey="label" tick={{ fill: '#a1a1aa', fontSize: 10 }} width={120} />
                  <Tooltip formatter={(v) => `${Number(v ?? 0).toFixed(1)}%`} />
                  <Bar dataKey="portfolio" name="Portfolio" fill="rgba(14,165,233,0.75)" radius={[0, 3, 3, 0]} />
                  <Bar dataKey="benchmark" name="S&P 500" fill="rgba(34,197,94,0.45)" radius={[0, 3, 3, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <p className="text-sm text-text-muted">Sector data not yet available - will populate on next X-Ray load.</p>
          )}
        </Card>

        <Card className="border-white/8 bg-dark-surface/70 p-4">
          <p className="text-sm font-semibold text-text-primary">Factor Footprint</p>
          <p className="mb-3 text-xs text-text-muted">Portfolio style vs S&amp;P 500 - derived from beta, P/E, and sector tilts</p>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <RadarChart data={factorChartData(data)} cx="50%" cy="50%" outerRadius="65%">
                <PolarGrid stroke="rgba(255,255,255,0.08)" />
                <PolarAngleAxis dataKey="factor" tick={{ fill: '#a1a1aa', fontSize: 11 }} />
                <Radar name="Portfolio" dataKey="portfolio" stroke="rgba(14,165,233,0.9)" fill="rgba(14,165,233,0.15)" strokeWidth={1.5} />
                <Radar name="S&P 500" dataKey="benchmark" stroke="rgba(34,197,94,0.7)" fill="rgba(34,197,94,0.08)" strokeWidth={1.5} />
                <Tooltip formatter={(v) => `${Number(v ?? 0).toFixed(0)}/100`} />
              </RadarChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-1 flex gap-4">
            <div className="flex items-center gap-1.5"><div className="h-2 w-2 rounded-full bg-sky-400" /><span className="text-[10px] text-text-muted">Portfolio</span></div>
            <div className="flex items-center gap-1.5"><div className="h-2 w-2 rounded-full bg-emerald-400" /><span className="text-[10px] text-text-muted">S&P 500 proxy</span></div>
          </div>
        </Card>
      </div>

      <Card className="border-white/8 bg-dark-surface/70 p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-sm font-semibold text-text-primary">Key Findings</p>
            <p className="text-xs text-text-muted">Plain-English concentration and overlap signals</p>
          </div>
          <span className="rounded-full border border-altrion-500/20 bg-altrion-500/10 px-2 py-0.5 text-[10px] text-altrion-300">
            {aiFindings?.length ? 'Claude AI' : aiFindingsLoading ? 'Claude analyzing' : 'Rule-based'}
          </span>
        </div>
        <div className="grid gap-2 md:grid-cols-2">
          {keyFindings.map((finding, index) => (
            <div key={`${finding.severity}-${index}`} className="flex gap-2 rounded-lg border border-white/8 bg-white/3 p-3 text-sm text-text-secondary">
              <span className={`mt-1 h-1.5 w-1.5 shrink-0 rounded-full ${findingDotClass(finding.severity)}`} />
              <span>{finding.message}</span>
            </div>
          ))}
        </div>
      </Card>

      <Card className="border-white/8 bg-dark-surface/70 p-4">
        {/* Card header */}
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-text-primary">Holdings Intelligence</p>
            <p className="text-xs text-text-muted">
              {selectedHolding
                ? `${selectedHolding.symbol} - click row again to dismiss`
                : 'Click a row to see position detail on the right'}
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" className={sortKey === 'weight' ? 'text-altrion-300' : undefined} onClick={() => onSort('weight')}>
              Weight{sortKey === 'weight' ? (sortAsc ? ' up' : ' down') : ''}
            </Button>
            <Button variant="ghost" size="sm" className={sortKey === 'overlap' ? 'text-altrion-300' : undefined} onClick={() => onSort('overlap')}>
              Overlap{sortKey === 'overlap' ? (sortAsc ? ' up' : ' down') : ''}
            </Button>
          </div>
        </div>

        {/* Body: table + optional right panel side by side */}
        <div className={`flex items-start gap-4 ${selectedHolding ? '' : ''}`}>
          {/* Table */}
          <div className="min-w-0 flex-1 overflow-x-auto">
            <table className={`w-full text-left text-sm ${selectedHolding ? 'min-w-[560px]' : 'min-w-[860px]'}`}>
              <thead>
                <tr className="border-b border-white/8 text-[10px] uppercase tracking-[0.12em] text-text-muted">
                  <th className="px-2 py-2">Ticker</th>
                  <th className="px-2 py-2">Name</th>
                  <th className="px-2 py-2">Weight</th>
                  <th className="px-2 py-2">True Exposure</th>
                  {!selectedHolding && <th className="px-2 py-2">Value</th>}
                  <th className="px-2 py-2">Overlap</th>
                  {!selectedHolding && <th className="px-2 py-2">Valuation</th>}
                  <th className="px-2 py-2">Sector</th>
                </tr>
              </thead>
              <tbody>
                {holdings.map((holding) => (
                  <tr
                    key={holding.symbol}
                    onClick={() => onSelect(holding.symbol)}
                    className={`cursor-pointer border-b border-white/5 transition hover:bg-white/3 ${
                      selectedHolding?.symbol === holding.symbol
                        ? 'border-l-2 border-l-altrion-400 bg-altrion-500/8'
                        : ''
                    }`}
                  >
                    <td className="px-2 py-2.5 font-mono font-medium text-text-primary">{holding.symbol}</td>
                    <td className="max-w-[160px] truncate px-2 py-2.5 text-text-secondary">{holding.name}</td>
                    <td className="px-2 py-2.5 font-mono">{fmtPct(holding.weight_pct)}</td>
                    <td className={`px-2 py-2.5 font-mono ${holding.true_exposure_pct > holding.weight_pct ? 'text-altrion-300' : 'text-text-primary'}`}>
                      {fmtPct(holding.true_exposure_pct)}
                      {holding.true_exposure_pct > holding.weight_pct && (
                        <span className="ml-1 text-[10px] text-amber-400">
                          +{fmtPct(holding.true_exposure_pct - holding.weight_pct)}
                        </span>
                      )}
                    </td>
                    {!selectedHolding && (
                      <td className="px-2 py-2.5 font-mono text-text-secondary">{fmtMoney(holding.value_usd)}</td>
                    )}
                    <td className="px-2 py-2.5">
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${overlapBadgeClass(holding.overlap_risk)}`}>
                        {holding.overlap_risk}
                      </span>
                    </td>
                    {!selectedHolding && (
                      <td className="px-2 py-2.5 font-mono text-text-secondary">{holding.valuation_label ?? '-'}</td>
                    )}
                    <td className="px-2 py-2.5 text-text-secondary">{holding.sector ?? '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Right panel - position detail, appears inline to the right */}
          {selectedHolding && (() => {
            const ltEntry = data.real_look_through?.entries.find(
              (e) => e.symbol.toUpperCase() === selectedHolding.symbol.toUpperCase(),
            );
            return (
              <div className="w-64 shrink-0 space-y-3 border-l border-white/8 pl-4">
                {/* Header */}
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-mono font-semibold text-text-primary">{selectedHolding.symbol}</p>
                    <p className="line-clamp-1 text-xs text-text-muted">{selectedHolding.name}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => onSelect(selectedHolding.symbol)}
                    className="mt-0.5 shrink-0 text-text-muted hover:text-text-primary"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>

                {/* Portfolio share bar */}
                <div className="rounded-xl bg-white/3 p-3">
                  <div className="mb-1.5 flex justify-between text-xs">
                    <span className="text-text-muted">Portfolio share</span>
                    <span className="font-mono text-text-primary">{fmtPct(selectedHolding.weight_pct)}</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-white/8">
                    <div
                      className="h-2 rounded-full bg-altrion-400 transition-all"
                      style={{ width: `${Math.min(selectedHolding.weight_pct * 5, 100)}%` }}
                    />
                  </div>
                </div>

                {/* Position metrics */}
                <div className="rounded-xl bg-white/3 p-3 space-y-1.5">
                  <p className="mb-1 text-[10px] uppercase tracking-widest text-text-muted">Position</p>
                  <StatRow label="Value" value={fmtMoney(selectedHolding.value_usd)} />
                  <StatRow label="Weight" value={fmtPct(selectedHolding.weight_pct)} />
                  <StatRow
                    label="True Exposure"
                    value={fmtPct(selectedHolding.true_exposure_pct)}
                    valueClassName={selectedHolding.true_exposure_pct > selectedHolding.weight_pct ? 'text-altrion-300' : undefined}
                  />
                  {selectedHolding.true_exposure_pct > selectedHolding.weight_pct && (
                    <StatRow
                      label="Hidden via ETFs"
                      value={`+${fmtPct(selectedHolding.true_exposure_pct - selectedHolding.weight_pct)}`}
                      valueClassName="text-amber-400"
                    />
                  )}
                </div>

                {/* Classification */}
                <div className="rounded-xl bg-white/3 p-3 space-y-1.5">
                  <p className="mb-1 text-[10px] uppercase tracking-widest text-text-muted">Classification</p>
                  <StatRow label="Sector" value={selectedHolding.sector ?? '-'} />
                  <div className="flex items-center justify-between py-1 border-b border-white/5">
                    <span className="text-xs text-text-muted">Overlap Risk</span>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${overlapBadgeClass(selectedHolding.overlap_risk)}`}>
                      {selectedHolding.overlap_risk}
                    </span>
                  </div>
                </div>

                {/* Valuation metrics (stocks only, skipped for ETF/cash/crypto) */}
                {!isCashOrEtf && (
                  <div className="rounded-xl bg-white/3 p-3 space-y-1.5">
                    <div className="mb-1 flex items-center justify-between">
                      <p className="text-[10px] uppercase tracking-widest text-text-muted">Valuation</p>
                      {valuationLoading && <Loader2 className="h-3 w-3 animate-spin text-text-muted" />}
                    </div>
                    {holdingValuation && Object.values(holdingValuation).some((v) => v !== null) ? (
                      <>
                        {holdingValuation.trailing_pe != null && (
                          <StatRow label="P/E (TTM)" value={`${holdingValuation.trailing_pe.toFixed(1)}x`} />
                        )}
                        {holdingValuation.forward_pe != null && (
                          <StatRow label="Forward P/E" value={`${holdingValuation.forward_pe.toFixed(1)}x`} />
                        )}
                        {holdingValuation.price_to_book != null && (
                          <StatRow label="P/B" value={`${holdingValuation.price_to_book.toFixed(1)}x`} />
                        )}
                        {holdingValuation.ev_to_ebitda != null && (
                          <StatRow label="EV/EBITDA" value={`${holdingValuation.ev_to_ebitda.toFixed(1)}x`} />
                        )}
                        {holdingValuation.peg_ratio != null && (
                          <StatRow label="PEG" value={holdingValuation.peg_ratio.toFixed(2)} />
                        )}
                        {holdingValuation.roe != null && (
                          <StatRow
                            label="ROE"
                            value={`${(holdingValuation.roe * 100).toFixed(1)}%`}
                            valueClassName={holdingValuation.roe > 0.15 ? 'text-emerald-400' : undefined}
                          />
                        )}
                        {holdingValuation.revenue_growth != null && (
                          <StatRow
                            label="Rev. Growth"
                            value={`${holdingValuation.revenue_growth >= 0 ? '+' : ''}${(holdingValuation.revenue_growth * 100).toFixed(1)}%`}
                            valueClassName={holdingValuation.revenue_growth > 0 ? 'text-emerald-400' : 'text-red-400'}
                          />
                        )}
                        {holdingValuation.market_cap != null && (
                          <StatRow
                            label="Market Cap"
                            value={
                              holdingValuation.market_cap >= 1e12
                                ? `$${(holdingValuation.market_cap / 1e12).toFixed(1)}T`
                                : holdingValuation.market_cap >= 1e9
                                ? `$${(holdingValuation.market_cap / 1e9).toFixed(1)}B`
                                : `$${(holdingValuation.market_cap / 1e6).toFixed(0)}M`
                            }
                          />
                        )}
                      </>
                    ) : !valuationLoading ? (
                      <p className="text-[10px] text-text-muted">No valuation data available.</p>
                    ) : null}
                  </div>
                )}

                {/* ETF look-through */}
                {ltEntry && ltEntry.via_etfs.length > 0 ? (
                  <div className="rounded-xl bg-white/3 p-3 space-y-1.5">
                    <p className="mb-1 text-[10px] uppercase tracking-widest text-text-muted">Held Via ETFs</p>
                    {ltEntry.via_etfs.map((v) => (
                      <div key={v.etf} className="flex items-center justify-between text-xs">
                        <span className="text-text-muted">via {v.etf}</span>
                        <span className="font-mono text-altrion-300">+{fmtPct(v.contribution_pct)}</span>
                      </div>
                    ))}
                    <div className="flex items-center justify-between border-t border-white/8 pt-1.5 text-xs font-semibold">
                      <span className="text-text-primary">Total</span>
                      <span className="font-mono text-altrion-300">{fmtPct(ltEntry.total_pct)}</span>
                    </div>
                  </div>
                ) : (
                  <p className="text-[10px] text-text-muted">No additional ETF exposure found.</p>
                )}

                {/* Research Lab CTA */}
                <div className="rounded-xl border border-altrion-500/20 bg-altrion-500/6 p-3">
                  <p className="text-[10px] leading-relaxed text-text-muted">
                    Run AI analysis on <span className="font-mono text-altrion-300">{selectedHolding.symbol}</span> in the{' '}
                    <span className="text-text-secondary">Research Lab</span> tab.
                  </p>
                </div>
              </div>
            );
          })()}
        </div>
      </Card>
    </div>
  );
}

// -- Macro Tab -----------------------------------------------------------------
const macroToneClass = (tone: string) => {
  if (tone === 'lime') return 'text-emerald-300';
  if (tone === 'amber') return 'text-amber-300';
  return 'text-altrion-300';
};

const macroSignalClass = (signal: string) => {
  if (signal === 'Positive') return 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/25';
  if (signal === 'Negative') return 'bg-rose-500/15 text-rose-300 border border-rose-500/25';
  return 'bg-amber-500/15 text-amber-300 border border-amber-500/25';
};

function MacroTab({ snapshot }: { snapshot: PortfolioXRayMacroSnapshot }) {
  // Build radar data from indicators for the Regime Dashboard chart
  const radarData = snapshot.indicators.map((ind) => {
    // Parse numeric value for radar - crude extraction of the leading number
    const numMatch = String(ind.value).match(/[\d.]+/);
    const raw = numMatch ? parseFloat(numMatch[0]) : 0;
    // Normalize to 0-100 scale per indicator
    const normalise = (v: number, max: number) => Math.min(100, Math.round((v / max) * 100));
    let scaled = 50;
    if (ind.key === 'fed_funds') scaled = normalise(raw, 7);
    else if (ind.key === 'ten_year') scaled = normalise(raw, 6);
    else if (ind.key === 'cpi_yoy') scaled = normalise(raw, 8);
    else if (ind.key === 'unemployment') scaled = normalise(raw, 8);
    else if (ind.key === 'vix') scaled = normalise(raw, 40);
    else if (ind.key === 'hy_spread') scaled = normalise(raw, 8);
    return { label: ind.label.replace(/\s/g, ' '), value: scaled, raw: ind.value };
  });

  return (
    <div className="space-y-4">
      {/* Regime headline */}
      <Card className="border-white/8 bg-dark-surface/70 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-[10px] uppercase tracking-widest text-text-muted">Current Regime</p>
            <p className="mt-1 text-xl font-semibold text-emerald-300">{snapshot.regime_label}</p>
          </div>
          <span className="rounded-full bg-white/5 px-3 py-1 text-[10px] uppercase tracking-widest text-text-muted">
            Static snapshot - updated on startup
          </span>
        </div>
        <p className="mt-2 text-xs leading-relaxed text-text-muted">
          Macro indicators are curated placeholders. Connect to a live data feed for real-time regime detection.
        </p>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Regime radar chart */}
        <Card className="border-white/8 bg-dark-surface/70 p-4">
          <p className="mb-1 text-sm font-semibold text-text-primary">Regime Dashboard</p>
          <p className="mb-3 text-xs text-text-muted">Normalised macro indicators (0 = low, 100 = extreme)</p>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <RadarChart data={radarData}>
                <PolarGrid stroke="rgba(255,255,255,0.08)" />
                <PolarAngleAxis dataKey="label" tick={{ fill: '#a1a1aa', fontSize: 10 }} />
                <Radar dataKey="value" stroke="rgba(0,212,200,0.9)" fill="rgba(0,212,200,0.12)" strokeWidth={1.5} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#0e1420', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, fontSize: 11 }}
                  formatter={(_val, _name, item) =>
                    [String(item?.payload?.raw ?? _val), 'Value']
                  }
                />
              </RadarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        {/* Macro indicators grid */}
        <div className="grid grid-cols-2 gap-3 content-start">
          {snapshot.indicators.map((indicator: any) => (
            <Card key={indicator.key} className="border-white/8 bg-dark-surface/70 p-3">
              <p className="text-[10px] uppercase tracking-[0.12em] text-text-muted">{indicator.label}</p>
              <p className={`mt-1.5 text-lg font-semibold ${macroToneClass(indicator.tone)}`}>{indicator.value}</p>
              <p className="mt-1 text-[11px] leading-relaxed text-text-muted">{indicator.meaning}</p>
            </Card>
          ))}
        </div>
      </div>

      {/* Macro-to-portfolio mapping */}
      <Card className="border-white/8 bg-dark-surface/70 p-4">
        <p className="mb-3 text-sm font-semibold text-text-primary">Macro-to-Portfolio Mapping</p>
        <p className="mb-3 text-xs text-text-muted">How macro conditions map to your current holdings</p>
        <div className="space-y-2">
          {snapshot.impact_cards.map((card: any) => (
            <div key={card.title} className="rounded-lg border border-white/8 bg-white/3 p-3">
              <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-medium text-text-primary">{card.title}</p>
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${macroSignalClass(card.signal)}`}>{card.signal}</span>
              </div>
              <p className="text-xs leading-relaxed text-text-secondary">{card.description}</p>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
