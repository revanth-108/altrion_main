import { useState } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, ArrowRight, Landmark, Plus, Trash2, Wallet, X } from 'lucide-react';
import { DashboardLayout } from '@/components/layout';
import { Button, Card } from '@/components/ui';
import { TransactionSyncControls } from '@/components/plaid/TransactionSyncControls';
import { CONTAINER_VARIANTS, ITEM_VARIANTS, PLATFORM_ICONS, ROUTES, getAccountDetailRoute } from '@/constants';
import {
  useConnectedPlatforms,
  useDisconnectPlaidItem,
  usePlaidTransactionSyncStatus,
  usePortfolio,
  useSyncPlaidBalances,
  useSyncPlaidTransactionUpdates,
} from '@/hooks';
import { formatCurrency, formatDate } from '@/utils';

const categoryLabels = {
  crypto: 'Crypto',
  bank: 'Banking',
  broker: 'Brokerage',
} as const;

const providerDisplayName = (provider: string) =>
  provider === 'plaid' ? 'Bank integration' : provider;

const formatOptionalCurrency = (value: number | null | undefined) =>
  value == null ? '—' : formatCurrency(value);

const classifyAccount = (account: { classification?: string; accountType: string | null; subtype: string | null }) => {
  const accountType = account.accountType?.toLowerCase() ?? '';
  const subtype = account.subtype?.toLowerCase() ?? '';
  if (account.classification) return account.classification;
  if (accountType === 'credit' || subtype === 'credit card' || accountType === 'loan') return 'liability';
  if (accountType === 'depository' || accountType === 'investment') return 'asset';
  return 'other';
};

