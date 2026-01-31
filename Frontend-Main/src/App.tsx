import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ROUTES } from './constants';
import { ThemeProvider } from './contexts/ThemeContext';
import { QueryProvider, ErrorBoundary } from './components/providers';
import { ProtectedRoute, PublicOnlyRoute, PageSkeleton } from './components/routing';
import { ToastProvider, Footer } from './components/ui';
import { useAuthStore, selectIsAuthenticated } from './store';

// Lazy load pages for code splitting
const Login = lazy(() => import('./pages/auth/Login').then(m => ({ default: m.Login })));
const Signup = lazy(() => import('./pages/auth/Signup').then(m => ({ default: m.Signup })));
const Onboarding = lazy(() => import('./pages/auth/Onboarding').then(m => ({ default: m.Onboarding })));
const SelectWallets = lazy(() => import('./pages/connect/SelectWallets').then(m => ({ default: m.SelectWallets })));
const ConnectAPI = lazy(() => import('./pages/connect/ConnectAPI').then(m => ({ default: m.ConnectAPI })));
const Dashboard = lazy(() => import('./pages/dashboard/Dashboard').then(m => ({ default: m.Dashboard })));
const LoanApplication = lazy(() => import('./pages/dashboard/LoanApplication').then(m => ({ default: m.LoanApplication })));
const LoanReview = lazy(() => import('./pages/dashboard/LoanReview').then(m => ({ default: m.LoanReview })));
const LoanSummary = lazy(() => import('./pages/dashboard/LoanSummary').then(m => ({ default: m.LoanSummary })));
const LoanConfirmation = lazy(() => import('./pages/dashboard/LoanConfirmation').then(m => ({ default: m.LoanConfirmation })));

function RootRedirect() {
  const isAuthenticated = useAuthStore(selectIsAuthenticated);
  return <Navigate to={isAuthenticated ? ROUTES.DASHBOARD : ROUTES.LOGIN} replace />;
}

function AppRoutes() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Routes>
        {/* Auth Routes - Public only (redirect if logged in) */}
        <Route
          path={ROUTES.LOGIN}
          element={
            <PublicOnlyRoute>
              <Login />
            </PublicOnlyRoute>
          }
        />
        <Route
          path={ROUTES.SIGNUP}
          element={
            <PublicOnlyRoute>
              <Signup />
            </PublicOnlyRoute>
          }
        />

        {/* Onboarding - Protected (requires auth) */}
        <Route
          path={ROUTES.ONBOARDING}
          element={
            <ProtectedRoute>
              <Onboarding />
            </ProtectedRoute>
          }
        />

        {/* Connect Routes - Protected */}
        <Route
          path={ROUTES.CONNECT_SELECT}
          element={
            <ProtectedRoute>
              <SelectWallets />
            </ProtectedRoute>
          }
        />
        <Route
          path={ROUTES.CONNECT_API}
          element={
            <ProtectedRoute>
              <ConnectAPI />
            </ProtectedRoute>
          }
        />

        {/* Dashboard - Protected */}
        <Route
          path={ROUTES.DASHBOARD}
          element={
            <ProtectedRoute>
              <Dashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path={ROUTES.LOAN_APPLICATION}
          element={
            <ProtectedRoute>
              <LoanApplication />
            </ProtectedRoute>
          }
        />
        <Route
          path={ROUTES.LOAN_REVIEW}
          element={
            <ProtectedRoute>
              <LoanReview />
            </ProtectedRoute>
          }
        />
        <Route
          path={ROUTES.LOAN_SUMMARY}
          element={
            <ProtectedRoute>
              <LoanSummary />
            </ProtectedRoute>
          }
        />
        <Route
          path={ROUTES.LOAN_CONFIRMATION}
          element={
            <ProtectedRoute>
              <LoanConfirmation />
            </ProtectedRoute>
          }
        />

        {/* Default redirect */}
        <Route path={ROUTES.HOME} element={<RootRedirect />} />
        <Route path="*" element={<RootRedirect />} />
      </Routes>
    </Suspense>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <QueryProvider>
        <ThemeProvider>
          <ToastProvider>
            <BrowserRouter>
              <div className="min-h-screen flex flex-col">
                <main className="flex-1">
                  <AppRoutes />
                </main>
                <Footer />
              </div>
            </BrowserRouter>
          </ToastProvider>
        </ThemeProvider>
      </QueryProvider>
    </ErrorBoundary>
  );
}

export default App;
