import { CheckCircle2, CreditCard, ShieldCheck, Sparkles, UserRound, FileCheck, Link2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { OnboardingHeader } from '../../components/onboarding';
import { PricingPlans } from '../../components/subscription';
import { ROUTES } from '../../constants';

const COMPLETED_STEPS = [
  { icon: UserRound,  label: 'Profile created',        detail: 'Your display name and personal details are saved.' },
  { icon: FileCheck,  label: 'Terms accepted',          detail: 'Data consent confirmed and on record.' },
  { icon: Link2,      label: 'Accounts connected',      detail: 'Your bank and portfolio links are ready.' },
] as const;

export function OnboardingPayment() {
  const navigate = useNavigate();
  const displayName = localStorage.getItem('altrion-displayName');

  const handleSkip = () => {
    navigate(ROUTES.ONBOARDING_COMPLETE);
  };

  return (
    <div className="min-h-screen bg-dark-bg text-text-primary">
      <OnboardingHeader currentStep={5} />

      <main className="relative mx-auto max-w-6xl overflow-hidden px-5 py-12 sm:px-8 lg:py-16">
        {/* Ambient glows */}
        <div className="pointer-events-none absolute left-1/2 top-0 h-80 w-[600px] -translate-x-1/2 rounded-full bg-altrion-500/6 blur-3xl" aria-hidden />
        <div className="pointer-events-none absolute -right-20 top-40 h-60 w-60 rounded-full bg-cyan-500/4 blur-3xl" aria-hidden />

        {/* ── Hero ── */}
        <motion.div
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45 }}
          className="relative mx-auto mb-12 max-w-3xl text-center"
        >
          <span className="inline-flex items-center gap-2 rounded-full border border-altrion-500/30 bg-gradient-to-r from-altrion-500/15 to-altrion-500/5 px-4 py-1.5 text-xs font-semibold text-altrion-400">
            <Sparkles size={13} />
            One last step
          </span>

          <h1 className="mt-5 font-display text-3xl font-bold leading-tight sm:text-5xl">
            {displayName ? (
              <>You're all set{', '}
                <span className="text-gradient-altrion">{displayName}</span>.
              </>
            ) : (
              <>Choose your plan</>
            )}
          </h1>

          <p className="mx-auto mt-4 max-w-xl text-base leading-7 text-text-secondary">
            Unlock the full power of Altrion. Your connected accounts stay read-only —
            payments are processed securely via Bank of America Secure Acceptance.
          </p>

          {/* Trust badges */}
          <div className="mt-6 flex flex-wrap justify-center gap-4 text-sm text-text-muted">
            <span className="inline-flex items-center gap-1.5">
              <ShieldCheck size={15} className="text-green-400" /> Secure checkout
            </span>
            <span className="inline-flex items-center gap-1.5">
              <CheckCircle2 size={15} className="text-green-400" /> Cancel anytime
            </span>
            <span className="inline-flex items-center gap-1.5">
              <CreditCard size={15} className="text-green-400" /> No hidden fees
            </span>
          </div>
        </motion.div>

        {/* ── Completed steps summary ── */}
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.12 }}
          className="mx-auto mb-10 grid max-w-3xl grid-cols-1 gap-3 sm:grid-cols-3"
        >
          {COMPLETED_STEPS.map(({ icon: Icon, label, detail }, i) => (
            <motion.div
              key={label}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, delay: 0.18 + i * 0.07 }}
              className="relative overflow-hidden rounded-xl border border-dark-border bg-dark-card px-4 py-4"
            >
              <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-altrion-500/25 to-transparent" />
              <div className="mb-3 flex items-center gap-2.5">
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-altrion-500/10">
                  <Icon size={14} className="text-altrion-400" />
                </span>
                <span className="text-xs font-semibold text-text-primary">{label}</span>
                <CheckCircle2 size={13} className="ml-auto text-altrion-500" />
              </div>
              <p className="text-xs leading-5 text-text-muted">{detail}</p>
            </motion.div>
          ))}
        </motion.div>

        {/* ── Pricing plans ── */}
        <PricingPlans
          context="onboarding"
          successUrl={`${window.location.origin}${ROUTES.SUBSCRIPTION_SUCCESS}`}
          cancelUrl={`${window.location.origin}${ROUTES.ONBOARDING_PAYMENT}`}
        />

        {/* ── Skip for now ── */}
        <div className="mt-6 text-center">
          <button
            type="button"
            onClick={handleSkip}
            className="text-sm text-text-muted underline-offset-2 transition-colors hover:text-text-primary hover:underline"
          >
            Skip for now — finish setup
          </button>
        </div>
      </main>
    </div>
  );
}
