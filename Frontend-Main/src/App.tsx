import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { ROUTES } from './constants';
import { ThemeProvider } from './contexts/ThemeContext';
import { QueryProvider, ErrorBoundary } from './components/providers';
import { PublicOnlyRoute, UserOnlyRoute, PageSkeleton } from './components/routing';
import { ToastProvider, Footer } from './components/ui';
import { useAuthStore, selectIsAuthenticated } from './store';
import { PageEngagementTracker } from './components/analytics/PageEngagementTracker';

const Login = lazy(() => import('./pages/auth/Login').then((m) => ({ default: m.Login })));
const Signup = lazy(() => import('./pages/auth/Signup').then((m) => ({ default: m.Signup })));
const OAuthCallback = lazy(() => import('./pages/auth/OAuthCallback').then((m) => ({ default: m.OAuthCallback })));
const Onboarding = lazy(() => import('./pages/auth/Onboarding').then((m) => ({ default: m.Onboarding })));
const OnboardingDetails = lazy(() => import('./pages/auth/OnboardingDetails').then((m) => ({ default: m.OnboardingDetails })));
const OnboardingDateOfBirth = lazy(() => import('./pages/auth/OnboardingProfile').then((m) => ({ default: m.OnboardingDateOfBirth })));
const OnboardingAnnualIncome = lazy(() => import('./pages/auth/OnboardingProfile').then((m) => ({ default: m.OnboardingAnnualIncome })));
const OnboardingIncomeSource = lazy(() => import('./pages/auth/OnboardingProfile').then((m) => ({ default: m.OnboardingIncomeSource })));
const OnboardingUpload = lazy(() => import('./pages/auth/OnboardingUpload').then((m) => ({ default: m.OnboardingUpload })));
const OnboardingTerms = lazy(() => import('./pages/auth/OnboardingTerms').then((m) => ({ default: m.OnboardingTerms })));
const OnboardingPayment = lazy(() => import('./pages/auth/OnboardingPayment').then((m) => ({ default: m.OnboardingPayment })));
const OnboardingComplete = lazy(() => import('./pages/auth/OnboardingComplete').then((m) => ({ default: m.OnboardingComplete })));
const SelectWallets = lazy(() => import('./pages/connect/SelectWallets').then((m) => ({ default: m.SelectWallets })));
const ConnectAPI = lazy(() => import('./pages/connect/ConnectAPI').then((m) => ({ default: m.ConnectAPI })));
const ConnectCrypto = lazy(() => import('./pages/connect/ConnectCrypto').then((m) => ({ default: m.ConnectCrypto })));
const Dashboard = lazy(() => import('./pages/dashboard/Dashboard').then((m) => ({ default: m.Dashboard })));
const Accounts = lazy(() => import('./pages/dashboard/Accounts').then((m) => ({ default: m.Accounts })));
const AccountDetail = lazy(() => import('./pages/dashboard/AccountDetail').then((m) => ({ default: m.AccountDetail })));
const LoanApplication = lazy(() => import('./pages/dashboard/LoanApplication').then((m) => ({ default: m.LoanApplication })));
const LoanReview = lazy(() => import('./pages/dashboard/LoanReview').then((m) => ({ default: m.LoanReview })));
const LoanSummary = lazy(() => import('./pages/dashboard/LoanSummary').then((m) => ({ default: m.LoanSummary })));
const LoanConfirmation = lazy(() => import('./pages/dashboard/LoanConfirmation').then((m) => ({ default: m.LoanConfirmation })));
const Profile = lazy(() => import('./pages/dashboard/Profile').then((m) => ({ default: m.Profile })));
const LoanDetail = lazy(() => import('./pages/dashboard/LoanDetail').then((m) => ({ default: m.LoanDetail })));
const AssetDetail = lazy(() => import('./pages/dashboard/AssetDetail').then((m) => ({ default: m.AssetDetail })));
const Budget = lazy(() => import('./pages/dashboard/Budget').then((m) => ({ default: m.Budget })));
const CashFlowOverview = lazy(() => import('./pages/dashboard/CashFlowOverview').then((m) => ({ default: m.CashFlowOverview })));
const Transactions = lazy(() => import('./pages/dashboard/Transactions').then((m) => ({ default: m.Transactions })));
const Liabilities = lazy(() => import('./pages/dashboard/Liabilities').then((m) => ({ default: m.Liabilities })));
const Recurring = lazy(() => import('./pages/dashboard/Recurring').then((m) => ({ default: m.Recurring })));
const Pricing = lazy(() => import('./pages/Pricing').then((m) => ({ default: m.default })));
const SubscriptionSuccess = lazy(() => import('./pages/SubscriptionSuccess').then((m) => ({ default: m.default })));
const ManageSubscription = lazy(() => import('./pages/ManageSubscription').then((m) => ({ default: m.default })));
const WorthIt = lazy(() => import('./pages/WorthIt').then((m) => ({ default: m.WorthIt })));
const WorthItHistory = lazy(() => import('./pages/WorthItHistory').then((m) => ({ default: m.WorthItHistory })));
const WorthItSessionInsights = lazy(() => import('./pages/WorthItSessionInsights').then((m) => ({ default: m.WorthItSessionInsights })));
const MonteCarlo = lazy(() => import('./pages/dashboard/MonteCarlo').then((m) => ({ default: m.MonteCarlo })));
const PortfolioXRay = lazy(() => import('./pages/dashboard/PortfolioXRay').then((m) => ({ default: m.PortfolioXRay })));
const ResearchLab = lazy(() => import('./pages/dashboard/ResearchLab').then((m) => ({ default: m.ResearchLab })));
const FinancialAnalysis = lazy(() => import('./pages/dashboard/FinancialAnalysis').then((m) => ({ default: m.FinancialAnalysis })));