export function Accounts() {
  const navigate = useNavigate();
  const { data: accounts = [], isLoading } = useConnectedPlatforms();
  const { data: portfolio } = usePortfolio();
  const { data: syncStatus } = usePlaidTransactionSyncStatus();
  const refreshBalances = useSyncPlaidBalances();
  const syncTransactions = useSyncPlaidTransactionUpdates();
  const disconnectPlaidItem = useDisconnectPlaidItem();
  const [disconnectTarget, setDisconnectTarget] = useState<{
    itemId: string;
    name: string;
    institutionName: string | null;
    accountCount: number;
  } | null>(null);

  const accountCards = accounts.map((account) => {
    let hasPortfolioSource = false;
    const portfolioSourceValue = portfolio?.assets.reduce((sum, asset) => {
      const source = asset.sources?.find((assetSource) => assetSource.accountId === account.id);
      if (source) hasPortfolioSource = true;
      const sourceValue = source?.value ?? 0;
      return sum + sourceValue;
    }, 0);
    const relatedValue = hasPortfolioSource ? (portfolioSourceValue ?? null) : account.balanceCurrent;
    const classification = classifyAccount(account);

    return {
      ...account,
      classification,
      relatedValue: classification === 'liability' ? (account.debtAmount ?? account.balanceCurrent) : relatedValue,
    };
  });
  const assetAccountValue = accountCards
    .filter((account) => account.classification === 'asset')
    .reduce((sum, account) => sum + (account.relatedValue ?? 0), 0);

  const openDisconnectConfirm = (account: { itemId: string | null; name: string; institutionName: string | null }) => {
    if (!account.itemId) return;
    const accountCount = accountCards.filter((entry) => entry.itemId === account.itemId).length || 1;
    setDisconnectTarget({
      itemId: account.itemId,
      name: account.name,
      institutionName: account.institutionName,
      accountCount,
    });
  };

  const handleDisconnectConfirm = async () => {
    if (!disconnectTarget) return;
    await disconnectPlaidItem.mutateAsync(disconnectTarget.itemId);
    setDisconnectTarget(null);
  };

  return (
    <DashboardLayout>
      <motion.div variants={CONTAINER_VARIANTS} initial="hidden" animate="visible" className="space-y-6">
        <motion.div variants={ITEM_VARIANTS} className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm uppercase tracking-[0.24em] text-text-muted">Accounts</p>
            <h1 className="font-display text-3xl sm:text-4xl font-black text-text-primary">Connected accounts</h1>
            <p className="mt-2 text-text-secondary max-w-2xl">
              Open any connected account to inspect balances, account metadata, and portfolio exposure tied to that connection.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <TransactionSyncControls
              hasTransactionUpdates={syncStatus?.status === 'updates_available' || Boolean(syncStatus?.hasTransactionUpdates)}
              onRefreshBalances={() => refreshBalances.mutate(undefined)}
              onSyncTransactions={() => syncTransactions.mutate()}
              refreshBalancesLoading={refreshBalances.isPending}
              syncTransactionsLoading={syncTransactions.isPending}
            />
            <Button onClick={() => navigate(ROUTES.CONNECT_SELECT)}>
              <Plus size={16} />
              Add Account
            </Button>
          </div>
        </motion.div>

        <motion.div variants={ITEM_VARIANTS} className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Card variant="bordered">
            <p className="text-sm text-text-muted">Connected</p>
            <p className="mt-3 text-3xl font-bold text-text-primary">{accounts.length}</p>
          </Card>
          <Card variant="bordered">
            <p className="text-sm text-text-muted">Banking Connections</p>
            <p className="mt-3 text-3xl font-bold text-text-primary">{accounts.filter((account) => account.category === 'bank').length}</p>
          </Card>
          <Card variant="bordered">
            <p className="text-sm text-text-muted">Estimated Value</p>
            <p className="mt-3 text-3xl font-bold text-text-primary">
              {formatCurrency(assetAccountValue)}
            </p>
          </Card>
        </motion.div>

        <motion.div variants={ITEM_VARIANTS}>
          <Card variant="bordered" padding="none" className="overflow-hidden">
            {accountCards.length > 0 ? (
              <div className="divide-y divide-dark-border/70">
                {accountCards.map((account) => {
                  const config = PLATFORM_ICONS[account.provider] || PLATFORM_ICONS[account.id];
                  const Icon = config?.icon || (account.category === 'bank' ? Landmark : Wallet);

                  return (
                    <div
                      key={account.id}
                      className="w-full px-5 py-4 text-left transition-colors hover:bg-dark-elevated/60"
                    >
                      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                        <button
                          type="button"
                          onClick={() => navigate(getAccountDetailRoute(account.id))}
                          className="flex min-w-0 flex-1 items-center gap-4 text-left"
                        >
                          <div className={`h-11 w-11 shrink-0 rounded-2xl flex items-center justify-center ${config?.color || 'bg-dark-elevated'}`}>
                            {config?.logo ? (
                              <img src={config.logo} alt={account.name} className="h-6 w-6 object-contain" />
                            ) : (
                              <Icon size={18} />
                            )}
                          </div>
                          <div className="min-w-0">
                            <p className="font-semibold text-text-primary truncate">{account.name}</p>
                            <p className="text-sm text-text-secondary truncate">
                              {account.institutionName || providerDisplayName(account.provider)} • {account.roleLabel || account.subtype || account.accountType || categoryLabels[account.category]}
                              {account.mask ? ` • •••• ${account.mask}` : ''}
                            </p>
                          </div>
                        </button>

                        <div className="flex items-center justify-between gap-3 md:justify-end">
                          <div className="text-left md:text-right">
                            <p className="font-semibold text-text-primary">{formatOptionalCurrency(account.relatedValue)}</p>
                            {account.classification === 'liability' && account.relatedValue != null ? (
                              <p className="text-xs text-text-muted">owed</p>
                            ) : null}
                            <p className="text-sm text-text-muted">
                              {account.errorMessage
                                ? 'Sync failed'
                                : account.lastSyncedAt
                                  ? `Synced ${formatDate(new Date(account.lastSyncedAt))}`
                              : 'Waiting for first sync'}
                            </p>
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => openDisconnectConfirm(account)}
                            disabled={!account.itemId || disconnectPlaidItem.isPending}
                            className="shrink-0 border border-transparent text-text-muted hover:border-red-500/30 hover:bg-red-500/10 hover:text-red-300"
                          >
                            <Trash2 size={14} />
                            <span className="hidden sm:inline">Disconnect</span>
                          </Button>
                          <ArrowRight size={16} className="text-text-muted shrink-0" />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="px-6 py-12 text-center">
                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-dark-elevated">
                  <Wallet size={24} className="text-text-muted" />
                </div>
                <h2 className="mt-5 text-xl font-semibold text-text-primary">No connected accounts yet</h2>
                <p className="mt-2 text-text-secondary">Connect a wallet or bank account to populate this list.</p>
                <Button className="mt-6" onClick={() => navigate(ROUTES.CONNECT_SELECT)}>
                  <Plus size={16} />
                  Connect Account
                </Button>
              </div>
            )}
          </Card>
        </motion.div>

        {isLoading && (
          <motion.p variants={ITEM_VARIANTS} className="text-sm text-text-muted">
            Loading connected accounts...
          </motion.p>
        )}

        {disconnectTarget && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              onClick={() => setDisconnectTarget(null)}
            />
            <div className="relative w-full max-w-lg rounded-2xl border border-dark-border bg-dark-card p-6 shadow-2xl">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 flex h-10 w-10 items-center justify-center rounded-full bg-red-500/15 text-red-300">
                    <AlertTriangle size={18} />
                  </div>
                  <div>
                    <h2 className="font-display text-xl font-bold text-text-primary">Disconnect account connection?</h2>
                    <p className="mt-2 text-sm text-text-secondary">
                      This will disconnect the Plaid item for {disconnectTarget.institutionName || disconnectTarget.name} and hide all {disconnectTarget.accountCount} account{disconnectTarget.accountCount === 1 ? '' : 's'} tied to that connection.
                    </p>
                    <p className="mt-2 text-sm text-text-secondary">
                      Your historical transactions and holdings stay in the database.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setDisconnectTarget(null)}
                  className="rounded-lg p-1.5 text-text-muted hover:bg-dark-elevated hover:text-text-primary"
                >
                  <X size={16} />
                </button>
              </div>

              <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-end">
                <Button variant="ghost" onClick={() => setDisconnectTarget(null)} disabled={disconnectPlaidItem.isPending}>
                  Cancel
                </Button>
                <Button
                  onClick={handleDisconnectConfirm}
                  loading={disconnectPlaidItem.isPending}
                  className="bg-red-500 text-white hover:bg-red-600"
                >
                  Disconnect
                </Button>
              </div>
            </div>
          </div>
        )}
      </motion.div>
    </DashboardLayout>
  );
}
