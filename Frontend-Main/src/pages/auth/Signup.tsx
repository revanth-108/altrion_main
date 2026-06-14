import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { useForm as useReactHookForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Mail, User, Check, Shield, Users, Zap } from 'lucide-react';
import { AuthLayout } from '../../components/layout/AuthLayout';
import { Button, Input, PasswordInput } from '../../components/ui';
import { useOAuthLogin, useSignup } from '../../hooks';
import { useToast } from '../../components/ui';
import { getPasswordRequirements } from '../../utils';
import { ROUTES } from '../../constants';
import { signupSchema, type SignupFormData } from '../../schemas';

export function Signup() {
  const { success, error: showError } = useToast();

  const signupMutation = useSignup();
  const oauthMutation = useOAuthLogin();

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useReactHookForm<SignupFormData>({
    resolver: zodResolver(signupSchema),
    defaultValues: {
      name: '',
      email: '',
      password: '',
      confirmPassword: '',
    },
  });

  const password = watch('password', '');
  const confirmPassword = watch('confirmPassword', '');

  const passwordRequirements = getPasswordRequirements(password, confirmPassword);

  const onSubmit = async (data: SignupFormData) => {
    try {
      const result = await signupMutation.mutateAsync(data);
      if (result.emailVerificationRequired || !result.tokens?.accessToken) {
        success('Check your email', 'We sent you a verification link. Confirm your email, then sign in.');
        return;
      }
      success('Welcome!', 'Your account has been created successfully.');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Signup failed';
      showError('Signup failed', message);
    }
  };

  const handleGoogleSignup = () => {
    oauthMutation.mutate();
  };

  // Calculate progress for Zeigarnik effect (encourages completion)
  const name = watch('name', '');
  const email = watch('email', '');

  const completionProgress = [
    name.length > 0,
    email.length > 0,
    passwordRequirements.every(r => r.met),
  ].filter(Boolean).length;
  const totalFields = 3;
  const progressPercentage = (completionProgress / totalFields) * 100;

  return (
    <AuthLayout
      title="Create your account"
    >
      {/* Social Proof - Anchoring effect */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="flex flex-wrap items-center justify-center gap-3 sm:gap-5 mb-3 pb-3 border-b border-dark-border/50"
      >
        <div className="flex items-center gap-2 text-xs">
          <Users className="w-3.5 h-3.5 text-altrion-400" />
          <span className="text-text-secondary">
            <span className="text-altrion-400 font-bold">10,000+</span> users
          </span>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <Shield className="w-3.5 h-3.5 text-altrion-400" />
          <span className="text-text-secondary font-medium">Bank-level security</span>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <Zap className="w-3.5 h-3.5 text-altrion-400" />
          <span className="text-text-secondary"><span className="font-bold">2</span>-min setup</span>
        </div>
      </motion.div>

      {/* Progress indicator - Zeigarnik effect to encourage completion */}
      {completionProgress > 0 && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          className="mb-5"
        >
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs text-text-muted">
              {completionProgress === totalFields ? 'Ready to sign up!' : `${completionProgress} of ${totalFields} steps completed`}
            </span>
            <span className="text-xs font-bold text-altrion-400">{Math.round(progressPercentage)}%</span>
          </div>
          <div className="progress-bar">
            <div className="progress-bar-fill" style={{ width: `${progressPercentage}%` }} />
          </div>
        </motion.div>
      )}

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-2.5 sm:space-y-3">
        {/* Staggered animations for form fields */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3, duration: 0.5 }}
        >
          <Input
            label="Full Name"
            type="text"
            {...register('name')}
            icon={<User size={18} />}
            error={errors.name?.message}
          />
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4, duration: 0.5 }}
        >
          <Input
            label="Email"
            type="email"
            {...register('email')}
            icon={<Mail size={18} />}
            error={errors.email?.message}
          />
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5, duration: 0.5 }}
        >
          <PasswordInput
            label="Password"
            {...register('password')}
            error={errors.password?.message}
          />
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6, duration: 0.5 }}
        >
          <PasswordInput
            label="Confirm Password"
            {...register('confirmPassword')}
            error={errors.confirmPassword?.message}
          />
        </motion.div>

        {/* Password requirements */}
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: password ? 1 : 0, height: password ? 'auto' : 0 }}
          className="space-y-1.5 overflow-hidden pb-3"
        >
          {passwordRequirements.map((req, index) => (
            <motion.div
              key={req.label}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: index * 0.1 }}
              className="flex items-center gap-2 text-xs"
            >
              <div
                className={`w-3.5 h-3.5 rounded-full flex items-center justify-center transition-colors ${
                  req.met ? 'bg-altrion-500' : 'bg-dark-border'
                }`}
              >
                {req.met && <Check size={10} className="text-text-primary" />}
              </div>
              <span className={req.met ? 'text-text-primary' : 'text-text-muted'}>
                {req.label}
              </span>
            </motion.div>
          ))}
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.7, duration: 0.5 }}
          className="py-0.5 -mt-[0.8125rem]"
        >
          <div className="flex items-center justify-center gap-2">
            <input
              type="checkbox"
              id="terms"
              required
              className="w-3.5 h-3.5 rounded border-dark-border bg-dark-input text-altrion-500 focus:ring-altrion-500 flex-shrink-0"
            />
            <label htmlFor="terms" className="text-xs text-text-secondary cursor-pointer leading-snug">
              I agree to the{' '}
              <a href="#" className="text-altrion-400 hover:text-altrion-300 underline-offset-2 hover:underline transition-all">Terms of Service</a>
              {' '}and{' '}
              <a href="#" className="text-altrion-400 hover:text-altrion-300 underline-offset-2 hover:underline transition-all">Privacy Policy</a>
            </label>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.8, duration: 0.5 }}
        >
          <Button
            type="submit"
            fullWidth
            size="lg"
            loading={isSubmitting || signupMutation.isPending}
            disabled={!passwordRequirements.every(r => r.met) || isSubmitting || signupMutation.isPending}
          >
            Create Account
          </Button>
        </motion.div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.85, duration: 0.5 }}
          className="flex items-center gap-3 mt-4 mb-1"
        >
          <div className="flex-1 border-t border-dark-border" />
          <span className="text-sm text-text-muted font-medium">or continue with</span>
          <div className="flex-1 border-t border-dark-border" />
        </motion.div>

        <motion.button
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.9, duration: 0.5 }}
          type="button"
          onClick={handleGoogleSignup}
          disabled={oauthMutation.isPending}
          className="h-10 sm:h-11 bg-dark-card border border-dark-border hover:border-dark-border-hover hover:bg-dark-elevated text-text-primary rounded-lg transition-all duration-200 flex items-center justify-center gap-2 font-medium text-sm sm:text-[15px] focus:outline-none focus:ring-2 focus:ring-altrion-500/30 hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 w-full"
        >
          <img
            src="https://www.google.com/favicon.ico"
            alt="Google"
            className="w-4 h-4 sm:w-[18px] sm:h-[18px]"
          />
          Google
        </motion.button>

        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1, duration: 0.5 }}
          className="text-center text-text-secondary text-sm pt-2"
        >
          Already have an account?{' '}
          <Link to={ROUTES.LOGIN} className="text-altrion-400 hover:text-altrion-300 transition-colors font-semibold">
            Sign in
          </Link>
        </motion.p>
      </form>

      {/* Trust indicators at bottom */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1, duration: 0.6 }}
        className="mt-4 pt-3 border-t border-dark-border/50 text-center text-xs text-text-muted"
      >
        <p>Your data is encrypted and secured • Trusted by <span className="text-altrion-400 font-bold">10,000+</span> users</p>
      </motion.div>
    </AuthLayout>
  );
}
