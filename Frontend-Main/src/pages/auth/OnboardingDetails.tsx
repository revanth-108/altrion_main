import { useState } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowLeft, ArrowRight, ChevronDown, Lock, ShieldCheck } from 'lucide-react';
import { Button } from '../../components/ui';
import { OnboardingHeader } from '../../components/onboarding';
import { onboardingDetailsSchema, type OnboardingDetailsFormData } from '../../schemas';
import { authService } from '../../services';
import { useAuthStore } from '../../store';
import { ROUTES } from '../../constants';

const INCOME_MIDPOINTS: Record<string, number> = {
  'under-30k': 20000,
  '30k-60k': 45000,
  '60k-100k': 80000,
  '100k-150k': 125000,
  '150k-250k': 200000,
  'over-250k': 300000,
  'prefer-not': 0,
};

const EMPLOYMENT_TO_SOURCE: Record<string, string> = {
  employed: 'employment',
  'self-employed': 'self_employed',
  student: 'other',
  retired: 'retirement',
  unemployed: 'other',
  other: 'other',
};

const inputClass =
  'h-11 w-full rounded-lg border-2 border-dark-border bg-transparent px-3.5 text-sm text-text-primary outline-none transition-colors placeholder:text-text-subtle hover:border-dark-border-hover focus:border-altrion-500';

function Label({ children }: { children: React.ReactNode }) {
  return <label className="mb-1.5 block text-xs font-semibold text-text-secondary">{children}</label>;
}

