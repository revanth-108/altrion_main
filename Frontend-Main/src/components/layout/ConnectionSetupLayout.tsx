import type { ReactNode } from 'react';
import { ArrowLeft, ShieldCheck } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { OnboardingHeader } from '../onboarding';
import { ROUTES } from '../../constants';
import { DashboardLayout } from './DashboardLayout';

interface ConnectionSetupLayoutProps {
  children: ReactNode;
  maxWidth?: string;
  backTo?: string;
  backLabel?: string;
}

export function ConnectionSetupLayout({
  children,
  maxWidth = 'max-w-6xl',
  backTo = ROUTES.ONBOARDING_TERMS,
  backLabel = 'Back to consent',
}: ConnectionSetupLayoutProps) {
  const navigate = useNavigate();
  const isOnboarding =
    sessionStorage.getItem('altrion:onboardingFlow') === 'true';

  if (!isOnboarding) {
    return <DashboardLayout maxWidth={maxWidth}>{children}</DashboardLayout>;
  }

  return (
    <div className="min-h-screen bg-dark-bg text-text-primary">
      <OnboardingHeader currentStep={4} />

      <main className={`mx-auto w-full ${maxWidth} px-5 py-8 sm:px-8 sm:py-10`}>
        <div className="mb-7 flex items-center justify-between gap-4 border-b border-dark-border pb-5">
          <button
            type="button"
            onClick={() => navigate(backTo)}
            className="inline-flex items-center gap-2 text-sm text-text-muted transition-colors hover:text-text-primary"
          >
            <ArrowLeft size={16} />
            {backLabel}
          </button>
          <span className="inline-flex items-center gap-2 text-xs text-text-muted">
            <ShieldCheck size={15} className="text-altrion-400" />
            Secure, read-only account setup
          </span>
        </div>
        {children}
      </main>
    </div>
  );
}
