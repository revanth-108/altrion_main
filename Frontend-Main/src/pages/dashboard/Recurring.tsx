import { useState, useEffect, useRef } from 'react';
import type { ElementType } from 'react';
import { motion } from 'framer-motion';
import { AlertCircle, TrendingDown, TrendingUp, Repeat, RefreshCw } from 'lucide-react';
import { DashboardLayout } from '@/components/layout';
import { Card, Button, TableRowSkeleton } from '@/components/ui';
import { CONTAINER_VARIANTS, ITEM_VARIANTS } from '@/constants';
import { usePlaidRecurring, useSyncRecurring } from '@/hooks/queries/usePlaid';
import { formatCurrency } from '@/utils';
import type { PlaidRecurringResponse } from '@/types';

// ── Formatters ──────────────────────────────────────────────────────

interface RecurringStream {
  stream_id?: string | null;
  merchant_name?: string | null;
  description?: string | null;
  average_amount?: number | null;
  predicted_next_date?: string | null;
  is_active?: boolean | null;
  status?: string | null;
  frequency?: string | null;
}

function fmtFrequency(frequency: string | null | undefined): string {
  switch ((frequency || '').toUpperCase()) {
    case 'MONTHLY':      return 'Monthly';
    case 'WEEKLY':       return 'Weekly';
    case 'BIWEEKLY':     return 'Every 2 weeks';
    case 'SEMI_MONTHLY': return 'Twice monthly';
    default:             return 'Irregular';
  }
}