export function OnboardingDetails() {
  const navigate = useNavigate();
  const { setUser } = useAuthStore();
  const [submitError, setSubmitError] = useState('');

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<OnboardingDetailsFormData>({
    resolver: zodResolver(onboardingDetailsSchema),
    defaultValues: {
      dateOfBirth: localStorage.getItem('altrion-dateOfBirth') || '',
      phoneNumber: localStorage.getItem('altrion-phoneNumber') || '',
      zipCode: localStorage.getItem('altrion-zipCode') || '',
      employmentStatus: localStorage.getItem('altrion-employmentStatus') || '',
      annualIncome: localStorage.getItem('altrion-annualIncome') || '',
    },
  });

  const phoneField = register('phoneNumber');

  const onSubmit = async (data: OnboardingDetailsFormData) => {
    setSubmitError('');
    try {
      const profileUser = await authService.updateProfile({
        date_of_birth: data.dateOfBirth,
        annual_income: INCOME_MIDPOINTS[data.annualIncome] ?? 0,
        income_source: EMPLOYMENT_TO_SOURCE[data.employmentStatus] ?? 'other',
      });
      setUser(profileUser);

      Object.entries(data).forEach(([key, value]) => {
        const storageKey = `altrion-${key}`;
        localStorage.setItem(storageKey, value);
      });
      navigate(ROUTES.ONBOARDING_TERMS);
    } catch (error) {
      console.error('Failed to save onboarding details', error);
      setSubmitError(error instanceof Error ? error.message : 'Could not save your details. Please try again.');
    }
  };

  return (
    <div className="min-h-screen bg-dark-bg text-text-primary">
      <OnboardingHeader currentStep={2} />

      <main className="mx-auto max-w-4xl px-5 py-12 sm:px-8 lg:py-16">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8"
        >
          <span className="text-xs font-semibold uppercase tracking-widest text-altrion-400">
            Personalize your insights
          </span>
          <h1 className="mt-3 font-display text-3xl font-bold sm:text-4xl">
            Tell us a little about you
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-text-secondary sm:text-base">
            These details help Altrion shape planning horizons, cash-flow guidance, and relevant financial benchmarks.
          </p>
        </motion.div>

        <motion.form
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.08 }}
          onSubmit={handleSubmit(onSubmit)}
          className="overflow-hidden rounded-lg border border-dark-border bg-dark-card"
          noValidate
        >
          <div className="grid gap-5 p-6 sm:grid-cols-2 sm:p-8">
            <div>
              <Label>Date of birth</Label>
              <input type="date" {...register('dateOfBirth')} className={inputClass} style={{ colorScheme: 'dark' }} />
              {errors.dateOfBirth && <p className="mt-1.5 text-xs text-red-400">{errors.dateOfBirth.message}</p>}
            </div>

            <div>
              <Label>Phone number</Label>
              <input
                {...phoneField}
                type="tel"
                inputMode="numeric"
                maxLength={10}
                placeholder="10-digit number"
                className={inputClass}
                onChange={(event) => {
                  event.target.value = event.target.value.replace(/\D/g, '').slice(0, 10);
                  void phoneField.onChange(event);
                }}
              />
              {errors.phoneNumber && <p className="mt-1.5 text-xs text-red-400">{errors.phoneNumber.message}</p>}
            </div>

            <div>
              <Label>ZIP code</Label>
              <input {...register('zipCode')} maxLength={10} placeholder="94105" className={inputClass} />
              {errors.zipCode && <p className="mt-1.5 text-xs text-red-400">{errors.zipCode.message}</p>}
            </div>

            <div>
              <Label>Employment status</Label>
              <div className="relative">
                <select {...register('employmentStatus')} className={`${inputClass} appearance-none`}>
                  <option value="">Select status</option>
                  <option value="employed">Employed</option>
                  <option value="self-employed">Self-employed</option>
                  <option value="student">Student</option>
                  <option value="retired">Retired</option>
                  <option value="unemployed">Unemployed</option>
                  <option value="other">Other</option>
                </select>
                <ChevronDown size={14} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-text-muted" />
              </div>
              {errors.employmentStatus && <p className="mt-1.5 text-xs text-red-400">{errors.employmentStatus.message}</p>}
            </div>

            <div className="sm:col-span-2">
              <Label>Annual income</Label>
              <div className="relative">
                <select {...register('annualIncome')} className={`${inputClass} appearance-none`}>
                  <option value="">Select range</option>
                  <option value="under-30k">Under $30,000</option>
                  <option value="30k-60k">$30,000 - $60,000</option>
                  <option value="60k-100k">$60,000 - $100,000</option>
                  <option value="100k-150k">$100,000 - $150,000</option>
                  <option value="150k-250k">$150,000 - $250,000</option>
                  <option value="over-250k">Over $250,000</option>
                  <option value="prefer-not">Prefer not to say</option>
                </select>
                <ChevronDown size={14} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-text-muted" />
              </div>
              {errors.annualIncome && <p className="mt-1.5 text-xs text-red-400">{errors.annualIncome.message}</p>}
            </div>

            <div className="sm:col-span-2 flex items-start gap-3 rounded-lg border border-altrion-500/20 bg-altrion-500/5 p-4">
              <Lock size={15} className="mt-0.5 flex-none text-altrion-400" />
              <p className="text-xs leading-5 text-text-muted">
                Your profile details are encrypted and used only to personalize your Altrion experience.
              </p>
            </div>

            {submitError && (
              <div role="alert" className="sm:col-span-2 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
                {submitError}
              </div>
            )}
          </div>

          <div className="flex items-center justify-between border-t border-dark-border bg-dark-elevated/30 px-6 py-5 sm:px-8">
            <button
              type="button"
              onClick={() => navigate(ROUTES.ONBOARDING)}
              className="inline-flex items-center gap-2 text-sm text-text-muted transition-colors hover:text-text-primary"
            >
              <ArrowLeft size={16} />
              Back
            </button>
            <Button type="submit" size="lg" disabled={isSubmitting} loading={isSubmitting}>
              Save and continue
              <ArrowRight size={17} />
            </Button>
          </div>
        </motion.form>

        <p className="mt-5 flex items-center justify-center gap-2 text-xs text-text-muted">
          <ShieldCheck size={14} className="text-altrion-400" />
          You can update these details anytime from your profile.
        </p>
      </main>
    </div>
  );
}
