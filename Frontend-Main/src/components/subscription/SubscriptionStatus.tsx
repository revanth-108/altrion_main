import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  CheckCircle2, Clock, XCircle, AlertTriangle,
  RefreshCw, ArrowRight, Loader2, Infinity,
} from 'lucide-react';
import { useSubscriptionStore } from '../../store';
import { subscriptionService } from '../../services/subscription.service';
import { ApiError } from '../../services/api';
import type { SubscriptionPlan } from '../../types';

// ─── helpers ──────────────────────────────────────────────────────────────────

function fmt(date: string | Date | null | undefined): string {
  if (!date) return '—';
  return new Date(date).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  });
}

function isPast(date: string | Date | null | undefined): boolean {
  if (!date) return false;
  return new Date(date) < new Date();
}

// ─── status badge ─────────────────────────────────────────────────────────────

function StatusBadge({ status, cancelAtEnd, periodEnd }: {
  status: string;
  cancelAtEnd: boolean;
  periodEnd?: string;
}) {
  const expired = cancelAtEnd && isPast(periodEnd);

  if (status === 'lifetime') {
    return (
      <span className="inline-flex items-center gap-1.5 text-purple-400 text-sm font-medium">
        <Infinity size={15} /> Lifetime Access
      </span>
    );
  }
  if (expired || status === 'canceled') {
    return (
      <span className="inline-flex items-center gap-1.5 text-red-400 text-sm font-medium">
        <XCircle size={15} /> Expired
      </span>
    );
  }
  if (cancelAtEnd) {
    return (
      <span className="inline-flex items-center gap-1.5 text-amber-400 text-sm font-medium">
        <AlertTriangle size={15} /> Canceling
      </span>
    );
  }
  if (status === 'trialing') {
    return (
      <span className="inline-flex items-center gap-1.5 text-blue-400 text-sm font-medium">
        <Clock size={15} /> Free Trial
      </span>
    );
  }
  if (status === 'active') {
    return (
      <span className="inline-flex items-center gap-1.5 text-green-400 text-sm font-medium">
        <CheckCircle2 size={15} /> Active
      </span>
    );
  }
  if (status === 'past_due') {
    return (
      <span className="inline-flex items-center gap-1.5 text-red-400 text-sm font-medium">
        <AlertTriangle size={15} /> Past Due
      </span>
    );
  }
  return (
    <span className="text-text-muted text-sm capitalize">{status}</span>
  );
}

// ─── row ──────────────────────────────────────────────────────────────────────

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between py-2.5 border-b border-dark-border/50 last:border-0">
      <span className="text-sm text-text-muted">{label}</span>
      <span className="text-sm font-medium text-text-primary">{value}</span>
    </div>
  );
}

// ─── main ─────────────────────────────────────────────────────────────────────

