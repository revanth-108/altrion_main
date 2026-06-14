import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { AuthLayout } from '@/components/layout/AuthLayout';
import { Button, PasswordInput, useToast } from '@/components/ui';
import { authService } from '@/services';
import { useAuthStore } from '@/store';
import { ROUTES } from '@/constants';
import { resetPasswordSchema, type ResetPasswordFormData } from '@/schemas';

type CallbackState = 'loading' | 'error' | 'recovery';

export function OAuthCallback() {
  const navigate = useNavigate();
  const { login: storeLogin } = useAuthStore();
  const { success, error: showError } = useToast();
  const [state, setState] = useState<CallbackState>('loading');
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [recoveryTokens, setRecoveryTokens] = useState<{ accessToken: string; refreshToken: string } | null>(null);
  const queryParams = useMemo(() => new URLSearchParams(window.location.search), []);

  const hashParams = useMemo(() => {
    const hash = window.location.hash.startsWith('#')
      ? window.location.hash.slice(1)
      : window.location.hash;
    return new URLSearchParams(hash);
  }, []);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ResetPasswordFormData>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: {
      password: '',
      confirmPassword: '',
    },
  });

  useEffect(() => {
    const run = async () => {
      const code = queryParams.get('code');
      const queryError = queryParams.get('error_description') || queryParams.get('error');
      const accessToken = hashParams.get('access_token');
      const refreshToken = hashParams.get('refresh_token');
      const callbackType = hashParams.get('type');
      const oauthError = hashParams.get('error_description') || hashParams.get('error');

      if (queryError) {
        setState('error');
        setErrorMessage(decodeURIComponent(queryError));
        return;
      }

      if (code) {
        try {
          await authService.exchangeOAuthCode(code);
          return;
        } catch (error) {
          setState('error');
          setErrorMessage(error instanceof Error ? error.message : 'OAuth sign-in failed');
          return;
        }
      }

      if (oauthError) {
        setState('error');
        setErrorMessage(decodeURIComponent(oauthError));
        return;
      }

      if (!accessToken || !refreshToken) {
        setState('error');
        setErrorMessage('Missing OAuth tokens from callback.');
        return;
      }

      if (callbackType === 'recovery') {
        setRecoveryTokens({ accessToken, refreshToken });
        setState('recovery');
        return;
      }

      try {
        const auth = await authService.completeOAuth({
          accessToken,
          refreshToken,
        });

        if (!auth.tokens?.accessToken) {
          setState('error');
          setErrorMessage('OAuth completed but app session token is missing.');
          return;
        }

        storeLogin(auth.user, auth.tokens.accessToken);
        navigate(ROUTES.DASHBOARD, { replace: true });
      } catch (error) {
        setState('error');
        setErrorMessage(error instanceof Error ? error.message : 'OAuth sign-in failed');
      }
    };

    run();
  }, [hashParams, navigate, queryParams, storeLogin]);

  const onResetPassword = async (data: ResetPasswordFormData) => {
    if (!recoveryTokens) {
      showError('Reset failed', 'Recovery session expired. Request a new reset email.');
      return;
    }

    try {
      const auth = await authService.resetPassword({
        accessToken: recoveryTokens.accessToken,
        refreshToken: recoveryTokens.refreshToken,
        password: data.password,
      });

      if (!auth.tokens?.accessToken) {
        showError('Reset failed', 'Password updated but app session token is missing.');
        navigate(ROUTES.LOGIN, { replace: true });
        return;
      }

      storeLogin(auth.user, auth.tokens.accessToken);
      success('Password updated', 'You are signed in with your new password.');
      navigate(ROUTES.DASHBOARD, { replace: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Password reset failed';
      showError('Reset failed', message);
    }
  };

  if (state === 'loading') {
    return (
      <AuthLayout title="Signing you in...">
        <p className="text-center text-text-secondary">Completing your login.</p>
      </AuthLayout>
    );
  }

  if (state === 'recovery') {
    return (
      <AuthLayout title="Choose a new password">
        <form onSubmit={handleSubmit(onResetPassword)} className="space-y-4">
          <PasswordInput
            label="New password"
            {...register('password')}
            error={errors.password?.message}
          />
          <PasswordInput
            label="Confirm password"
            {...register('confirmPassword')}
            error={errors.confirmPassword?.message}
          />
          <Button type="submit" fullWidth disabled={isSubmitting}>
            {isSubmitting ? 'Updating password...' : 'Update password'}
          </Button>
        </form>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title="OAuth failed">
      <p className="text-center text-red-400 text-sm mb-4">{errorMessage}</p>
      <Button fullWidth onClick={() => navigate(ROUTES.LOGIN, { replace: true })}>
        Back to Login
      </Button>
    </AuthLayout>
  );
}
