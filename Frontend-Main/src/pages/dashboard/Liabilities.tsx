import { useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { AlertCircle, CreditCard, Home, GraduationCap, Award, Banknote, RefreshCw } from 'lucide-react';
import { DashboardLayout } from '@/components/layout';
import { Card, Button, TableRowSkeleton } from '@/components/ui';
import { CONTAINER_VARIANTS, ITEM_VARIANTS } from '@/constants';
import { usePlaidLiabilities, usePlaidBalances, useSyncLiabilities } from '@/hooks/queries/usePlaid';
import { formatCurrency } from '@/utils';
import type { PlaidBalancesResponse, PlaidLiabilityResponse } from '@/types';

// ── Formatters ──────────────────────────────────────────────────────

function fmtDate(value: string | null | undefined): string {
  if (!value) return '\u2014';
  const d = new Date(value);
  if (isNaN(d.getTime())) return value;
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(d);
}

function fmtCurrency(value: number | null | undefined): string {
  if (value == null) return '\u2014';
  return formatCurrency(value);
}

function firstNumber(...values: unknown[]): number | null {
  for (const value of values) {
    if (value == null || value === '') continue;
    const numberValue = Number(value);
    if (Number.isFinite(numberValue)) return numberValue;
  }
  return null;
}

function fmtPercent(value: number | null | undefined): string {
  if (value == null) return '\u2014';
  return `${value.toFixed(2)}%`;
}

function formatAprType(type: string): string {
  return type
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, c => c.toUpperCase());
}

function formatAddress(addr: { street?: string; city?: string; region?: string; postal_code?: string } | null | undefined): string | null {
  if (!addr) return null;
  const parts = [addr.street, addr.city, addr.region, addr.postal_code].filter(Boolean);
  return parts.length > 0 ? parts.join(', ') : null;
}

// ── Shared Primitives ───────────────────────────────────────────────

function SectionHeader({ icon: Icon, title, accent }: { icon: React.ElementType; title: string; accent: string }) {
  return (
    <div className="flex items-center gap-3 mb-5">
      <div className={`w-1 h-6 rounded-full ${accent}`} />
      <Icon size={20} className="text-text-secondary" />
      <h2 className="font-display text-lg sm:text-xl font-bold text-text-primary">{title}</h2>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="py-2.5">
      <p className="text-text-muted text-xs uppercase tracking-wider mb-1">{label}</p>
      <p className="text-text-primary text-sm font-medium">{children ?? <span className="text-text-muted">{'\u2014'}</span>}</p>
    </div>
  );
}

function StatusBadge({ overdue }: { overdue: boolean }) {
  return overdue ? (
    <span className="px-3 py-1 rounded-full text-xs font-semibold bg-red-500/15 text-red-400 border border-red-500/20">
      Overdue
    </span>
  ) : (
    <span className="px-3 py-1 rounded-full text-xs font-semibold bg-green-500/15 text-green-400 border border-green-500/20">
      Current
    </span>
  );
}

// ── Utilization Bar ─────────────────────────────────────────────────

function UtilizationBar({ balance, limit }: { balance: number | null; limit: number | null }) {
  if (balance == null || limit == null || limit === 0) return null;
  const pct = Math.min((balance / limit) * 100, 100);
  const color = pct >= 90 ? 'bg-red-500' : pct >= 70 ? 'bg-yellow-500' : 'bg-altrion-500';

  return (
    <div className="mt-3">
      <div className="flex justify-between items-center mb-1.5">
        <span className="text-text-muted text-xs">Utilization</span>
        <span className="text-text-secondary text-xs font-medium">{pct.toFixed(0)}%</span>
      </div>
      <div className="h-2 bg-dark-elevated rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <div className="flex justify-between mt-1">
        <span className="text-text-muted text-[11px]">{fmtCurrency(balance)} used</span>
        <span className="text-text-muted text-[11px]">{fmtCurrency(limit)} limit</span>
      </div>
    </div>
  );
}

// ── Credit Card ─────────────────────────────────────────────────────

