// State Management Rules:
// - Zustand authStore   → Auth session persistence (user, token, isAuthenticated)
// - Zustand loanStore   → Client-only loan draft data (persisted to localStorage)
// - React Query         → ALL server data (portfolio, platforms, loan calculations)
// - Local useState      → Ephemeral UI state (modals, dropdowns, form values)

export { useAuthStore, selectUser, selectIsAuthenticated } from './authStore';
export { useLoanStore, selectApplications, selectActiveLoan, selectPendingApplications, selectActiveLoans } from './loanStore';
export { default as useSubscriptionStore } from './subscriptionStore';
export type { LoanApplication, LoanAsset } from './loanStore';
