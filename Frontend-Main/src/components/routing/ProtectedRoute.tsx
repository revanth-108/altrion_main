import { Navigate, useLocation } from 'react-router-dom';
import { useAuthStore, selectIsAuthenticated } from '@/store';
import { ROUTES } from '@/constants';
import type { ReactNode } from 'react';

interface ProtectedRouteProps {
  children: ReactNode;
  redirectTo?: string;
}

/**
 * Protected Route wrapper that redirects to login if user is not authenticated
 */
export function ProtectedRoute({
  children,
  redirectTo = ROUTES.LOGIN,
}: ProtectedRouteProps) {
  const isAuthenticated = useAuthStore(selectIsAuthenticated);
  const location = useLocation();

  if (!isAuthenticated) {
    // Redirect to login with return URL
    return (
      <Navigate
        to={redirectTo}
        state={{ from: location.pathname }}
        replace
      />
    );
  }

  return <>{children}</>;
}

interface PublicOnlyRouteProps {
  children: ReactNode;
  redirectTo?: string;
}

/**
 * Public-only Route wrapper that redirects to dashboard if user is already authenticated
 * Useful for login/signup pages
 */
export function PublicOnlyRoute({
  children,
  redirectTo = ROUTES.DASHBOARD,
}: PublicOnlyRouteProps) {
  const isAuthenticated = useAuthStore(selectIsAuthenticated);
  const justSignedUp = useAuthStore((state) => state.justSignedUp);
  const location = useLocation();

  if (isAuthenticated) {
    if (justSignedUp) {
      return <Navigate to={ROUTES.ONBOARDING} replace />;
    }
    // Check if there's a return URL in state
    const from = (location.state as { from?: string })?.from;

    return <Navigate to={from || redirectTo} replace />;
  }

  return <>{children}</>;
}
