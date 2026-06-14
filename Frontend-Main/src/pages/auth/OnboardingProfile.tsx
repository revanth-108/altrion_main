import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowLeft, ArrowRight, Banknote, BriefcaseBusiness, CalendarDays } from 'lucide-react';
import { Button, Card, Input, Logo } from '../../components/ui';
import { authService } from '../../services';
import { useAuthStore, selectUser } from '../../store';
import {
  onboardingAnnualIncomeSchema,
  onboardingDateOfBirthSchema,
  onboardingIncomeSourceSchema,
  type OnboardingAnnualIncomeFormData,
  type OnboardingDateOfBirthFormData,
  type OnboardingIncomeSourceFormData,
} from '../../schemas';
import { ROUTES } from '../../constants';
import type { User } from '../../types';

const incomeSourceOptions: Array<{
  value: NonNullable<User['incomeSource']>;
  label: string;
  description: string;
}> = [
  {
    value: 'employment',
    label: 'Employment',
    description: 'Salary, wages, bonuses, or regular payroll income.',
  },
  {
    value: 'self_employed',
    label: 'Self-employed',
    description: 'Freelance, consulting, business, or contractor income.',
  },
  {
    value: 'investment',
    label: 'Investment income',
    description: 'Dividends, interest, capital gains, or rental income.',
  },
  {
    value: 'retirement',
    label: 'Retirement income',
    description: 'Pension, retirement account distributions, or Social Security.',
  },
  {
    value: 'other',
    label: 'Other',
    description: 'Any primary source that does not fit the categories above.',
  },
];

const parseIncome = (value: string) => Number(value.replace(/[$,\s]/g, ''));

function OnboardingShell({
  step,
  title,
  subtitle,
  icon,
  progress,
  children,
}: {
  step: string;
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  progress: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-dark-bg flex flex-col">
      <div className="p-6 border-b border-dark-border bg-dark-surface/50 backdrop-blur-sm">
        <div className="max-w-3xl mx-auto">
          <div className="flex items-center justify-between mb-4">
            <Logo size="sm" />
            <span className="text-sm text-text-muted">{step}</span>
          </div>
          <div className="progress-bar">
            <div className="progress-bar-fill" style={{ width: progress }} />
          </div>
        </div>
      </div>

      <div className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-lg">
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.3 }}
          >
            <div className="mb-6">
              <div className="w-11 h-11 rounded-xl bg-altrion-500/10 text-altrion-400 flex items-center justify-center mb-4">
                {icon}
              </div>
              <h1 className="font-display text-3xl font-bold text-text-primary tracking-tight">
                {title}
              </h1>
              <p className="text-text-secondary text-sm leading-relaxed mt-2">
                {subtitle}
              </p>
            </div>
            {children}
          </motion.div>
        </div>
      </div>
    </div>
  );
}

export function OnboardingDateOfBirth() {
  const navigate = useNavigate();
  const user = useAuthStore(selectUser);
  const { setUser } = useAuthStore();

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<OnboardingDateOfBirthFormData>({
    resolver: zodResolver(onboardingDateOfBirthSchema),
    defaultValues: { dateOfBirth: user?.dateOfBirth || '' },
  });

  const onSubmit = async (data: OnboardingDateOfBirthFormData) => {
    const updatedUser = await authService.updateProfile({
      date_of_birth: data.dateOfBirth,
    });
    setUser(updatedUser);
    navigate(ROUTES.ONBOARDING_INCOME);
  };

  return (
    <OnboardingShell
      step="Step 2 of 6 · Date of birth"
      title="Date of birth"
      subtitle="This helps Altrion tailor planning horizons and age-based financial analysis."
      icon={<CalendarDays size={22} />}
      progress="33%"
    >
      <form onSubmit={handleSubmit(onSubmit)}>
        <Card variant="bordered" className="space-y-6">
          <Input
            label="Date of birth"
            type="date"
            {...register('dateOfBirth')}
            error={errors.dateOfBirth?.message}
            autoFocus
          />
        </Card>

        <div className="flex items-center justify-between mt-8">
          <button
            type="button"
            onClick={() => navigate(ROUTES.ONBOARDING)}
            className="text-sm text-text-muted hover:text-text-primary transition-colors inline-flex items-center gap-2"
          >
            <ArrowLeft size={16} />
            Back
          </button>
          <Button type="submit" disabled={isSubmitting} loading={isSubmitting}>
            Continue
            <ArrowRight size={18} />
          </Button>
        </div>
      </form>
    </OnboardingShell>
  );
}

