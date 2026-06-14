import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  Building2,
  FileText,
  LockKeyhole,
  ShieldCheck,
} from 'lucide-react';
import { Button } from '../../components/ui';
import { ConnectionSetupLayout } from '../../components/layout';
import { ROUTES } from '../../constants';

const choices = [
  {
    title: 'Connect a bank account',
    description:
      'Link checking, savings, credit, and investment accounts through Plaid.',
    note: 'Secure, read-only connection',
    icon: Building2,
    action: 'Connect bank',
    route: ROUTES.CONNECT_API,
    primary: true,
  },
  {
    title: 'Upload a portfolio statement',
    description:
      'Import holdings from a supported brokerage or crypto exchange PDF.',
    note: 'Encrypted PDF upload',
    icon: FileText,
    action: 'Upload statement',
    route: ROUTES.CONNECT_CRYPTO,
    primary: false,
  },
];

export function SelectWallets() {
  const navigate = useNavigate();
  const isOnboarding =
    sessionStorage.getItem('altrion:onboardingFlow') === 'true';

  const handleSkip = () => {
    navigate(isOnboarding ? ROUTES.ONBOARDING_PAYMENT : ROUTES.DASHBOARD);
  };

  return (
    <ConnectionSetupLayout maxWidth="max-w-5xl">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
      >
        <div className="mx-auto max-w-2xl text-center">
          <span className="inline-flex items-center gap-2 rounded-full border border-altrion-500/30 bg-altrion-500/10 px-3 py-1 text-xs font-semibold text-altrion-400">
            <ShieldCheck size={14} />
            Optional and under your control
          </span>
          <h1 className="mt-5 font-display text-3xl font-bold text-text-primary sm:text-4xl">
            Build your financial picture
          </h1>
          <p className="mt-3 text-base leading-7 text-text-secondary">
            Add live account data, import a statement, or continue and connect
            accounts later from your dashboard.
          </p>
        </div>

        <div className="mt-10 grid gap-5 md:grid-cols-2">
          {choices.map((choice, index) => {
            const Icon = choice.icon;
            return (
              <motion.section
                key={choice.title}
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.08 + index * 0.08 }}
                className={`flex flex-col rounded-lg border p-6 ${
                  choice.primary
                    ? 'border-altrion-500/50 bg-altrion-500/5'
                    : 'border-dark-border bg-dark-card'
                }`}
              >
                <div
                  className={`flex h-12 w-12 items-center justify-center rounded-lg ${
                    choice.primary
                      ? 'bg-altrion-500 text-white'
                      : 'bg-dark-elevated text-altrion-400'
                  }`}
                >
                  <Icon size={23} />
                </div>
                <h2 className="mt-5 text-xl font-bold text-text-primary">
                  {choice.title}
                </h2>
                <p className="mt-2 flex-1 text-sm leading-6 text-text-secondary">
                  {choice.description}
                </p>
                <div className="mt-5 flex items-center gap-2 border-t border-dark-border pt-4 text-xs text-text-muted">
                  <LockKeyhole size={14} className="text-altrion-400" />
                  {choice.note}
                </div>
                <Button
                  className="mt-5"
                  variant={choice.primary ? 'primary' : 'secondary'}
                  fullWidth
                  onClick={() => navigate(choice.route)}
                >
                  {choice.action}
                  <ArrowRight size={17} />
                </Button>
              </motion.section>
            );
          })}
        </div>

        <div className="mt-8 flex flex-col items-center justify-between gap-4 border-t border-dark-border pt-6 sm:flex-row">
          <p className="max-w-xl text-sm leading-6 text-text-muted">
            Altrion cannot move money or make transactions. Connections can be
            revoked and uploaded files can be removed from your account.
          </p>
          <Button variant="ghost" onClick={handleSkip}>
            Continue without accounts
            <ArrowRight size={17} />
          </Button>
        </div>
      </motion.div>
    </ConnectionSetupLayout>
  );
}
