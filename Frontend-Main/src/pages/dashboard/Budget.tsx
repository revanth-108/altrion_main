import { useState, useRef, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowUpRight, ArrowDownRight, Building2, GripVertical, ArrowRight, RotateCcw, History } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, Button } from '@/components/ui';
import { ScrollableList } from '@/components/ui/ScrollableList';
import { CONTAINER_VARIANTS, ITEM_VARIANTS } from '@/constants';
import { useBudgetData, useSaveAllocations, useDeleteAllocation, budgetKeys } from '@/hooks/queries/useBudget';
import type {
  BudgetIncomeSource,
  BudgetBankAccount,
  BudgetOutflowCategory,
  BudgetAllocation,
} from '@/types';

/* ── Allocation log (localStorage) ── */
const LOG_KEY = 'altrion-budget-log';
const LOG_MAX = 100;
type LogAction = 'create' | 'update' | 'delete' | 'restart';
interface LogEntry {
  id: string;
  ts: number;
  action: LogAction;
  fromLabel?: string;
  toLabel?: string;
  amount?: number;
  prevAmount?: number;
}

function readLog(): LogEntry[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(LOG_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function appendLog(entry: Omit<LogEntry, 'id' | 'ts'>): LogEntry[] {
  const next: LogEntry = { ...entry, id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, ts: Date.now() };
  const existing = readLog();
  const updated = [next, ...existing].slice(0, LOG_MAX);
  try {
    window.localStorage.setItem(LOG_KEY, JSON.stringify(updated));
  } catch {
    // ignore quota errors
  }
  return updated;
}

function clearLog() {
  try {
    window.localStorage.removeItem(LOG_KEY);
  } catch {
    // ignore
  }
}

function relativeTime(ts: number): string {
  const diff = Date.now() - ts;
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return 'just now';
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} min ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} hr ago`;
  const day = Math.floor(hr / 24);
  return `${day} day${day === 1 ? '' : 's'} ago`;
}

/* ── SVG Colors — scoped to SVG + dynamic color calculations only ── */
const SVG_COLORS = {
  income: '#00D4AA', bank: '#F59E0B', loan: '#FF6B6B', rent: '#A78BFA',
  food: '#22D3EE', trans: '#60A5FA', health: '#F472B6', savings: '#34D399',
  accent: '#3B82F6', dim: '#1A2840', muted: '#2E4560',
};

/* ── Fallback data (used when no endpoint connected) ── */
const DEFAULT_INCOME: BudgetIncomeSource[] = [
  { id: 'income1', label: 'Income 1', amount: 4800 },
  { id: 'income2', label: 'Income 2', amount: 3700 },
  { id: 'tax_refund', label: 'Tax Refund', amount: 3200 },
  { id: 'dividends', label: 'Dividends', amount: 1200 },
  { id: 'rental', label: 'Rental Income', amount: 1800 },
];

const DEFAULT_BANKS: BudgetBankAccount[] = [
  { id: 'checking', label: 'Checking Account', balance: 2400, icon: '\u{1F3E6}' },
  { id: 'savings_acct', label: 'Savings Account', balance: 8500, icon: '\u{1F4B0}' },
  { id: 'cash', label: 'Cash Reserve', balance: 600, icon: '\u{1F4B5}' },
  { id: 'invest', label: 'Investment Account', balance: 12000, icon: '\u{1F4C8}' },
  { id: 'emergency', label: 'Emergency Fund', balance: 3000, icon: '\u{1F6E1}' },
];

const DEFAULT_OUTFLOWS: BudgetOutflowCategory[] = [
  { group: 'Loan Payments', color: SVG_COLORS.loan, items: [
    { id: 'student_loan', label: 'Student Loan', due: 850 },
    { id: 'credit_card', label: 'Credit Card', due: 420 },
    { id: 'car_payment', label: 'Car Payment', due: 380 },
  ]},
  { group: 'Rent & Utilities', color: SVG_COLORS.rent, items: [
    { id: 'rent', label: 'Rent', due: 2200 },
    { id: 'electricity', label: 'Gas & Electricity', due: 180 },
    { id: 'internet', label: 'Internet & Cable', due: 95 },
  ]},
  { group: 'Food & Groceries', color: SVG_COLORS.food, items: [
    { id: 'groceries', label: 'Groceries', due: 600 },
    { id: 'dining', label: 'Dining Out', due: 250 },
  ]},
  { group: 'Transport', color: SVG_COLORS.trans, items: [
    { id: 'gas', label: 'Gas', due: 200 },
    { id: 'auto_ins', label: 'Auto Insurance', due: 160 },
  ]},
  { group: 'Health', color: SVG_COLORS.health, items: [
    { id: 'health_ins', label: 'Health Insurance', due: 450 },
    { id: 'gym', label: 'Gym', due: 55 },
  ]},
  { group: 'Savings Goals', color: SVG_COLORS.savings, items: [
    { id: 'savings_transfer', label: 'Savings Account', due: 1000 },
    { id: 'emg_goal', label: 'Emergency Goal', due: 500 },
    { id: 'retirement', label: '401k / IRA', due: 600 },
  ]},
];

/* ── Helpers ── */
const buildOutflowMap = (categories: BudgetOutflowCategory[]) => {
  const map: Record<string, { label: string; due: number; color: string; group: string }> = {};
  for (const cat of categories)
    for (const item of cat.items)
      map[item.id] = { ...item, color: cat.color, group: cat.group };
  return map;
};

const fmt = (n: number) => '$' + Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 0 });

/* ── Progress Bar ── */
function Bar({ pct, color }: { pct: number; color: string }) {
  return (
    <div className="h-[3px] bg-dark-elevated rounded-full overflow-hidden mt-1.5">
      <div className="h-full rounded-full transition-all duration-300" style={{ width: `${Math.min(100, pct)}%`, background: color }} />
    </div>
  );
}

/* ── Flow Lines SVG ── */
function FlowLinesSVG({
  allocs, fromRefs, toRefs, containerRef, hoveredId, colorFn, fromColor,
  onLineClick, activeLineId, onDeleteLine,
}: {
  allocs: BudgetAllocation[];
  fromRefs: React.MutableRefObject<Record<string, HTMLDivElement | null>>;
  toRefs: React.MutableRefObject<Record<string, HTMLDivElement | null>>;
  containerRef: React.RefObject<HTMLDivElement | null>;
  hoveredId: string | null;
  colorFn: (id: string) => string;
  fromColor: string;
  onLineClick: (allocId: string) => void;
  activeLineId: string | null;
  onDeleteLine: (allocId: string) => void;
}) {
  const [lines, setLines] = useState<Array<{
    id: string; x1: number; y1: number; x2: number; y2: number;
    color: string; amount: number; dimmed: boolean; highlighted: boolean;
  }>>([]);

  const compute = useCallback(() => {
    if (!containerRef.current) return;
    const cr = containerRef.current.getBoundingClientRect();
    const nl: typeof lines = [];
    for (const a of allocs) {
      const f = fromRefs.current[a.fromId];
      const t = toRefs.current[a.toId];
      if (!f || !t) continue;
      const fr = f.getBoundingClientRect();
      const tr = t.getBoundingClientRect();
      nl.push({
        id: a.id, x1: fr.right - cr.left, y1: fr.top + fr.height / 2 - cr.top,
        x2: tr.left - cr.left, y2: tr.top + tr.height / 2 - cr.top,
        color: colorFn(a.toId), amount: a.amount,
        dimmed: hoveredId !== null && hoveredId !== a.id,
        highlighted: hoveredId === a.id,
      });
    }
    setLines(nl);
  }, [allocs, hoveredId, containerRef, fromRefs, toRefs, colorFn]);

  useEffect(() => {
    compute();
    window.addEventListener('resize', compute);
    const t = setTimeout(compute, 80);
    return () => { window.removeEventListener('resize', compute); clearTimeout(t); };
  }, [compute]);

  return (
    <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 5 }}>
      <defs>
        {lines.map((l) => (
          <linearGradient key={`g-${l.id}`} id={`gr-${l.id}`} x1="0%" y1="0%" x2="100%">
            <stop offset="0%" stopColor={fromColor} stopOpacity={l.dimmed ? .1 : .85} />
            <stop offset="100%" stopColor={l.color} stopOpacity={l.dimmed ? .1 : .85} />
          </linearGradient>
        ))}
      </defs>
      {lines.map((l) => {
        const cx = Math.min(120, Math.abs(l.x2 - l.x1) * .38);
        const d = `M${l.x1} ${l.y1} C${l.x1+cx} ${l.y1},${l.x2-cx} ${l.y2},${l.x2} ${l.y2}`;
        const mx = (l.x1+l.x2)/2, my = (l.y1+l.y2)/2 - 11;
        const isActive = activeLineId === l.id;
        return (
          <g key={l.id} opacity={l.dimmed ? .18 : 1} style={{ transition: 'opacity .2s', pointerEvents: 'all' }} onClick={(e) => e.stopPropagation()}>
            <path d={d} fill="none" stroke={l.color} strokeWidth={l.highlighted?7:4} strokeOpacity={.06} style={{ filter:'blur(3px)' }}/>
            <path d={d} fill="none" stroke={`url(#gr-${l.id})`} strokeWidth={l.highlighted?2.5:1.4} strokeLinecap="round"/>
            <path d={d} fill="none" stroke="transparent" strokeWidth={18} style={{ cursor: 'pointer' }} onClick={() => onLineClick(l.id)} />
            {isActive ? (
              <foreignObject x={mx - 36} y={my - 14} width={72} height={28} style={{ overflow: 'visible' }}>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center', justifyContent: 'center' }}>
                  <button
                    onClick={(e) => { e.stopPropagation(); onLineClick(''); }}
                    style={{ background: '#00D4AA', border: 'none', borderRadius: '50%', width: 22, height: 22, cursor: 'pointer', color: '#fff', fontSize: 12, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                  >✓</button>
                  <button
                    onClick={(e) => { e.stopPropagation(); onDeleteLine(l.id); }}
                    style={{ background: '#FF6B6B', border: 'none', borderRadius: '50%', width: 22, height: 22, cursor: 'pointer', color: '#fff', fontSize: 12, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                  >✕</button>
                </div>
              </foreignObject>
            ) : (
              <>
                <rect x={mx-26} y={my-8} width={52} height={15} rx={7} fill="#08101EDD" stroke={l.color} strokeOpacity={.3} strokeWidth="1" onClick={() => onLineClick(l.id)} style={{ cursor: 'pointer' }} pointerEvents="all"/>
                <text x={mx} y={my+3} textAnchor="middle" fill={l.color} fontSize="8" fontWeight="600" onClick={() => onLineClick(l.id)} style={{ cursor: 'pointer' }} pointerEvents="all">{fmt(l.amount)}</text>
              </>
            )}
          </g>
        );
      })}
    </svg>
  );
}