export function OnboardingAnnualIncome() {
  const navigate = useNavigate();
  const user = useAuthStore(selectUser);
  const { setUser } = useAuthStore();

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<OnboardingAnnualIncomeFormData>({
    resolver: zodResolver(onboardingAnnualIncomeSchema),
    defaultValues: {
      annualIncome: user?.annualIncome != null ? String(user.annualIncome) : '',
    },
  });

  const onSubmit = async (data: OnboardingAnnualIncomeFormData) => {
    const updatedUser = await authService.updateProfile({
      annual_income: parseIncome(data.annualIncome),
    });
    setUser(updatedUser);
    navigate(ROUTES.ONBOARDING_INCOME_SOURCE);
  };

  return (
    <OnboardingShell
      step="Step 3 of 6 · Annual income"
      title="Annual income"
      subtitle="Use your best estimate before taxes. This powers budget, risk, and retirement projections."
      icon={<Banknote size={22} />}
      progress="50%"
    >
      <form onSubmit={handleSubmit(onSubmit)}>
        <Card variant="bordered" className="space-y-6">
          <Input
            label="Annual income"
            type="text"
            inputMode="decimal"
            placeholder="120000"
            {...register('annualIncome')}
            error={errors.annualIncome?.message}
            autoFocus
          />
          <p className="text-sm text-text-muted">
            Enter `0` if you do not currently have income.
          </p>
        </Card>

        <div className="flex items-center justify-between mt-8">
          <button
            type="button"
            onClick={() => navigate(ROUTES.ONBOARDING_DOB)}
            className="text-sm text-text-muted hover:text-text-primary transition-colors inline-flex items-center gap-2"
          >
            <ArrowLeft size={16} />
            Back
          </button>
          <Button type="submit" disabled={isSubmitting} loading={isSubmitting}>
            Continue
            <ArrowRight size={18} />
          </Button>
        </div>
      </form>
    </OnboardingShell>
  );
}

export function OnboardingIncomeSource() {
  const navigate = useNavigate();
  const user = useAuthStore(selectUser);
  const { setUser } = useAuthStore();

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<OnboardingIncomeSourceFormData>({
    resolver: zodResolver(onboardingIncomeSourceSchema),
    defaultValues: {
      incomeSource: user?.incomeSource || undefined,
    },
  });

  const selectedSource = watch('incomeSource');

  const onSubmit = async (data: OnboardingIncomeSourceFormData) => {
    const updatedUser = await authService.updateProfile({
      income_source: data.incomeSource,
    });
    setUser(updatedUser);
    navigate(ROUTES.ONBOARDING_UPLOAD);
  };

  return (
    <OnboardingShell
      step="Step 4 of 6 · Income source"
      title="Primary income source"
      subtitle="Choose the source that best represents most of your current annual income."
      icon={<BriefcaseBusiness size={22} />}
      progress="67%"
    >
      <form onSubmit={handleSubmit(onSubmit)}>
        <Card variant="bordered" className="space-y-3">
          {incomeSourceOptions.map((option) => (
            <label
              key={option.value}
              className={`block rounded-lg border p-4 cursor-pointer transition-all ${
                selectedSource === option.value
                  ? 'border-altrion-500 bg-altrion-500/10'
                  : 'border-dark-border bg-dark-card hover:border-dark-border-hover'
              }`}
            >
              <input
                type="radio"
                value={option.value}
                className="sr-only"
                {...register('incomeSource')}
              />
              <span className="block text-sm font-semibold text-text-primary">{option.label}</span>
              <span className="block text-xs text-text-muted mt-1 leading-relaxed">
                {option.description}
              </span>
            </label>
          ))}
          {errors.incomeSource?.message && (
            <p className="text-error text-xs ml-1">{errors.incomeSource.message}</p>
          )}
        </Card>

        <div className="flex items-center justify-between mt-8">
          <button
            type="button"
            onClick={() => navigate(ROUTES.ONBOARDING_INCOME)}
            className="text-sm text-text-muted hover:text-text-primary transition-colors inline-flex items-center gap-2"
          >
            <ArrowLeft size={16} />
            Back
          </button>
          <Button type="submit" disabled={isSubmitting} loading={isSubmitting}>
            Continue
            <ArrowRight size={18} />
          </Button>
        </div>
      </form>
    </OnboardingShell>
  );
}
