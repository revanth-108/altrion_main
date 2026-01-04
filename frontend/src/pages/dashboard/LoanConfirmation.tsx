import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  CheckCircle,
  Copy,
  Home,
  FileText,
  Clock,
  Shield,
  Wallet,
} from 'lucide-react';
import { Button, Card, Header } from '../../components/ui';
import { formatCurrency } from '../../utils';
import { CONTAINER_VARIANTS, ITEM_VARIANTS, ROUTES } from '../../constants';
import type { LoanCalculateResponse } from '@/types';

interface SelectedAsset {
  name: string;
  symbol: string;
  amount: number;
  value: number;
}

interface LoanConfirmationData {
  loanResponse: LoanCalculateResponse;
  selectedAssets: SelectedAsset[];
  applicationId?: string;
}

export function LoanConfirmation() {
  const navigate = useNavigate();
  const location = useLocation();
  const [copied, setCopied] = useState(false);

  // Get loan data from router state
  const loanData = location.state as LoanConfirmationData | null;

  // Use application ID from store or generate a fallback
  const applicationId = loanData?.applicationId || (() => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let id = 'ALT-';
    for (let i = 0; i < 8; i++) {
      id += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return id;
  })();

  // Generate submission date
  const submissionDate = new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  // If no loan data, redirect to dashboard
  useEffect(() => {
    if (!loanData) {
      navigate(ROUTES.DASHBOARD);
    }
  }, [loanData, navigate]);

  const copyApplicationId = () => {
    navigator.clipboard.writeText(applicationId);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!loanData) {
    return null;
  }

  const { loanResponse } = loanData;
  const summary = loanResponse.summary;

  return (
    <div className="min-h-screen bg-dark-bg relative">
      {/* Atmospheric background */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-altrion-500/10 rounded-full blur-[120px] animate-pulse" style={{ animationDuration: '8s' }} />
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-accent-cyan/5 rounded-full blur-[120px] animate-pulse" style={{ animationDuration: '10s' }} />
      </div>

      <Header />

      <main className="max-w-4xl mx-auto px-5 pt-16 pb-16">
        <motion.div
          variants={CONTAINER_VARIANTS}
          initial="hidden"
          animate="visible"
          className="space-y-6"
        >
          {/* Success Header */}
          <motion.div variants={ITEM_VARIANTS} className="text-center">
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: 'spring', stiffness: 200, damping: 15, delay: 0.2 }}
              className="w-20 h-20 mx-auto mb-4 rounded-full bg-altrion-500/20 flex items-center justify-center"
            >
              <CheckCircle size={48} className="text-altrion-400" />
            </motion.div>
            <h1 className="font-display text-3xl font-bold text-text-primary mb-2">
              Application Submitted Successfully!
            </h1>
            <p className="text-text-secondary">
              Your loan application has been received and is being processed.
            </p>
          </motion.div>

          {/* Application ID Card */}
          <motion.div variants={ITEM_VARIANTS}>
            <Card variant="bordered" className="bg-gradient-to-br from-dark-card via-dark-elevated to-dark-card border-altrion-500/20">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-text-muted text-sm mb-1">Application ID</p>
                  <p className="text-2xl font-bold text-text-primary font-mono">{applicationId}</p>
                </div>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={copyApplicationId}
                >
                  {copied ? (
                    <>
                      <CheckCircle size={16} />
                      Copied!
                    </>
                  ) : (
                    <>
                      <Copy size={16} />
                      Copy ID
                    </>
                  )}
                </Button>
              </div>
              <p className="text-text-muted text-xs mt-3">
                Save this ID for your records. You'll need it to track your application status.
              </p>
            </Card>
          </motion.div>

          {/* Loan Summary */}
          <motion.div variants={ITEM_VARIANTS}>
            <Card variant="bordered">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-xl bg-altrion-500/20 flex items-center justify-center">
                  <Wallet size={20} className="text-altrion-400" />
                </div>
                <div>
                  <h3 className="font-display text-xl font-semibold text-text-primary">Loan Summary</h3>
                  <p className="text-sm text-text-secondary">Your approved loan details</p>
                </div>
              </div>

              {/* Main Stats */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                <div className="p-4 bg-dark-elevated rounded-xl">
                  <p className="text-text-muted text-xs mb-1">Total Collateral</p>
                  <p className="text-xl font-bold text-text-primary">
                    {formatCurrency(summary.total_collateral)}
                  </p>
                </div>
                <div className="p-4 bg-dark-elevated rounded-xl">
                  <p className="text-text-muted text-xs mb-1">Loan Amount</p>
                  <p className="text-xl font-bold text-altrion-400">
                    {formatCurrency(summary.total_loan)}
                  </p>
                </div>
                <div className="p-4 bg-dark-elevated rounded-xl">
                  <p className="text-text-muted text-xs mb-1">Interest Rate</p>
                  <p className="text-xl font-bold text-text-primary">
                    {summary.interest_rate.toFixed(2)}% APR
                  </p>
                </div>
                <div className="p-4 bg-dark-elevated rounded-xl">
                  <p className="text-text-muted text-xs mb-1">LTV Ratio</p>
                  <p className="text-xl font-bold text-text-primary">
                    {summary.portfolio_ltv.toFixed(0)}%
                  </p>
                </div>
              </div>

              {/* Payment & Risk Stats */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                <div className="p-4 bg-dark-elevated rounded-xl">
                  <p className="text-text-muted text-xs mb-1">Monthly Payment</p>
                  <p className="text-xl font-bold text-accent-cyan">
                    {formatCurrency(summary.monthly_emi)}
                  </p>
                </div>
                <div className="p-4 bg-dark-elevated rounded-xl">
                  <p className="text-text-muted text-xs mb-1">Loan Term</p>
                  <p className="text-xl font-bold text-text-primary">
                    {summary.months} months
                  </p>
                </div>
                <div className="p-4 bg-dark-elevated rounded-xl">
                  <p className="text-text-muted text-xs mb-1">Margin Call LTV</p>
                  <p className="text-xl font-bold text-amber-400">
                    {summary.margin_call_ltv.toFixed(0)}%
                  </p>
                </div>
                <div className="p-4 bg-dark-elevated rounded-xl">
                  <p className="text-text-muted text-xs mb-1">Liquidation LTV</p>
                  <p className="text-xl font-bold text-red-400">
                    {summary.liquidation_ltv.toFixed(0)}%
                  </p>
                </div>
              </div>

              {/* Asset Details - Expanded */}
              <div className="border-t border-dark-border pt-4 mt-4">
                <p className="text-sm font-medium text-text-secondary mb-3">Collateral Asset Breakdown</p>
                <div className="space-y-2">
                  {loanResponse.assets.map((asset, index) => (
                    <div
                      key={index}
                      className="p-3 bg-dark-elevated rounded-lg border border-dark-border/50"
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <div className="w-10 h-10 rounded-full bg-dark-card flex items-center justify-center font-bold text-sm">
                            {asset.symbol.slice(0, 2)}
                          </div>
                          <div>
                            <p className="font-semibold text-text-primary text-sm">{asset.symbol}</p>
                            <p className="text-xs text-text-muted">{asset.tier}</p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-xs text-text-muted">Monthly Payment</p>
                          <p className="text-base font-bold text-accent-cyan">
                            {formatCurrency(loanResponse.schedule.payments[asset.symbol])}
                          </p>
                        </div>
                      </div>

                      <div className="grid grid-cols-4 gap-2 mb-2">
                        <div>
                          <p className="text-xs text-text-muted">Collateral</p>
                          <p className="text-sm font-semibold text-text-primary">
                            {formatCurrency(asset.collateral_usd)}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-text-muted">Loan Amount</p>
                          <p className="text-sm font-semibold text-altrion-400">
                            {formatCurrency(asset.loan_usd)}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-text-muted">LTV</p>
                          <p className="text-sm font-semibold text-text-primary">
                            {(asset.ltv * 100).toFixed(1)}%
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-text-muted">Interest Rate</p>
                          <p className="text-sm font-semibold text-text-primary">
                            {(asset.interest_rate * 100).toFixed(2)}%
                          </p>
                        </div>
                      </div>

                      <div className="grid grid-cols-4 gap-2 pt-2 border-t border-dark-border/30">
                        <div>
                          <p className="text-xs text-text-muted">Base Rate</p>
                          <p className="text-xs font-medium text-text-primary">
                            {(asset.base_rate * 100).toFixed(2)}%
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-text-muted">Risk Premium</p>
                          <p className="text-xs font-medium text-amber-400">
                            {(asset.risk_premium * 100).toFixed(2)}%
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-text-muted">Volatility Premium</p>
                          <p className="text-xs font-medium text-red-400">
                            {(asset.volatility_premium * 100).toFixed(2)}%
                          </p>
                        </div>
                        {asset.pct_change_30d !== null && (
                          <div>
                            <p className="text-xs text-text-muted">30-day Change</p>
                            <p className={`text-xs font-medium ${asset.pct_change_30d >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                              {asset.pct_change_30d >= 0 ? '+' : ''}{asset.pct_change_30d.toFixed(2)}%
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Portfolio Payment Schedule - Full */}
              <div className="border-t border-dark-border pt-4 mt-4">
                <p className="text-sm font-medium text-text-secondary mb-3">Portfolio Payment Schedule</p>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-text-muted text-xs">
                        <th className="text-left py-2 px-3">Month</th>
                        <th className="text-right py-2 px-3">Payment</th>
                        <th className="text-right py-2 px-3">Principal</th>
                        <th className="text-right py-2 px-3">Interest</th>
                        <th className="text-right py-2 px-3">Balance</th>
                      </tr>
                    </thead>
                    <tbody>
                      {loanResponse.schedule.portfolio.map((row) => (
                        <tr key={row.month} className="border-t border-dark-border/50">
                          <td className="py-2 px-3 text-text-primary font-medium">{row.month}</td>
                          <td className="py-2 px-3 text-right text-text-primary">{formatCurrency(row.payment)}</td>
                          <td className="py-2 px-3 text-right text-altrion-400">{formatCurrency(row.principal)}</td>
                          <td className="py-2 px-3 text-right text-amber-400">{formatCurrency(row.interest)}</td>
                          <td className="py-2 px-3 text-right text-text-muted">{formatCurrency(row.ending_balance)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </Card>
          </motion.div>

          {/* Analyst Report */}
          {summary.analyst?.markdown && (
            <motion.div variants={ITEM_VARIANTS}>
              <Card variant="bordered" className="bg-gradient-to-br from-purple-500/5 to-blue-500/5 border-purple-500/20">
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-12 h-12 rounded-xl bg-purple-500/20 flex items-center justify-center">
                    <FileText size={24} className="text-purple-400" />
                  </div>
                  <div>
                    <h2 className="font-display text-2xl font-bold text-text-primary">Loan Analyst Summary</h2>
                    <p className="text-sm text-text-secondary">
                      {summary.analyst.used_llm 
                        ? `Generated by ${summary.analyst.provider} (${summary.analyst.model})`
                        : 'Deterministic analysis'}
                    </p>
                  </div>
                </div>

                <div className="space-y-6">
                  {summary.analyst.markdown
                    .replace(/^## /, '')
                    .split('\n## ')
                    .map((section, idx) => {
                    if (!section.trim()) return null;
                    
                    const lines = section.split('\n');
                    const title = lines[0];
                    const content = lines.slice(1);
                    
                    return (
                      <div key={idx} className="bg-dark-elevated/50 rounded-lg p-4 border border-dark-border/30">
                        <h3 className="text-base font-bold text-text-primary mb-3 pb-2 border-b border-dark-border/50">{title}</h3>
                        <div className="space-y-2">
                          {content.map((line, lineIdx) => {
                            if (line.startsWith('- ')) {
                              const text = line.substring(2);
                              const boldRegex = /\*\*(.+?)\*\*/g;
                              const linkRegex = /\[(.+?)\]\((.+?)\)/g;
                              
                              let processed = text.replace(boldRegex, (_, p1) => `<strong class="text-text-primary font-semibold">${p1}</strong>`);
                              processed = processed.replace(linkRegex, (_, p1, p2) => `<a href="${p2}" class="text-altrion-400 hover:text-altrion-300 underline" target="_blank" rel="noopener noreferrer">${p1}</a>`);
                              
                              return (
                                <div key={lineIdx} className="flex gap-2 text-sm">
                                  <span className="text-altrion-400 mt-0.5">•</span>
                                  <span className="flex-1 text-text-secondary leading-relaxed" dangerouslySetInnerHTML={{ __html: processed }} />
                                </div>
                              );
                            }
                            
                            if (line.startsWith('**') && line.endsWith('**')) {
                              const coinName = line.replace(/\*\*/g, '');
                              return <h4 key={lineIdx} className="font-bold text-text-primary mt-4 mb-2 text-sm">{coinName}</h4>;
                            }
                            
                            if (line.trim()) {
                              const boldRegex = /\*\*(.+?)\*\*/g;
                              const linkRegex = /\[(.+?)\]\((.+?)\)/g;
                              
                              let processed = line.replace(boldRegex, (_, p1) => `<strong class="text-text-primary font-semibold">${p1}</strong>`);
                              processed = processed.replace(linkRegex, (_, p1, p2) => `<a href="${p2}" class="text-altrion-400 hover:text-altrion-300 underline" target="_blank" rel="noopener noreferrer">${p1}</a>`);
                              
                              return <p key={lineIdx} className="text-sm text-text-secondary leading-relaxed" dangerouslySetInnerHTML={{ __html: processed }} />;
                            }
                            return null;
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Final Loan Details Summary */}
                <div className="mt-6 p-5 bg-gradient-to-br from-altrion-500/10 to-blue-500/10 border border-altrion-500/30 rounded-lg">
                  <h3 className="text-lg font-bold text-text-primary mb-4">Final Loan Details</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-xs text-text-muted mb-1">Total Collateral Selected</p>
                      <p className="text-lg font-bold text-text-primary">{formatCurrency(summary.total_collateral)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-text-muted mb-1">Total Loan Amount</p>
                      <p className="text-lg font-bold text-altrion-400">{formatCurrency(summary.total_loan)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-text-muted mb-1">Portfolio LTV</p>
                      <p className="text-lg font-bold text-text-primary">{summary.portfolio_ltv.toFixed(2)}%</p>
                    </div>
                    <div>
                      <p className="text-xs text-text-muted mb-1">Liquidation LTV</p>
                      <p className="text-lg font-bold text-red-400">{summary.liquidation_ltv.toFixed(2)}%</p>
                    </div>
                    <div>
                      <p className="text-xs text-text-muted mb-1">Margin Call LTV</p>
                      <p className="text-lg font-bold text-amber-400">{summary.margin_call_ltv.toFixed(2)}%</p>
                    </div>
                    <div>
                      <p className="text-xs text-text-muted mb-1">Interest Rate</p>
                      <p className="text-lg font-bold text-text-primary">{summary.interest_rate.toFixed(2)}%</p>
                    </div>
                    <div>
                      <p className="text-xs text-text-muted mb-1">Loan Duration</p>
                      <p className="text-lg font-bold text-text-primary">{summary.months} months</p>
                    </div>
                    <div>
                      <p className="text-xs text-text-muted mb-1">Monthly Repayment (EMI)</p>
                      <p className="text-lg font-bold text-accent-cyan">{formatCurrency(summary.monthly_emi)}</p>
                    </div>
                  </div>
                </div>
              </Card>
            </motion.div>
          )}

          {/* Timeline / What's Next */}
          <motion.div variants={ITEM_VARIANTS}>
            <Card variant="bordered">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-xl bg-accent-cyan/20 flex items-center justify-center">
                  <Clock size={20} className="text-accent-cyan" />
                </div>
                <div>
                  <h3 className="font-display text-xl font-semibold text-text-primary">What's Next?</h3>
                  <p className="text-sm text-text-secondary">Expected timeline for your application</p>
                </div>
              </div>

              <div className="space-y-4">
                <div className="flex gap-4">
                  <div className="flex flex-col items-center">
                    <div className="w-8 h-8 rounded-full bg-altrion-500 flex items-center justify-center">
                      <CheckCircle size={16} className="text-white" />
                    </div>
                    <div className="w-0.5 h-full bg-altrion-500 mt-2" />
                  </div>
                  <div className="pb-6">
                    <p className="font-medium text-text-primary">Application Submitted</p>
                    <p className="text-sm text-text-muted">{submissionDate}</p>
                  </div>
                </div>

                <div className="flex gap-4">
                  <div className="flex flex-col items-center">
                    <div className="w-8 h-8 rounded-full bg-dark-elevated border-2 border-altrion-500 flex items-center justify-center">
                      <Shield size={16} className="text-altrion-400" />
                    </div>
                    <div className="w-0.5 h-full bg-dark-border mt-2" />
                  </div>
                  <div className="pb-6">
                    <p className="font-medium text-text-primary">Collateral Verification</p>
                    <p className="text-sm text-text-muted">Usually within 24 hours</p>
                  </div>
                </div>

                <div className="flex gap-4">
                  <div className="flex flex-col items-center">
                    <div className="w-8 h-8 rounded-full bg-dark-elevated border-2 border-dark-border flex items-center justify-center">
                      <FileText size={16} className="text-text-muted" />
                    </div>
                    <div className="w-0.5 h-full bg-dark-border mt-2" />
                  </div>
                  <div className="pb-6">
                    <p className="font-medium text-text-secondary">Final Approval</p>
                    <p className="text-sm text-text-muted">1-2 business days</p>
                  </div>
                </div>

                <div className="flex gap-4">
                  <div className="flex flex-col items-center">
                    <div className="w-8 h-8 rounded-full bg-dark-elevated border-2 border-dark-border flex items-center justify-center">
                      <Wallet size={16} className="text-text-muted" />
                    </div>
                  </div>
                  <div>
                    <p className="font-medium text-text-secondary">Funds Disbursement</p>
                    <p className="text-sm text-text-muted">Same day after approval</p>
                  </div>
                </div>
              </div>
            </Card>
          </motion.div>

          {/* Action Buttons */}
          <motion.div variants={ITEM_VARIANTS} className="flex justify-center">
            <Button onClick={() => navigate(ROUTES.DASHBOARD)}>
              <Home size={16} />
              Back to Dashboard
            </Button>
          </motion.div>

          {/* Help Text */}
          <motion.div variants={ITEM_VARIANTS} className="text-center">
            <p className="text-text-muted text-sm">
              Questions about your application? Contact our support team at{' '}
              <a href="mailto:support@altrion.com" className="text-altrion-400 hover:underline">
                support@altrion.com
              </a>
            </p>
          </motion.div>
        </motion.div>
      </main>
    </div>
  );
}
