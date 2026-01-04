export const ROUTES = {
  // Auth routes
  LOGIN: '/login',
  SIGNUP: '/signup',
  ONBOARDING: '/onboarding',

  // Connect routes
  CONNECT_SELECT: '/connect/select',
  CONNECT_API: '/connect/api',

  // App routes
  DASHBOARD: '/dashboard',
  LOAN_APPLICATION: '/dashboard/loan',
  LOAN_REVIEW: '/dashboard/loan/review',
  LOAN_SUMMARY: '/dashboard/loan/summary',
  LOAN_CONFIRMATION: '/dashboard/loan/confirmation',

  // Default
  HOME: '/',
} as const;
