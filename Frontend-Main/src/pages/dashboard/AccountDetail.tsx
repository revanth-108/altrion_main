import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { useNavigate, useParams } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowLeft,
  Building2,
  CalendarDays,
  Clock3,
  CreditCard,
  Home,
  Landmark,
  ShieldCheck,
  Wallet,
} from 'lucide-react';
import { DashboardLayout } from '@/components/layout';
import { Button, Card } from '@/components/ui';
import { CONTAINER_VARIANTS, ITEM_VARIANTS, PLATFORM_ICONS, ROUTES } from '@/constants';
import { useConnectedPlatforms, usePlaidAccounts, usePlaidBalances, usePlaidLiabilities, usePortfolio } from '@/hooks';
import { formatCurrency, formatDate } from '@/utils';
import type { AggregatedAsset } from '@/hooks/useAggregatedAssets';
import { AllocationInsightsCard } from './components';
import type { PlaidAccountsResponse, PlaidBalancesResponse, PlaidLiabilityResponse } from '@/types';

type MortgageLiability = {
  account_id?: string | null;
  interest_rate_percentage?: number | null;
  interest_rate_type?: string | null;
  maturity_date?: string | null;
  origination_principal?: number | null;
  next_monthly_payment?: number | null;
  next_payment_due_date?: string | null;
  last_payment_amount?: number | null;
  last_payment_date?: string | null;
  ytd_interest_paid?: number | null;
  ytd_principal_paid?: number | null;
  property_address?: {
    street?: string | null;
    city?: string | null;
    region?: string | null;
    postal_code?: string | null;
  } | null;
};

const labelize = (value: string | null | undefined, fallback = 'Not provided') =>
  value ? value.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase()) : fallback;
const providerDisplayName = (provider: string | null | undefined) =>
  provider === 'plaid' ? 'Bank integration' : labelize(provider);

const isMortgageSubtype = (value: string | null | undefined) => value?.toLowerCase().includes('mortgage') ?? false;
const isLiabilityAccount = (accountType: string | null | undefined, subtype: string | null | undefined) => {
  const normalizedType = accountType?.toLowerCase();
  const normalizedSubtype = subtype?.toLowerCase();
  return normalizedType === 'loan' || normalizedType === 'credit' || ['mortgage', 'student', 'student loan', 'credit card'].includes(normalizedSubtype ?? '');
};

const formatMaybeCurrency = (value: number | null | undefined) => (value == null ? 'Not provided' : formatCurrency(Math.abs(value)));
const formatMaybeDate = (value: string | null | undefined) => {
  if (!value) return 'Not provided';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Not provided' : formatDate(date);
};
const formatMaybePercent = (value: number | null | undefined) => (value == null ? 'Not provided' : `${value.toFixed(2)}%`);

function formatAddress(address: MortgageLiability['property_address']) {
  if (!address) return null;
  const parts = [address.street, address.city, address.region, address.postal_code].filter(Boolean);
  return parts.length > 0 ? parts.join(', ') : null;
}