/* ── Bank Transfer Arcs ── */
function BankTransferLines({
  allocs, bankRefs, containerRef, hoveredId, onLineClick, activeLineId, onDeleteLine,
}: {
  allocs: BudgetAllocation[];
  bankRefs: React.MutableRefObject<Record<string, HTMLDivElement | null>>;
  containerRef: React.RefObject<HTMLDivElement | null>;
  hoveredId: string | null;
  onLineClick: (allocId: string) => void;
  activeLineId: string | null;
  onDeleteLine: (allocId: string) => void;
}) {
  const [arcs, setArcs] = useState<Array<{
    id: string; x1: number; y1: number; x2: number; y2: number;
    midX: number; arcY: number; amount: number; dimmed: boolean; highlighted: boolean;
  }>>([]);

  const compute = useCallback(() => {
    if (!containerRef.current) return;
    const cr = containerRef.current.getBoundingClientRect();
    const na: typeof arcs = [];
    for (const a of allocs) {
      const f = bankRefs.current[a.fromId];
      const t = bankRefs.current[a.toId];
      if (!f || !t) continue;
      const fr = f.getBoundingClientRect();
      const tr = t.getBoundingClientRect();
      const x1 = fr.left + fr.width / 2 - cr.left;
      const y1 = fr.top - cr.top;
      const x2 = tr.left + tr.width / 2 - cr.left;
      const y2 = tr.top - cr.top;
      const midX = (x1 + x2) / 2;
      const arcH = Math.min(-28, -(Math.abs(y2 - y1) * .35 + 18));
      na.push({ id: a.id, x1, y1, x2, y2, midX, arcY: Math.min(y1, y2) + arcH, amount: a.amount,
        dimmed: hoveredId !== null && hoveredId !== a.id, highlighted: hoveredId === a.id });
    }
    setArcs(na);
  }, [allocs, hoveredId, containerRef, bankRefs]);

  useEffect(() => {
    compute();
    window.addEventListener('resize', compute);
    const t = setTimeout(compute, 80);
    return () => { window.removeEventListener('resize', compute); clearTimeout(t); };
  }, [compute]);

  return (
    <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 6 }}>
      {arcs.map((a) => {
        const d = `M${a.x1} ${a.y1} Q${a.midX} ${a.arcY} ${a.x2} ${a.y2}`;
        const isActive = activeLineId === a.id;
        return (
          <g key={a.id} opacity={a.dimmed ? .18 : 1} style={{ transition: 'opacity .2s', pointerEvents: 'all' }} onClick={(e) => e.stopPropagation()}>
            <path d={d} fill="none" stroke={SVG_COLORS.bank} strokeWidth={3} strokeOpacity={.05} style={{ filter: 'blur(3px)' }} />
            <path d={d} fill="none" stroke={SVG_COLORS.bank} strokeWidth={a.highlighted ? 2 : 1.2} strokeLinecap="round" strokeDasharray={a.highlighted ? 'none' : '5 3'} strokeOpacity={.7} />
            <path d={d} fill="none" stroke="transparent" strokeWidth={18} style={{ cursor: 'pointer' }} onClick={() => onLineClick(a.id)} />
            {isActive ? (
              <foreignObject x={a.midX - 36} y={a.arcY - 14} width={72} height={28} style={{ overflow: 'visible' }}>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center', justifyContent: 'center' }}>
                  <button
                    onClick={(e) => { e.stopPropagation(); onLineClick(''); }}
                    style={{ background: '#00D4AA', border: 'none', borderRadius: '50%', width: 22, height: 22, cursor: 'pointer', color: '#fff', fontSize: 12, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                  >✓</button>
                  <button
                    onClick={(e) => { e.stopPropagation(); onDeleteLine(a.id); }}
                    style={{ background: '#FF6B6B', border: 'none', borderRadius: '50%', width: 22, height: 22, cursor: 'pointer', color: '#fff', fontSize: 12, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                  >✕</button>
                </div>
              </foreignObject>
            ) : (
              <>
                <rect x={a.midX-24} y={a.arcY-7} width={48} height={14} rx={7} fill="#08101EDD" stroke={SVG_COLORS.bank} strokeOpacity={.3} strokeWidth="1" onClick={() => onLineClick(a.id)} style={{ cursor: 'pointer' }} pointerEvents="all" />
                <text x={a.midX} y={a.arcY+3} textAnchor="middle" fill={SVG_COLORS.bank} fontSize="7.5" fontWeight="600" onClick={() => onLineClick(a.id)} style={{ cursor: 'pointer' }} pointerEvents="all">{fmt(a.amount)}</text>
              </>
            )}
          </g>
        );
      })}
    </svg>
  );
}

/* ── Allocation Modal ── */
function AllocModal({
  fromLabel, fromColor, toLabel, toColor, due, available, existing, onSave, onCancel, linkedBankBalance,
}: {
  fromLabel: string; fromColor: string; toLabel: string; toColor: string;
  due: number; available: number | null; linkedBankBalance: number | null;
  existing: BudgetAllocation | null;
  onSave: (result: { amount: number; date: string; note: string } | null) => void;
  onCancel: () => void;
}) {
  const [amount, setAmount] = useState(existing ? String(existing.amount) : '');
  const [date, setDate] = useState(existing?.date || '');
  const [note, setNote] = useState(existing?.note || '');
  const num = parseFloat((amount || '0').replace(/,/g, '')) || 0;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[1000] flex items-center justify-center">
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onCancel}
          className="absolute inset-0 bg-[#06080F]/50 backdrop-blur-md"
        />

        {/* Modal card */}
        <motion.div
          initial={{ opacity: 0, y: 12, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 12, scale: 0.97 }}
          transition={{ duration: 0.25 }}
          className="relative z-10 bg-dark-card border border-dark-border rounded-2xl p-6 w-[420px] max-w-[92vw] shadow-2xl"
        >
          <div className="text-[10px] text-text-muted tracking-[.16em] uppercase mb-4">
            {existing ? 'Edit Allocation' : 'New Allocation'}
          </div>

          {/* From → To row */}
          <div className="flex items-center gap-3 bg-dark-bg rounded-xl p-3.5 mb-3">
            <div className="flex-1">
              <div className="text-[9px] tracking-[.1em] uppercase mb-1" style={{ color: `${fromColor}66` }}>From</div>
              <div className="rounded-md px-2.5 py-1.5 text-xs font-semibold" style={{ background: `${fromColor}14`, color: fromColor, border: `1px solid ${fromColor}33` }}>{fromLabel}</div>
              {available != null && <div className="text-[11px] text-text-muted mt-1">Available: <span className="font-semibold" style={{ color: fromColor }}>{fmt(available)}</span></div>}
            </div>
            <ArrowRight size={18} className="text-text-muted/30 shrink-0 mt-2" />
            <div className="flex-1">
              <div className="text-[9px] tracking-[.1em] uppercase mb-1" style={{ color: `${toColor}66` }}>To</div>
              <div className="rounded-md px-2.5 py-1.5 text-xs font-semibold" style={{ background: `${toColor}14`, color: toColor, border: `1px solid ${toColor}33` }}>{toLabel}</div>
              {linkedBankBalance != null
                ? <div className="text-[11px] text-text-muted mt-1">Balance: <span className="font-semibold" style={{ color: toColor }}>{fmt(linkedBankBalance)}</span></div>
                : due > 0 && <div className="text-[11px] text-text-muted mt-1">Due: <span className="font-semibold" style={{ color: toColor }}>{fmt(due)}</span>/mo</div>
              }
            </div>
          </div>

          {/* Quick fill / Preset amounts */}
          {!existing && linkedBankBalance != null && available != null && available > 0 && (
            <div className="mb-3">
              <div className="text-[9px] text-text-muted tracking-[.1em] uppercase mb-2">Choose amount</div>
              <div className="grid grid-cols-4 gap-1.5">
                {[10, 25, 50, 100].map((pct) => {
                  const val = Math.round(available * pct / 100);
                  const isSelected = num === val;
                  return (
                    <motion.button
                      key={pct}
                      whileHover={{ scale: 1.04 }}
                      whileTap={{ scale: 0.96 }}
                      onClick={() => setAmount(String(val))}
                      className={`py-2 rounded-lg text-center text-xs font-semibold transition-all cursor-pointer ${
                        isSelected
                          ? 'ring-1 ring-offset-1 ring-offset-dark-card'
                          : 'hover:brightness-125'
                      }`}
                      style={{
                        background: `${toColor}${isSelected ? '30' : '12'}`,
                        color: toColor,
                        border: `1px solid ${toColor}${isSelected ? '66' : '25'}`,
                        ...(isSelected ? { ringColor: toColor } : {}),
                      }}
                    >
                      <div className="font-bold">{pct}%</div>
                      <div className="text-[9px] opacity-70 mt-0.5">{fmt(val)}</div>
                    </motion.button>
                  );
                })}
              </div>
            </div>
          )}
          {!existing && linkedBankBalance == null && (due > 0 || (available != null && available > 0)) && (
            <button
              onClick={() => setAmount(String(due > 0 ? due : available))}
              className="flex items-center gap-2 w-full px-3 py-2 mb-3 rounded-lg cursor-pointer text-xs text-text-muted transition-colors hover:bg-dark-elevated"
              style={{ background: `${due > 0 ? toColor : fromColor}0C`, border: `1px dashed ${due > 0 ? toColor : fromColor}33` }}
            >
              <ArrowUpRight size={12} style={{ color: due > 0 ? toColor : fromColor }} />
              {due > 0
                ? <>Quick fill: <span className="font-semibold" style={{ color: toColor }}>{fmt(due)}</span></>
                : <>Full amount: <span className="font-semibold" style={{ color: fromColor }}>{fmt(available!)}</span></>
              }
            </button>
          )}

          {/* Form fields */}
          <div className="flex flex-col gap-3">
            <div>
              <div className="text-[10px] text-text-muted tracking-[.12em] uppercase mb-1.5">Amount *</div>
              <div className={`flex items-center bg-dark-bg border rounded-lg px-3 ${amount ? 'border-altrion-500/50' : 'border-dark-border'}`}>
                <span className="text-text-muted text-sm mr-1">$</span>
                <input
                  type="number"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0.00"
                  autoFocus
                  className="flex-1 bg-transparent border-none outline-none text-text-primary text-sm py-2.5 font-display"
                />
              </div>
              {num > 0 && due > 0 && (
                <div className="text-[11px] mt-1" style={{ color: num >= due ? SVG_COLORS.savings : SVG_COLORS.food }}>
                  {num >= due ? `\u2713 Covers full ${fmt(due)}` : `\u26A0 ${fmt(due - num)} remaining`}
                </div>
              )}
            </div>
            <div>
              <div className="text-[10px] text-text-muted tracking-[.12em] uppercase mb-1.5">Date</div>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className={`w-full bg-dark-bg border rounded-lg px-3 py-2.5 text-sm outline-none font-display ${date ? 'border-altrion-500/50 text-text-primary' : 'border-dark-border text-text-muted'}`}
                style={{ colorScheme: 'dark' }}
              />
            </div>
            <div>
              <div className="text-[10px] text-text-muted tracking-[.12em] uppercase mb-1.5">Note</div>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Add a note..."
                rows={2}
                className={`w-full bg-dark-bg border rounded-lg px-3 py-2.5 text-xs outline-none resize-none leading-relaxed text-text-secondary ${note ? 'border-altrion-500/50' : 'border-dark-border'}`}
              />
            </div>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="ghost" size="sm" onClick={onCancel}>Cancel</Button>
            {existing && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onSave(null)}
                className="!text-red-400 hover:!bg-red-500/10 !border-red-500/20"
              >
                Delete
              </Button>
            )}
            <Button
              variant="primary"
              size="sm"
              disabled={num <= 0}
              onClick={() => { if (num > 0) onSave({ amount: num, date, note }); }}
            >
              {existing ? 'Update' : 'Save'}
            </Button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}

