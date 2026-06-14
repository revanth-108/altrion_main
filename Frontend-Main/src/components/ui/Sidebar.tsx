import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { LayoutDashboard, ArrowLeftRight, Settings, Wallet, CreditCard, Landmark, X, LogOut, DollarSign, BarChart3, Repeat, Sparkles, LineChart, Calculator, ScanSearch, FlaskConical } from 'lucide-react';
import { ROUTES } from '../../constants';
import { useLogout } from '../../hooks';
import { useAuthStore, selectUser, useSubscriptionStore } from '../../store';

const NAV_ITEMS = [
  { label: 'Dashboard', icon: LayoutDashboard, route: ROUTES.DASHBOARD },
  { label: 'Transactions', icon: ArrowLeftRight, route: ROUTES.TRANSACTIONS },
  { label: 'Recurring', icon: Repeat, route: ROUTES.RECURRING },
  { label: 'Liabilities', icon: Landmark, route: ROUTES.LIABILITIES },
  { label: 'Accounts', icon: Wallet, route: ROUTES.ACCOUNTS },
  { label: 'Overview', icon: BarChart3, route: ROUTES.OVERVIEW },
];

const TOOL_ITEMS = [
  { label: 'Budget', icon: DollarSign, route: ROUTES.BUDGET },
  { label: 'Monte Carlo', icon: LineChart, route: ROUTES.MONTE_CARLO },
  { label: 'Portfolio X-Ray', icon: ScanSearch, route: ROUTES.PORTFOLIO_XRAY },
  { label: 'Research Lab', icon: FlaskConical, route: ROUTES.RESEARCH_LAB },
  { label: 'Financial Analysis', icon: Calculator, route: ROUTES.FINANCIAL_ANALYSIS },
];


interface SidebarProps {
  open?: boolean;
  onClose?: () => void;
}

export function Sidebar({ open, onClose }: SidebarProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const logoutMutation = useLogout();
  const user = useAuthStore(selectUser);
  const subscription = useSubscriptionStore((s) => s.subscription);

  const subscriptionLabel = (() => {
    if (!subscription) return 'Free Tier';
    if (subscription.override?.is_waived) return 'Complimentary';
    if (subscription.status === 'trialing') return 'Free Trial';
    if (subscription.status === 'active' || subscription.status === 'lifetime') return 'Subscribed';
    return `Status: ${subscription.status}`;
  })();

  useEffect(() => {
    onClose?.();
  }, [location.pathname, onClose]);

  const getInitials = (name: string) =>
    name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2);

  return (
    <>
      {open && <div className="sidebar-backdrop fixed inset-0 z-40 bg-black/60 lg:hidden" onClick={onClose} />}

      <div
        className={`
          sidebar-nav fixed top-0 left-0 bottom-0 z-50 flex h-full w-56 flex-col overflow-y-auto border-r border-white/8
          bg-dark-bg/82 pt-[3.25rem] backdrop-blur-xl transition-transform duration-300 ease-in-out
          lg:translate-x-0 lg:z-40 lg:bg-dark-bg/34
          ${open ? 'translate-x-0' : '-translate-x-full'}
        `}
      >
        <button
          onClick={onClose}
          className="absolute top-4 right-3 rounded-lg p-1.5 text-text-secondary transition-colors hover:bg-dark-elevated hover:text-text-primary lg:hidden"
        >
          <X size={18} />
        </button>

        <nav className="flex-1 space-y-1 px-3 pt-5 pb-4">
          {NAV_ITEMS.map((item) => {
            const isActive = item.route === ROUTES.ACCOUNTS
              ? location.pathname.startsWith(ROUTES.ACCOUNTS)
              : location.pathname === item.route;
            return (
              <button
                key={item.route}
                onClick={() => navigate(item.route)}
                className={`dashboard-nav-item flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-sm font-medium transition-all ${
                  isActive ? 'dashboard-nav-item--active' : ''
                }`}
              >
                <item.icon size={17} strokeWidth={1.85} />
                {item.label}
              </button>
            );
          })}

          <div className="pt-6">
            <p className="px-3 pb-2 text-[11px] uppercase tracking-[0.18em] text-text-muted">Tools</p>
            {TOOL_ITEMS.map((item) => {
              const isActive = location.pathname === item.route;
              return (
                <button
                  key={item.route}
                  onClick={() => navigate(item.route)}
                  className={`dashboard-nav-item flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-sm font-medium transition-all ${
                    isActive ? 'dashboard-nav-item--active' : ''
                  }`}
                >
                  <item.icon size={17} strokeWidth={1.85} />
                  {item.label}
                </button>
              );
            })}
            <button
              onClick={() => navigate(ROUTES.WORTH_IT)}
              className={`dashboard-nav-item flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-sm font-medium transition-all ${
                location.pathname === ROUTES.WORTH_IT ? 'dashboard-nav-item--active' : ''
              }`}
            >
              <Sparkles size={17} strokeWidth={1.85} />
              <span className="flex-1 text-left">Worth It?</span>
            </button>
          </div>

          <div className="pt-6">
            <p className="px-3 pb-2 text-[11px] uppercase tracking-[0.18em] text-text-muted">Coming Soon</p>
            <button
              onClick={() => navigate(ROUTES.LOAN_APPLICATION)}
              className={`dashboard-nav-item flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-sm font-medium transition-all ${
                location.pathname === ROUTES.LOAN_APPLICATION ? 'dashboard-nav-item--active' : ''
              }`}
            >
              <CreditCard size={17} strokeWidth={1.85} />
              Loan
            </button>
          </div>
        </nav>

        <div className="px-3 space-y-1 pb-2">
          <button
            onClick={() => navigate(ROUTES.PROFILE)}
            className={`dashboard-nav-item flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-sm font-medium transition-all ${
              location.pathname === ROUTES.PROFILE ? 'dashboard-nav-item--active' : ''
            }`}
          >
            <Settings size={17} strokeWidth={1.85} />
            Settings
          </button>
          <button
            onClick={() => logoutMutation.mutate()}
            className="dashboard-nav-item flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-sm font-medium text-text-secondary transition-all hover:text-red-300"
          >
            <LogOut size={17} strokeWidth={1.85} />
            Logout
          </button>
        </div>

        <div className="border-t border-white/10 px-3 py-3">
          <button
            onClick={() => navigate(ROUTES.PROFILE)}
            className="flex w-full items-center gap-3 rounded-2xl px-2 py-2 transition-colors hover:bg-white/4"
          >
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-white/8 bg-dark-elevated">
              {user?.avatar ? (
                <img src={user.avatar} alt={user.name} className="h-full w-full rounded-full object-cover" />
              ) : (
                <span className="text-[11px] font-semibold tracking-[0.12em] text-text-secondary">
                  {user ? getInitials(user.name) : '?'}
                </span>
              )}
            </div>
            <div className="min-w-0 flex-1 text-left">
              <p className="truncate text-sm font-medium text-text-primary">{user?.name || 'User'}</p>
              <p className="truncate text-xs text-text-muted">{subscriptionLabel}</p>
            </div>
          </button>
        </div>
      </div>
    </>
  );
}
