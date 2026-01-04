import { useEffect } from 'react';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Mail, TrendingUp, Clock, Shield } from 'lucide-react';
import { AuthLayout } from '../../components/layout/AuthLayout';
import { Input, PasswordInput, useToast } from '../../components/ui';
import { useLogin, useOAuthLogin } from '../../hooks';
import { ROUTES } from '../../constants';
import { loginSchema, type LoginFormData } from '../../schemas';
import { useAuthStore, selectError } from '../../store';

export function Login() {
  const { success, error: showError } = useToast();
  const authError = useAuthStore(selectError);
  const clearError = useAuthStore((state) => state.clearError);
  
  const loginMutation = useLogin();
  const oauthMutation = useOAuthLogin();

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: '',
      password: '',
    },
  });

  // Show auth errors as toast
  useEffect(() => {
    if (authError) {
      showError('Login failed', authError);
      clearError();
    }
  }, [authError, showError, clearError]);

  const onSubmit = async (data: LoginFormData) => {
    try {
      await loginMutation.mutateAsync(data);
      success('Welcome back!', 'You have been logged in successfully.');
    } catch {
      // Error is handled by mutation and toast
    }
  };

  const handleOAuthLogin = (provider: 'google' | 'github') => {
    oauthMutation.mutate(provider);
  };

  return (
    <AuthLayout
      title="Welcome back"
      subtitle="Sign in to your account to continue"
    >
      {/* Quick wins - Social proof for returning users */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="mb-4 pb-3 border-b border-dark-border/50"
      >
        <div className="grid grid-cols-3 gap-3 text-center">
          <div className="space-y-1.5">
            <TrendingUp className="w-4 h-4 text-altrion-400 mx-auto" />
            <p className="text-xs text-text-muted font-medium">Real-time<br />tracking</p>
          </div>
          <div className="space-y-1.5">
            <Clock className="w-4 h-4 text-altrion-400 mx-auto" />
            <p className="text-xs text-text-muted font-medium">24/7<br />access</p>
          </div>
          <div className="space-y-1.5">
            <Shield className="w-4 h-4 text-altrion-400 mx-auto" />
            <p className="text-xs text-text-muted font-medium">Secure<br />& private</p>
          </div>
        </div>
      </motion.div>

      <form onSubmit={handleSubmit(onSubmit)}>
        {/* Email Input - Staggered animation */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3, duration: 0.5 }}
          className="mt-4"
        >
          <Input
            label="Email"
            type="email"
            {...register('email')}
            icon={<Mail size={18} />}
            error={errors.email?.message}
          />
        </motion.div>

        {/* Password Input - Staggered animation */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4, duration: 0.5 }}
          className="mt-3"
        >
          <PasswordInput
            label="Password"
            {...register('password')}
            error={errors.password?.message}
          />
        </motion.div>

        {/* Forgot Password - Staggered animation */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5, duration: 0.5 }}
          className="flex items-center justify-end mt-2"
        >
          <a
            href="#"
            className="text-sm text-altrion-400 hover:text-altrion-300 transition-colors font-semibold underline-offset-2 hover:underline"
          >
            Forgot password?
          </a>
        </motion.div>

        {/* Sign In Button - Staggered animation with emphasis */}
        <motion.button
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6, duration: 0.5 }}
          type="submit"
          disabled={isSubmitting || loginMutation.isPending}
          className="w-full h-11 mt-4 bg-altrion-500 hover:bg-altrion-600 active:bg-altrion-700 text-text-primary font-semibold rounded-lg transition-all duration-200 shadow-lg shadow-emerald-500/20 hover:shadow-xl hover:shadow-emerald-500/30 focus:outline-none focus:ring-2 focus:ring-altrion-500 focus:ring-offset-2 focus:ring-offset-dark-bg disabled:opacity-50 disabled:cursor-not-allowed hover:scale-[1.02] active:scale-[0.98]"
        >
          {isSubmitting || loginMutation.isPending ? (
            <div className="flex items-center justify-center gap-2">
              <div className="w-5 h-5 border-2 border-text-primary/30 border-t-text-primary rounded-full animate-spin" />
              <span>Signing in...</span>
            </div>
          ) : (
            'Sign In'
          )}
        </motion.button>

        {/* Divider */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.7, duration: 0.5 }}
          className="flex items-center gap-3 mt-5 mb-4"
        >
          <div className="flex-1 border-t border-dark-border" />
          <span className="text-sm text-text-muted font-medium">
            or continue with
          </span>
          <div className="flex-1 border-t border-dark-border" />
        </motion.div>

        {/* Social Login Buttons */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.8, duration: 0.5 }}
          className="grid grid-cols-2 gap-2"
        >
          <button
            type="button"
            onClick={() => handleOAuthLogin('google')}
            disabled={oauthMutation.isPending}
            className="h-11 bg-dark-card border border-dark-border hover:border-dark-border-hover hover:bg-dark-elevated text-text-primary rounded-lg transition-all duration-200 flex items-center justify-center gap-2.5 font-medium text-[15px] focus:outline-none focus:ring-2 focus:ring-altrion-500/30 hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50"
          >
            <img
              src="https://www.google.com/favicon.ico"
              alt="Google"
              className="w-[18px] h-[18px]"
            />
            Google
          </button>
          <button
            type="button"
            onClick={() => handleOAuthLogin('github')}
            disabled={oauthMutation.isPending}
            className="h-11 bg-dark-card border border-dark-border hover:border-dark-border-hover hover:bg-dark-elevated text-text-primary rounded-lg transition-all duration-200 flex items-center justify-center gap-2.5 font-medium text-[15px] focus:outline-none focus:ring-2 focus:ring-altrion-500/30 hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50"
          >
            <svg className="w-[18px] h-[18px]" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/>
            </svg>
            GitHub
          </button>
        </motion.div>

        {/* Sign Up Link */}
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.9, duration: 0.5 }}
          className="text-center text-text-muted mt-4"
        >
          Don't have an account?{' '}
          <Link
            to={ROUTES.SIGNUP}
            className="text-altrion-400 hover:text-altrion-300 transition-colors font-semibold"
          >
            Sign up
          </Link>
        </motion.p>
      </form>

      {/* Trust indicators */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1, duration: 0.6 }}
        className="mt-4 pt-3 border-t border-dark-border/50 text-center text-xs text-text-muted"
      >
        <p>Your data is encrypted and secured • Trusted by <span className="font-semibold text-altrion-400">10,000+</span> users</p>
      </motion.div>
    </AuthLayout>
  );
}