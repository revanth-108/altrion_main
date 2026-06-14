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
  const { login: storeLogin, setJustSignedUp } = useAuthStore();

  return useMutation({
    mutationFn: (credentials: LoginFormData) => authService.login(credentials),
    onSuccess: (data) => {
      if (!data.tokens?.accessToken) {
        navigate(ROUTES.LOGIN, { replace: true });
        return;
      }
      storeLogin(data.user, data.tokens.accessToken);
      const pendingOnboardingEmail = localStorage.getItem('altrion:pendingOnboardingEmail');
      if (pendingOnboardingEmail === data.user.email.trim().toLowerCase()) {
        localStorage.removeItem('altrion:pendingOnboardingEmail');
        setJustSignedUp(true);
        navigate(ROUTES.ONBOARDING, { replace: true });
        return;
      }
      navigate(ROUTES.DASHBOARD);
    },
  });
}

export function useSignup() {
  const navigate = useNavigate();
  const { login: storeLogin, setJustSignedUp } = useAuthStore();

  return useMutation({
    mutationFn: (data: SignupFormData) => authService.signup(data),
    onSuccess: (data) => {
      setJustSignedUp(true);

      if (data.emailVerificationRequired || !data.tokens?.accessToken) {
        localStorage.setItem(
          'altrion:pendingOnboardingEmail',
          data.user.email.trim().toLowerCase(),
        );
        navigate(ROUTES.LOGIN, {
          replace: true,
          state: {
            emailVerificationRequired: true,
            email: data.user.email,
          },
        });
        return;
      }

      storeLogin(data.user, data.tokens.accessToken);
      navigate(ROUTES.ONBOARDING, { replace: true });
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
    mutationFn: () => authService.oauthLogin('google'),
    onSuccess: (url) => {
      window.location.href = url;
    },
  });
}
