import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Check } from 'lucide-react';
import { Button, Logo } from '../../components/ui';
import { useAuthStore } from '../../store';
import { ROUTES } from '../../constants';

export function OnboardingComplete() {
  const navigate = useNavigate();
  const { completeOnboarding, setJustSignedUp } = useAuthStore();
  const displayName = localStorage.getItem('altrion-displayName')?.trim();

  const enterDashboard = () => {
    completeOnboarding();
    setJustSignedUp(false);
    sessionStorage.removeItem('altrion:onboardingCheckout');
    sessionStorage.removeItem('altrion:onboardingFlow');
    navigate(ROUTES.DASHBOARD, { replace: true });
  };

  return (
    <div className="min-h-screen bg-dark-bg text-text-primary">
      <header className="border-b border-dark-border">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-5 sm:px-8">
          <Logo size="sm" clickable={false} />
          <span className="text-xs text-text-muted">Account setup</span>
        </div>
      </header>

      <main className="mx-auto flex min-h-[calc(100vh-81px)] max-w-3xl items-center justify-center px-5 py-12 sm:px-8">
        <motion.section
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="w-full rounded-lg border border-dark-border bg-dark-card px-6 py-10 text-center sm:px-12 sm:py-12"
        >
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full border border-altrion-500/30 bg-altrion-500/10">
            <Check size={22} className="text-altrion-400" strokeWidth={2.25} />
          </div>

          <p className="mt-6 text-sm font-medium text-altrion-400">
            Setup complete
          </p>

          <h1 className="mt-3 font-display text-3xl font-bold sm:text-4xl">
            Welcome to Altrion{displayName ? `, ${displayName}` : ''}
          </h1>

          <p className="mx-auto mt-4 max-w-md text-sm leading-6 text-text-secondary sm:text-base">
            Your account is ready. Continue to your dashboard to get started.
          </p>

          <div className="mt-8 flex justify-center">
            <Button size="lg" onClick={enterDashboard}>
              Continue to dashboard
              <ArrowRight size={18} />
            </Button>
          </div>
        </motion.section>
      </main>
    </div>
  );
}
