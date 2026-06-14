import { useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { AlertTriangle, Loader2, Play, Plus, Trash2 } from 'lucide-react';
import { Card, Button } from '@/components/ui';
import { analysisService, type CompsRequest, type CompsResult } from '@/services';

type ChartValue = string | number | readonly (string | number)[] | undefined;

const fmtMoney = (n: number | null | undefined) => {
  if (n === null || n === undefined || Number.isNaN(n)) return '—';
  const abs = Math.abs(n);
  if (abs >= 1_000_000_000) return `${n < 0 ? '-' : ''}$${(abs / 1_000_000_000).toFixed(2)}B`;
  if (abs >= 1_000_000) return `${n < 0 ? '-' : ''}$${(abs / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `${n < 0 ? '-' : ''}$${(abs / 1_000).toFixed(1)}k`;
  return `${n < 0 ? '-' : ''}$${abs.toFixed(2)}`;
};

const toNumber = (value: ChartValue): number | null => {
  const raw = Array.isArray(value) ? value[0] : value;
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null;
  if (typeof raw === 'string') {
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

const formatTooltipMoney = (value: ChartValue) => fmtMoney(toNumber(value));

function NumberField({
  label,
  value,
  onChange,
  step = 1,
  prefix,
  suffix,
}: {
  label: string;
  value: number | undefined | null;
  onChange: (v: number) => void;
  step?: number;
  prefix?: string;
  suffix?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-text-muted">
        {label}
      </span>
      <div className="flex items-stretch rounded-lg border-2 border-dark-border bg-transparent transition-colors focus-within:border-altrion-500">
        {prefix ? (
          <span className="flex items-center pl-3 pr-1.5 text-sm text-text-muted">{prefix}</span>
        ) : null}
        <input
          type="number"
          step={step}
          value={value ?? ''}
          onChange={(e) => onChange(Number(e.target.value))}
          className="w-full bg-transparent px-3 py-2.5 text-sm text-text-primary focus:outline-none"
        />
        {suffix ? (
          <span className="flex items-center pl-1.5 pr-3 text-sm text-text-muted">{suffix}</span>
        ) : null}
      </div>
    </label>
  );
}

function TextField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-text-muted">
        {label}
      </span>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border-2 border-dark-border bg-transparent px-3 py-2.5 text-sm text-text-primary focus:border-altrion-500 focus:outline-none"
      />
    </label>
  );
}

interface PeerRow {
  name: string;
  sector: string;
  ev_revenue: number;
  ev_ebitda: number;
  pe: number;
  revenue_growth: number;
  ebitda_margin: number;
}

const COMPS_DEFAULT_PEERS: PeerRow[] = [
  { name: 'Peer A', sector: 'Tech', ev_revenue: 6.2, ev_ebitda: 18, pe: 28, revenue_growth: 0.18, ebitda_margin: 0.32 },
  { name: 'Peer B', sector: 'Tech', ev_revenue: 5.1, ev_ebitda: 16, pe: 24, revenue_growth: 0.14, ebitda_margin: 0.3 },
  { name: 'Peer C', sector: 'Tech', ev_revenue: 7.4, ev_ebitda: 22, pe: 32, revenue_growth: 0.22, ebitda_margin: 0.36 },
];

/**
 * Comparable multiples analysis — define a target investment and a set of
 * peers, then compute an implied valuation range from peer multiples.
 */
export function CompsPanel() {
  const [target, setTarget] = useState({
    name: 'Target Co',
    sector: 'Tech',
    revenue: 250,
    ebitda: 60,
    net_income: 35,
  });
  const [peers, setPeers] = useState<PeerRow[]>(COMPS_DEFAULT_PEERS);
  const [result, setResult] = useState<CompsResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const updatePeer = (idx: number, next: Partial<PeerRow>) => {
    const updated = [...peers];
    updated[idx] = { ...updated[idx], ...next };
    setPeers(updated);
  };

  const addPeer = () => {
    setPeers([
      ...peers,
      {
        name: `Peer ${String.fromCharCode(65 + peers.length)}`,
        sector: target.sector,
        ev_revenue: 5,
        ev_ebitda: 15,
        pe: 22,
        revenue_growth: 0.1,
        ebitda_margin: 0.25,
      },
    ]);
  };

  const removePeer = (idx: number) => {
    const updated = [...peers];
    updated.splice(idx, 1);
    setPeers(updated);
  };

  const run = async () => {
    setLoading(true);
    setError(null);
    try {
      const payload: CompsRequest = {
        target_investment: target as unknown as Record<string, unknown>,
        comparison_investments: peers as unknown as Array<Record<string, unknown>>,
      };
      const res = await analysisService.runComps(payload);
      setResult(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Comps failed');
    } finally {
      setLoading(false);
    }
  };

  const valuationChartData = result
    ? Object.entries(result.valuation_range).map(([k, v]) => ({
        multiple: k.replace('_', ' / ').toUpperCase(),
        low: v.low ?? 0,
        median: v.median ?? 0,
        high: v.high ?? 0,
      }))
    : [];

  return (
    <div className="space-y-4">
      <Card variant="bordered">
        <h3 className="mb-3 text-sm font-semibold text-text-primary">Target investment</h3>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <TextField label="Name" value={target.name} onChange={(v) => setTarget({ ...target, name: v })} />
          <TextField label="Sector" value={target.sector} onChange={(v) => setTarget({ ...target, sector: v })} />
          <NumberField label="Revenue ($M)" value={target.revenue} onChange={(v) => setTarget({ ...target, revenue: v })} prefix="$" />
          <NumberField label="EBITDA ($M)" value={target.ebitda} onChange={(v) => setTarget({ ...target, ebitda: v })} prefix="$" />
          <NumberField label="Net income ($M)" value={target.net_income} onChange={(v) => setTarget({ ...target, net_income: v })} prefix="$" />
        </div>
      </Card>

      <Card variant="bordered">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-text-primary">Peers</h3>
          <button onClick={addPeer} className="flex items-center gap-1 text-xs text-altrion-400 hover:text-altrion-300">
            <Plus size={14} /> Add peer
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-text-muted">
                <th className="pb-2 pr-3">Name</th>
                <th className="pb-2 pr-3">Sector</th>
                <th className="pb-2 pr-3">EV / Rev</th>
                <th className="pb-2 pr-3">EV / EBITDA</th>
                <th className="pb-2 pr-3">P/E</th>
                <th className="pb-2 pr-3">Rev growth</th>
                <th className="pb-2 pr-3">EBITDA margin</th>
                <th className="pb-2"></th>
              </tr>
            </thead>
            <tbody>
              {peers.map((peer, idx) => (
                <tr key={idx} className="border-t border-dark-border">
                  <td className="py-1.5 pr-3">
                    <input value={peer.name} onChange={(e) => updatePeer(idx, { name: e.target.value })} className="w-full rounded border border-dark-border bg-transparent px-2 py-1 text-sm text-text-primary" />
                  </td>
                  <td className="py-1.5 pr-3">
                    <input value={peer.sector} onChange={(e) => updatePeer(idx, { sector: e.target.value })} className="w-full rounded border border-dark-border bg-transparent px-2 py-1 text-sm text-text-primary" />
                  </td>
                  <td className="py-1.5 pr-3">
                    <input type="number" step={0.1} value={peer.ev_revenue} onChange={(e) => updatePeer(idx, { ev_revenue: Number(e.target.value) })} className="w-full rounded border border-dark-border bg-transparent px-2 py-1 text-sm text-text-primary" />
                  </td>
                  <td className="py-1.5 pr-3">
                    <input type="number" step={0.1} value={peer.ev_ebitda} onChange={(e) => updatePeer(idx, { ev_ebitda: Number(e.target.value) })} className="w-full rounded border border-dark-border bg-transparent px-2 py-1 text-sm text-text-primary" />
                  </td>
                  <td className="py-1.5 pr-3">
                    <input type="number" step={0.5} value={peer.pe} onChange={(e) => updatePeer(idx, { pe: Number(e.target.value) })} className="w-full rounded border border-dark-border bg-transparent px-2 py-1 text-sm text-text-primary" />
                  </td>
                  <td className="py-1.5 pr-3">
                    <input type="number" step={0.01} value={peer.revenue_growth} onChange={(e) => updatePeer(idx, { revenue_growth: Number(e.target.value) })} className="w-full rounded border border-dark-border bg-transparent px-2 py-1 text-sm text-text-primary" />
                  </td>
                  <td className="py-1.5 pr-3">
                    <input type="number" step={0.01} value={peer.ebitda_margin} onChange={(e) => updatePeer(idx, { ebitda_margin: Number(e.target.value) })} className="w-full rounded border border-dark-border bg-transparent px-2 py-1 text-sm text-text-primary" />
                  </td>
                  <td className="py-1.5">
                    <button onClick={() => removePeer(idx)} className="text-text-muted hover:text-red-400">
                      <Trash2 size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Button onClick={run} disabled={loading || peers.length === 0} className="mt-4 flex items-center gap-2">
          {loading ? <Loader2 size={16} className="animate-spin" /> : <Play size={16} />}
          {loading ? 'Computing…' : 'Run comps'}
        </Button>
      </Card>

      {error ? (
        <Card variant="bordered" className="border-red-500/40">
          <div className="flex items-start gap-2">
            <AlertTriangle className="text-red-400" size={18} />
            <p className="text-sm text-red-300">{error}</p>
          </div>
        </Card>
      ) : null}

      {result ? (
        <>
          <Card variant="bordered">
            <h4 className="mb-3 text-sm font-semibold text-text-primary">Implied valuation range</h4>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={valuationChartData}>
                  <CartesianGrid stroke="#1f2937" vertical={false} />
                  <XAxis dataKey="multiple" stroke="#64748b" tick={{ fontSize: 12 }} />
                  <YAxis
                    stroke="#64748b"
                    tick={{ fontSize: 12 }}
                    tickFormatter={(v) => fmtMoney(v)}
                    width={70}
                  />
                  <Tooltip
                    contentStyle={{
                      background: '#0a0e1a',
                      border: '1px solid #1f2937',
                      borderRadius: 8,
                      color: '#e5e7eb',
                    }}
                    formatter={(value) => formatTooltipMoney(value)}
                  />
                  <Legend wrapperStyle={{ fontSize: 12, color: '#94a3b8' }} />
                  <Bar dataKey="low" fill="#06b6d4" name="Low" />
                  <Bar dataKey="median" fill="#10b981" name="Median" />
                  <Bar dataKey="high" fill="#a78bfa" name="High" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>

          <Card variant="bordered">
            <h4 className="mb-2 text-sm font-semibold text-text-primary">Narrative</h4>
            <pre className="whitespace-pre-wrap font-sans text-xs leading-relaxed text-text-secondary">
              {result.narrative_summary}
            </pre>
          </Card>
        </>
      ) : null}
    </div>
  );
}

export default CompsPanel;
