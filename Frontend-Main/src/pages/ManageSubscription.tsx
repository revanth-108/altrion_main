import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CreditCard, CheckCircle, XCircle, AlertCircle, RefreshCw } from 'lucide-react';
import { SubscriptionStatus } from '../components/subscription';
import { DashboardLayout } from '../components/layout';
import { subscriptionService } from '../services/subscription.service';

type BofaPayment = {
  id: string;
  reference_number: string;
  decision: string;
  reason_code: string | null;
  amount: string | null;
  currency: string | null;
  req_card_type: string | null;
  req_card_number: string | null;
  auth_code: string | null;
  created_at: string | null;
};

function DecisionBadge({ decision }: { decision: string }) {
  const map: Record<string, { cls: string; Icon: typeof CheckCircle }> = {
    ACCEPT: { cls: 'bg-green-500/20 text-green-400 border-green-500/30', Icon: CheckCircle },
    DECLINE: { cls: 'bg-red-500/20 text-red-400 border-red-500/30', Icon: XCircle },
    REVIEW: { cls: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30', Icon: AlertCircle },
    ERROR: { cls: 'bg-orange-500/20 text-orange-400 border-orange-500/30', Icon: AlertCircle },
    CANCEL: { cls: 'bg-gray-500/20 text-gray-400 border-gray-500/30', Icon: XCircle },
  };
  const { cls, Icon } = map[decision] ?? {
    cls: 'bg-dark-elevated text-text-secondary border-dark-border',
    Icon: AlertCircle,
  };
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold border ${cls}`}
    >
      <Icon className="h-3 w-3" />
      {decision}
    </span>
  );
}

export const ManageSubscription: React.FC = () => {
  const navigate = useNavigate();
  const [payments, setPayments] = useState<BofaPayment[]>([]);
  const [paymentsLoading, setPaymentsLoading] = useState(true);
  const [paymentsError, setPaymentsError] = useState<string | null>(null);

  useEffect(() => {
    loadPayments();
  }, []);

  const loadPayments = async () => {
    try {
      setPaymentsLoading(true);
      setPaymentsError(null);
      const data = await subscriptionService.getMyBofaPayments();
      setPayments(data);
    } catch {
      setPaymentsError('Unable to load payment history.');
    } finally {
      setPaymentsLoading(false);
    }
  };

  return (
    <DashboardLayout>
      <div className="max-w-4xl mx-auto py-8 px-4 space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-text-primary">Manage Subscription</h1>
          <p className="text-text-secondary mt-2">Review your plan, billing status, and payment history.</p>
        </div>

        <SubscriptionStatus />

        {/* Upgrade / change plan */}
        <div className="bg-dark-card border border-dark-border rounded-2xl p-6 flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h2 className="text-lg font-semibold text-text-primary">Change Plan</h2>
            <p className="text-sm text-text-secondary mt-1">
              Browse available plans and upgrade or switch at any time.
            </p>
          </div>
          <button
            onClick={() => navigate('/pricing')}
            className="px-5 py-2.5 rounded-lg bg-altrion-500 text-text-primary hover:bg-altrion-600 font-medium text-sm"
          >
            View Plans
          </button>
        </div>

        {/* BofA Payment History */}
        <div className="bg-dark-card border border-dark-border rounded-2xl p-6">
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-2">
              <CreditCard className="h-5 w-5 text-altrion-400" />
              <h2 className="text-xl font-semibold text-text-primary">Payment History</h2>
            </div>
            <button
              onClick={loadPayments}
              disabled={paymentsLoading}
              className="flex items-center gap-1.5 text-sm text-text-secondary hover:text-text-primary disabled:opacity-50"
            >
              <RefreshCw className={`h-4 w-4 ${paymentsLoading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>

          {paymentsLoading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-altrion-500" />
            </div>
          ) : paymentsError ? (
            <p className="text-sm text-red-400">{paymentsError}</p>
          ) : payments.length === 0 ? (
            <p className="text-sm text-text-secondary">No payment records found.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-text-muted uppercase tracking-wider border-b border-dark-border">
                    <th className="pb-3 pr-4">Date</th>
                    <th className="pb-3 pr-4">Status</th>
                    <th className="pb-3 pr-4">Amount</th>
                    <th className="pb-3 pr-4">Card</th>
                    <th className="pb-3 pr-4">Reference</th>
                    <th className="pb-3">Auth Code</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-dark-border">
                  {payments.map((p) => (
                    <tr key={p.id} className="hover:bg-dark-elevated/40">
                      <td className="py-3 pr-4 text-text-secondary whitespace-nowrap">
                        {p.created_at ? new Date(p.created_at).toLocaleDateString() : '—'}
                      </td>
                      <td className="py-3 pr-4">
                        <DecisionBadge decision={p.decision} />
                      </td>
                      <td className="py-3 pr-4 text-text-primary font-medium">
                        {p.amount ? `$${p.amount}` : '—'}
                        {p.currency ? ` ${p.currency}` : ''}
                      </td>
                      <td className="py-3 pr-4 text-text-secondary">
                        {p.req_card_type ?? ''} {p.req_card_number ?? ''}
                        {!p.req_card_type && !p.req_card_number && '—'}
                      </td>
                      <td className="py-3 pr-4 font-mono text-text-muted text-xs">
                        {p.reference_number}
                      </td>
                      <td className="py-3 font-mono text-text-muted text-xs">
                        {p.auth_code ?? '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="bg-dark-card border border-dark-border rounded-2xl p-6">
          <h2 className="text-xl font-semibold text-text-primary mb-2">Need Help?</h2>
          <p className="text-text-secondary text-sm mb-3">
            Have questions about your subscription or billing?
          </p>
          <a
            href="mailto:support@altrion.com"
            className="text-altrion-400 hover:text-altrion-300 font-medium text-sm"
          >
            Contact Support
          </a>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default ManageSubscription;