function RootRedirect() {
  const isAuthenticated = useAuthStore(selectIsAuthenticated);
  if (!isAuthenticated) return <Navigate to={ROUTES.LOGIN} replace />;
  return <Navigate to={ROUTES.DASHBOARD} replace />;
}

function AppRoutes() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Routes>
        <Route path={ROUTES.LOGIN} element={<PublicOnlyRoute><Login /></PublicOnlyRoute>} />
        <Route path={ROUTES.SIGNUP} element={<PublicOnlyRoute><Signup /></PublicOnlyRoute>} />
        <Route path={ROUTES.AUTH_CALLBACK} element={<OAuthCallback />} />
        <Route path={ROUTES.ONBOARDING} element={<UserOnlyRoute><Onboarding /></UserOnlyRoute>} />
        <Route path={ROUTES.ONBOARDING_DETAILS} element={<UserOnlyRoute><OnboardingDetails /></UserOnlyRoute>} />
        <Route path={ROUTES.ONBOARDING_DOB} element={<UserOnlyRoute><OnboardingDateOfBirth /></UserOnlyRoute>} />
        <Route path={ROUTES.ONBOARDING_INCOME} element={<UserOnlyRoute><OnboardingAnnualIncome /></UserOnlyRoute>} />
        <Route path={ROUTES.ONBOARDING_INCOME_SOURCE} element={<UserOnlyRoute><OnboardingIncomeSource /></UserOnlyRoute>} />
        <Route path={ROUTES.ONBOARDING_UPLOAD} element={<UserOnlyRoute><OnboardingUpload /></UserOnlyRoute>} />
        <Route path={ROUTES.ONBOARDING_TERMS} element={<UserOnlyRoute><OnboardingTerms /></UserOnlyRoute>} />
        <Route path={ROUTES.ONBOARDING_PAYMENT} element={<UserOnlyRoute><OnboardingPayment /></UserOnlyRoute>} />
        <Route path={ROUTES.ONBOARDING_COMPLETE} element={<UserOnlyRoute><OnboardingComplete /></UserOnlyRoute>} />
        <Route path={ROUTES.CONNECT_SELECT} element={<UserOnlyRoute><SelectWallets /></UserOnlyRoute>} />
        <Route path={ROUTES.CONNECT_API} element={<UserOnlyRoute><ConnectAPI /></UserOnlyRoute>} />
        <Route path={ROUTES.CONNECT_CRYPTO} element={<UserOnlyRoute><ConnectCrypto /></UserOnlyRoute>} />
        <Route path={ROUTES.DASHBOARD} element={<UserOnlyRoute><Dashboard /></UserOnlyRoute>} />
        <Route path={ROUTES.ACCOUNTS} element={<UserOnlyRoute><Accounts /></UserOnlyRoute>} />
        <Route path={ROUTES.ACCOUNT_DETAIL} element={<UserOnlyRoute><AccountDetail /></UserOnlyRoute>} />
        <Route path={ROUTES.PROFILE} element={<UserOnlyRoute><Profile /></UserOnlyRoute>} />
        <Route path={ROUTES.TRANSACTIONS} element={<UserOnlyRoute><Transactions /></UserOnlyRoute>} />
        <Route path={ROUTES.LIABILITIES} element={<UserOnlyRoute><Liabilities /></UserOnlyRoute>} />
        <Route path={ROUTES.RECURRING} element={<UserOnlyRoute><Recurring /></UserOnlyRoute>} />
        <Route path={ROUTES.LOAN_DETAIL} element={<UserOnlyRoute><LoanDetail /></UserOnlyRoute>} />
        <Route path={ROUTES.BUDGET} element={<UserOnlyRoute><Budget /></UserOnlyRoute>} />
        <Route path={ROUTES.OVERVIEW} element={<UserOnlyRoute><CashFlowOverview /></UserOnlyRoute>} />
        <Route path={ROUTES.ASSET_DETAIL} element={<UserOnlyRoute><AssetDetail /></UserOnlyRoute>} />
        <Route path={ROUTES.LOAN_APPLICATION} element={<UserOnlyRoute><LoanApplication /></UserOnlyRoute>} />
        <Route path={ROUTES.LOAN_REVIEW} element={<UserOnlyRoute><LoanReview /></UserOnlyRoute>} />
        <Route path={ROUTES.LOAN_SUMMARY} element={<UserOnlyRoute><LoanSummary /></UserOnlyRoute>} />
        <Route path={ROUTES.LOAN_CONFIRMATION} element={<UserOnlyRoute><LoanConfirmation /></UserOnlyRoute>} />
        <Route path={ROUTES.PRICING} element={<Pricing />} />
        <Route path={ROUTES.SUBSCRIPTION} element={<UserOnlyRoute><ManageSubscription /></UserOnlyRoute>} />
        <Route path={ROUTES.SUBSCRIPTION_SUCCESS} element={<UserOnlyRoute><SubscriptionSuccess /></UserOnlyRoute>} />
        <Route path={ROUTES.WORTH_IT} element={<UserOnlyRoute><WorthIt /></UserOnlyRoute>} />
        <Route path={ROUTES.WORTH_IT_HISTORY} element={<UserOnlyRoute><WorthItHistory /></UserOnlyRoute>} />
        <Route path={ROUTES.WORTH_IT_SESSION_INSIGHTS} element={<UserOnlyRoute><WorthItSessionInsights /></UserOnlyRoute>} />
        <Route path={ROUTES.MONTE_CARLO} element={<UserOnlyRoute><MonteCarlo /></UserOnlyRoute>} />
        <Route path={ROUTES.PORTFOLIO_XRAY} element={<UserOnlyRoute><PortfolioXRay /></UserOnlyRoute>} />
        <Route path={ROUTES.RESEARCH_LAB} element={<UserOnlyRoute><ResearchLab /></UserOnlyRoute>} />
        <Route path={ROUTES.FINANCIAL_ANALYSIS} element={<UserOnlyRoute><FinancialAnalysis /></UserOnlyRoute>} />
        <Route path={ROUTES.HOME} element={<RootRedirect />} />
        <Route path="*" element={<RootRedirect />} />
      </Routes>
    </Suspense>
  );
}

function AppShell() {
  const location = useLocation();
  const usesSharedAppLayout =
    location.pathname.startsWith('/home') ||
    location.pathname.startsWith('/connect');

  return (
    <div className="min-h-screen flex flex-col">
      <main className="flex-1">
        <AppRoutes />
      </main>
      {!usesSharedAppLayout && <Footer />}
    </div>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <QueryProvider>
        <ThemeProvider>
          <ToastProvider>
            <BrowserRouter>
              <PageEngagementTracker />
              <AppShell />
            </BrowserRouter>
          </ToastProvider>
        </ThemeProvider>
      </QueryProvider>
    </ErrorBoundary>
  );
}

export default App;