function CreditCardCard({ card, accountName, balance, limit }: {
  card: any;
  accountName: string;
  balance: number | null;
  limit: number | null;
}) {
  return (
    <Card variant="bordered" padding="none" className="overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-dark-border/50">
        <h3 className="font-display font-bold text-text-primary text-base">{accountName}</h3>
        <StatusBadge overdue={!!card.is_overdue} />
      </div>

      <div className="px-5 py-4 space-y-4">
        {/* Balance + Utilization */}
        <div>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Current Balance">{fmtCurrency(balance)}</Field>
            <Field label="Credit Limit">{fmtCurrency(limit)}</Field>
          </div>
          <UtilizationBar balance={balance} limit={limit} />
        </div>

        {/* Divider */}
        <div className="border-t border-dark-border/30" />

        {/* Payment Info */}
        <div className="grid grid-cols-2 gap-4">
          <Field label="Minimum Payment">{fmtCurrency(card.minimum_payment_amount)}</Field>
          <Field label="Next Payment Due">{fmtDate(card.next_payment_due_date)}</Field>
          <Field label="Last Payment">
            {card.last_payment_amount != null
              ? <>{fmtCurrency(card.last_payment_amount)} <span className="text-text-muted">on {fmtDate(card.last_payment_date)}</span></>
              : <span className="text-text-muted">{'\u2014'}</span>}
          </Field>
          <Field label="Last Statement">
            {card.last_statement_balance != null
              ? <>{fmtCurrency(card.last_statement_balance)} <span className="text-text-muted">on {fmtDate(card.last_statement_issue_date)}</span></>
              : <span className="text-text-muted">{'\u2014'}</span>}
          </Field>
        </div>

        {/* APRs Table */}
        {card.aprs && card.aprs.length > 0 && (
          <>
            <div className="border-t border-dark-border/30" />
            <div>
              <p className="text-text-muted text-xs uppercase tracking-wider mb-3">APR Breakdown</p>
              <div className="rounded-lg border border-dark-border/50 overflow-hidden">
                <table className="w-full">
                  <thead>
                    <tr className="bg-dark-elevated/50">
                      <th className="text-left px-3 py-2 text-text-muted text-xs uppercase tracking-wider font-medium">Type</th>
                      <th className="text-right px-3 py-2 text-text-muted text-xs uppercase tracking-wider font-medium">Rate</th>
                      <th className="text-right px-3 py-2 text-text-muted text-xs uppercase tracking-wider font-medium hidden sm:table-cell">Balance</th>
                      <th className="text-right px-3 py-2 text-text-muted text-xs uppercase tracking-wider font-medium hidden sm:table-cell">Interest</th>
                    </tr>
                  </thead>
                  <tbody>
                    {card.aprs.map((apr: any, i: number) => (
                      <tr key={i} className={i % 2 === 0 ? 'bg-dark-card' : 'bg-dark-elevated/30'}>
                        <td className="px-3 py-2 text-text-primary text-sm">{formatAprType(apr.apr_type || '')}</td>
                        <td className="px-3 py-2 text-text-primary text-sm text-right font-medium">{fmtPercent(apr.apr_percentage)}</td>
                        <td className="px-3 py-2 text-text-secondary text-sm text-right hidden sm:table-cell">{fmtCurrency(apr.balance_subject_to_apr)}</td>
                        <td className="px-3 py-2 text-text-secondary text-sm text-right hidden sm:table-cell">{fmtCurrency(apr.interest_charge_amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </div>
    </Card>
  );
}

// ── Mortgage ────────────────────────────────────────────────────────

function MortgageCard({ m, accountName }: { m: any; accountName: string }) {
  const address = formatAddress(m.property_address);

  return (
    <Card variant="bordered" padding="none" className="overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-dark-border/50">
        <h3 className="font-display font-bold text-text-primary text-base">{accountName}</h3>
        {m.has_pmi && (
          <span className="px-3 py-1 rounded-full text-xs font-semibold bg-amber-500/15 text-amber-400 border border-amber-500/20">
            PMI Active
          </span>
        )}
      </div>

      <div className="px-5 py-4 space-y-4">
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-0">
          <Field label="Next Monthly Payment">{fmtCurrency(m.next_monthly_payment)}</Field>
          <Field label="Next Payment Due">{fmtDate(m.next_payment_due_date)}</Field>
          <Field label="Interest Rate">
            {m.interest_rate_percentage != null
              ? <>{fmtPercent(m.interest_rate_percentage)} <span className="text-text-muted">({m.interest_rate_type || 'N/A'})</span></>
              : <span className="text-text-muted">{'\u2014'}</span>}
          </Field>
          <Field label="Origination Principal">{fmtCurrency(m.origination_principal)}</Field>
          <Field label="Maturity Date">{fmtDate(m.maturity_date)}</Field>
          <Field label="Loan Term">{m.loan_term || <span className="text-text-muted">{'\u2014'}</span>}</Field>
          <Field label="Escrow Balance">{fmtCurrency(m.escrow_balance)}</Field>
          <Field label="Last Payment">
            {m.last_payment_amount != null
              ? <>{fmtCurrency(m.last_payment_amount)} <span className="text-text-muted">on {fmtDate(m.last_payment_date)}</span></>
              : <span className="text-text-muted">{'\u2014'}</span>}
          </Field>
          <Field label="YTD Interest Paid">{fmtCurrency(m.ytd_interest_paid)}</Field>
          <Field label="YTD Principal Paid">{fmtCurrency(m.ytd_principal_paid)}</Field>
        </div>

        {/* Property Address */}
        {address && (
          <>
            <div className="border-t border-dark-border/30" />
            <div className="rounded-lg bg-dark-elevated/40 border border-dark-border/30 px-4 py-3">
              <p className="text-text-muted text-xs uppercase tracking-wider mb-1">Property Address</p>
              <p className="text-text-primary text-sm font-medium">{address}</p>
            </div>
          </>
        )}
      </div>
    </Card>
  );
}

// ── Student Loan ────────────────────────────────────────────────────

function StudentLoanCard({ s, accountName }: { s: any; accountName: string }) {
  const hasPslf = s.pslf_estimated_eligibility_date || s.pslf_payments_made != null || s.pslf_payments_remaining != null;

  return (
    <Card variant="bordered" padding="none" className="overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 border-b border-dark-border/50">
        <h3 className="font-display font-bold text-text-primary text-base">
          {s.loan_name || accountName}
        </h3>
      </div>

      <div className="px-5 py-4 space-y-4">
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-0">
          <Field label="Repayment Plan">
            {s.repayment_plan_description
              ? <>{s.repayment_plan_description} <span className="text-text-muted">({s.repayment_plan_type || ''})</span></>
              : s.repayment_plan_type || <span className="text-text-muted">{'\u2014'}</span>}
          </Field>
          <Field label="Interest Rate">{fmtPercent(s.interest_rate_percentage)}</Field>
          <Field label="Minimum Payment">{fmtCurrency(s.minimum_payment_amount)}</Field>
          <Field label="Next Payment Due">{fmtDate(s.next_payment_due_date)}</Field>
          <Field label="Outstanding Interest">{fmtCurrency(s.outstanding_interest_amount)}</Field>
          <Field label="Loan Status">
            {s.loan_status_type
              ? <>{s.loan_status_type}{s.loan_status_end_date && <span className="text-text-muted"> (ends {fmtDate(s.loan_status_end_date)})</span>}</>
              : <span className="text-text-muted">{'\u2014'}</span>}
          </Field>
          <Field label="Expected Payoff">{fmtDate(s.expected_payoff_date)}</Field>
          <Field label="Origination Principal">{fmtCurrency(s.origination_principal)}</Field>
          <Field label="Guarantor">{s.guarantor || <span className="text-text-muted">{'\u2014'}</span>}</Field>
          <Field label="YTD Interest Paid">{fmtCurrency(s.ytd_interest_paid)}</Field>
          <Field label="YTD Principal Paid">{fmtCurrency(s.ytd_principal_paid)}</Field>
        </div>

        {/* PSLF Sub-card */}
        {hasPslf && (
          <>
            <div className="border-t border-dark-border/30" />
            <div className="rounded-lg border border-purple-500/20 bg-purple-500/5 p-4">
              <div className="flex items-center gap-2 mb-3">
                <Award size={16} className="text-purple-400" />
                <p className="text-purple-300 text-xs uppercase tracking-wider font-semibold">Public Service Loan Forgiveness</p>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div className="text-center">
                  <p className="text-2xl font-bold text-text-primary">{s.pslf_payments_made ?? <span className="text-text-muted">{'\u2014'}</span>}</p>
                  <p className="text-text-muted text-xs mt-1">Payments Made</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-bold text-text-primary">{s.pslf_payments_remaining ?? <span className="text-text-muted">{'\u2014'}</span>}</p>
                  <p className="text-text-muted text-xs mt-1">Remaining</p>
                </div>
                <div className="text-center">
                  <p className="text-sm font-bold text-purple-300">{fmtDate(s.pslf_estimated_eligibility_date)}</p>
                  <p className="text-text-muted text-xs mt-1">Est. Eligibility</p>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </Card>
  );
}

function GenericLoanCard({ loan, accountName }: { loan: any; accountName: string }) {
  return (
    <Card variant="bordered" padding="none" className="overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-dark-border/50">
        <h3 className="font-display font-bold text-text-primary text-base">{loan.name || accountName}</h3>
        <span className="px-3 py-1 rounded-full text-xs font-semibold bg-red-500/15 text-red-300 border border-red-500/20">
          Liability
        </span>
      </div>
      <div className="px-5 py-4 grid grid-cols-2 gap-4">
        <Field label="Amount Owed">{fmtCurrency(loan.debt_amount ?? loan.current_balance)}</Field>
        <Field label="Type">{loan.subtype || loan.account_type || <span className="text-text-muted">{'\u2014'}</span>}</Field>
      </div>
    </Card>
  );
}

// ── Main Component ──────────────────────────────────────────────────

export function Liabilities() {
  const { data: liabilitiesData, isLoading, isError, error } = usePlaidLiabilities();
  const { data: accountsData } = usePlaidBalances();
  const syncLiabilities = useSyncLiabilities();
  const autoSyncFired = useRef(false);

  const resData = liabilitiesData as PlaidLiabilityResponse | undefined;
  const credit = resData?.credit_cards || resData?.credit || [];
  const mortgage = resData?.mortgage || [];
  const student = resData?.student || [];
  const loans = resData?.loans || [];
  const totalLiabilities: number = resData?.total_liabilities ?? resData?.liabilities_total ?? resData?.summary?.total_liabilities ?? 0;
  const source: string | undefined = resData?.source;

  const accountsRes = accountsData as PlaidBalancesResponse | undefined;
  const accounts = accountsRes?.accounts || [];
  const accountMap = new Map<string, any>();
  for (const acct of accounts) {
    accountMap.set(acct.account_id, acct);
  }

  const getAccountName = (accountId: string, fallbackName?: string | null) => {
    const acct = accountMap.get(accountId);
    return acct?.name || acct?.official_name || fallbackName || `Account \u2026${accountId.slice(-4)}`;
  };
  const getAccountBalance = (accountId: string) => {
    const acct = accountMap.get(accountId);
    return firstNumber(acct?.current, acct?.balance_current, acct?.balanceCurrent);
  };
  const getAccountLimit = (accountId: string) => {
    const acct = accountMap.get(accountId);
    return firstNumber(acct?.limit, acct?.balance_limit, acct?.balanceLimit);
  };

  const isEmpty = credit.length === 0 && mortgage.length === 0 && student.length === 0 && loans.length === 0;

  // Auto-sync once when the page loads with no data
  useEffect(() => {
    if (!isLoading && !isError && isEmpty && !autoSyncFired.current && !syncLiabilities.isPending) {
      autoSyncFired.current = true;
      syncLiabilities.mutate();
    }
  }, [isLoading, isError, isEmpty]);

  return (
    <DashboardLayout>
      <motion.div
        variants={CONTAINER_VARIANTS}
        initial="hidden"
        animate="visible"
        className="space-y-8"
      >
        {/* Header */}
        <motion.div variants={ITEM_VARIANTS} className="flex items-end justify-between gap-3">
          <div className="min-w-0">
            <h1 className="font-display text-2xl sm:text-4xl font-black leading-tight text-text-primary">
              Liabilities
            </h1>
            <p className="text-text-secondary text-sm mt-1">
              Credit cards, mortgages, and student loans
              {source === 'db' && <span className="ml-2 text-text-muted text-xs">Cached</span>}
              {source === 'sync' && <span className="ml-2 text-green-400 text-xs">Updated just now</span>}
            </p>
          </div>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => syncLiabilities.mutate()}
            disabled={syncLiabilities.isPending || isLoading}
            className="flex-shrink-0 sm:px-6 sm:py-3 sm:text-base"
          >
            <RefreshCw size={16} className={syncLiabilities.isPending ? 'animate-spin' : ''} />
            <span className="hidden sm:inline">Sync</span>
          </Button>
        </motion.div>

        {!isLoading && !isError && (
          <motion.div variants={ITEM_VARIANTS} className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Card variant="bordered">
              <p className="text-sm text-text-muted">Total Liabilities</p>
              <p className="mt-3 text-3xl font-bold text-text-primary">{fmtCurrency(totalLiabilities)}</p>
            </Card>
            <Card variant="bordered">
              <p className="text-sm text-text-muted">Credit Cards</p>
              <p className="mt-3 text-3xl font-bold text-text-primary">{credit.length}</p>
            </Card>
            <Card variant="bordered">
              <p className="text-sm text-text-muted">Loans</p>
              <p className="mt-3 text-3xl font-bold text-text-primary">{mortgage.length + student.length + loans.length}</p>
            </Card>
          </motion.div>
        )}

        {/* Loading */}
        {isLoading && (
          <motion.div variants={ITEM_VARIANTS}>
            <Card variant="bordered" className="overflow-hidden">
              <div className="p-5 space-y-4">
                {Array.from({ length: 5 }).map((_, i) => (
                  <TableRowSkeleton key={i} />
                ))}
              </div>
            </Card>
          </motion.div>
        )}

        {/* Error */}
        {isError && !isLoading && (
          <motion.div variants={ITEM_VARIANTS}>
            <Card variant="bordered" className="p-6">
              <div className="flex items-center gap-3 text-red-400">
                <AlertCircle size={20} />
                <p className="text-sm">{(error as any)?.message || 'Failed to load liabilities. Make sure a bank account is connected.'}</p>
              </div>
            </Card>
          </motion.div>
        )}

        {/* Empty */}
        {!isLoading && !isError && isEmpty && !syncLiabilities.isPending && (
          <motion.div variants={ITEM_VARIANTS}>
            <Card variant="bordered" className="p-12 text-center">
              <p className="text-text-primary text-sm font-medium mb-1">No liability accounts found</p>
              <p className="text-text-muted text-sm mb-5">
                Sync to load credit cards, mortgages, and student loans from your connected accounts.
              </p>
              <Button
                variant="primary"
                size="sm"
                onClick={() => syncLiabilities.mutate()}
                disabled={syncLiabilities.isPending}
              >
                <RefreshCw size={14} />
                Sync Now
              </Button>
            </Card>
          </motion.div>
        )}

        {/* Syncing state while empty */}
        {syncLiabilities.isPending && isEmpty && (
          <motion.div variants={ITEM_VARIANTS}>
            <Card variant="bordered" className="overflow-hidden">
              <div className="p-5 space-y-4">
                {Array.from({ length: 5 }).map((_, i) => (
                  <TableRowSkeleton key={i} />
                ))}
              </div>
            </Card>
          </motion.div>
        )}

        {/* Credit Cards */}
        {!isLoading && credit.length > 0 && (
          <motion.div variants={ITEM_VARIANTS}>
            <SectionHeader icon={CreditCard} title="Credit Cards" accent="bg-blue-500" />
            <div className="grid gap-5 lg:grid-cols-2">
              {credit.map((card: any, idx: number) => (
                <CreditCardCard
                  key={card.account_id || idx}
                  card={card}
                  accountName={getAccountName(card.account_id, card.name)}
                  balance={firstNumber(
                    card.current_balance,
                    card.balance,
                    card.balance_current,
                    card.debt_amount,
                    getAccountBalance(card.account_id),
                  )}
                  limit={firstNumber(
                    card.credit_limit,
                    card.limit,
                    card.balance_limit,
                    getAccountLimit(card.account_id),
                  )}
                />
              ))}
            </div>
          </motion.div>
        )}

        {/* Mortgages */}
        {!isLoading && mortgage.length > 0 && (
          <motion.div variants={ITEM_VARIANTS}>
            <SectionHeader icon={Home} title="Mortgage" accent="bg-amber-500" />
            <div className="space-y-5">
              {mortgage.map((m: any, idx: number) => (
                <MortgageCard key={m.account_id || idx} m={m} accountName={getAccountName(m.account_id, m.name)} />
              ))}
            </div>
          </motion.div>
        )}

        {/* Student Loans */}
        {!isLoading && student.length > 0 && (
          <motion.div variants={ITEM_VARIANTS}>
            <SectionHeader icon={GraduationCap} title="Student Loans" accent="bg-purple-500" />
            <div className="space-y-5">
              {student.map((s: any, idx: number) => (
                <StudentLoanCard key={s.account_id || idx} s={s} accountName={getAccountName(s.account_id, s.name)} />
              ))}
            </div>
          </motion.div>
        )}

        {!isLoading && loans.length > 0 && (
          <motion.div variants={ITEM_VARIANTS}>
            <SectionHeader icon={Banknote} title="Loans" accent="bg-red-500" />
            <div className="grid gap-5 lg:grid-cols-2">
              {loans.map((loan: any, idx: number) => (
                <GenericLoanCard key={loan.account_id || idx} loan={loan} accountName={getAccountName(loan.account_id, loan.name)} />
              ))}
            </div>
          </motion.div>
        )}
      </motion.div>
    </DashboardLayout>
  );
}
