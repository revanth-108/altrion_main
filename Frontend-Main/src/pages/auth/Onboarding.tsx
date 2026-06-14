import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowRight, BarChart3, Link2, ShieldCheck, Sparkles, TrendingUp } from 'lucide-react';
import { Button, Input } from '../../components/ui';
import { OnboardingHeader } from '../../components/onboarding';
import { authService } from '../../services';
import { selectUser, useAuthStore } from '../../store';
import { onboardingNameSchema, type OnboardingNameFormData } from '../../schemas';
import { ROUTES } from '../../constants';

const FEATURES = [
  { icon: TrendingUp, text: 'Track your complete net worth' },
  { icon: Sparkles, text: 'Get insights tailored to your goals' },
  { icon: Link2, text: 'Connect accounts with read-only access' },
  { icon: BarChart3, text: 'See every asset in one clear dashboard' },
] as const;

export function Onboarding() {
  const navigate = useNavigate();
  const user = useAuthStore(selectUser);
  const { setUser } = useAuthStore();
  const [submitError, setSubmitError] = useState('');

  const suggestedName = useMemo(() => {
    const existing = user?.displayName?.trim();
    if (existing) return existing;
    return user?.name?.trim().split(/\s+/)[0] ?? '';
  }, [user?.displayName, user?.name]);
  const [previewName, setPreviewName] = useState(suggestedName);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<OnboardingNameFormData>({
    resolver: zodResolver(onboardingNameSchema),
    defaultValues: { displayName: suggestedName },
  });

  const displayNameField = register('displayName');
  const displayName = previewName.trim() || 'there';

  const onSubmit = async (data: OnboardingNameFormData) => {
    setSubmitError('');
    try {
      const nickname = data.displayName.trim();
      const updatedUser = await authService.updateNickname(nickname);
      setUser({ ...updatedUser, displayName: updatedUser.displayName || nickname });
      localStorage.setItem('altrion-displayName', nickname);
      navigate(ROUTES.ONBOARDING_DETAILS);
    } catch (error) {
      console.error('Failed to save display name', error);
      setSubmitError(error instanceof Error ? error.message : 'Could not save your name. Please try again.');
    }
  };

  return (
    <div className="min-h-screen bg-dark-bg text-text-primary">
      <OnboardingHeader currentStep={1} />

      <main className="mx-auto grid max-w-6xl gap-12 px-5 py-12 sm:px-8 lg:grid-cols-[0.9fr_1.1fr] lg:items-center lg:py-20">
        <motion.section
          initial={{ opacity: 0, x: -18 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.45 }}
        >
          <span className="inline-flex items-center gap-2 rounded-full border border-altrion-500/30 bg-altrion-500/10 px-3 py-1 text-xs font-semibold text-altrion-400">
            <Sparkles size={13} />
            Welcome to Altrion
          </span>
          <h1 className="mt-5 font-display text-4xl font-bold leading-tight sm:text-5xl">
            Let&apos;s build your
            <span className="block text-gradient-altrion">financial command center.</span>
          </h1>
          <p className="mt-5 max-w-lg text-base leading-7 text-text-secondary">
            Start with the name you want to see across your dashboard, reports, and account experience.
          </p>

          <div className="mt-8 grid gap-3 sm:grid-cols-2">
            {FEATURES.map(({ icon: Icon, text }, index) => (
              <motion.div
                key={text}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.12 + index * 0.06 }}
                className="flex items-center gap-3 rounded-lg border border-dark-border bg-dark-card/60 px-4 py-3"
              >
                <Icon size={16} className="flex-none text-altrion-400" />
                <span className="text-sm text-text-secondary">{text}</span>
              </motion.div>
            ))}
          </div>
        </motion.section>

        <motion.section
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, delay: 0.08 }}
          className="overflow-hidden rounded-lg border border-dark-border bg-dark-card shadow-[0_24px_64px_-20px_rgba(0,0,0,0.6)]"
        >
          <div className="h-px bg-gradient-to-r from-transparent via-altrion-500/70 to-transparent" />
          <form onSubmit={handleSubmit(onSubmit)} className="p-7 sm:p-9" noValidate>
            <p className="text-xs font-semibold uppercase tracking-widest text-altrion-400">
              First, an introduction
            </p>
            <h2 className="mt-3 font-display text-2xl font-bold sm:text-3xl">
              What should we call you?
            </h2>
            <p className="mt-2 text-sm leading-6 text-text-secondary">
              This is your display name. It does not change your legal account information.
            </p>

            <div className="mt-7">
              <Input
                label="Display name"
                placeholder="Your preferred name"
                autoComplete="nickname"
                autoFocus
                {...displayNameField}
                onChange={(event) => {
                  setPreviewName(event.target.value);
                  void displayNameField.onChange(event);
                }}
                error={errors.displayName?.message}
              />
            </div>

            <div className="mt-5 rounded-lg border border-altrion-500/20 bg-altrion-500/5 p-4">
              <p className="text-xs text-text-muted">Dashboard preview</p>
              <p className="mt-1 text-base font-semibold text-text-primary">
                Welcome back, {displayName}
              </p>
            </div>

            {submitError && (
              <div role="alert" className="mt-5 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
                {submitError}
              </div>
            )}

            <div className="mt-7 flex items-center justify-between gap-4 border-t border-dark-border pt-5">
              <span className="inline-flex items-center gap-2 text-xs text-text-muted">
                <ShieldCheck size={14} className="text-altrion-400" />
                Private by default
              </span>
              <Button type="submit" size="lg" disabled={isSubmitting} loading={isSubmitting}>
                Continue
                <ArrowRight size={17} />
              </Button>
            </div>
          </form>
        </motion.section>
      </main>
    </div>
  );
}
