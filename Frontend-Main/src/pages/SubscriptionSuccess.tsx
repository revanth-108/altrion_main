import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowRight, CheckCircle2, Loader2, ShieldCheck, XCircle } from 'lucide-react';
import { subscriptionService } from '../services/subscription.service';
import { useAuthStore, useSubscriptionStore } from '../store';
import { ROUTES } from '../constants';
import { Button, Logo } from '../components/ui';

export const SubscriptionSuccess: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { setSubscription } = useSubscriptionStore();
  const { completeOnboarding, setJustSignedUp } = useAuthStore();
  const isOnboardingCheckout =
    sessionStorage.getItem('altrion:onboardingCheckout') === 'true';

  const decision = searchParams.get('decision')?.toUpperCase();

  const [state, setState] = useState<'loading' | 'success' | 'pending' | 'failed'>('loading');

  useEffect(() => {
    let redirectTimer: ReturnType<typeof setTimeout> | undefined;

    const goToNextPage = (delay: number) => {
      redirectTimer = setTimeout(
        () => navigate(
          isOnboardingCheckout ? ROUTES.ONBOARDING_COMPLETE : ROUTES.DASHBOARD,
          { replace: true },
        ),
        delay,
      );
    };

    const finishOnboarding = () => {
      if (!isOnboardingCheckout) return;
      completeOnboarding();
      setJustSignedUp(false);
      sessionStorage.removeItem('altrion:onboardingCheckout');
      sessionStorage.removeItem('altrion:onboardingFlow');
    };

    // BofA DECLINE / ERROR — show failure immediately
    if (decision && decision !== 'ACCEPT') {
      setState('failed');
      return;
    }

    let cancelled = false;

    const run = async () => {
      // If BofA redirect included signed params, send them to the backend so it
      // can activate the subscription without needing a public-facing webhook.
      const signed = searchParams.get('signed_field_names');
      if (signed) {
        const params: Record<string, string> = {};
        searchParams.forEach((v, k) => { params[k] = v; });
        try {
          const result = await subscriptionService.confirmHppPayment(params);
          if (!cancelled && !result.success) {
            setState('failed');
            return;
          }
        } catch {
          // Backend unreachable or sig mismatch — fall through to polling
        }
      } else {
        const checkoutSessionId = sessionStorage.getItem('altrion:lastCheckoutSessionId');
        const pendingPlanId = sessionStorage.getItem('altrion:lastCheckoutPlanId');
        if (checkoutSessionId) {
          try {
            const result = await subscriptionService.confirmHppPayment({
              decision: 'ACCEPT',
              transaction_uuid: checkoutSessionId,
              dev_unsigned_return: 'true',
              ...(pendingPlanId ? { pending_plan_id: pendingPlanId } : {}),
            });
            if (!cancelled && result.success) {
              sessionStorage.removeItem('altrion:lastCheckoutSessionId');
              sessionStorage.removeItem('altrion:lastCheckoutPlanId');
            }
          } catch {
            // Keep polling; production gateways should return signed fields.
          }
        }
      }

      // Poll for subscription activation (webhook may fire asynchronously)
      let attempts = 0;
      const MAX = 10; // ~15 s total

      const poll = async () => {
        try {
          const sub = await subscriptionService.getMySubscription();
          if (cancelled) return;

          if (sub && (sub.status === 'active' || sub.status === 'lifetime')) {
            setSubscription(sub);
            finishOnboarding();
            sessionStorage.removeItem('altrion:lastCheckoutSessionId');
            sessionStorage.removeItem('altrion:lastCheckoutPlanId');
            setState('success');
            goToNextPage(900);
            return;
          }
        } catch { /* ignore */ }

        attempts++;
        if (attempts >= MAX) {
          if (!cancelled) {
            finishOnboarding();
            setState('pending');
            goToNextPage(1200);
          }
          return;
        }
        setTimeout(poll, 1500);
      };

      poll();
    };

    run();
    return () => {
      cancelled = true;
      if (redirectTimer) clearTimeout(redirectTimer);
    };
  }, [
    completeOnboarding,
    decision,
    isOnboardingCheckout,
    navigate,
    searchParams,
    setJustSignedUp,
    setSubscription,
  ]);

  const reasonCode = searchParams.get('reason_code');

  return (
    <div className="min-h-screen bg-dark-bg px-5 py-8 text-text-primary">
      <div className="mx-auto flex max-w-6xl items-center justify-between">
        <Logo size="sm" clickable={false} />
        <span className="inline-flex items-center gap-2 text-xs text-text-muted">
          <ShieldCheck size={15} className="text-altrion-400" />
          Secure payment confirmation
        </span>
      </div>

      <div className="mx-auto flex min-h-[calc(100vh-7rem)] max-w-lg items-center">
        <div className="w-full rounded-lg border border-dark-border bg-dark-card p-8 text-center sm:p-10">

        {state === 'loading' && (
          <>
            <Loader2 className="h-12 w-12 animate-spin text-altrion-500 mx-auto" />
            <h1 className="mt-5 text-xl font-bold">Confirming your payment</h1>
            <p className="mt-2 text-sm leading-6 text-text-secondary">
              Please keep this page open while we activate your subscription.
            </p>
          </>
        )}

        {state === 'success' && (
          <>
            <CheckCircle2 className="h-14 w-14 text-green-400 mx-auto" />
            <p className="mt-5 text-xs font-semibold uppercase text-green-400">
              Payment successful
            </p>
            <h1 className="mt-2 text-2xl font-bold">Your Altrion workspace is ready</h1>
            <p className="mt-3 text-sm leading-6 text-text-secondary">
              Your subscription is active. We are taking you to your dashboard now.
            </p>
            <Button
              className="mt-6"
              fullWidth
              onClick={() => navigate(
                isOnboardingCheckout ? ROUTES.ONBOARDING_COMPLETE : ROUTES.DASHBOARD,
                { replace: true },
              )}
            >
              Open dashboard
              <ArrowRight size={18} />
            </Button>
          </>
        )}

        {state === 'pending' && (
          <>
            <CheckCircle2 className="h-14 w-14 text-amber-400 mx-auto" />
            <h1 className="mt-5 text-2xl font-bold">Payment received</h1>
            <p className="mt-3 text-sm leading-6 text-text-secondary">
              Activation is finishing in the background. You can continue to your dashboard.
            </p>
            <Button
              className="mt-6"
              fullWidth
              onClick={() => navigate(
                isOnboardingCheckout ? ROUTES.ONBOARDING_COMPLETE : ROUTES.DASHBOARD,
                { replace: true },
              )}
            >
              Continue to dashboard
              <ArrowRight size={18} />
            </Button>
          </>
        )}

        {state === 'failed' && (
          <>
            <XCircle className="h-14 w-14 text-red-400 mx-auto" />
            <h1 className="mt-5 text-2xl font-bold">Payment not completed</h1>
            <p className="mt-3 text-sm leading-6 text-text-secondary">
              {reasonCode ? `Reason code: ${reasonCode}. ` : ''}
              Your card was not charged. Please try again.
            </p>
            <Button
              className="mt-6"
              fullWidth
              onClick={() => navigate(
                isOnboardingCheckout ? ROUTES.ONBOARDING_PAYMENT : ROUTES.PRICING,
              )}
            >
              Try Again
            </Button>
          </>
        )}

        </div>
      </div>
    </div>
  );
};

export default SubscriptionSuccess;
