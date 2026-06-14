import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  Wallet,
  Calendar,
  Copy,
  Check,
  X,
  AlertTriangle,
  Clock,
  TrendingUp,
  DollarSign,
} from 'lucide-react';


import { Button, Card, Header } from '../../components/ui';
import { useLoanStore, type LoanApplication } from '../../store/loanStore';

// Status cycle for testing
const STATUS_CYCLE: LoanApplication['status'][] = ['pending', 'approved', 'active', 'completed', 'rejected'];

import { formatCurrency, formatDate } from '../../utils';
import { CONTAINER_VARIANTS, ITEM_VARIANTS, ROUTES } from '../../constants';

const STATUS_STYLES = {
  pending: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  approved: 'bg-green-500/20 text-green-400 border-green-500/30',
  rejected: 'bg-red-500/20 text-red-400 border-red-500/30',
  active: 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30',
  completed: 'bg-gray-500/20 text-gray-400 border-gray-500/30',
} as const;

const STATUS_LABELS = {
  pending: 'Pending Review',
  approved: 'Approved',
  rejected: 'Rejected',
  active: 'Active',
  completed: 'Completed',
} as const;

// Generate a simplified payment schedule based on loan data
function generatePaymentSchedule(loan: LoanApplication) {
  const months = 12;
  const principal = loan.loanAmount;
  const annualRate = loan.interestRate / 100;
  const monthlyRate = annualRate / 12;

  const monthlyPayment = principal * (monthlyRate * Math.pow(1 + monthlyRate, months)) / (Math.pow(1 + monthlyRate, months) - 1);

  const schedule = [];
  let balance = principal;

  for (let month = 1; month <= months; month++) {
    const interest = balance * monthlyRate;
    const principalPayment = monthlyPayment - interest;
    balance = Math.max(0, balance - principalPayment);

    schedule.push({
      month,
      payment: monthlyPayment,
      principal: principalPayment,
      interest,
      balance,
    });
  }

  return { schedule, monthlyPayment, totalInterest: schedule.reduce((sum, row) => sum + row.interest, 0) };
}