export function AccountDetail() {
  const navigate = useNavigate();
  const { accountId } = useParams<{ accountId: string }>();
  const { data: connectedAccounts = [], isLoading: accountsLoading } = useConnectedPlatforms();
  const account = connectedAccounts.find((entry) => entry.id === accountId);
  const { data: portfolio } = usePortfolio();
  const shouldLoadPlaid = account?.provider === 'plaid';
  const { data: plaidAccountsData } = usePlaidAccounts(shouldLoadPlaid);
  const { data: plaidBalancesData } = usePlaidBalances(shouldLoadPlaid);
  const { data: liabilitiesData } = usePlaidLiabilities(shouldLoadPlaid);

  const plaidAccounts = useMemo<PlaidAccountsResponse['accounts']>(
    () => plaidAccountsData?.accounts || [],
    [plaidAccountsData],
  );
  const plaidBalances = useMemo<PlaidBalancesResponse['accounts']>(
    () => plaidBalancesData?.accounts || [],
    [plaidBalancesData],
  );

  const plaidSnapshot = useMemo(() => {
    if (!account || account.provider !== 'plaid') return null;
    const metadata = plaidAccounts.find((entry) => entry.id === account.providerAccountId);
    const balance = plaidBalances.find((entry) => entry.account_id === account.providerAccountId);
    return { metadata, balance };
  }, [account, plaidAccounts, plaidBalances]);

  const mortgageDetails = useMemo<MortgageLiability | null>(() => {
    if (!account) return null;
    const liabilities = liabilitiesData as PlaidLiabilityResponse | undefined;
    const found = liabilities?.mortgage?.find((mortgage) => mortgage.account_id === account.providerAccountId);
    return found ? (found as MortgageLiability) : null;
  }, [account, liabilitiesData]);

  const relatedAssets = useMemo(() => {
    if (!account || !portfolio?.assets) return [];
    return portfolio.assets
      .map((asset) => {
        const source = asset.sources?.find((entry) => entry.accountId === account.id);
        if (!source) return null;
        return {
          id: asset.id,
          symbol: asset.symbol,
          name: asset.name,
          type: asset.type,
          quantity: source.quantity,
          value: source.value,
        };
      })
      .filter((asset): asset is NonNullable<typeof asset> => Boolean(asset))
      .sort((a, b) => b.value - a.value);
  }, [account, portfolio]);

  const analysisAssets = useMemo<AggregatedAsset[]>(() => {
    if (!account) return [];
    return relatedAssets.map((asset) => ({
      id: asset.id,
      symbol: asset.symbol,
      name: asset.name,
      amount: asset.quantity,
      value: asset.value,
      price: asset.quantity > 0 ? asset.value / asset.quantity : asset.value,
      change24h: 0,
      platforms: [account.provider],
      type: asset.type,
    }));
  }, [account, relatedAssets]);

  if (accountsLoading) {
    return (
      <DashboardLayout>
        <div className="mx-auto max-w-3xl py-8">
          <Card variant="bordered">
            <div className="h-8 w-56 animate-pulse rounded-lg bg-dark-elevated" />
            <div className="mt-4 h-4 w-72 animate-pulse rounded bg-dark-elevated" />
          </Card>
        </div>
      </DashboardLayout>
    );
  }

  if (!account) {
    return (
      <DashboardLayout>
        <div className="mx-auto max-w-3xl py-8">
          <Card variant="bordered" className="text-center">
            <h1 className="text-2xl font-semibold text-text-primary">Account not found</h1>
            <p className="mt-2 text-text-secondary">That connected account is missing or no longer active.</p>
            <Button className="mt-6" onClick={() => navigate(ROUTES.ACCOUNTS)}>
              <ArrowLeft size={16} />
              Back to Accounts
            </Button>
          </Card>
        </div>
      </DashboardLayout>
    );
  }

  const config = PLATFORM_ICONS[account.provider] || PLATFORM_ICONS[account.id];
  const isMortgage = isMortgageSubtype(plaidSnapshot?.metadata?.subtype || account.subtype);
  const isLiability = isLiabilityAccount(plaidSnapshot?.metadata?.type || account.accountType, plaidSnapshot?.metadata?.subtype || account.subtype);
  const Icon = config?.icon || (isMortgage ? Home : account.category === 'bank' ? Landmark : Wallet);
  const liveCurrent = plaidSnapshot?.balance?.current ?? account.balanceCurrent;
  const liveAvailable = plaidSnapshot?.balance?.available ?? account.balanceAvailable;
  const liveLimit = plaidSnapshot?.balance?.limit ?? account.balanceLimit;
  const currency = plaidSnapshot?.balance?.currency ?? account.balanceCurrency ?? 'USD';
  const relatedValue = relatedAssets.reduce((sum, asset) => sum + asset.value, 0);
  const accountTypeLabel = labelize(plaidSnapshot?.metadata?.subtype || account.subtype || plaidSnapshot?.metadata?.type || account.accountType, 'Connected account');
  const address = formatAddress(mortgageDetails?.property_address);

  return (
    <DashboardLayout>
      <motion.div variants={CONTAINER_VARIANTS} initial="hidden" animate="visible" className="space-y-6">
        <motion.div variants={ITEM_VARIANTS} className="flex flex-col gap-4">
          <Button variant="ghost" size="sm" onClick={() => navigate(ROUTES.ACCOUNTS)} className="w-fit px-0">
            <ArrowLeft size={16} />
            Back to Accounts
          </Button>

          <Card variant="bordered" className="relative overflow-hidden">
            <div className="absolute inset-x-0 top-0 h-32 bg-gradient-to-r from-altrion-500/20 via-transparent to-accent-cyan/10" />
            <div className="relative flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
              <div className="flex min-w-0 items-start gap-4">
                <div className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-lg ${config?.color || 'bg-dark-elevated'}`}>
                  {config?.logo ? (
                    <img src={config.logo} alt={account.name} className="h-8 w-8 object-contain" />
                  ) : (
                    <Icon size={22} />
                  )}
                </div>
                <div className="min-w-0">
                  <p className="text-sm uppercase tracking-[0.24em] text-text-muted">{account.institutionName || providerDisplayName(account.provider)}</p>
                  <h1 className="mt-2 font-display text-3xl font-black text-text-primary sm:text-4xl">{account.name}</h1>
                  <p className="mt-2 text-text-secondary">
                    {accountTypeLabel}{account.mask ? ` • ${account.mask}` : ''}
                  </p>
                  {address ? <p className="mt-2 max-w-2xl text-sm text-text-muted">{address}</p> : null}
                </div>
              </div>

              <div className="grid grid-cols-1 overflow-hidden rounded-lg border border-white/6 bg-white/[0.025] sm:grid-cols-3 sm:divide-x sm:divide-white/6 lg:w-[520px]">
                {isMortgage ? (
                  <>
                    <MetricTile label="Balance" value={formatMaybeCurrency(liveCurrent)} detail={currency} />
                    <MetricTile label="Next payment" value={formatMaybeCurrency(mortgageDetails?.next_monthly_payment)} detail={formatMaybeDate(mortgageDetails?.next_payment_due_date)} />
                    <MetricTile label="Rate" value={formatMaybePercent(mortgageDetails?.interest_rate_percentage)} detail={labelize(mortgageDetails?.interest_rate_type, 'Rate type not provided')} />
                  </>
                ) : (
                  <>
                    <MetricTile label="Balance" value={formatMaybeCurrency(liveCurrent)} detail={currency} />
                    <MetricTile label={liveLimit != null ? 'Limit' : 'Available'} value={formatMaybeCurrency(liveLimit ?? liveAvailable)} detail={currency} />
                    <MetricTile label="Portfolio" value={formatCurrency(relatedValue)} detail={`${relatedAssets.length} linked asset${relatedAssets.length === 1 ? '' : 's'}`} />
                  </>
                )}
              </div>
            </div>
          </Card>
        </motion.div>

        <motion.div variants={ITEM_VARIANTS}>
          {isLiability && relatedAssets.length === 0 ? (
            <AccountAnalysisState
              title="Account Analysis"
              eyebrow="Liability account"
              icon={isMortgage ? <Home size={18} className="text-cyan-300" /> : <CreditCard size={18} className="text-cyan-300" />}
              message={`${accountTypeLabel} accounts are tracked through liability data, not allocation analysis.`}
              detail="Portfolio allocation insights are available when an account has linked investment holdings or cash assets."
            />
          ) : relatedAssets.length > 0 ? (
            <AllocationInsightsCard
              accountId={account.id}
              assets={analysisAssets}
              totalValue={relatedValue}
              eyebrow="Account stance"
              title="Account Analysis"
            />
          ) : (
            <AccountAnalysisState
              title="Account Analysis"
              eyebrow="No linked holdings"
              icon={<Wallet size={18} className="text-cyan-300" />}
              message="Not enough data to generate account analysis."
              detail="This account does not currently have synced portfolio assets attributed to it."
            />
          )}
        </motion.div>

        <motion.div variants={ITEM_VARIANTS} className="grid grid-cols-1 gap-5 lg:grid-cols-[1.05fr,0.95fr]">
          <Card variant="bordered">
            <div className="flex items-center gap-2">
              <ShieldCheck size={18} className="text-altrion-400" />
              <h2 className="text-lg font-semibold text-text-primary">Account overview</h2>
            </div>
            <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <DetailItem label="Institution" value={account.institutionName || providerDisplayName(account.provider)} />
              <DetailItem label="Account type" value={accountTypeLabel} />
              <DetailItem label="Visible identifier" value={account.mask ? `Ending in ${account.mask}` : 'Not provided'} />
              <DetailItem label="Balance currency" value={currency} />
              {isMortgage ? (
                <>
                  <DetailItem label="Maturity date" value={formatMaybeDate(mortgageDetails?.maturity_date)} />
                  <DetailItem label="Origination principal" value={formatMaybeCurrency(mortgageDetails?.origination_principal)} />
                  <DetailItem label="Last payment" value={formatMaybeCurrency(mortgageDetails?.last_payment_amount)} detail={formatMaybeDate(mortgageDetails?.last_payment_date)} />
                  <DetailItem label="YTD principal paid" value={formatMaybeCurrency(mortgageDetails?.ytd_principal_paid)} />
                </>
              ) : liveLimit != null ? (
                <DetailItem label="Credit limit" value={formatCurrency(liveLimit)} />
              ) : null}
            </div>

            <details className="mt-6 rounded-lg border border-dark-border bg-dark-elevated/40 px-4 py-3">
              <summary className="cursor-pointer text-sm font-medium text-text-secondary">Advanced provider details</summary>
              <div className="mt-4 grid grid-cols-1 gap-4 text-sm sm:grid-cols-2">
                <DetailItem label="Internal account ID" value={account.id} muted />
                <DetailItem label="Provider account ID" value={account.providerAccountId} muted />
                <DetailItem label="Connection item" value={account.itemId || 'Not provided'} muted />
                <DetailItem label="Provider" value={providerDisplayName(account.provider)} muted />
              </div>
            </details>
          </Card>

          <Card variant="bordered">
            <div className="flex items-center gap-2">
              <Clock3 size={18} className="text-altrion-400" />
              <h2 className="text-lg font-semibold text-text-primary">Connection health</h2>
            </div>
            <div className="mt-5 space-y-4">
              <div className="rounded-lg border border-dark-border bg-dark-elevated p-4">
                <div className="flex items-start gap-3">
                  <CalendarDays size={18} className="mt-0.5 text-text-muted" />
                  <div>
                    <p className="text-sm text-text-muted">Last sync</p>
                    <p className="mt-1 text-text-primary">
                      {account.lastSyncedAt ? formatDate(new Date(account.lastSyncedAt)) : 'No successful sync yet'}
                    </p>
                  </div>
                </div>
              </div>
              <ConnectionHealthCard
                errorMessage={account.errorMessage}
                lastSyncedAt={account.lastSyncedAt}
              />
            </div>
          </Card>
        </motion.div>

        <motion.div variants={ITEM_VARIANTS}>
          <Card variant="bordered" padding="none">
            <div className="flex items-center justify-between px-6 pt-6">
              <div>
                <h2 className="text-lg font-semibold text-text-primary">Linked portfolio assets</h2>
                <p className="mt-1 text-sm text-text-secondary">Assets in the portfolio that currently trace back to this connected account.</p>
              </div>
            </div>

            {relatedAssets.length > 0 ? (
              <div className="mt-5 divide-y divide-dark-border/70">
                {relatedAssets.map((asset) => (
                  <div key={asset.id} className="flex items-center justify-between gap-4 px-6 py-4 transition-colors hover:bg-white/[0.035]">
                    <div>
                      <p className="font-medium text-text-primary">{asset.name}</p>
                      <p className="text-sm text-text-secondary">{asset.symbol} • {labelize(asset.type)}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-medium text-text-primary">{formatCurrency(asset.value)}</p>
                      <p className="text-sm text-text-secondary">{asset.quantity.toLocaleString()}</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="px-6 py-10 text-center">
                <p className="font-medium text-text-primary">No linked portfolio assets</p>
                <p className="mt-1 text-sm text-text-secondary">
                  {isLiability ? 'This account is tracked as a liability rather than an investment holding.' : 'No synced assets are currently attributed to this account.'}
                </p>
              </div>
            )}
          </Card>
        </motion.div>
      </motion.div>
    </DashboardLayout>
  );
}

function MetricTile({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <div className="min-w-0 border-b border-white/6 px-4 py-3 last:border-b-0 sm:border-b-0 sm:px-5">
      <p className="text-[0.72rem] font-medium leading-snug text-text-muted">{label}</p>
      <p className="mt-1.5 break-words font-display text-xl font-semibold leading-tight tracking-tight text-text-primary sm:text-[1.35rem]">
        {value}
      </p>
      {detail ? <p className="mt-1 break-words text-xs leading-snug text-text-muted">{detail}</p> : null}
    </div>
  );
}

function DetailItem({ label, value, detail, muted = false }: { label: string; value: string; detail?: string; muted?: boolean }) {
  return (
    <div>
      <p className="text-sm text-text-muted">{label}</p>
      <p className={`mt-1 break-all ${muted ? 'text-sm text-text-secondary' : 'text-text-primary'}`}>{value}</p>
      {detail ? <p className="mt-1 text-xs text-text-muted">{detail}</p> : null}
    </div>
  );
}

type HealthState = 'healthy' | 'stale' | 'error';

function deriveHealthState(errorMessage: string | null, lastSyncedAt: string | null): HealthState {
  const hoursSinceSync = lastSyncedAt
    ? (Date.now() - new Date(lastSyncedAt).getTime()) / 36e5
    : Infinity;
  if (errorMessage && hoursSinceSync < 48) return 'error';
  if (hoursSinceSync > 24) return 'stale';
  return 'healthy';
}

function ConnectionHealthCard({
  errorMessage,
  lastSyncedAt,
}: {
  errorMessage: string | null;
  lastSyncedAt: string | null;
}) {
  const state = deriveHealthState(errorMessage, lastSyncedAt);
  const lastSyncDisplay = lastSyncedAt
    ? formatDate(new Date(lastSyncedAt))
    : 'No successful sync recorded';

  if (state === 'error') {
    return (
      <div className="rounded-lg border p-4 border-red-500/40 bg-red-500/10">
        <div className="flex items-start gap-3">
          <AlertTriangle size={18} className="mt-0.5 text-red-300" />
          <div>
            <p className="font-medium text-text-primary">Needs attention</p>
            <p className="mt-1 text-sm text-text-secondary">{errorMessage}</p>
          </div>
        </div>
      </div>
    );
  }

  if (state === 'stale') {
    return (
      <div className="rounded-lg border p-4 border-amber-500/40 bg-amber-500/10">
        <div className="flex items-start gap-3">
          <Clock3 size={18} className="mt-0.5 text-amber-300" />
          <div className="flex-1">
            <p className="font-medium text-text-primary">Sync is stale</p>
            <p className="mt-1 text-sm text-text-secondary">Last successful sync: {lastSyncDisplay}.</p>
            <button
              type="button"
              disabled
              title="Coming soon"
              className="mt-3 inline-flex items-center gap-1.5 rounded-md border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-xs font-semibold text-amber-200 opacity-60 cursor-not-allowed"
            >
              Resync
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-lg border p-4 border-emerald-500/30 bg-emerald-500/10">
      <div className="flex items-start gap-3">
        <Building2 size={18} className="mt-0.5 text-emerald-300" />
        <div>
          <p className="font-medium text-text-primary">Healthy connection</p>
          <p className="mt-1 text-sm text-text-secondary">No provider error is recorded for this account.</p>
        </div>
      </div>
    </div>
  );
}

function AccountAnalysisState({
  title,
  eyebrow,
  icon,
  message,
  detail,
}: {
  title: string;
  eyebrow: string;
  icon: React.ReactNode;
  message: string;
  detail: string;
}) {
  return (
    <Card variant="bordered">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-cyan-500/15">
          {icon}
        </div>
        <div>
          <p className="text-xs uppercase tracking-[0.16em] text-text-muted">{eyebrow}</p>
          <h3 className="font-display text-2xl font-bold text-text-primary">{title}</h3>
        </div>
      </div>
      <div className="mt-5 rounded-lg border border-white/6 bg-dark-elevated/45 p-4">
        <p className="font-medium text-text-primary">{message}</p>
        <p className="mt-2 text-sm leading-6 text-text-secondary">{detail}</p>
      </div>
    </Card>
  );
}