/* ── Column Panel ── */
function ColPanel({ icon, label, color, right, children }: {
  icon: React.ReactNode; label: string; color: string; right?: string; children: React.ReactNode;
}) {
  return (
    <Card variant="bordered" padding="none" className="flex flex-col">
      <div className="px-4 py-3 border-b border-dark-border flex items-center gap-2">
        <span style={{ color }}>{icon}</span>
        <span className="text-[10px] font-bold tracking-[.14em] uppercase" style={{ color }}>{label}</span>
        {right && <span className="ml-auto text-sm font-bold font-display" style={{ color }}>{right}</span>}
      </div>
      {children}
    </Card>
  );
}

/* ── Modal state type ── */
interface ModalState {
  fromId: string;
  toId: string;
  allocType: BudgetAllocation['type'];
  existing: BudgetAllocation | null;
  fromLabel: string;
  fromColor: string;
  toLabel: string;
  toColor: string;
  due: number;
  available: number | null;
  linkedBankBalance: number | null;
}

/* ── Main Component ── */
export function Budget() {
  const queryClient = useQueryClient();
  const { data: budgetData, isLoading: budgetLoading } = useBudgetData();
  const saveAllocations = useSaveAllocations();
  const deleteAllocation = useDeleteAllocation();

  const incomeSources = budgetData?.incomeSources ?? DEFAULT_INCOME;
  const bankAccounts = budgetData?.bankAccounts ?? DEFAULT_BANKS;
  const outflowCategories = budgetData?.outflowCategories ?? DEFAULT_OUTFLOWS;

  const outflowMap = buildOutflowMap(outflowCategories);
  const getOutflowColor = (id: string) => outflowMap[id]?.color || SVG_COLORS.muted;
  const getOutflowLabel = (id: string) => outflowMap[id]?.label || id;
  const getOutflowDue = (id: string) => outflowMap[id]?.due || 0;
  const getIncomeLabel = (id: string) => incomeSources.find((i) => i.id === id)?.label || id;
  const getBankLabel = (id: string) => bankAccounts.find((b) => b.id === id)?.label || id;

  const [allocs, setAllocs] = useState<BudgetAllocation[]>(budgetData?.allocations ?? []);
  const [dragging, setDragging] = useState<{ id: string; type: string } | null>(null);
  const [dragOver, setDragOver] = useState<{ id: string; zone: string } | null>(null);
  const [modal, setModal] = useState<ModalState | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const [activeLineId, setActiveLineId] = useState<string | null>(null);
  const [logEntries, setLogEntries] = useState<LogEntry[]>(() => readLog());
  const [showHistory, setShowHistory] = useState(false);
  const [showRestartModal, setShowRestartModal] = useState(false);

  const recordLog = useCallback((entry: Omit<LogEntry, 'id' | 'ts'>) => {
    setLogEntries(appendLog(entry));
  }, []);

  const handleRestart = useCallback(() => {
    // Optimistic local clear
    const previousAllocs = allocs;
    setAllocs([]);
    setActiveLineId(null);
    setShowRestartModal(false);

    // Best-effort backend deletes for any persisted allocation IDs
    previousAllocs.forEach((a) => {
      const numId = Number(a.id);
      if (Number.isFinite(numId)) {
        deleteAllocation.mutate(numId);
      }
    });

    // Refresh server-side data
    queryClient.invalidateQueries({ queryKey: budgetKeys.data() });

    // Log + clear local audit trail
    clearLog();
    setLogEntries(appendLog({ action: 'restart' }));
  }, [allocs, deleteAllocation, queryClient]);

  useEffect(() => {
    if (budgetData?.allocations) setAllocs(budgetData.allocations);
  }, [budgetData?.allocations]);

  const containerRef = useRef<HTMLDivElement>(null);
  const incomeRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const bankRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const outflowRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const incomeBankAllocs = allocs.filter((a) => a.type === 'income-bank');
  const bankOutflowAllocs = allocs.filter((a) => a.type === 'bank-outflow');
  const bankBankAllocs = allocs.filter((a) => a.type === 'bank-bank');

  const totalIncome = incomeSources.reduce((s, i) => s + i.amount, 0);
  const totalDue = outflowCategories.reduce((s, c) => s + c.items.reduce((ss, i) => ss + i.due, 0), 0);
  const totalAllocToOutflow = bankOutflowAllocs.reduce((s, a) => s + a.amount, 0);

  // Map outflow items that feed back into a bank account
  const OUTFLOW_TO_BANK: Record<string, string> = { savings_transfer: 'savings_acct' };

  const getIncomeAllocated = (id: string) => incomeBankAllocs.filter((a) => a.fromId === id).reduce((s, a) => s + a.amount, 0);
  const getBankInflow = (id: string) =>
    incomeBankAllocs.filter((a) => a.toId === id).reduce((s, a) => s + a.amount, 0) +
    bankBankAllocs.filter((a) => a.toId === id).reduce((s, a) => s + a.amount, 0) +
    bankOutflowAllocs.filter((a) => OUTFLOW_TO_BANK[a.toId] === id).reduce((s, a) => s + a.amount, 0);
  const getBankOutflowAmt = (id: string) =>
    bankOutflowAllocs.filter((a) => a.fromId === id).reduce((s, a) => s + a.amount, 0) +
    bankBankAllocs.filter((a) => a.fromId === id).reduce((s, a) => s + a.amount, 0);
  const getBankAvailable = (id: string) => (bankAccounts.find((b) => b.id === id)?.balance || 0) + getBankInflow(id) - getBankOutflowAmt(id);
  const getOutflowAllocated = (id: string) => bankOutflowAllocs.filter((a) => a.toId === id).reduce((s, a) => s + a.amount, 0);

  const handleDragStart = (id: string, type: string) => {
    setActiveLineId(null);  // dismiss any open line actions before starting a drag
    setDragging({ id, type });
  };
  const handleDragEnd = () => { setDragging(null); setDragOver(null); };

  // Toggle active line — empty string or same id dismisses
  const handleLineClick = (id: string) => setActiveLineId(prev => (id === '' || prev === id) ? null : id);
  const handleDeleteLine = (allocId: string) => {
    // Capture labels before removing for the log
    const target = allocs.find(a => a.id === allocId);
    if (target) {
      const fromL = target.type === 'income-bank' ? getIncomeLabel(target.fromId) : getBankLabel(target.fromId);
      const toL = target.type === 'bank-outflow' ? getOutflowLabel(target.toId) : getBankLabel(target.toId);
      recordLog({ action: 'delete', fromLabel: fromL, toLabel: toL, amount: target.amount });
    }
    // Optimistically remove from local state
    setAllocs(prev => prev.filter(a => a.id !== allocId));
    setActiveLineId(null);
    // Persist deletion to backend (soft delete via is_active = false)
    deleteAllocation.mutate(Number(allocId));
  };

  const validDrop = (targetId: string, zone: string) => {
    if (!dragging) return false;
    if (dragging.type === 'income' && zone === 'bank') return true;
    if (dragging.type === 'bank' && zone === 'outflow') return true;
    if (dragging.type === 'bank' && zone === 'bank' && dragging.id !== targetId) return true;
    return false;
  };



  const handleDrop = (targetId: string, zone: string) => {
    if (!dragging) return;
    let allocType: BudgetAllocation['type'] | null = null;
    if (dragging.type === 'income' && zone === 'bank') allocType = 'income-bank';
    else if (dragging.type === 'bank' && zone === 'outflow') allocType = 'bank-outflow';
    else if (dragging.type === 'bank' && zone === 'bank' && dragging.id !== targetId) allocType = 'bank-bank';
    if (!allocType) { setDragging(null); setDragOver(null); return; }

    const existing = allocs.find((a) => a.fromId === dragging.id && a.toId === targetId && a.type === allocType) || null;
    const fromColor2 = allocType === 'income-bank' ? SVG_COLORS.income : SVG_COLORS.bank;
    const toColor2 = allocType === 'bank-outflow' ? getOutflowColor(targetId) : SVG_COLORS.bank;
    const fromLabel = allocType === 'income-bank' ? getIncomeLabel(dragging.id) : getBankLabel(dragging.id);
    const toLabel = allocType === 'bank-outflow' ? getOutflowLabel(targetId) : getBankLabel(targetId);
    const due = allocType === 'bank-outflow' ? getOutflowDue(targetId) : 0;
    const available = allocType === 'income-bank' ? (incomeSources.find((s) => s.id === dragging.id)?.amount ?? 0) : getBankAvailable(dragging.id);

    const linkedBankId = OUTFLOW_TO_BANK[targetId];
    const linkedBankBalance = linkedBankId ? getBankAvailable(linkedBankId) : null;
    setModal({ fromId: dragging.id, toId: targetId, allocType, existing, fromLabel, fromColor: fromColor2, toLabel, toColor: toColor2, due, available, linkedBankBalance });
    setDragging(null); setDragOver(null);
  };

  const handleSave = (result: { amount: number; date: string; note: string } | null) => {
    if (!modal) return;
    const { fromId, toId, allocType, existing, fromLabel, toLabel } = modal;

    if (result === null && existing) {
      // DELETE: remove the allocation from local state only.
      // TODO: call DELETE /api/budget/allocations/:id when endpoint exists.
      setAllocs(allocs.filter((a) => a.id !== existing.id));
      recordLog({ action: 'delete', fromLabel, toLabel, amount: existing.amount });
    } else if (result && existing) {
      // EDIT: update the existing allocation in local state and persist to the backend.
      const updatedAlloc: BudgetAllocation = { ...existing, ...result };
      setAllocs(allocs.map((a) => a.id === existing.id ? updatedAlloc : a));
      saveAllocations.mutate(updatedAlloc);
      recordLog({ action: 'update', fromLabel, toLabel, amount: result.amount, prevAmount: existing.amount });
    } else if (result) {
      // CREATE: build the new allocation, optimistically add it to local state, and persist.
      const newAlloc: BudgetAllocation = { id: `${allocType}-${fromId}-${toId}-${Date.now()}`, fromId, toId, type: allocType, ...result };
      setAllocs([...allocs, newAlloc]);
      saveAllocations.mutate(newAlloc);
      recordLog({ action: 'create', fromLabel, toLabel, amount: result.amount });
    }

    setModal(null);
  };

  const incPct = totalIncome > 0 ? Math.min(100, (incomeBankAllocs.reduce((s, a) => s + a.amount, 0) / totalIncome) * 100) : 0;
  const covPct = totalDue > 0 ? Math.min(100, (totalAllocToOutflow / totalDue) * 100) : 0;

  const openAllocEdit = (a: BudgetAllocation) => {
    const at = a.type;
    const fromLabel = at === 'income-bank' ? getIncomeLabel(a.fromId) : getBankLabel(a.fromId);
    const toLabel = at === 'bank-outflow' ? getOutflowLabel(a.toId) : getBankLabel(a.toId);
    const linkedBankId = OUTFLOW_TO_BANK[a.toId];
    const linkedBankBalance = linkedBankId ? getBankAvailable(linkedBankId) : null;
    setModal({ fromId: a.fromId, toId: a.toId, allocType: at, existing: a, fromLabel, fromColor: at === 'income-bank' ? SVG_COLORS.income : SVG_COLORS.bank, toLabel, toColor: at === 'bank-outflow' ? getOutflowColor(a.toId) : SVG_COLORS.bank, due: at === 'bank-outflow' ? getOutflowDue(a.toId) : 0, available: null, linkedBankBalance });
  };

  if (budgetLoading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-96 text-text-muted">
          Loading budget data...
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout padding="pt-2 lg:pt-3" maxWidth="">
      <motion.div
        variants={CONTAINER_VARIANTS}
        initial="hidden"
        animate="visible"
        className="flex flex-col h-full text-text-primary"
      >
        {/* Page Header */}
        <motion.div variants={ITEM_VARIANTS} className="px-6 pt-6 pb-4">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <h1 className="font-display text-2xl sm:text-4xl font-black">
              Budget <span className="text-altrion-400">Playground</span>
            </h1>
            <div className="flex items-center gap-3 flex-wrap">
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                <ArrowUpRight size={12} /> {Math.round(incPct)}% Routed
              </span>
              <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border ${
                covPct >= 100
                  ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                  : 'bg-altrion-500/10 text-altrion-400 border-altrion-500/20'
              }`}>
                {Math.round(covPct)}% Covered
              </span>
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-dark-elevated text-text-secondary border border-dark-border">
                <ArrowDownRight size={12} /> {fmt(totalAllocToOutflow)} / {fmt(totalDue)}
              </span>
              <button
                type="button"
                onClick={() => setShowRestartModal(true)}
                disabled={allocs.length === 0}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-red-500/10 text-red-400 border border-red-500/30 hover:bg-red-500/20 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <RotateCcw size={12} /> Restart
              </button>
            </div>
          </div>
        </motion.div>

        {/* Main 3-column layout */}
        <motion.div variants={ITEM_VARIANTS} ref={containerRef} className="flex-1 relative px-6 pb-6 overflow-auto min-h-0">
          {/* SVG overlays — absolutely positioned over the full container */}
          <FlowLinesSVG allocs={incomeBankAllocs} fromRefs={incomeRefs} toRefs={bankRefs} containerRef={containerRef} hoveredId={hovered} colorFn={() => SVG_COLORS.bank} fromColor={SVG_COLORS.income} onLineClick={handleLineClick} activeLineId={activeLineId} onDeleteLine={handleDeleteLine} />
          <FlowLinesSVG allocs={bankOutflowAllocs} fromRefs={bankRefs} toRefs={outflowRefs} containerRef={containerRef} hoveredId={hovered} colorFn={getOutflowColor} fromColor={SVG_COLORS.bank} onLineClick={handleLineClick} activeLineId={activeLineId} onDeleteLine={handleDeleteLine} />
          <BankTransferLines allocs={bankBankAllocs} bankRefs={bankRefs} containerRef={containerRef} hoveredId={hovered} onLineClick={handleLineClick} activeLineId={activeLineId} onDeleteLine={handleDeleteLine} />

          <div className="grid grid-cols-[1fr_8rem_1fr_8rem_1fr] h-full">

          {/* COL 1: Income — vertically centered */}
          <div className="min-w-0 self-center">
            <ColPanel icon={<ArrowUpRight size={14} />} label="Income Sources" color={SVG_COLORS.income} right={fmt(totalIncome)}>
              <div className="p-2.5 flex flex-col gap-2">
                {incomeSources.map((src) => {
                  const alloc = getIncomeAllocated(src.id);
                  const left = src.amount - alloc;
                  const conn = alloc > 0;
                  return (
                    <div key={src.id} ref={(el) => { incomeRefs.current[src.id] = el; }}
                      draggable onDragStart={() => handleDragStart(src.id, 'income')} onDragEnd={handleDragEnd}
                      className={`p-3 rounded-xl cursor-grab transition-all duration-200 ${
                        conn
                          ? 'border border-emerald-500/30 bg-emerald-500/10 shadow-md shadow-emerald-500/5'
                          : 'border border-emerald-500/15 bg-emerald-500/5'
                      } ${dragging?.id === src.id ? 'opacity-30' : 'opacity-100'}`}
                    >
                      <div className="flex justify-between items-center mb-1">
                        <span className="text-emerald-400 text-xs font-medium">{src.label}</span>
                        <GripVertical size={12} className="text-emerald-500/20" />
                      </div>
                      <div className="flex items-baseline gap-2">
                        <span className="font-display text-base font-bold text-emerald-400">{fmt(src.amount)}</span>
                        {alloc > 0 && <span className={`text-[10px] ${left >= 0 ? 'text-text-muted' : 'text-red-400'}`}>{left >= 0 ? `${fmt(left)} left` : `${fmt(-left)} over`}</span>}
                      </div>
                      {alloc > 0 && <Bar pct={(alloc / src.amount) * 100} color={left >= 0 ? SVG_COLORS.income : SVG_COLORS.loan} />}
                    </div>
                  );
                })}
              </div>
              <div className="px-3.5 py-2 border-t border-dark-border text-[10px] text-text-muted flex items-center gap-1.5">
                <GripVertical size={10} className="text-emerald-400" /> Drag &rarr; drop on bank account
              </div>
            </ColPanel>
          </div>

          {/* Spacer column for Income→Bank flow lines */}
          <div />

          {/* COL 2: Banks — vertically centered */}
          <div className="min-w-0 self-center z-10">
            <ColPanel icon={<Building2 size={14} />} label="Bank Accounts" color={SVG_COLORS.bank} right={fmt(bankAccounts.reduce((s, b) => s + getBankAvailable(b.id), 0))}>
              <div className="p-2.5 flex flex-col gap-2">
                {bankAccounts.map((bank) => {
                  const inflow = getBankInflow(bank.id);
                  const outflow = getBankOutflowAmt(bank.id);
                  const avail = getBankAvailable(bank.id);
                  const isOver = dragOver?.id === bank.id && dragOver?.zone === 'bank' && validDrop(bank.id, 'bank');
                  const conn = inflow > 0 || outflow > 0;
                  return (
                    <div key={bank.id} ref={(el) => { bankRefs.current[bank.id] = el; }}
                      draggable onDragStart={() => handleDragStart(bank.id, 'bank')} onDragEnd={handleDragEnd}
                      onDragOver={(e) => { e.preventDefault(); if (validDrop(bank.id, 'bank')) setDragOver({ id: bank.id, zone: 'bank' }); }}
                      onDragLeave={() => setDragOver(null)}
                      onDrop={() => handleDrop(bank.id, 'bank')}
                      className={`p-3 rounded-xl cursor-grab transition-all duration-200 ${
                        isOver
                          ? 'border border-amber-400/50 bg-amber-400/10 scale-[1.02] shadow-lg shadow-amber-500/10'
                          : conn
                            ? 'border border-amber-500/25 bg-amber-500/[0.06] shadow-sm shadow-amber-500/5'
                            : 'border border-amber-500/10 bg-amber-500/[0.03]'
                      } ${dragging?.id === bank.id ? 'opacity-30' : 'opacity-100'}`}
                    >
                      <div className="flex justify-between items-center mb-1">
                        <span className="flex items-center gap-1.5">
                          <span className="text-sm">{bank.icon}</span>
                          <span className="text-amber-400 text-xs font-medium">{bank.label}</span>
                        </span>
                        <GripVertical size={12} className="text-amber-500/20" />
                      </div>
                      <div className="flex items-baseline gap-1.5 mb-0.5">
                        <span className={`font-display text-base font-bold ${avail >= 0 ? 'text-amber-400' : 'text-red-400'}`}>{avail < 0 ? '-' : ''}{fmt(avail)}</span>
                        <span className="text-[10px] text-text-muted">available</span>
                      </div>
                      <div className="flex gap-2.5 text-[9px] text-text-muted flex-wrap">
                        <span>Base: <span className="text-text-primary">{fmt(bank.balance)}</span></span>
                        {inflow > 0 && <span className="text-emerald-400">+ {fmt(inflow)}</span>}
                        {outflow > 0 && <span className="text-red-400">- {fmt(outflow)}</span>}
                      </div>
                      {isOver && <div className="text-[9px] text-amber-400 mt-1 font-semibold">&darr; Drop here</div>}
                    </div>
                  );
                })}
              </div>

              {/* Allocation log */}
              {allocs.length > 0 && (
                <div className="border-t border-dark-border px-2.5 py-2">
                  <div className="text-[9px] text-text-muted tracking-[.12em] uppercase mb-1.5 flex justify-between items-center">
                    <span>Allocation Log ({allocs.length})</span>
                    <button
                      type="button"
                      onClick={() => setShowHistory(s => !s)}
                      className="inline-flex items-center gap-1 normal-case tracking-normal text-[10px] text-text-muted hover:text-text-secondary"
                    >
                      <History size={10} /> {showHistory ? 'Hide' : 'History'}
                    </button>
                  </div>
                  <ScrollableList maxHeight={110} className="flex flex-col gap-1">
                    {allocs.map((a) => {
                      const isH = hovered === a.id;
                      const col = a.type === 'income-bank' ? SVG_COLORS.income : a.type === 'bank-bank' ? SVG_COLORS.bank : getOutflowColor(a.toId);
                      const fromL = a.type === 'income-bank' ? getIncomeLabel(a.fromId) : getBankLabel(a.fromId);
                      const toL = a.type === 'bank-outflow' ? getOutflowLabel(a.toId) : getBankLabel(a.toId);
                      return (
                        <div key={a.id}
                          onMouseEnter={() => setHovered(a.id)} onMouseLeave={() => setHovered(null)}
                          onClick={() => openAllocEdit(a)}
                          className={`px-2.5 py-1.5 rounded-lg cursor-pointer transition-all duration-150 ${
                            isH ? 'bg-[#0C1830] border border-blue-500/25' : 'bg-dark-bg border border-dark-border'
                          }`}
                        >
                          <div className="flex items-center gap-1 text-[9px]">
                            <span className="font-semibold" style={{ color: a.type === 'income-bank' ? SVG_COLORS.income : SVG_COLORS.bank }}>{fromL}</span>
                            <ArrowRight size={8} className="text-text-muted/30" />
                            <span className="font-semibold" style={{ color: col }}>{toL}</span>
                            <span className="ml-auto font-display text-xs font-bold" style={{ color: col }}>{fmt(a.amount)}</span>
                          </div>
                        </div>
                      );
                    })}
                  </ScrollableList>

                  {showHistory && (
                    <div className="mt-2 pt-2 border-t border-dark-border/60">
                      <div className="text-[9px] text-text-muted tracking-[.12em] uppercase mb-1.5">
                        Recent Changes ({logEntries.length})
                      </div>
                      {logEntries.length === 0 ? (
                        <div className="text-[10px] text-text-muted/60 italic px-1">No changes yet.</div>
                      ) : (
                        <ScrollableList maxHeight={220} className="flex flex-col gap-1">
                          {logEntries.slice(0, 20).map((entry) => (
                            <div key={entry.id} className="px-2 py-1 rounded bg-dark-bg/60 border border-dark-border/50">
                              <div className="flex items-center gap-1.5 text-[9px]">
                                <span className={`uppercase font-bold tracking-wider ${
                                  entry.action === 'create' ? 'text-emerald-400' :
                                  entry.action === 'update' ? 'text-amber-400' :
                                  entry.action === 'restart' ? 'text-red-400' : 'text-text-muted'
                                }`}>
                                  {entry.action}
                                </span>
                                {entry.fromLabel && (
                                  <>
                                    <span className="text-text-secondary">{entry.fromLabel}</span>
                                    <ArrowRight size={8} className="text-text-muted/40" />
                                    <span className="text-text-secondary">{entry.toLabel}</span>
                                  </>
                                )}
                                {entry.amount != null && (
                                  <span className="ml-auto font-display font-bold text-text-primary">
                                    {entry.prevAmount != null && entry.prevAmount !== entry.amount && (
                                      <span className="text-text-muted/60 line-through mr-1 font-normal">{fmt(entry.prevAmount)}</span>
                                    )}
                                    {fmt(entry.amount)}
                                  </span>
                                )}
                              </div>
                              <div className="text-[8px] text-text-muted/60 mt-0.5">{relativeTime(entry.ts)}</div>
                            </div>
                          ))}
                        </ScrollableList>
                      )}
                    </div>
                  )}
                </div>
              )}
            </ColPanel>
          </div>

          {/* Spacer column for Bank→Outflow flow lines */}
          <div />

          {/* COL 3: Outflows — tallest, stretches full height */}
          <div className="min-w-0 self-stretch flex flex-col">
            <ColPanel icon={<ArrowDownRight size={14} />} label="Outflow / Bills" color={SVG_COLORS.loan} right={`${fmt(totalDue)}/mo`}>
              <div className="p-2.5 overflow-y-auto">
                {outflowCategories.map((cat) => (
                  <div key={cat.group} className="mb-3.5">
                    <div className="flex justify-between text-[9px] font-semibold tracking-[.08em] uppercase mb-1.5 pl-0.5" style={{ color: cat.color }}>
                      <span>{cat.group}</span>
                      <span className="text-text-muted font-normal">{fmt(cat.items.reduce((s, i) => s + (OUTFLOW_TO_BANK[i.id] ? getBankAvailable(OUTFLOW_TO_BANK[i.id]) : i.due), 0))}</span>
                    </div>
                    <div className="flex flex-col gap-1.5">
                      {cat.items.map((item) => {
                        const isOver = dragOver?.id === item.id && dragOver?.zone === 'outflow' && validDrop(item.id, 'outflow');
                        const alloc = getOutflowAllocated(item.id);
                        const linkedBankId = OUTFLOW_TO_BANK[item.id];
                        const effectiveDue = linkedBankId ? getBankAvailable(linkedBankId) : item.due;
                        const covered = effectiveDue > 0 && alloc >= effectiveDue;
                        const conn = alloc > 0;
                        return (
                          <div key={item.id} ref={(el) => { outflowRefs.current[item.id] = el; }}
                            onDragOver={(e) => { e.preventDefault(); if (validDrop(item.id, 'outflow')) setDragOver({ id: item.id, zone: 'outflow' }); }}
                            onDragLeave={() => setDragOver(null)}
                            onDrop={() => handleDrop(item.id, 'outflow')}
                            className={`px-3 py-2 rounded-lg transition-all duration-150 text-xs ${isOver ? 'scale-[1.02] -translate-x-0.5' : ''}`}
                            style={{
                              border: `1px solid ${isOver ? cat.color + '88' : conn ? cat.color + '44' : cat.color + '18'}`,
                              background: isOver ? `${cat.color}22` : `${cat.color}08`,
                              color: cat.color,
                              boxShadow: isOver ? `0 0 20px ${cat.color}30` : 'none',
                            }}
                          >
                            <div className="flex items-center">
                              <span className="flex-1">{item.label}</span>
                              <span className="font-display text-[13px] font-bold opacity-90">{fmt(effectiveDue)}</span>
                              {conn && <span className="text-[10px] ml-1.5" style={{ color: covered ? SVG_COLORS.savings : `${cat.color}88` }}>{covered ? '\u2713' : '\u25CF'}</span>}
                              {isOver && <span className="text-[9px] ml-1.5" style={{ color: `${cat.color}66` }}>drop</span>}
                            </div>
                            {conn && effectiveDue > 0 && (
                              <div className="flex items-center gap-1.5 mt-1.5">
                                <div className="flex-1 h-[3px] rounded-full overflow-hidden" style={{ background: `${cat.color}1A` }}>
                                  <div className="h-full rounded-full transition-all duration-300" style={{ width: `${Math.min(100, (alloc / effectiveDue) * 100)}%`, background: covered ? SVG_COLORS.savings : cat.color }} />
                                </div>
                                <span className="text-[9px] font-medium" style={{ color: covered ? SVG_COLORS.savings : SVG_COLORS.muted }}>{covered ? 'Covered' : `${fmt(alloc)} / ${fmt(effectiveDue)}`}</span>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </ColPanel>
          </div>
          </div>
        </motion.div>

        {modal && <AllocModal {...modal} onSave={handleSave} onCancel={() => setModal(null)} />}

        <AnimatePresence>
          {showRestartModal && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/70 px-6"
              onClick={() => setShowRestartModal(false)}
            >
              <motion.div
                initial={{ scale: 0.95, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.95, opacity: 0 }}
                transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                onClick={(e) => e.stopPropagation()}
              >
                <Card variant="bordered" padding="lg" className="w-full max-w-sm shadow-2xl">
                  <h2 className="text-lg font-bold text-text-primary">Restart budget?</h2>
                  <p className="mt-2 text-sm text-text-muted">
                    This clears all {allocs.length} allocation{allocs.length === 1 ? '' : 's'} and cannot be undone.
                  </p>
                  <div className="mt-6 flex gap-3">
                    <Button onClick={() => setShowRestartModal(false)} variant="ghost" fullWidth>
                      Cancel
                    </Button>
                    <Button
                      onClick={handleRestart}
                      variant="secondary"
                      fullWidth
                      className="!bg-red-500/10 !border-red-500/30 !text-red-400 hover:!bg-red-500/20"
                    >
                      Restart
                    </Button>
                  </div>
                </Card>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </DashboardLayout>
  );
}