export function LoanDetail() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const { getApplicationById, cancelApplication, updateApplicationStatus } = useLoanStore();
  const [copied, setCopied] = useState(false);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  const loan = id ? getApplicationById(id) : undefined;

  useEffect(() => {
    if (!loan && id) {
      navigate(ROUTES.PROFILE);
    }
  }, [loan, id, navigate]);

  if (!loan) {
    return null;
  }

  const copyId = () => {
    navigator.clipboard.writeText(loan.id);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleCancel = async () => {
    setCancelling(true);
    await new Promise(resolve => setTimeout(resolve, 500));
    cancelApplication(loan.id);
    navigate(ROUTES.PROFILE);
  };

  // DEV: Cycle through statuses for testing
  const cycleStatus = () => {
    const currentIndex = STATUS_CYCLE.indexOf(loan.status);
    const nextIndex = (currentIndex + 1) % STATUS_CYCLE.length;
    updateApplicationStatus(loan.id, STATUS_CYCLE[nextIndex]);
  };

  const { schedule, monthlyPayment, totalInterest } = generatePaymentSchedule(loan);
  const currentMonth = 1;

  return (
    <div className="min-h-screen bg-dark-bg relative">
      {/* Atmospheric background */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-altrion-500/10 rounded-full blur-[120px] animate-pulse" style={{ animationDuration: '8s' }} />
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-accent-cyan/5 rounded-full blur-[120px] animate-pulse" style={{ animationDuration: '10s' }} />
      </div>

      <Header />

      <main className="max-w-4xl mx-auto px-5 py-6">
        <motion.div
          variants={CONTAINER_VARIANTS}
          initial="hidden"
          animate="visible"
          className="space-y-6"
        >
          {/* Back Button & Title */}
          <motion.div variants={ITEM_VARIANTS} className="flex items-center gap-4">
            <button
              onClick={() => navigate(ROUTES.PROFILE)}
              className="w-10 h-10 rounded-xl bg-dark-elevated border border-dark-border flex items-center justify-center text-text-muted hover:text-text-primary hover:border-altrion-500/50 transition-colors"
            >
              <ArrowLeft size={20} />
            </button>
            <h1 className="font-display text-2xl font-bold text-text-primary">Loan Application</h1>
          </motion.div>

          {/* Application ID & Status Card */}
          <motion.div variants={ITEM_VARIANTS}>
            <Card variant="bordered" className="border-altrion-500/20">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <p className="text-text-muted text-sm mb-1">Application ID</p>
                  <div className="flex items-center gap-2">
                    <p className="text-2xl font-bold text-text-primary font-mono">{loan.id}</p>
                    <button
                      onClick={copyId}
                      className="p-1.5 rounded-lg bg-dark-elevated hover:bg-dark-card text-text-muted hover:text-text-primary transition-colors"
                    >
                      {copied ? <Check size={16} className="text-green-400" /> : <Copy size={16} />}
                    </button>
                  </div>
                  <div className="flex items-center gap-1.5 mt-2 text-text-secondary text-sm">
                    <Calendar size={14} />
                    <span>Submitted {formatDate(new Date(loan.submittedAt))}</span>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <span className={`inline-flex items-center px-4 py-2 rounded-full text-sm font-semibold border ${STATUS_STYLES[loan.status]}`}>
                    {STATUS_LABELS[loan.status]}
                  </span>
                  {/* DEV: Status toggle for testing */}
                  <button
                    onClick={cycleStatus}
                    className="px-3 py-1.5 text-xs font-medium rounded-lg bg-purple-500/20 text-purple-400 border border-purple-500/30 hover:bg-purple-500/30 transition-colors"
                  >
                    Test: Change Status
                  </button>
                </div>
              </div>
            </Card>
          </motion.div>

          {/* Loan Summary */}
          <motion.div variants={ITEM_VARIANTS}>
            <Card variant="bordered">
              <div className="flex items-center gap-3 mb-5">
                <div className="w-10 h-10 rounded-xl bg-altrion-500/20 flex items-center justify-center">
                  <Wallet size={20} className="text-altrion-400" />
                </div>
                <h3 className="font-display text-xl font-semibold text-text-primary">Loan Summary</h3>
              </div>

              {/* Main Stats */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-5">
                <div className="p-4 bg-dark-elevated rounded-xl text-center">
                  <p className="text-text-muted text-xs mb-1">Total Collateral</p>
                  <p className="text-xl font-bold text-text-primary">
                    {formatCurrency(loan.totalCollateral)}
                  </p>
                </div>
                <div className="p-4 bg-dark-elevated rounded-xl text-center">
                  <p className="text-text-muted text-xs mb-1">Loan Amount</p>
                  <p className="text-xl font-bold text-altrion-400">
                    {formatCurrency(loan.loanAmount)}
                  </p>
                </div>
                <div className="p-4 bg-dark-elevated rounded-xl text-center">
                  <p className="text-text-muted text-xs mb-1">Interest Rate</p>
                  <p className="text-xl font-bold text-text-primary">
                    {loan.interestRate.toFixed(2)}% APR
                  </p>
                </div>
                <div className="p-4 bg-dark-elevated rounded-xl text-center">
                  <p className="text-text-muted text-xs mb-1">LTV Ratio</p>
                  <p className="text-xl font-bold text-text-primary">
                    {loan.ltv.toFixed(0)}%
                  </p>
                </div>
              </div>

              {/* Secondary Stats */}
              <div className="grid grid-cols-3 gap-4">
                <div className="p-4 bg-dark-elevated rounded-xl text-center">
                  <div className="flex items-center justify-center gap-2 mb-1">
                    <DollarSign size={14} className="text-accent-cyan" />
                    <p className="text-text-muted text-xs">Monthly Payment</p>
                  </div>
                  <p className="text-lg font-bold text-accent-cyan">
                    {formatCurrency(monthlyPayment)}
                  </p>
                </div>
                <div className="p-4 bg-dark-elevated rounded-xl text-center">
                  <div className="flex items-center justify-center gap-2 mb-1">
                    <Clock size={14} className="text-purple-400" />
                    <p className="text-text-muted text-xs">Loan Term</p>
                  </div>
                  <p className="text-lg font-bold text-text-primary">12 months</p>
                </div>
                <div className="p-4 bg-dark-elevated rounded-xl text-center">
                  <div className="flex items-center justify-center gap-2 mb-1">
                    <TrendingUp size={14} className="text-amber-400" />
                    <p className="text-text-muted text-xs">Total Interest</p>
                  </div>
                  <p className="text-lg font-bold text-amber-400">
                    {formatCurrency(totalInterest)}
                  </p>
                </div>
              </div>
            </Card>
          </motion.div>

          {/* Collateral Assets */}
          <motion.div variants={ITEM_VARIANTS}>
            <Card variant="bordered">
              <h3 className="font-display text-lg font-semibold text-text-primary mb-4">Collateral Assets</h3>
              <div className="space-y-3">
                {loan.selectedAssets.map((asset, index) => (
                  <div
                    key={index}
                    className="flex items-center justify-between p-4 bg-dark-elevated rounded-xl border border-dark-border/50"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-full bg-dark-card flex items-center justify-center overflow-hidden">
                        <span className="font-bold text-sm text-text-muted">
                          {asset.symbol.slice(0, 2)}
                        </span>
                      </div>
                      <div>
                        <p className="font-semibold text-text-primary">{asset.name}</p>
                        <p className="text-sm text-text-muted">{asset.symbol}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold text-text-primary">
                        {asset.amount.toLocaleString()} {asset.symbol}
                      </p>
                      <p className="text-sm text-text-muted">
                        {formatCurrency(asset.value)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          </motion.div>

          {/* Payment Schedule - Only for active loans */}
          {loan.status === 'active' && (
            <motion.div variants={ITEM_VARIANTS}>
              <Card variant="bordered">
                <div className="flex items-center gap-3 mb-5">
                  <div className="w-10 h-10 rounded-xl bg-accent-cyan/20 flex items-center justify-center">
                    <Calendar size={20} className="text-accent-cyan" />
                  </div>
                  <h3 className="font-display text-xl font-semibold text-text-primary">Payment Schedule</h3>
                </div>

                {/* Progress */}
                <div className="p-4 bg-gradient-to-br from-altrion-500/10 to-accent-cyan/10 rounded-xl border border-altrion-500/20 mb-5">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-sm text-text-secondary">Loan Progress</span>
                    <span className="text-sm font-medium text-text-primary">
                      {currentMonth} of {schedule.length} payments
                    </span>
                  </div>
                  <div className="h-2 bg-dark-bg rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-altrion-500 to-accent-cyan rounded-full transition-all"
                      style={{ width: `${(currentMonth / schedule.length) * 100}%` }}
                    />
                  </div>
                </div>

                {/* Schedule Table */}
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-text-muted text-xs border-b border-dark-border">
                        <th className="text-left py-2 px-3">Month</th>
                        <th className="text-right py-2 px-3">Payment</th>
                        <th className="text-right py-2 px-3">Principal</th>
                        <th className="text-right py-2 px-3">Interest</th>
                        <th className="text-right py-2 px-3">Balance</th>
                      </tr>
                    </thead>
                    <tbody>
                      {schedule.map((row) => (
                        <tr
                          key={row.month}
                          className={`border-b border-dark-border/50 ${
                            row.month === currentMonth
                              ? 'bg-altrion-500/10'
                              : row.month < currentMonth
                              ? 'opacity-50'
                              : ''
                          }`}
                        >
                          <td className="py-2 px-3">
                            <div className="flex items-center gap-2">
                              {row.month === currentMonth && (
                                <span className="w-2 h-2 rounded-full bg-altrion-500 animate-pulse" />
                              )}
                              <span className="text-text-primary font-medium">{row.month}</span>
                            </div>
                          </td>
                          <td className="py-2 px-3 text-right text-text-primary">
                            {formatCurrency(row.payment)}
                          </td>
                          <td className="py-2 px-3 text-right text-altrion-400">
                            {formatCurrency(row.principal)}
                          </td>
                          <td className="py-2 px-3 text-right text-amber-400">
                            {formatCurrency(row.interest)}
                          </td>
                          <td className="py-2 px-3 text-right text-text-muted">
                            {formatCurrency(row.balance)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            </motion.div>
          )}

          {/* Cancel Section - Only for pending loans */}
          {loan.status === 'pending' && (
            <motion.div variants={ITEM_VARIANTS}>
              <Card variant="bordered" className="border-amber-500/20 bg-amber-500/5">
                {!showCancelConfirm ? (
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 rounded-xl bg-amber-500/20 flex items-center justify-center flex-shrink-0">
                        <Clock size={20} className="text-amber-400" />
                      </div>
                      <div>
                        <h3 className="font-display text-lg font-semibold text-text-primary">Application Pending</h3>
                        <p className="text-sm text-text-secondary">
                          Your application is under review. This typically takes 24-48 hours.
                          You can cancel your application if you've changed your mind.
                        </p>
                      </div>
                    </div>
                    <Button
                      variant="secondary"
                      onClick={() => setShowCancelConfirm(true)}
                      className="text-red-400 border-red-500/30 hover:bg-red-500/10"
                    >
                      <X size={16} />
                      Cancel Application
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 rounded-xl bg-red-500/20 flex items-center justify-center flex-shrink-0">
                        <AlertTriangle size={20} className="text-red-400" />
                      </div>
                      <div>
                        <h3 className="font-display text-lg font-semibold text-text-primary">Confirm Cancellation</h3>
                        <p className="text-sm text-text-secondary">
                          Are you sure you want to cancel this loan application? This action cannot be undone.
                        </p>
                      </div>
                    </div>
                    <div className="flex gap-3 justify-end">
                      <Button variant="ghost" onClick={() => setShowCancelConfirm(false)}>
                        Keep Application
                      </Button>
                      <Button
                        variant="secondary"
                        onClick={handleCancel}
                        loading={cancelling}
                        className="text-red-400 border-red-500/30 hover:bg-red-500/10"
                      >
                        <X size={16} />
                        Yes, Cancel Application
                      </Button>
                    </div>
                  </div>
                )}
              </Card>
            </motion.div>
          )}

          {/* Last Updated */}
          <motion.div variants={ITEM_VARIANTS} className="text-center">
            <p className="text-xs text-text-muted">
              Last updated: {formatDate(new Date(loan.updatedAt))}
            </p>
          </motion.div>

          {/* Back to Profile Button */}
          <motion.div variants={ITEM_VARIANTS} className="flex justify-center">
            <Button variant="secondary" onClick={() => navigate(ROUTES.PROFILE)}>
              <ArrowLeft size={16} />
              Back to Profile
            </Button>
          </motion.div>
        </motion.div>
      </main>
    </div>
  );
}
