import { useEffect, useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { AlertTriangle, FlaskConical, Loader2, X } from 'lucide-react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, Button } from '@/components/ui';
import {
  analysisService,
  type AssetHistoryPeriod,
  type ResearchLabMode,
  type ResearchLabResult,
} from '@/services';
import { CompsPanel } from './financial-analysis/CompsPanel';

// ── Constants ─────────────────────────────────────────────────────────────────

const LS_RECENT_KEY = 'altrion_lab_recent';

type ResearchView = 'research' | 'comps';
const RESEARCH_VIEWS: { key: ResearchView; label: string }[] = [
  { key: 'research', label: 'AI Research' },
  { key: 'comps', label: 'Comps' },
];

const LAB_MODES: { key: ResearchLabMode; label: string; description: string; cryptoOnly?: boolean }[] = [
  { key: 'investment_thesis',       label: 'Investment Thesis',  description: 'Moat, valuation & growth outlook' },
  { key: 'earnings_analysis',       label: 'Earnings Analysis',  description: 'Post-earnings results & thesis impact' },
  { key: 'earnings_preview',        label: 'Earnings Preview',   description: 'Pre-earnings scenarios & setup' },
  { key: 'comps_valuation',         label: 'Comps & Valuation',  description: 'Multiples vs sector benchmarks' },
  { key: 'bull_bear_memo',          label: 'Bull/Bear Memo',     description: 'Structured bull vs bear argument' },
  { key: 'catalyst_tracker',        label: 'Catalyst Tracker',   description: 'Upcoming events ranked by impact' },
  { key: 'insider_activity_analysis', label: 'Insider Activity', description: 'Buy/sell signals from corporate insiders' },
  { key: 'protocol_deep_dive',      label: 'Protocol Deep Dive', description: 'Digital asset fundamentals', cryptoOnly: true },
];

const HISTORY_PERIODS: { key: AssetHistoryPeriod; label: string }[] = [
  { key: '1D', label: '1D' },
  { key: '1W', label: '1W' },
  { key: '1M', label: '1M' },
  { key: '6M', label: '6M' },
  { key: '1Y', label: '1Y' },
  { key: '5Y', label: '5Y' },
  { key: 'MAX', label: 'Max' },
];

const CRYPTO_PREFIXES = ['BTC', 'ETH', 'SOL', 'DOGE', 'AVAX', 'ADA', 'MATIC', 'ARB', 'OP', 'SHIB', 'USDC', 'USDT'];

// ── Markdown renderer ─────────────────────────────────────────────────────────

function inlineText(text: string): ReactNode[] {
  const parts = text.split(/\*\*(.+?)\*\*/g);
  return parts.map((part, i) =>
    i % 2 === 1 ? <strong key={i} className="text-text-primary">{part}</strong> : part,
  );
}

function SimpleMarkdown({ text }: { text: string }) {
  const lines = text.split('\n');
  const nodes: ReactNode[] = [];
  let bullets: string[] = [];
  let keyIdx = 0;

  const flushBullets = () => {
    if (!bullets.length) return;
    nodes.push(
      <ul key={`ul-${keyIdx++}`} className="my-1 space-y-1 pl-4">
        {bullets.map((b, i) => (
          <li key={i} className="text-sm leading-relaxed text-text-secondary list-disc">
            {inlineText(b)}
          </li>
        ))}
      </ul>,
    );
    bullets = [];
  };

  lines.forEach((line) => {
    const k = keyIdx++;
    if (line.startsWith('## ')) {
      flushBullets();
      nodes.push(
        <h2 key={k} className="mt-4 mb-1 text-sm font-semibold text-text-primary border-b border-white/8 pb-1">
          {line.slice(3)}
        </h2>,
      );
    } else if (line.startsWith('### ')) {
      flushBullets();
      nodes.push(
        <h3 key={k} className="mt-3 mb-1 text-xs font-semibold text-text-primary uppercase tracking-wide">
          {line.slice(4)}
        </h3>,
      );
    } else if (line.startsWith('**') && line.endsWith('**') && line.length > 4) {
      flushBullets();
      nodes.push(
        <p key={k} className="mt-3 text-sm font-semibold text-text-primary">
          {line.slice(2, -2)}
        </p>,
      );
    } else if (line.startsWith('- ') || line.startsWith('* ')) {
      bullets.push(line.slice(2));
    } else if (line.trim() === '') {
      flushBullets();
    } else {
      flushBullets();
      nodes.push(
        <p key={k} className="mt-1 text-sm leading-relaxed text-text-secondary">
          {inlineText(line)}
        </p>,
      );
    }
  });
  flushBullets();

  return <div className="space-y-0.5">{nodes}</div>;
}

// ── Price chart ───────────────────────────────────────────────────────────────

function PriceChart({ symbol }: { symbol: string }) {
  const [period, setPeriod] = useState<AssetHistoryPeriod>('1M');

  const { data, isLoading, error } = useQuery({
    queryKey: ['asset-history', symbol, period],
    queryFn: () => analysisService.getAssetHistory(symbol, period),
    staleTime: period === '1D' ? 60_000 : 300_000,
  });

  const prices = data?.prices ?? [];

  const formatXAxis = (dateStr: string) => {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    if (period === '1D') return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    if (period === '1W') return d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
    if (period === '1M' || period === '6M') return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
    return d.toLocaleDateString([], { month: 'short', year: '2-digit' });
  };

  const minPrice  = prices.length ? Math.min(...prices.map((p) => p.close)) * 0.995 : 0;
  const maxPrice  = prices.length ? Math.max(...prices.map((p) => p.close)) * 1.005 : 100;
  const firstClose = prices[0]?.close ?? 0;
  const lastClose  = prices[prices.length - 1]?.close ?? 0;
  const isPositive = lastClose >= firstClose;
  const changeAmt  = lastClose - firstClose;
  const changePct  = firstClose ? (changeAmt / firstClose) * 100 : 0;
  const strokeColor = isPositive ? '#10b981' : '#f43f5e';
  const fillId      = isPositive ? 'greenGrad' : 'redGrad';

  return (
    <Card className="border-white/8 bg-dark-surface/70 p-4">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-text-primary">Price History — {symbol}</p>
          {prices.length > 0 && (
            <p className={`text-xs ${isPositive ? 'text-emerald-300' : 'text-rose-300'}`}>
              {isPositive ? '▲' : '▼'} {Math.abs(changePct).toFixed(2)}%
              ({isPositive ? '+' : ''}${changeAmt.toFixed(2)}) over period
            </p>
          )}
        </div>
        <div className="flex rounded-lg border border-white/8 bg-white/4 p-0.5">
          {HISTORY_PERIODS.map((p) => (
            <button
              key={p.key}
              type="button"
              onClick={() => setPeriod(p.key)}
              className={`rounded-md px-2.5 py-1 text-xs font-medium transition ${
                period === p.key ? 'bg-altrion-500/20 text-altrion-300' : 'text-text-muted hover:text-text-primary'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="flex h-48 items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-altrion-400" />
        </div>
      ) : error || !prices.length ? (
        <div className="flex h-48 items-center justify-center text-sm text-text-muted">
          {error ? 'Price history unavailable for this period.' : 'No data available.'}
        </div>
      ) : (
        <div className="h-48">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={prices} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id="greenGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="#10b981" stopOpacity={0.25} />
                  <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="redGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="#f43f5e" stopOpacity={0.25} />
                  <stop offset="95%" stopColor="#f43f5e" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="rgba(255,255,255,0.04)" vertical={false} />
              <XAxis
                dataKey="date"
                tickFormatter={formatXAxis}
                tick={{ fill: '#71717a', fontSize: 10 }}
                interval="preserveStartEnd"
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                domain={[minPrice, maxPrice]}
                tick={{ fill: '#71717a', fontSize: 10 }}
                tickFormatter={(v) => `$${v >= 1000 ? `${(v / 1000).toFixed(1)}k` : v.toFixed(0)}`}
                tickLine={false}
                axisLine={false}
                width={55}
              />
              <Tooltip
                contentStyle={{ backgroundColor: '#1a1a2e', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, fontSize: 12 }}
                labelStyle={{ color: '#a1a1aa' }}
                formatter={(val) => [`$${Number(val ?? 0).toFixed(2)}`, 'Price']}
                labelFormatter={(label) => formatXAxis(label)}
              />
              <Area
                type="monotone"
                dataKey="close"
                stroke={strokeColor}
                strokeWidth={1.5}
                fill={`url(#${fillId})`}
                dot={false}
                activeDot={{ r: 3, fill: strokeColor }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
      <div className="mt-3 flex justify-end">
        <p className="text-[10px] text-text-muted">via Yahoo Finance</p>
      </div>
    </Card>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export function ResearchLab() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeAssetSymbol, setActiveAssetSymbol] = useState<string | null>(null);

  const [view, setView]         = useState<ResearchView>('research');
  const [labMode, setLabMode]   = useState<ResearchLabMode>('investment_thesis');
  const [labResult, setLabResult] = useState<ResearchLabResult | null>(null);
  const [labError, setLabError]   = useState<string | null>(null);

  const [recentSearches] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem(LS_RECENT_KEY) || '[]'); } catch { return []; }
  });

  // Auto-select asset from ?symbol= query param (set by the global header search)
  useEffect(() => {
    const sym = searchParams.get('symbol');
    if (sym) {
      setActiveAssetSymbol(sym);
      setLabResult(null);
      setLabError(null);
      setSearchParams({}, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  // Research lab mutation
  const labMutation = useMutation({
    mutationFn: (payload: { symbol: string; mode: ResearchLabMode }) =>
      analysisService.runResearchLab({ symbol: payload.symbol, mode: payload.mode }),
    onSuccess: (result) => { setLabResult(result); setLabError(null); },
    onError: () => { setLabError('Analysis failed. Please check your API configuration and try again.'); },
  });

  const selectTicker = (symbol: string) => {
    setActiveAssetSymbol(symbol);
    setLabResult(null);
    setLabError(null);
  };

  const clearSearch = () => {
    setActiveAssetSymbol(null);
    setLabResult(null);
    setLabError(null);
  };

  const runLab = () => {
    if (!activeAssetSymbol) return;
    setLabResult(null);
    setLabError(null);
    labMutation.mutate({ symbol: activeAssetSymbol, mode: labMode });
  };

  const isCrypto = activeAssetSymbol
    ? CRYPTO_PREFIXES.some((c) => activeAssetSymbol.toUpperCase().startsWith(c)) || activeAssetSymbol.includes('-USD')
    : false;
  const visibleModes = LAB_MODES.filter((m) => !m.cryptoOnly || isCrypto);

  return (
    <DashboardLayout maxWidth="max-w-5xl">
      {/* Header */}
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-[10px] uppercase tracking-[0.18em] text-altrion-400">AI-Powered Analysis</p>
          <h1 className="flex items-center gap-2 text-2xl font-semibold text-text-primary">
            <FlaskConical className="h-6 w-6 text-altrion-400" />
            Research Lab
          </h1>
          <p className="mt-1 text-sm text-text-muted">
            Use the search bar at the top to find any stock, ETF, or crypto — then run an AI-powered analyst report.
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* View toggle: AI research vs Comps */}
          <div className="inline-flex gap-1 rounded-xl border border-white/8 bg-white/4 p-1">
            {RESEARCH_VIEWS.map((v) => (
              <button
                key={v.key}
                type="button"
                onClick={() => setView(v.key)}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                  view === v.key ? 'bg-altrion-500/15 text-altrion-300' : 'text-text-muted hover:text-text-primary'
                }`}
              >
                {v.label}
              </button>
            ))}
          </div>

        </div>
      </div>

      {view === 'comps' ? (
        <CompsPanel />
      ) : (
        <>
      {/* No asset selected — placeholder + recent searches */}
      {!activeAssetSymbol && (
        <div className="space-y-4">
          <Card className="border-white/8 bg-dark-surface/70 p-10 text-center">
            <FlaskConical className="mx-auto mb-3 h-10 w-10 text-altrion-400/50" />
            <p className="text-sm font-medium text-text-primary">Search for a ticker to begin</p>
            <p className="mt-1 text-xs text-text-muted">
              Use the search bar at the top of the page to find a stock, ETF, or crypto.
            </p>
          </Card>

          {recentSearches.length > 0 && (
            <Card className="border-white/8 bg-dark-surface/70 p-4">
              <p className="mb-3 text-[10px] uppercase tracking-widest text-text-muted">Recent Searches</p>
              <div className="flex flex-wrap gap-2">
                {recentSearches.map((sym) => (
                  <button
                    key={sym}
                    type="button"
                    onClick={() => selectTicker(sym)}
                    className="rounded-lg border border-white/8 bg-white/3 px-3 py-1.5 font-mono text-xs text-text-secondary transition hover:border-altrion-500/30 hover:text-altrion-300"
                  >
                    {sym}
                  </button>
                ))}
              </div>
            </Card>
          )}
        </div>
      )}

      {/* Asset selected */}
      {activeAssetSymbol && (
        <div className="space-y-4">
          {/* Active ticker header */}
          <div className="flex items-center justify-between rounded-2xl border border-white/8 bg-dark-surface/70 px-4 py-3">
            <div>
              <p className="text-[10px] uppercase tracking-widest text-text-muted">Analyzing</p>
              <p className="text-lg font-semibold text-altrion-300">{activeAssetSymbol}</p>
            </div>
            <button
              type="button"
              onClick={clearSearch}
              className="rounded-lg p-1.5 text-text-muted transition hover:bg-white/8 hover:text-text-primary"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Price chart */}
          <PriceChart symbol={activeAssetSymbol} />

          {/* Mode selector + run button */}
          <Card className="border-white/8 bg-dark-surface/70 p-4">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-text-primary">Select Analysis Mode</p>
                <p className="text-xs text-text-muted">
                  Yahoo Finance data is gathered and Claude synthesizes the report.
                </p>
              </div>
              <Button onClick={runLab} disabled={labMutation.isPending} className="shrink-0">
                {labMutation.isPending ? (
                  <><Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> Analyzing…</>
                ) : (
                  <><FlaskConical className="mr-1.5 h-4 w-4" /> Run Analysis</>
                )}
              </Button>
            </div>

            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {visibleModes.map((mode) => (
                <button
                  key={mode.key}
                  type="button"
                  onClick={() => { setLabMode(mode.key); setLabResult(null); setLabError(null); }}
                  className={`rounded-xl border p-3 text-left transition ${
                    labMode === mode.key
                      ? 'border-altrion-500/40 bg-altrion-500/10'
                      : 'border-white/8 bg-white/3 hover:border-white/15 hover:bg-white/5'
                  }`}
                >
                  <p className={`text-sm font-medium ${labMode === mode.key ? 'text-altrion-300' : 'text-text-primary'}`}>
                    {mode.label}
                  </p>
                  <p className="mt-0.5 text-xs text-text-muted">{mode.description}</p>
                </button>
              ))}
            </div>
          </Card>

          {/* Error */}
          {labError && (
            <Card className="border-rose-500/25 bg-rose-500/10 p-4 text-sm text-rose-200">
              <div className="flex items-start gap-2">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                {labError}
              </div>
            </Card>
          )}

          {/* Running */}
          {labMutation.isPending && (
            <Card className="flex min-h-[200px] items-center justify-center border-white/8 bg-dark-surface/70">
              <div className="text-center">
                <Loader2 className="mx-auto mb-3 h-6 w-6 animate-spin text-altrion-400" />
                <p className="text-sm text-text-muted">Gathering data and synthesizing analysis…</p>
              </div>
            </Card>
          )}

          {/* Result */}
          {labResult && !labMutation.isPending && (
            <Card className="border-white/8 bg-dark-surface/70 p-5">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-text-primary">
                    {LAB_MODES.find((m) => m.key === labResult.mode)?.label ?? labResult.mode}
                  </p>
                  <p className="text-xs text-text-muted">{labResult.symbol} · powered by Claude</p>
                </div>
                <span className="rounded-full border border-altrion-500/20 bg-altrion-500/15 px-2.5 py-0.5 text-[10px] font-medium text-altrion-300">
                  AI Generated
                </span>
              </div>
              <div className="border-t border-white/8 pt-4">
                <SimpleMarkdown text={labResult.analysis} />
              </div>
              <p className="mt-4 border-t border-white/8 pt-3 text-[11px] leading-relaxed text-text-muted">
                This analysis is AI-generated for educational purposes only and does not constitute investment advice.
                Always consult a licensed financial advisor before making investment decisions.
              </p>
            </Card>
          )}
        </div>
      )}
        </>
      )}
    </DashboardLayout>
  );
}
