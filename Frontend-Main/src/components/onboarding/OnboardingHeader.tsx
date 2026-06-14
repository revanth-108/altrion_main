import { motion } from 'framer-motion';
import { Check, CreditCard, FileCheck, Link2, UserRound } from 'lucide-react';
import { Logo } from '../ui';

const STEPS = [
  { label: 'Name', icon: UserRound },
  { label: 'Details', icon: UserRound },
  { label: 'Consent', icon: FileCheck },
  { label: 'Accounts', icon: Link2 },
  { label: 'Payment', icon: CreditCard },
] as const;

interface OnboardingHeaderProps {
  currentStep: 1 | 2 | 3 | 4 | 5;
}

export function OnboardingHeader({ currentStep }: OnboardingHeaderProps) {
  const filledRatio = (currentStep - 1) / (STEPS.length - 1);

  return (
    <header className="sticky top-0 z-50 border-b border-dark-border bg-dark-surface/90 backdrop-blur-xl">
      <div className="mx-auto max-w-7xl px-5 py-4 sm:px-8">
        <div className="mb-6 flex items-center justify-between">
          <Logo size="sm" clickable={false} />
          <span className="rounded-full border border-altrion-500/25 bg-altrion-500/10 px-3 py-1 text-[11px] font-semibold text-altrion-400">
            Step {currentStep} of {STEPS.length}
          </span>
        </div>

        <ol className="relative flex items-start justify-between" aria-label="Onboarding progress">
          {/* Background track */}
          <div
            className="absolute h-px bg-dark-elevated"
            style={{ top: '15px', left: '15px', right: '15px' }}
            aria-hidden
          />
          {/* Animated fill */}
          <motion.div
            className="absolute h-px origin-left bg-gradient-to-r from-altrion-600 to-altrion-300"
            style={{ top: '15px', left: '15px', right: '15px' }}
            initial={{ scaleX: 0 }}
            animate={{ scaleX: filledRatio }}
            transition={{ duration: 0.65, ease: [0.4, 0, 0.2, 1] }}
            aria-hidden
          />

          {STEPS.map(({ label, icon: Icon }, i) => {
            const num = i + 1;
            const done = num < currentStep;
            const active = num === currentStep;

            return (
              <li
                key={label}
                className="relative z-10 flex flex-col items-center gap-2"
                aria-current={active ? 'step' : undefined}
              >
                <motion.div
                  initial={false}
                  animate={
                    active
                      ? { boxShadow: '0 0 0 5px rgba(16,185,129,0.16)' }
                      : { boxShadow: '0 0 0 0px rgba(16,185,129,0)' }
                  }
                  transition={{ duration: 0.35 }}
                  className={`flex h-[30px] w-[30px] items-center justify-center rounded-full border-2 transition-colors duration-300 ${
                    done
                      ? 'border-altrion-500 bg-altrion-500 text-white'
                      : active
                      ? 'border-altrion-500 bg-dark-bg text-altrion-400'
                      : 'border-dark-border bg-dark-elevated text-text-subtle'
                  }`}
                >
                  {done ? (
                    <motion.span
                      key="check"
                      initial={{ scale: 0, rotate: -20 }}
                      animate={{ scale: 1, rotate: 0 }}
                      transition={{ type: 'spring', stiffness: 500, damping: 25 }}
                    >
                      <Check size={13} strokeWidth={2.5} />
                    </motion.span>
                  ) : (
                    <Icon size={13} />
                  )}
                </motion.div>

                <span
                  className={`hidden text-[11px] leading-none transition-colors duration-200 sm:block ${
                    active
                      ? 'font-semibold text-text-primary'
                      : done
                      ? 'font-medium text-altrion-400'
                      : 'text-text-muted'
                  }`}
                >
                  {label}
                </span>
              </li>
            );
          })}
        </ol>
      </div>
    </header>
  );
}
