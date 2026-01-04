import { useEffect } from 'react';
import { motion } from 'framer-motion';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  ArrowLeft,
  ArrowRight,
  Wallet,
  Shield,
  AlertTriangle,
  CheckCircle,
} from 'lucide-react';
import { Button, Card, Header } from '../../components/ui';
import { formatCurrency } from '../../utils';
import { CONTAINER_VARIANTS, ITEM_VARIANTS, ROUTES } from '../../constants';
import { useLoanStore } from '../../store';
import type { LoanCalculateResponse } from '@/types';

interface SelectedAsset {
  name: string;
  symbol: string;
  amount: number;
  value: number;
}

interface LoanSummaryData {
  loanResponse: LoanCalculateResponse;
  selectedAssets: SelectedAsset[];
  loanRequest: {
    months: number;
    payout_currency: string;
    bank: string;
  };
}

const BANK_LABELS: Record<string, string> = {
  chase: 'Chase',
  bofa: 'Bank of America',
};

export function LoanSummary() {
  const navigate = useNavigate();
  const location = useLocation();
  const addApplication = useLoanStore((state) => state.addApplication);

  // Get loan data from router state
  const loanData = location.state as LoanSummaryData | null;

  // If no loan data, redirect to loan application
  useEffect(() => {
    if (!loanData) {
      navigate(ROUTES.LOAN_APPLICATION);
    }
  }, [loanData, navigate]);

  if (!loanData) {
    return null;
  }

  const { loanResponse, selectedAssets, loanRequest } = loanData;
  const summary = loanResponse?.summary;

  const handleConfirm = () => {
    // Save the loan application to the store
    const applicationId = addApplication({
      totalCollateral: summary?.total_collateral ?? 0,
      loanAmount: summary?.total_loan ?? 0,
      interestRate: summary?.interest_rate ?? 0,
      ltv: summary?.portfolio_ltv ?? 0,
      selectedAssets: selectedAssets,
    });

    // Navigate to confirmation page
    navigate(ROUTES.LOAN_CONFIRMATION, {
      state: { loanResponse, selectedAssets, applicationId }
    });
  };

  const handleGoBack = () => {
    navigate(ROUTES.LOAN_REVIEW, {
      state: {
        loanRequest: {
          assets: loanResponse.assets.map(a => ({
            symbol: a.symbol,
            collateral_value: a.collateral_usd,
          })),
          months: loanRequest.months,
          payout_currency: loanRequest.payout_currency,
          bank: loanRequest.bank,
        },
        selectedAssets,
        totalCollateral: summary.total_collateral,
      }
    });
  };

  return (
    <div className="min-h-screen bg-dark-bg relative">
      {/* Atmospheric background */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-altrion-500/10 rounded-full blur-[120px] animate-pulse" style={{ animationDuration: '8s' }} />
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-accent-cyan/5 rounded-full blur-[120px] animate-pulse" style={{ animationDuration: '10s' }} />
      </div>

      <Header />

      <main className="max-w-4xl mx-auto px-5 py-8">
        <motion.div
          variants={CONTAINER_VARIANTS}
          initial="hidden"
          animate="visible"
          className="space-y-6"
        >
          {/* Header */}
          <motion.div variants={ITEM_VARIANTS} className="text-center">
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: 'spring', stiffness: 200, damping: 15, delay: 0.2 }}
              className="w-16 h-16 mx-auto mb-4 rounded-full bg-blue-500/20 flex items-center justify-center"
            >
              <CheckCircle size={36} className="text-blue-400" />
            </motion.div>
            <h1 className="font-display text-3xl font-bold text-text-primary mb-2">
              Review Your Loan Terms
            </h1>
            <p className="text-text-secondary">
              Please review all loan details carefully before confirming your application.
            </p>
          </motion.div>

          {/* Loan Summary Card */}
          <motion.div variants={ITEM_VARIANTS}>
            <Card variant="bordered" className="border-altrion-500/30">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-12 h-12 rounded-xl bg-altrion-500/20 flex items-center justify-center">
                  <Wallet size={24} className="text-altrion-400" />
                </div>
                <div>
                  <h3 className="font-display text-2xl font-semibold text-text-primary">Loan Summary</h3>
                  <p className="text-sm text-text-secondary">Your approved loan details</p>
                </div>
              </div>

              {/* Main Loan Metrics */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                <div className="p-4 bg-dark-elevated rounded-xl">
                  <p className="text-text-muted text-xs mb-1">Total Collateral</p>
                  <p className="text-2xl font-bold text-text-primary">
                    {formatCurrency(summary?.total_collateral ?? 0)}
                  </p>
                </div>
                <div className="p-4 bg-dark-elevated rounded-xl">
                  <p className="text-text-muted text-xs mb-1">Loan Amount</p>
                  <p className="text-2xl font-bold text-altrion-400">
                    {formatCurrency(summary?.total_loan ?? 0)}
                  </p>
                </div>
                <div className="p-4 bg-dark-elevated rounded-xl">
                  <p className="text-text-muted text-xs mb-1">Interest Rate</p>
                  <p className="text-2xl font-bold text-yellow-400">
                    {(summary?.interest_rate ?? 0).toFixed(2)}% APR
                  </p>
                </div>
                <div className="p-4 bg-dark-elevated rounded-xl">
                  <p className="text-text-muted text-xs mb-1">LTV Ratio</p>
                  <p className="text-2xl font-bold text-text-primary">
                    {(summary?.portfolio_ltv ?? 0).toFixed(0)}%
                  </p>
                </div>
              </div>

              {/* Secondary Metrics */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                <div className="p-4 bg-dark-elevated rounded-xl">
                  <p className="text-text-muted text-xs mb-1">Monthly Payment</p>
                  <p className="text-xl font-bold text-altrion-400">
                    {formatCurrency(summary?.monthly_emi ?? 0)}
                  </p>
                </div>
                <div className="p-4 bg-dark-elevated rounded-xl">
                  <p className="text-text-muted text-xs mb-1">Loan Term</p>
                  <p className="text-xl font-bold text-text-primary">
                    {loanRequest?.months ?? 12} months
                  </p>
                </div>
                <div className="p-4 bg-dark-elevated rounded-xl">
                  <p className="text-text-muted text-xs mb-1">Margin Call LTV</p>
                  <p className="text-xl font-bold text-amber-400">
                    {(summary?.margin_call_ltv ?? 0).toFixed(0)}%
                  </p>
                </div>
                <div className="p-4 bg-dark-elevated rounded-xl">
                  <p className="text-text-muted text-xs mb-1">Liquidation LTV</p>
                  <p className="text-xl font-bold text-red-400">
                    {(summary?.liquidation_ltv ?? 0).toFixed(0)}%
                  </p>
                </div>
              </div>

              {/* Additional Info */}
              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 bg-dark-elevated rounded-xl">
                  <p className="text-text-muted text-xs mb-1">Payout Currency</p>
                  <p className="text-xl font-bold text-text-primary">
                    {loanRequest?.payout_currency ?? 'USD'}
                  </p>
                </div>
                <div className="p-4 bg-dark-elevated rounded-xl">
                  <p className="text-text-muted text-xs mb-1">Bank Account</p>
                  <p className="text-xl font-bold text-text-primary">
                    {BANK_LABELS[loanRequest?.bank ?? 'chase'] || loanRequest?.bank || 'Chase'}
                  </p>
                </div>
              </div>
            </Card>
          </motion.div>

          {/* Collateral Asset Breakdown */}
          <motion.div variants={ITEM_VARIANTS}>
            <Card variant="bordered">
              <h3 className="font-display text-lg font-semibold text-text-primary mb-4">
                Collateral Asset Breakdown
              </h3>

              <div className="space-y-4">
                {(loanResponse?.assets ?? []).map((asset, index) => (
                  <div
                    key={index}
                    className="p-4 bg-dark-elevated rounded-xl"
                  >
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-3">
                        <div className="w-12 h-12 rounded-full bg-dark-card flex items-center justify-center font-bold text-sm">
                          {(asset.symbol ?? 'XX').slice(0, 2)}
                        </div>
                        <div>
                          <p className="font-semibold text-text-primary">{asset.symbol ?? 'Unknown'}</p>
                          <p className="text-text-muted text-sm">{asset.tier ?? 'Tier 1'}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-text-muted text-xs">Monthly Payment</p>
                        <p className="text-xl font-bold text-altrion-400">
                          {formatCurrency(loanResponse?.schedule?.payments?.[asset.symbol] ?? 0)}
                        </p>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                      <div>
                        <p className="text-text-muted text-xs mb-1">Collateral</p>
                        <p className="font-semibold text-text-primary">
                          {formatCurrency(asset.collateral_usd ?? 0)}
                        </p>
                      </div>
                      <div>
                        <p className="text-text-muted text-xs mb-1">Loan Amount</p>
                        <p className="font-semibold text-altrion-400">
                          {formatCurrency(asset.loan_usd ?? 0)}
                        </p>
                      </div>
                      <div>
                        <p className="text-text-muted text-xs mb-1">LTV</p>
                        <p className="font-semibold text-text-primary">
                          {((asset.ltv ?? 0) * 100).toFixed(1)}%
                        </p>
                      </div>
                      <div>
                        <p className="text-text-muted text-xs mb-1">Interest Rate</p>
                        <p className="font-semibold text-yellow-400">
                          {((asset.interest_rate ?? 0) * 100).toFixed(2)}%
                        </p>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mt-3 pt-3 border-t border-dark-border">
                      <div>
                        <p className="text-text-muted text-xs mb-1">Base Rate</p>
                        <p className="font-semibold text-text-secondary">
                          {((asset.base_rate ?? 0) * 100).toFixed(2)}%
                        </p>
                      </div>
                      <div>
                        <p className="text-text-muted text-xs mb-1">Risk Premium</p>
                        <p className="font-semibold text-red-400">
                          {((asset.risk_premium ?? 0) * 100).toFixed(2)}%
                        </p>
                      </div>
                      <div>
                        <p className="text-text-muted text-xs mb-1">Volatility Premium</p>
                        <p className="font-semibold text-amber-400">
                          {((asset.volatility_premium ?? 0) * 100).toFixed(2)}%
                        </p>
                      </div>
                      <div>
                        <p className="text-text-muted text-xs mb-1">30-day Change</p>
                        <p className={`font-semibold ${(asset.pct_change_30d ?? 0) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                          {(asset.pct_change_30d ?? 0) >= 0 ? '+' : ''}{(asset.pct_change_30d ?? 0).toFixed(2)}%
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          </motion.div>

          {/* Risk Warning */}
          <motion.div variants={ITEM_VARIANTS}>
            <Card variant="bordered" className="bg-amber-500/5 border-amber-500/30">
              <div className="flex gap-3">
                <AlertTriangle size={24} className="text-amber-400 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold text-text-primary mb-2">Important Risk Information</p>
                  <ul className="text-sm text-text-secondary space-y-2">
                    <li>
                      <strong className="text-amber-400">Margin Call at {(summary?.margin_call_ltv ?? 0).toFixed(0)}% LTV:</strong> If your collateral value drops, you may need to add more collateral or reduce your loan.
                    </li>
                    <li>
                      <strong className="text-red-400">Liquidation at {(summary?.liquidation_ltv ?? 0).toFixed(0)}% LTV:</strong> Your collateral may be liquidated if LTV exceeds this threshold.
                    </li>
                    <li>
                      Interest rates are variable and may change based on market conditions.
                    </li>
                  </ul>
                </div>
              </div>
            </Card>
          </motion.div>

          {/* Terms Agreement */}
          <motion.div variants={ITEM_VARIANTS}>
            <Card variant="bordered" className="bg-dark-elevated/50">
              <div className="flex gap-3">
                <Shield size={20} className="text-altrion-400 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium text-text-primary mb-1">Terms & Conditions</p>
                  <p className="text-sm text-text-secondary">
                    By clicking "Confirm & Submit", you agree to our loan terms and conditions.
                    Your selected assets will be locked as collateral until the loan is fully repaid.
                    You understand the risks associated with cryptocurrency-backed loans including potential liquidation.
                  </p>
                </div>
              </div>
            </Card>
          </motion.div>

          {/* Action Buttons */}
          <motion.div variants={ITEM_VARIANTS} className="flex gap-4 justify-center pt-4">
            <Button
              variant="secondary"
              onClick={handleGoBack}
            >
              <ArrowLeft size={16} />
              Go Back
            </Button>
            <Button onClick={handleConfirm}>
              Confirm & Submit
              <ArrowRight size={16} />
            </Button>
          </motion.div>
        </motion.div>
      </main>
    </div>
  );
}
