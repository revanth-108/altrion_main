import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { useLocation } from 'react-router-dom';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Mail, TrendingUp, Clock, Shield } from 'lucide-react';
import { AuthLayout } from '../../components/layout/AuthLayout';
import { Input, PasswordInput, useToast } from '../../components/ui';
import { useLogin, useOAuthLogin } from '../../hooks';
import { authService } from '../../services';
import { ROUTES } from '../../constants';
import { loginSchema, type LoginFormData } from '../../schemas';

export function Login() {
  const { success, error: showError } = useToast();
  const location = useLocation();
  const [isResendingVerification, setIsResendingVerification] = useState(false);
  const [isSendingPasswordReset, setIsSendingPasswordReset] = useState(false);
  const [verificationPromptEmail, setVerificationPromptEmail] = useState('');
  const [showVerificationPrompt, setShowVerificationPrompt] = useState(false);

  const loginMutation = useLogin();
  const oauthMutation = useOAuthLogin();
  const loginState = location.state as { emailVerificationRequired?: boolean; email?: string } | null;

  const {
    register,
    handleSubmit,
    getValues,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: '',
      password: '',
    },
  });

  const onSubmit = async (data: LoginFormData) => {
    setShowVerificationPrompt(false);
    try {
      await loginMutation.mutateAsync(data);
      success('Welcome back!', 'You have been logged in successfully.');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Login failed';
      if (message.toLowerCase().includes('verify your email')) {
        setVerificationPromptEmail(data.email.trim().toLowerCase());
        setShowVerificationPrompt(true);
      }
      showError('Login failed', message);
    }
  };

  const handleOAuthLogin = () => {
    oauthMutation.mutate();
  };

  const verificationEmail = loginState?.email || verificationPromptEmail;
  const shouldShowVerificationPrompt = !!loginState?.emailVerificationRequired || showVerificationPrompt;

  const handleForgotPassword = async (event: React.MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault();
    const email = getValues('email').trim().toLowerCase();
    if (!email) {
      showError('Email required', 'Enter your email above, then choose Forgot password.');
      return;
    }

    try {
      setIsSendingPasswordReset(true);
      await authService.forgotPassword(email);
      success('Password reset sent', 'Check your inbox for reset instructions.');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to send password reset email';
      showError('Password reset failed', message);
    } finally {
      setIsSendingPasswordReset(false);
    }
  };

  const handleResendVerification = async () => {
    if (!verificationEmail) return;
    try {
      setIsResendingVerification(true);
      await authService.resendVerification(verificationEmail);
      success('Verification email sent', 'Check your inbox and spam folder.');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to resend verification email';
      showError('Resend failed', message);
    } finally {
      setIsResendingVerification(false);
    }
  };

  return (
    <AuthLayout
      title="Welcome back"
    >
      {/* Quick wins - Social proof for returning users */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="mb-3 pb-3 border-b border-dark-border/50"
      >
        <div className="flex items-center justify-center gap-4 sm:gap-6">
          <div className="flex items-center gap-1.5">
            <TrendingUp className="w-3.5 h-3.5 text-altrion-400" />
            <p className="text-[11px] sm:text-xs text-text-muted font-medium">Real-time</p>
          </div>
          <div className="flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5 text-altrion-400" />
            <p className="text-[11px] sm:text-xs text-text-muted font-medium">24/7 access</p>
          </div>
          <div className="flex items-center gap-1.5">
            <Shield className="w-3.5 h-3.5 text-altrion-400" />
            <p className="text-[11px] sm:text-xs text-text-muted font-medium">Secure</p>
          </div>
        </div>
      </motion.div>

      {shouldShowVerificationPrompt && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-300"
        >
          <p>Please verify your email first{verificationEmail ? ` (${verificationEmail})` : ''}, then sign in.</p>
          {verificationEmail && (
            <button
              type="button"
              onClick={handleResendVerification}
              disabled={isResendingVerification}
              className="mt-1 text-xs underline underline-offset-2 hover:text-emerald-200 disabled:opacity-60"
            >
              {isResendingVerification ? 'Resending...' : 'Resend verification email'}
            </button>
          )}
        </motion.div>
      )}

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
            onClick={handleForgotPassword}
            className="text-sm text-altrion-400 hover:text-altrion-300 transition-colors font-semibold underline-offset-2 hover:underline"
            aria-disabled={isSendingPasswordReset}
          >
            {isSendingPasswordReset ? 'Sending reset email...' : 'Forgot password?'}
          </a>
        </motion.div>

        {/* Sign In Button - Staggered animation with emphasis */}
        <motion.button
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6, duration: 0.5 }}
          type="submit"
          disabled={isSubmitting || loginMutation.isPending}
          className="w-full h-10 sm:h-11 mt-4 bg-altrion-500 hover:bg-altrion-600 active:bg-altrion-700 text-text-primary font-semibold rounded-lg transition-all duration-200 shadow-lg shadow-emerald-500/20 hover:shadow-xl hover:shadow-emerald-500/30 focus:outline-none focus:ring-2 focus:ring-altrion-500 focus:ring-offset-2 focus:ring-offset-dark-bg disabled:opacity-50 disabled:cursor-not-allowed hover:scale-[1.02] active:scale-[0.98]"
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

        {/* Social Login Button */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.8, duration: 0.5 }}
          className="grid grid-cols-1 gap-2"
        >
          <button
            type="button"
            onClick={handleOAuthLogin}
            disabled={oauthMutation.isPending}
            className="h-10 sm:h-11 bg-dark-card border border-dark-border hover:border-dark-border-hover hover:bg-dark-elevated text-text-primary rounded-lg transition-all duration-200 flex items-center justify-center gap-2 font-medium text-sm sm:text-[15px] focus:outline-none focus:ring-2 focus:ring-altrion-500/30 hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50"
          >
            <img
              src="https://www.google.com/favicon.ico"
              alt="Google"
              className="w-4 h-4 sm:w-[18px] sm:h-[18px]"
            />
            Google
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