function fmtNextDate(value: string | null | undefined): string | null {
  if (!value) return null;
  const d = new Date(value);
  if (isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(d);
}

// ── Sub-components ──────────────────────────────────────────────────

function FrequencyBadge({ frequency }: { frequency: string | null | undefined }) {
  return (
    <span className="text-[11px] text-text-muted bg-dark-elevated rounded-full px-2 py-0.5 border border-dark-border/40">
      {fmtFrequency(frequency)}
    </span>
  );
}

function StatusDot({ status, is_active }: { status: string | null | undefined; is_active: boolean }) {
  let color = 'bg-gray-500';

  if (!is_active || status === 'TOMBSTONED') {
    color = 'bg-gray-500/60';
  } else if (status === 'EARLY_DETECTION') {
    color = 'bg-yellow-400';
  } else if (status === 'MATURE') {
    color = 'bg-green-400';
  }

  return (
    <span
      className={`inline-block w-2 h-2 rounded-full shrink-0 mt-1 ${color}`}
      aria-hidden
    />
  );
}

function StreamCard({ stream, type }: { stream: RecurringStream; type: 'inflow' | 'outflow' }) {
  const isOutflow   = type === 'outflow';
  const name        = stream.merchant_name || stream.description || 'Uncategorized stream';
  const amount      = stream.average_amount ?? 0;
  const nextDate    = fmtNextDate(stream.predicted_next_date);
  const isInactive  = !stream.is_active || stream.status === 'TOMBSTONED';

  const amountColor = isInactive
    ? 'text-text-muted'
    : isOutflow
    ? 'text-red-400'
    : 'text-green-400';

  const amountDisplay = isOutflow
    ? `−${formatCurrency(Math.abs(amount))}`
    : `+${formatCurrency(Math.abs(amount))}`;

  return (
    <div className={`flex items-start justify-between px-4 py-3.5 transition-colors ${isInactive ? 'opacity-50' : ''}`}>
      {/* Left: dot + name + frequency */}
      <div className="flex items-start gap-3 min-w-0">
        <StatusDot status={stream.status} is_active={stream.is_active ?? true} />
        <div className="min-w-0">
          <p className="text-text-primary text-sm font-medium truncate">{name}</p>
          <div className="mt-1">
            <FrequencyBadge frequency={stream.frequency} />
          </div>
        </div>
      </div>

      {/* Right: amount + next date */}
      <div className="text-right shrink-0 ml-4">
        <p className={`text-sm font-semibold tabular-nums ${amountColor}`}>
          {amountDisplay}
        </p>
        {nextDate && (
          <p className="text-text-muted text-[11px] mt-0.5">Next: {nextDate}</p>
        )}
      </div>
    </div>
  );
}

function SectionHeader({
  icon: Icon,
  title,
  count,
  accent,
}: {
  icon: ElementType;
  title: string;
  count: number;
  accent: string;
}) {
  return (
    <div className="flex items-center gap-3 mb-4">
      <div className={`w-1 h-6 rounded-full ${accent}`} />
      <Icon size={20} className="text-text-secondary" />
      <h2 className="font-display text-lg sm:text-xl font-bold text-text-primary">{title}</h2>
      <span className="ml-auto text-text-muted text-sm">{count} stream{count !== 1 ? 's' : ''}</span>
    </div>
  );
}

// ── Main Component ──────────────────────────────────────────────────

export function Recurring() {
  const { data: recurringData, isLoading, isError, error } = usePlaidRecurring();
  const syncRecurring = useSyncRecurring();
  const [showInactive, setShowInactive] = useState(false);
  const autoSyncFired = useRef(false);

  const resData = recurringData as PlaidRecurringResponse | undefined;
  const source: string | undefined = resData?.source;
  const allInflow: RecurringStream[]  = resData?.inflow_streams  || [];
  const allOutflow: RecurringStream[] = resData?.outflow_streams || [];

  const activeInflow  = allInflow.filter(s => s.is_active && s.status !== 'TOMBSTONED');
  const activeOutflow = allOutflow.filter(s => s.is_active && s.status !== 'TOMBSTONED');

  const inactiveCount = (allInflow.length - activeInflow.length) + (allOutflow.length - activeOutflow.length);

  const displayInflow  = showInactive ? allInflow  : activeInflow;
  const displayOutflow = showInactive ? allOutflow : activeOutflow;

  const monthlyOutflow = activeOutflow.reduce((sum, s) => sum + Math.abs(s.average_amount ?? 0), 0);
  const monthlyInflow  = activeInflow.reduce((sum, s) => sum + Math.abs(s.average_amount ?? 0), 0);
  const netMonthly     = monthlyInflow - monthlyOutflow;

  const isEmpty = !isLoading && !isError && allInflow.length === 0 && allOutflow.length === 0;

  // Auto-sync once when the page loads with no data
  useEffect(() => {
    if (isEmpty && !autoSyncFired.current && !syncRecurring.isPending) {
      autoSyncFired.current = true;
      syncRecurring.mutate();
    }
  }, [isEmpty]);

  return (
    <DashboardLayout>
      <motion.div
        variants={CONTAINER_VARIANTS}
        initial="hidden"
        animate="visible"
        className="space-y-8"
      >
        {/* Header */}
        <motion.div variants={ITEM_VARIANTS} className="flex items-end justify-between gap-3">
          <div className="min-w-0">
            <h1 className="font-display text-2xl sm:text-4xl font-black leading-tight text-text-primary">
              Recurring
            </h1>
            <p className="text-text-secondary text-sm mt-1">
              Subscriptions, bills, and regular income
              {source === 'db' && <span className="ml-2 text-text-muted text-xs">Cached</span>}
              {source === 'sync' && <span className="ml-2 text-green-400 text-xs">Updated just now</span>}
            </p>
          </div>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => syncRecurring.mutate()}
            disabled={syncRecurring.isPending || isLoading}
            className="flex-shrink-0 sm:px-6 sm:py-3 sm:text-base"
          >
            <RefreshCw size={16} className={syncRecurring.isPending ? 'animate-spin' : ''} />
            <span className="hidden sm:inline">Sync</span>
          </Button>
        </motion.div>

        {/* Loading */}
        {isLoading && (
          <motion.div variants={ITEM_VARIANTS}>
            <Card variant="bordered" className="overflow-hidden">
              <div className="p-5 space-y-4">
                {Array.from({ length: 6 }).map((_, i) => (
                  <TableRowSkeleton key={i} />
                ))}
              </div>
            </Card>
          </motion.div>
        )}

        {/* Error */}
        {isError && !isLoading && (
          <motion.div variants={ITEM_VARIANTS}>
            <Card variant="bordered" className="p-6">
              <div className="flex items-center gap-3 text-red-400">
                <AlertCircle size={20} />
                <p className="text-sm">
                  {error instanceof Error ? error.message : 'Unable to load recurring transactions. Make sure a bank account is connected.'}
                </p>
              </div>
            </Card>
          </motion.div>
        )}

        {/* Empty */}
        {isEmpty && !syncRecurring.isPending && (
          <motion.div variants={ITEM_VARIANTS}>
            <Card variant="bordered" className="p-12 text-center">
              <Repeat size={36} className="text-text-muted mx-auto mb-3" />
              <p className="text-text-primary text-sm font-medium mb-1">No recurring streams found</p>
              <p className="text-text-muted text-sm mb-5">
                Sync to detect subscriptions, bills, and regular income from your connected accounts.
              </p>
              <Button
                variant="primary"
                size="sm"
                onClick={() => syncRecurring.mutate()}
                disabled={syncRecurring.isPending}
              >
                <RefreshCw size={14} />
                Sync Now
              </Button>
            </Card>
          </motion.div>
        )}

        {/* Syncing state (auto-sync or manual sync while empty) */}
        {(syncRecurring.isPending && allInflow.length === 0 && allOutflow.length === 0) && (
          <motion.div variants={ITEM_VARIANTS}>
            <Card variant="bordered" className="overflow-hidden">
              <div className="p-5 space-y-4">
                {Array.from({ length: 6 }).map((_, i) => (
                  <TableRowSkeleton key={i} />
                ))}
              </div>
            </Card>
          </motion.div>
        )}

        {/* Summary Bar */}
        {!isLoading && !isError && !isEmpty && (
          <motion.div variants={ITEM_VARIANTS}>
            <div className="grid grid-cols-3 gap-4">
              {/* Monthly outflow */}
              <Card variant="bordered" padding="none" className="px-5 py-4">
                <p className="text-text-muted text-xs uppercase tracking-wider mb-1">Monthly Bills</p>
                <p className="text-red-400 text-xl font-bold tabular-nums">
                  −{formatCurrency(monthlyOutflow)}
                </p>
              </Card>

              {/* Monthly inflow */}
              <Card variant="bordered" padding="none" className="px-5 py-4">
                <p className="text-text-muted text-xs uppercase tracking-wider mb-1">Monthly Income</p>
                <p className="text-green-400 text-xl font-bold tabular-nums">
                  +{formatCurrency(monthlyInflow)}
                </p>
              </Card>

              {/* Net */}
              <Card variant="bordered" padding="none" className="px-5 py-4">
                <p className="text-text-muted text-xs uppercase tracking-wider mb-1">Net Monthly</p>
                <p className={`text-xl font-bold tabular-nums ${netMonthly >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                  {netMonthly >= 0 ? '+' : '−'}{formatCurrency(Math.abs(netMonthly))}
                </p>
              </Card>
            </div>

            {/* Inactive toggle */}
            {inactiveCount > 0 && (
              <button
                onClick={() => setShowInactive(v => !v)}
                className="mt-3 text-xs text-text-muted hover:text-text-secondary transition-colors underline underline-offset-2"
              >
                {showInactive
                  ? 'Hide inactive streams'
                  : `${inactiveCount} inactive stream${inactiveCount !== 1 ? 's' : ''} hidden — click to show`}
              </button>
            )}
          </motion.div>
        )}

        {/* Outflow — Subscriptions & Bills */}
        {!isLoading && !isError && displayOutflow.length > 0 && (
          <motion.div variants={ITEM_VARIANTS}>
            <SectionHeader
              icon={TrendingDown}
              title="Subscriptions & Bills"
              count={activeOutflow.length}
              accent="bg-red-500"
            />
            <Card variant="bordered" padding="none" className="overflow-hidden divide-y divide-dark-border/40">
              {displayOutflow.map((stream, idx) => (
                <StreamCard key={stream.stream_id || idx} stream={stream} type="outflow" />
              ))}
            </Card>
          </motion.div>
        )}

        {/* Inflow — Income & Deposits */}
        {!isLoading && !isError && displayInflow.length > 0 && (
          <motion.div variants={ITEM_VARIANTS}>
            <SectionHeader
              icon={TrendingUp}
              title="Income & Deposits"
              count={activeInflow.length}
              accent="bg-green-500"
            />
            <Card variant="bordered" padding="none" className="overflow-hidden divide-y divide-dark-border/40">
              {displayInflow.map((stream, idx) => (
                <StreamCard key={stream.stream_id || idx} stream={stream} type="inflow" />
              ))}
            </Card>
          </motion.div>
        )}
      </motion.div>
    </DashboardLayout>
  );
}
