import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  ArrowLeft,
  AlertCircle,
  Wallet,
  Shield,
  ArrowRight,
  ChevronDown,
  ChevronUp,
  FileText,
} from 'lucide-react';
import { Button, Card, Header } from '../../components/ui';
import { formatCurrency } from '../../utils';
import { CONTAINER_VARIANTS, ITEM_VARIANTS, ROUTES } from '../../constants';
import { useCalculateLoan } from '../../hooks';
import type { LoanCalculateRequest } from '@/types';

interface SelectedAsset {
  name: string;
  symbol: string;
  amount: number;
  value: number;
}

interface LoanReviewData {
  loanRequest: LoanCalculateRequest;
  selectedAssets: SelectedAsset[];
  totalCollateral: number;
}

const BANK_LABELS: Record<string, string> = {
  chase: 'Chase',
  bofa: 'Bank of America',
};

export function LoanReview() {
  const navigate = useNavigate();
  const location = useLocation();
  const calculateLoanMutation = useCalculateLoan();

  // Get loan data from router state
  const loanData = location.state as LoanReviewData | null;

  // If no loan data, redirect to loan application
  useEffect(() => {
    if (!loanData) {
      navigate(ROUTES.LOAN_APPLICATION);
    }
  }, [loanData, navigate]);

  const [showSummary, setShowSummary] = useState(false);

  const { loanRequest, selectedAssets, totalCollateral } = loanData || { 
    loanRequest: null, 
    selectedAssets: [], 
    totalCollateral: 0 
  };

  const handleConfirm = async () => {
    if (!loanData || !loanRequest) return;

    try {
      // Call the loan API
      const loanResponse = await calculateLoanMutation.mutateAsync(loanRequest);

      // Navigate to loan summary page to show full details before final confirmation
      navigate(ROUTES.LOAN_SUMMARY, {
        state: {
          loanResponse,
          selectedAssets,
          loanRequest: {
            months: loanRequest.months,
            payout_currency: loanRequest.payout_currency,
            bank: loanRequest.bank,
          }
        }
      });
    } catch (error) {
      console.error('Loan calculation failed:', error);
    }
  };

  const handleGoBack = () => {
    navigate(ROUTES.LOAN_APPLICATION);
  };

  if (!loanData) {
    return null;
  }

  return (
    <div className="min-h-screen bg-dark-bg relative">
      {/* Atmospheric background */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-altrion-500/10 rounded-full blur-[120px] animate-pulse" style={{ animationDuration: '8s' }} />
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-accent-cyan/5 rounded-full blur-[120px] animate-pulse" style={{ animationDuration: '10s' }} />
      </div>

      <Header />

      <main className="max-w-3xl mx-auto px-5 py-8">
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
              className="w-16 h-16 mx-auto mb-4 rounded-full bg-amber-500/20 flex items-center justify-center"
            >
              <AlertCircle size={36} className="text-amber-400" />
            </motion.div>
            <h1 className="font-display text-3xl font-bold text-text-primary mb-2">
              Confirm Your Loan Application
            </h1>
            <p className="text-text-secondary">
              Please review the details below before submitting your application.
            </p>
          </motion.div>

          {/* Loan Details Card */}
          <motion.div variants={ITEM_VARIANTS}>
            <Card variant="bordered" className="border-amber-500/30">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-xl bg-altrion-500/20 flex items-center justify-center">
                  <Wallet size={20} className="text-altrion-400" />
                </div>
                <div>
                  <h3 className="font-display text-xl font-semibold text-text-primary">Loan Details</h3>
                  <p className="text-sm text-text-secondary">Review your loan terms</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 mb-6">
                <div className="p-4 bg-dark-elevated rounded-xl">
                  <p className="text-text-muted text-xs mb-1">Total Collateral</p>
                  <p className="text-2xl font-bold text-altrion-400">
                    {formatCurrency(totalCollateral)}
                  </p>
                </div>
                <div className="p-4 bg-dark-elevated rounded-xl">
                  <p className="text-text-muted text-xs mb-1">Loan Term</p>
                  <p className="text-2xl font-bold text-text-primary">
                    {loanRequest?.months || 0} months
                  </p>
                </div>
                <div className="p-4 bg-dark-elevated rounded-xl">
                  <p className="text-text-muted text-xs mb-1">Payout Currency</p>
                  <p className="text-2xl font-bold text-text-primary">
                    {loanRequest?.payout_currency || 'USD'}
                  </p>
                </div>
                <div className="p-4 bg-dark-elevated rounded-xl">
                  <p className="text-text-muted text-xs mb-1">Bank Account</p>
                  <p className="text-2xl font-bold text-text-primary">
                    {BANK_LABELS[loanRequest?.bank || 'chase'] || loanRequest?.bank}
                  </p>
                </div>
              </div>

              {/* Selected Assets */}
              <div className="border-t border-dark-border pt-4">
                <p className="text-sm font-medium text-text-secondary mb-3">
                  Collateral Assets ({selectedAssets.length})
                </p>
                <div className="space-y-2">
                  {selectedAssets.map((asset, index) => (
                    <div
                      key={index}
                      className="flex items-center justify-between p-3 bg-dark-elevated rounded-lg"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-dark-card flex items-center justify-center font-bold text-sm">
                          {asset.symbol.slice(0, 2)}
                        </div>
                        <div>
                          <p className="font-medium text-text-primary">{asset.name}</p>
                          <p className="text-text-muted text-sm">
                            {asset.amount.toLocaleString()} {asset.symbol}
                          </p>
                        </div>
                      </div>
                      <p className="font-semibold text-text-primary">
                        {formatCurrency(asset.value)}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </Card>
          </motion.div>

          {/* Loan Summary - Collapsible */}
          <motion.div variants={ITEM_VARIANTS}>
            <Card variant="bordered" className="border-blue-500/30">
              <button
                onClick={() => setShowSummary(!showSummary)}
                className="w-full flex items-center justify-between p-4 hover:bg-dark-elevated/50 transition-colors rounded-lg"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-blue-500/20 flex items-center justify-center">
                    <FileText size={20} className="text-blue-400" />
                  </div>
                  <div className="text-left">
                    <h3 className="font-display text-xl font-semibold text-text-primary">Loan Summary</h3>
                    <p className="text-sm text-text-secondary">View estimated loan details</p>
                  </div>
                </div>
                {showSummary ? (
                  <ChevronUp size={24} className="text-text-muted" />
                ) : (
                  <ChevronDown size={24} className="text-text-muted" />
                )}
              </button>

              <AnimatePresence>
                {showSummary && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.3 }}
                    className="overflow-hidden"
                  >
                    <div className="px-4 pb-4 pt-2 border-t border-dark-border mt-2">
                      <p className="text-xs text-text-muted mb-4 italic">
                        Note: These are estimated values based on your selected collateral. Final terms will be calculated after submission.
                      </p>

                      <div className="grid grid-cols-2 gap-3 mb-4">
                        <div className="p-3 bg-dark-elevated rounded-lg">
                          <p className="text-xs text-text-muted mb-1">Total Collateral</p>
                          <p className="text-lg font-bold text-text-primary">
                            {formatCurrency(totalCollateral)}
                          </p>
                        </div>
                        <div className="p-3 bg-dark-elevated rounded-lg">
                          <p className="text-xs text-text-muted mb-1">Estimated Loan (75% LTV)</p>
                          <p className="text-lg font-bold text-altrion-400">
                            {formatCurrency(totalCollateral * 0.75)}
                          </p>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-3 mb-4">
                        <div className="p-3 bg-dark-elevated rounded-lg">
                          <p className="text-xs text-text-muted mb-1">Loan Term</p>
                          <p className="text-lg font-bold text-text-primary">
                            {loanRequest?.months || 0} months
                          </p>
                        </div>
                        <div className="p-3 bg-dark-elevated rounded-lg">
                          <p className="text-xs text-text-muted mb-1">Est. Interest Rate</p>
                          <p className="text-lg font-bold text-text-primary">
                            ~12-18% APR
                          </p>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div className="p-3 bg-dark-elevated rounded-lg">
                          <p className="text-xs text-text-muted mb-1">Payout Currency</p>
                          <p className="text-lg font-bold text-text-primary">
                            {loanRequest?.payout_currency || 'USD'}
                          </p>
                        </div>
                        <div className="p-3 bg-dark-elevated rounded-lg">
                          <p className="text-xs text-text-muted mb-1">Bank Account</p>
                          <p className="text-lg font-bold text-text-primary">
                            {BANK_LABELS[loanRequest?.bank || 'chase'] || loanRequest?.bank}
                          </p>
                        </div>
                      </div>

                      <div className="mt-4 p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg">
                        <p className="text-xs text-amber-400">
                          <strong>Important:</strong> Actual loan amount, interest rate, and terms will be determined by our system based on real-time market conditions and asset risk assessment.
                        </p>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </Card>
          </motion.div>

          {/* Warning Notice */}
          <motion.div variants={ITEM_VARIANTS}>
            <Card variant="bordered" className="bg-amber-500/5 border-amber-500/30">
              <div className="flex gap-3">
                <Shield size={20} className="text-amber-400 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium text-text-primary mb-1">Important Notice</p>
                  <p className="text-sm text-text-secondary">
                    By submitting this application, you agree to lock the selected assets as collateral.
                    These assets will be held until the loan is fully repaid. Make sure you understand
                    the terms before proceeding.
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
              Go Back & Edit
            </Button>
            <Button
              onClick={handleConfirm}
              disabled={calculateLoanMutation.isPending}
            >
              {calculateLoanMutation.isPending ? 'Calculating...' : 'Continue to Review'}
              {!calculateLoanMutation.isPending && <ArrowRight size={16} />}
            </Button>
          </motion.div>
        </motion.div>
      </main>
    </div>
  );
}
