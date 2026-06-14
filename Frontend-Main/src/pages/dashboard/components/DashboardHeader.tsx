import { memo } from 'react';
import { Bell, Plus, Search } from 'lucide-react';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui';
import { ITEM_VARIANTS } from '@/constants';
import { formatLastPlaidSyncAt, getDashboardGreeting } from '@/utils';

interface DashboardHeaderProps {
  displayName: string;
  lastPlaidSyncAt?: string | null;
  notificationCount: number;
  onNotificationsClick: () => void;
  onAddAccountClick: () => void;
}

export const DashboardHeader = memo(function DashboardHeader({
  displayName,
  lastPlaidSyncAt,
  notificationCount,
  onNotificationsClick,
  onAddAccountClick,
}: DashboardHeaderProps) {
  return (
    <motion.div variants={ITEM_VARIANTS}>
      <div className="border-b border-white/8 pb-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <GreetingBlock displayName={displayName} lastPlaidSyncAt={lastPlaidSyncAt} />
          <SearchCommandBar />
          <div className="flex items-center gap-2 lg:ml-auto">
            <NotificationsButton count={notificationCount} onClick={onNotificationsClick} />
            <Button size="sm" onClick={onAddAccountClick} className="min-w-[128px]">
              <Plus size={16} />
              Add Account
            </Button>
          </div>
        </div>
      </div>
    </motion.div>
  );
});

function GreetingBlock({
  displayName,
  lastPlaidSyncAt,
}: {
  displayName: string;
  lastPlaidSyncAt?: string | null;
}) {
  return (
    <div className="min-w-0 lg:w-[250px]">
      <p className="text-base font-semibold tracking-tight text-text-primary lg:text-[1.05rem]">
        {getDashboardGreeting(displayName)}
      </p>
      <p className="mt-0.5 text-xs text-text-muted sm:text-sm">
        {formatLastPlaidSyncAt(lastPlaidSyncAt)}
      </p>
    </div>
  );
}

function SearchCommandBar() {
  return (
    <div className="flex-1 lg:max-w-xl xl:max-w-2xl">
      <label className="group flex h-11 items-center gap-3 rounded-2xl border border-white/8 bg-dark-elevated/70 px-4 text-text-secondary transition-all duration-200 hover:border-dark-border-hover focus-within:border-altrion-500/60 focus-within:ring-2 focus-within:ring-altrion-500/15">
        <Search size={16} className="shrink-0 text-text-muted transition-colors group-focus-within:text-altrion-400" />
        <input
          type="search"
          placeholder="Search accounts, transactions, insights..."
          className="h-full flex-1 bg-transparent text-sm text-text-primary placeholder:text-text-muted focus:outline-none"
          aria-label="Search accounts, transactions, insights"
        />
        <span className="hidden rounded-lg border border-white/8 bg-dark-bg/70 px-2 py-1 text-[10px] font-medium uppercase tracking-[0.18em] text-text-muted md:inline-flex">
          /
        </span>
      </label>
    </div>
  );
}

function NotificationsButton({
  count,
  onClick,
}: {
  count: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Notifications"
      className="relative inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-white/8 bg-dark-elevated/75 text-text-secondary transition-all duration-200 hover:border-altrion-500/30 hover:text-text-primary focus:outline-none focus:ring-2 focus:ring-altrion-500/30"
    >
      <Bell size={18} />
      {count > 0 && (
        <span className="absolute right-2 top-2 inline-flex min-h-5 min-w-5 items-center justify-center rounded-full bg-altrion-500 px-1.5 text-[11px] font-bold text-white">
          {count > 9 ? '9+' : count}
        </span>
      )}
    </button>
  );
}
