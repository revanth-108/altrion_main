import { useEffect, useState } from 'react';
import {
  Check,
  Infinity as InfinityIcon,
  Loader2,
  Shield,
  Star,
  TrendingUp,
  Zap,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { ApiError, NetworkError } from '../../services/api';
import { subscriptionService } from '../../services/subscription.service';
import { submitHostedPaymentSession } from '../../services/bofa-payments.service';
import { useAuthStore, selectIsAuthenticated } from '../../store';
import type { SubscriptionPlan } from '../../types';

const getPlanMeta = (plan: SubscriptionPlan) => {
  const cycle = plan.billing_cycle.toLowerCase();
  const name = plan.name.toLowerCase();
  const features = Object.values(plan.features ?? {}).map(String).filter(Boolean);

  if (cycle === 'lifetime') {
    return {
      displayName: plan.name,
      subtitle: 'One-time payment, forever',
      icon: <InfinityIcon size={22} />,
      color: 'from-purple-500/20 to-transparent',
      highlight: 'Best Deal',
      features: features.length ? features : [
        'Lifetime access',
        'All future features included',
        'Priority support',
      ],
    };
  }

  return {
    displayName: plan.name,
    subtitle: cycle === 'yearly'
      ? 'Billed yearly'
      : cycle === 'quarterly'
        ? 'Billed quarterly'
        : 'Billed monthly',
    icon: name.includes('pro') ? <TrendingUp size={22} /> : name.includes('essential') ? <Zap size={22} /> : <Star size={22} />,
    color: name.includes('pro') ? 'from-altrion-500/30 to-altrion-600/10' : 'from-altrion-500/20 to-transparent',
    highlight: name.includes('pro') ? 'Most Popular' : undefined,
    features: features.length ? features : [
      'Portfolio dashboard access',
      'Connected account tracking',
      'Financial insights',
      'Email support',
    ],
  };
};

const getCheckoutErrorMessage = (error: unknown) => {
  if (error instanceof ApiError) {
    const detail = error.data && typeof error.data === 'object' && 'detail' in error.data
      ? String((error.data as { detail?: unknown }).detail)
      : null;
    const url = error.url ? ` (${error.url})` : '';
    return detail ? `${detail}${url}` : `Checkout failed with API status ${error.status}${url}.`;
  }

  if (error instanceof NetworkError) {
    return error.message;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return 'Checkout failed. Please try again.';
};

interface PricingPlansProps {
  context?: 'default' | 'onboarding';
  successUrl?: string;
  cancelUrl?: string;
}

export const PricingPlans: React.FC<PricingPlansProps> = ({
  context = 'default',
  successUrl = `${window.location.origin}/subscription/success`,
  cancelUrl = `${window.location.origin}/pricing`,
}) => {
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [promoCode, setPromoCode] = useState('');
  const [checkingOutId, setCheckingOutId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [promoMessage, setPromoMessage] = useState<{ text: string; ok: boolean } | null>(null);
  const isAuthenticated = useAuthStore(selectIsAuthenticated);
  const navigate = useNavigate();

  useEffect(() => { loadPlans(); }, []);

  const loadPlans = async () => {
    try {
      setErrorMessage(null);
      const data = await subscriptionService.getPlans();
      setPlans(data);
    } catch {
      setErrorMessage('Unable to load plans. Please refresh.');
    } finally {
      setLoading(false);
    }
  };

  const handleCheckout = async (planId: string) => {
    if (!isAuthenticated) { navigate('/login', { state: { from: '/pricing' } }); return; }
    try {
      setCheckingOutId(planId);
      setErrorMessage(null);
      const response = await subscriptionService.createCheckoutSession({
        plan_id: planId,
        promo_code: promoCode || undefined,
        success_url: successUrl,
        cancel_url: cancelUrl,
      });
      sessionStorage.setItem('altrion:lastCheckoutSessionId', response.session_id);
      sessionStorage.setItem('altrion:lastCheckoutPlanId', planId);
      if (context === 'onboarding') {
        sessionStorage.setItem('altrion:onboardingCheckout', 'true');
      } else {
        sessionStorage.removeItem('altrion:onboardingCheckout');
      }

      if (response.method === 'POST' && response.fields) {
        submitHostedPaymentSession({ form_action: response.url, method: 'POST', fields: response.fields });
        return;
      }
      window.location.href = response.url;
    } catch (error) {
      console.error('Checkout failed:', error);
      setErrorMessage(getCheckoutErrorMessage(error));
    } finally {
      setCheckingOutId(null);
    }
  };

  const handleApplyPromo = async () => {
    if (!promoCode) { setPromoMessage({ text: 'Enter a promo code first.', ok: false }); return; }
    if (!isAuthenticated) { setPromoMessage({ text: 'Log in to validate promo codes.', ok: false }); return; }
    try {
      await subscriptionService.applyPromoCode({ code: promoCode });
      setPromoMessage({ text: '✓ Promo code applied — discount will reflect at checkout.', ok: true });
    } catch {
      setPromoMessage({ text: 'Invalid or expired promo code.', ok: false });
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-8 w-8 animate-spin text-altrion-500" />
      </div>
    );
  }

  return (
    <div className={`${context === 'onboarding' ? 'pb-10 pt-8' : 'py-10'} px-4 max-w-7xl mx-auto`}>
      {/* Header */}
      {context === 'default' && (
        <div className="text-center mb-14">
          <div className="inline-flex items-center gap-2 bg-altrion-500/10 border border-altrion-500/20 rounded-full px-4 py-1.5 text-sm text-altrion-400 mb-5">
            <Shield size={14} />
            14-day free trial included with every plan
          </div>
          <h1 className="text-4xl md:text-5xl font-bold mb-4 text-text-primary font-display">
            Invest smarter.<br />
            <span className="text-altrion-400">Track everything.</span>
          </h1>
          <p className="text-lg text-text-secondary max-w-xl mx-auto">
            One subscription to unify your crypto, stocks, and bank accounts with real-time AI insights.
          </p>
        </div>
      )}

      {/* Promo code */}
      <div className="max-w-sm mx-auto mb-10">
        <div className="flex gap-2">
          <input
            type="text"
            value={promoCode}
            onChange={(e) => { setPromoCode(e.target.value.toUpperCase()); setPromoMessage(null); }}
            placeholder="Enter code"
            className="flex-1 px-4 py-2.5 bg-dark-elevated border border-dark-border rounded-lg text-text-primary placeholder:text-text-muted text-sm focus:outline-none focus:border-altrion-500/50"
          />
          <button
            type="button"
            onClick={handleApplyPromo}
            className="px-4 py-2.5 rounded-lg bg-dark-elevated text-text-primary border border-dark-border hover:border-altrion-500/50 text-sm transition-colors"
          >
            Apply
          </button>
        </div>
        {promoMessage && (
          <p className={`text-xs mt-2 ${promoMessage.ok ? 'text-green-400' : 'text-red-400'}`}>
            {promoMessage.text}
          </p>
        )}
      </div>

      {errorMessage && (
        <div className="max-w-2xl mx-auto mb-8 bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-3 text-red-400 text-sm text-center">
          {errorMessage}
        </div>
      )}

      {/* Plans grid */}
      {plans.length === 0 ? (
        <div className="max-w-md mx-auto text-center bg-dark-card border border-dark-border rounded-2xl p-10">
          <p className="text-text-secondary mb-4">No plans available right now.</p>
          <button onClick={loadPlans} className="px-5 py-2 rounded-lg bg-altrion-500 text-white text-sm">
            Retry
          </button>
        </div>
      ) : (
        <div className={`grid gap-6 max-w-6xl mx-auto ${
          plans.length === 1 ? 'max-w-sm' :
          plans.length === 2 ? 'md:grid-cols-2 max-w-3xl' :
          'md:grid-cols-2 lg:grid-cols-3'
        }`}>
          {plans.map((plan) => {
            const meta = getPlanMeta(plan);
            const isPopular = !!meta.highlight;
            const price = Number(plan.base_price).toFixed(2);
            const period = plan.billing_cycle === 'lifetime' ? 'one-time'
              : plan.billing_cycle === 'yearly' ? 'year'
              : plan.billing_cycle === 'quarterly' ? 'quarter'
              : 'month';
            const isChecking = checkingOutId === plan.id;

            return (
              <div
                key={plan.id}
                className={`relative flex flex-col rounded-2xl border transition-all duration-200 overflow-hidden ${
                  isPopular
                    ? 'border-altrion-500/70 shadow-lg shadow-altrion-500/10'
                    : 'border-dark-border hover:border-altrion-500/30'
                }`}
              >
                {/* Gradient header background */}
                <div className={`absolute inset-0 bg-gradient-to-b ${meta.color} pointer-events-none`} />

                {isPopular && (
                  <div className="relative flex justify-center pt-4">
                    <span className="bg-altrion-500 text-white text-xs font-semibold px-3 py-1 rounded-full tracking-wide">
                      {meta.highlight}
                    </span>
                  </div>
                )}

                <div className="relative flex flex-col flex-1 p-7">
                  {/* Plan header */}
                  <div className="flex items-center gap-3 mb-1">
                    <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${
                      isPopular ? 'bg-altrion-500/20 text-altrion-400' : 'bg-dark-elevated text-text-secondary'
                    }`}>
                      {meta.icon}
                    </div>
                    <div>
                      <h3 className="text-lg font-bold text-text-primary leading-tight">{meta.displayName}</h3>
                      <p className="text-xs text-text-muted">{meta.subtitle}</p>
                    </div>
                  </div>

                  {/* Price */}
                  <div className="mt-6 mb-6">
                    <div className="flex items-end gap-1">
                      <span className="text-5xl font-bold text-text-primary">${price}</span>
                      <span className="text-text-muted text-sm mb-2">/{period}</span>
                    </div>
                    {plan.billing_cycle === 'yearly' && (
                      <p className="text-xs text-green-400 mt-1">
                        ${(Number(plan.base_price) / 12).toFixed(2)}/mo · saves ${(Number(plan.base_price) * 2 / 12).toFixed(0)} vs monthly
                      </p>
                    )}
                  </div>

                  {/* CTA */}
                  <button
                    onClick={() => handleCheckout(plan.id)}
                    disabled={!!checkingOutId}
                    className={`w-full py-3 px-6 rounded-xl font-semibold text-sm transition-all ${
                      isPopular
                        ? 'bg-altrion-500 text-white hover:bg-altrion-600 shadow-md shadow-altrion-500/20'
                        : 'bg-dark-elevated text-text-primary border border-dark-border hover:border-altrion-500/50'
                    } disabled:opacity-50 disabled:cursor-not-allowed`}
                  >
                    {isChecking ? (
                      <span className="flex items-center justify-center gap-2">
                        <Loader2 className="h-4 w-4 animate-spin" /> Redirecting to payment…
                      </span>
                    ) : (
                      context === 'onboarding' ? 'Continue to secure payment' : 'Start Free Trial'
                    )}
                  </button>

                  <p className="text-xs text-text-muted text-center mt-2">
                    14-day trial · Cancel anytime
                  </p>

                  {/* Features */}
                  <div className="mt-6 pt-6 border-t border-dark-border/60 space-y-3 flex-1">
                    {meta.features.map((feature) => (
                      <div key={feature} className="flex items-start gap-2.5">
                        <Check size={15} className="text-green-400 mt-0.5 shrink-0" />
                        <span className="text-sm text-text-secondary">{feature}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Trust footer */}
      <div className="mt-14 text-center space-y-3">
        <div className="flex items-center justify-center gap-6 text-sm text-text-muted flex-wrap">
          <span className="flex items-center gap-1.5"><Shield size={14} className="text-green-400" /> Bank-level encryption</span>
          <span className="flex items-center gap-1.5"><Check size={14} className="text-green-400" /> 14-day free trial</span>
          <span className="flex items-center gap-1.5"><Check size={14} className="text-green-400" /> Cancel anytime</span>
          <span className="flex items-center gap-1.5"><Zap size={14} className="text-altrion-400" /> Instant activation</span>
        </div>
        <p className="text-xs text-text-muted">
          Payments processed securely by Bank of America Secure Acceptance.
        </p>
      </div>
    </div>
  );
};

export default PricingPlans;