export const SubscriptionStatus: React.FC<{ plans?: SubscriptionPlan[] }> = () => {
  const navigate = useNavigate();
  const { subscription, trialDaysRemaining, isTrialing, isExpired, setSubscription } = useSubscriptionStore();
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const loadSubscription = async () => {
      try {
        const fresh = await subscriptionService.getMySubscription();
        if (!cancelled) setSubscription(fresh);
      } catch {
        if (!cancelled) setSubscription(null);
      }
    };

    loadSubscription();
    return () => { cancelled = true; };
  }, [setSubscription]);

  const withLoad = async (key: string, fn: () => Promise<void>) => {
    setLoading(key);
    setError(null);
    try { await fn(); }
    catch (error) {
      setError(error instanceof ApiError ? error.message : 'Something went wrong. Please try again.');
    }
    finally { setLoading(null); }
  };

  const handleCancel = () => {
    if (!confirm('Cancel your subscription? You keep access until the end of your billing period.')) return;
    withLoad('cancel', async () => {
      const response = await subscriptionService.cancelSubscription({ immediately: false });
      setSubscription(response.subscription);
    });
  };

  const handleReactivate = () =>
    withLoad('reactivate', async () => {
      const response = await subscriptionService.reactivateSubscription();
      setSubscription(response.subscription);
    });

  // ── no subscription ──────────────────────────────────────────────────────────
  if (!subscription) {
    return (
      <div className="bg-dark-card border border-dark-border rounded-2xl p-6">
        <h2 className="text-base font-semibold text-text-primary mb-1">Subscription</h2>
        <p className="text-sm text-text-muted mb-4">You don't have an active subscription yet.</p>
        <button
          onClick={() => navigate('/pricing')}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-altrion-500 text-white text-sm font-medium hover:bg-altrion-600 transition-colors"
        >
          View Plans <ArrowRight size={14} />
        </button>
      </div>
    );
  }

  const {
    status,
    plan,
    cancel_at_period_end,
    current_period_end,
    trial_end,
    override,
    effective_price,
  } = subscription;
  const cancelAtEnd = !!cancel_at_period_end;
  const expired = cancelAtEnd && isPast(current_period_end);
  const isWaived = !!override?.is_waived;
  const price = effective_price ?? plan?.base_price;

  return (
    <div className="bg-dark-card border border-dark-border rounded-2xl overflow-hidden">
      {/* Header */}
      <div className="px-6 py-4 border-b border-dark-border flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-text-primary">Subscription</h2>
          <div className="mt-0.5">
            <StatusBadge
              status={status}
              cancelAtEnd={cancelAtEnd}
              periodEnd={current_period_end}
            />
          </div>
        </div>
        <button
          onClick={() => navigate('/pricing')}
          className="text-xs text-altrion-400 hover:text-altrion-300 flex items-center gap-1 transition-colors"
        >
          View plans <ArrowRight size={11} />
        </button>
      </div>

      {/* Details */}
      <div className="px-6 py-3">
        {plan && (
          <>
            <Row label="Plan" value={plan.name} />
            {!isWaived && price != null && (
              <Row
                label="Price"
                value={
                  status === 'lifetime'
                    ? 'One-time payment'
                    : `$${Number(price).toFixed(2)}/${plan.billing_cycle}`
                }
              />
            )}
          </>
        )}

        {isWaived && (
          <Row label="Access" value={
            <span className="text-green-400">Complimentary</span>
          } />
        )}

        {isTrialing() && (
          <Row
            label="Trial ends"
            value={
              <span className="text-blue-400">
                {fmt(trial_end)} · {trialDaysRemaining()} days left
              </span>
            }
          />
        )}

        {status === 'active' && !cancelAtEnd && current_period_end && (
          <Row label="Renews" value={fmt(current_period_end)} />
        )}

        {cancelAtEnd && current_period_end && (
          <Row
            label={expired ? 'Expired' : 'Access until'}
            value={
              <span className={expired ? 'text-red-400' : 'text-amber-400'}>
                {fmt(current_period_end)}
              </span>
            }
          />
        )}
      </div>

      {error && (
        <p className="px-6 pb-2 text-xs text-red-400">{error}</p>
      )}

      {/* Actions */}
      <div className="px-6 py-4 border-t border-dark-border flex flex-wrap items-center gap-3">
        {/* Reactivate — show when canceling */}
        {cancelAtEnd && !expired && (
          <button
            onClick={handleReactivate}
            disabled={!!loading}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-altrion-500 text-white text-sm font-medium hover:bg-altrion-600 transition-colors disabled:opacity-40"
          >
            {loading === 'reactivate' ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
            Reactivate
          </button>
        )}

        {/* Subscribe / Upgrade */}
        {(isTrialing() || isExpired() || expired || status === 'incomplete' || status === 'past_due') && (
          <button
            onClick={() => navigate('/pricing')}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-altrion-500 text-white text-sm font-medium hover:bg-altrion-600 transition-colors"
          >
            {isTrialing() ? 'Subscribe Now' : 'Upgrade Subscription'}
            <ArrowRight size={13} />
          </button>
        )}

        {/* Cancel subscription */}
        {status === 'active' && !cancelAtEnd && !isWaived && (
          <button
            onClick={handleCancel}
            disabled={!!loading}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg border border-red-500/30 bg-red-500/10 text-sm text-red-300 hover:bg-red-500/15 transition-colors disabled:opacity-40"
          >
            {loading === 'cancel' ? (
              <>
                <Loader2 size={13} className="animate-spin" />
                Canceling...
              </>
            ) : (
              'Cancel Subscription'
            )}
          </button>
        )}
      </div>
    </div>
  );
};

export default SubscriptionStatus;
