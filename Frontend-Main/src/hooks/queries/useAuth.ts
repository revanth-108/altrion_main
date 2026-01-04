import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { authService } from '@/services';
import { useAuthStore } from '@/store';
import { ROUTES } from '@/constants';
import type { LoginFormData, SignupFormData } from '@/schemas';

export const authKeys = {
  all: ['auth'] as const,
  user: () => [...authKeys.all, 'user'] as const,
};

export function useLogin() {
  const navigate = useNavigate();
  const { login: storeLogin, setLoading, setError } = useAuthStore();

  return useMutation({
    mutationFn: (credentials: LoginFormData) => authService.login(credentials),
    onMutate: () => {
      setLoading(true);
      setError(null);
    },
    onSuccess: (data) => {
      storeLogin(data.user, data.tokens.accessToken);
      navigate(ROUTES.DASHBOARD);
    },
    onError: (error: Error) => {
      setError(error.message);
    },
    onSettled: () => {
      setLoading(false);
    },
  });
}

export function useSignup() {
  const navigate = useNavigate();
  const { login: storeLogin, setLoading, setError } = useAuthStore();

  return useMutation({
    mutationFn: (data: SignupFormData) => authService.signup(data),
    onMutate: () => {
      setLoading(true);
      setError(null);
    },
    onSuccess: (data) => {
      storeLogin(data.user, data.tokens.accessToken);
      // Use replace to prevent PublicOnlyRoute from interfering
      // Navigate with state to indicate this is a fresh signup
      navigate(ROUTES.ONBOARDING, { replace: true });
    },
    onError: (error: Error) => {
      setError(error.message);
    },
    onSettled: () => {
      setLoading(false);
    },
  });
}

export function useLogout() {
  const navigate = useNavigate();
  const { logout: storeLogout } = useAuthStore();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => authService.logout(),
    onSuccess: () => {
      storeLogout();
      queryClient.clear();
      // Clear onboarding data on logout
      localStorage.removeItem('altrion-displayName');
      localStorage.removeItem('altrion-connected-accounts');
      navigate(ROUTES.LOGIN);
    },
  });
}

export function useForgotPassword() {
  return useMutation({
    mutationFn: (email: string) => authService.forgotPassword(email),
  });
}

export function useOAuthLogin() {
  return useMutation({
    mutationFn: (provider: 'google' | 'github') => authService.oauthLogin(provider),
    onSuccess: (url) => {
      // Redirect to OAuth provider
      window.location.href = url;
    },
  });
}
