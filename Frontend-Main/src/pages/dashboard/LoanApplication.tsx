import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Wallet, ArrowUpRight } from 'lucide-react';
import { Button, Card, Tooltip } from '@/components/ui';
import { DashboardLayout } from '@/components/layout';
import { formatCurrency } from '@/utils';
import type { ChartPeriod } from '@/utils';
import { CONTAINER_VARIANTS, ITEM_VARIANTS, ROUTES } from '@/constants';
import type { PayoutCurrency, PayoutMethod } from '@/types';
import { usePortfolio } from '@/hooks/queries/usePortfolio';
import { useAggregatedAssets } from '@/hooks/useAggregatedAssets';
import {
  PortfolioChart,
  CollateralAssetsTable,
  LoanOptionsPanel,
} from './components';

type CollateralAmounts = Record<string, number>;

export function LoanApplication() {
  const navigate = useNavigate();
  const { data: portfolio } = usePortfolio();
  const portfolioData = portfolio || { totalValue: 0, change24h: null, changeType: 'tracking_started' as const, changeValue: null, changePct: null, assets: [] };
  const aggregatedAssets = useAggregatedAssets(portfolioData.assets);

  // UI state
  const [activeTab, setActiveTab] = useState<'all' | 'crypto' | 'stocks' | 'cash'>('all');
  const [chartPeriod, setChartPeriod] = useState<ChartPeriod>('24H');
  const [selectedAssetIds, setSelectedAssetIds] = useState<string[]>([]);
  const [collateralAmounts, setCollateralAmounts] = useState<CollateralAmounts>({});
  const [expandedAssetId, setExpandedAssetId] = useState<string | null>(null);
  const [loanMonths, setLoanMonths] = useState<6 | 12 | 18 | 24 | 36>(12);
  const [payoutCurrency, setPayoutCurrency] = useState<PayoutCurrency>('USD');
  const [payoutMethod, setPayoutMethod] = useState<PayoutMethod>('bank_transfer');

  // Selection handlers
  const handleSelectAsset = (assetId: string) => {
    const asset = aggregatedAssets.find(a => a.id === assetId);
    if (!asset) return;

    setSelectedAssetIds(prev => {
      if (prev.includes(assetId)) {
        setCollateralAmounts(amounts => {
          const newAmounts = { ...amounts };
          delete newAmounts[assetId];
          return newAmounts;
        });
        setExpandedAssetId(current => current === assetId ? null : current);
        return prev.filter(id => id !== assetId);
      } else {
        setCollateralAmounts(amounts => ({ ...amounts, [assetId]: asset.amount }));
        setExpandedAssetId(assetId);
        return [...prev, assetId];
      }
    });
  };

  const handleSelectAll = () => {
    const filteredAssets = aggregatedAssets.filter(asset => {
      if (activeTab === 'all') return true;
      if (activeTab === 'crypto') return asset.type === 'crypto';
      if (activeTab === 'stocks') return asset.type === 'stock';
      if (activeTab === 'cash') return asset.type === 'cash';
      return true;
    });
    const filteredIds = filteredAssets.map(a => a.id);
    const allSelected = filteredIds.every(id => selectedAssetIds.includes(id));

    if (allSelected) {
      setSelectedAssetIds(prev => prev.filter(id => !filteredIds.includes(id)));
      setCollateralAmounts(amounts => {
        const newAmounts = { ...amounts };
        filteredIds.forEach(id => delete newAmounts[id]);
        return newAmounts;
      });
      setExpandedAssetId(null);
    } else {
      setSelectedAssetIds(prev => [...prev, ...filteredIds.filter(id => !prev.includes(id))]);
      setCollateralAmounts(amounts => {
        const newAmounts = { ...amounts };
        filteredAssets.forEach(asset => {
          if (!newAmounts[asset.id]) newAmounts[asset.id] = asset.amount;
        });
        return newAmounts;
      });
    }
  };

  const updateCollateralAmount = (assetId: string, amount: number) => {
    const asset = aggregatedAssets.find(a => a.id === assetId);
    if (!asset) return;
    setCollateralAmounts(prev => ({
      ...prev,
      [assetId]: Math.max(0, Math.min(amount, asset.amount)),
    }));
  };

  const setPercentage = (assetId: string, percent: number) => {
    const asset = aggregatedAssets.find(a => a.id === assetId);
    if (!asset) return;
    updateCollateralAmount(assetId, (asset.amount * percent) / 100);
  };

  // Computed values
  const selectedAssets = aggregatedAssets.filter(a => selectedAssetIds.includes(a.id));
  const selectedCryptoAssets = selectedAssets.filter(a => a.type === 'crypto');
  const canContinueToReview = selectedCryptoAssets.length > 0;
  const totalCollateralValue = selectedAssets.reduce((sum, asset) => {
    return sum + (collateralAmounts[asset.id] || 0) * asset.price;
  }, 0);

  const handleSubmit = () => {
    if (selectedAssetIds.length === 0) return;

    if (selectedCryptoAssets.length === 0) return;

    navigate(ROUTES.LOAN_REVIEW, {
          state: {
            loanRequest: {
          assets: selectedCryptoAssets.map(asset => ({
            symbol: asset.symbol,
            allocation_usd: (collateralAmounts[asset.id] || 0) * asset.price,
          })),
          months: loanMonths,
          payout_currency: payoutCurrency,
          payout_method: payoutMethod,
        },
        selectedAssets: selectedAssets.map(asset => ({
          name: asset.name,
          symbol: asset.symbol,
          amount: collateralAmounts[asset.id] || 0,
          value: (collateralAmounts[asset.id] || 0) * asset.price,
        })),
        totalCollateral: totalCollateralValue,
      },
    });
  };

  return (
    <DashboardLayout>
      <motion.div
        variants={CONTAINER_VARIANTS}
        initial="hidden"
        animate="visible"
        className="space-y-6"
      >
        {/* Header */}
        <motion.div variants={ITEM_VARIANTS} className="flex items-center justify-between gap-3">
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-text-primary">Apply for a Loan</h1>
          <Button variant="secondary" size="sm" onClick={() => navigate(ROUTES.DASHBOARD)} className="flex-shrink-0 sm:px-4 sm:py-2 sm:text-sm">
            <ArrowLeft size={16} />
            <span className="hidden sm:inline">Back to Dashboard</span>
            <span className="sm:hidden">Back</span>
          </Button>
        </motion.div>

        {/* Loan Eligibility Card */}
        <motion.div variants={ITEM_VARIANTS}>
          <Card variant="bordered" className="bg-gradient-to-br from-dark-card via-dark-elevated to-dark-card border-altrion-500/20">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 rounded-xl bg-altrion-500/20 flex items-center justify-center flex-shrink-0">
                  <Wallet size={20} className="text-altrion-400" />
                </div>
                <div className="min-w-0">
                  <h3 className="font-display text-lg sm:text-xl font-semibold text-text-primary">
                    {selectedAssetIds.length > 0 ? 'Loan Details' : 'Loan Eligibility'}
                  </h3>
                  <p className="text-text-muted text-xs">
                    {selectedAssetIds.length > 0 ? 'Total Collateral' : 'Max Portfolio Value'}
                  </p>
                </div>
              </div>
              <p className="text-xl sm:text-2xl font-bold text-altrion-400 flex-shrink-0">
                {formatCurrency(selectedAssetIds.length > 0 ? totalCollateralValue : portfolioData.totalValue)}
              </p>
            </div>
          </Card>
        </motion.div>

        {/* Portfolio Chart */}
        <PortfolioChart
          totalValue={portfolioData.totalValue}
          chartPeriod={chartPeriod}
          onPeriodChange={setChartPeriod}
        />

        {/* Collateral Assets Table */}
        <CollateralAssetsTable
          assets={aggregatedAssets}
          activeTab={activeTab}
          onTabChange={setActiveTab}
          selectedAssetIds={selectedAssetIds}
          collateralAmounts={collateralAmounts}
          expandedAssetId={expandedAssetId}
          onSelectAsset={handleSelectAsset}
          onSelectAll={handleSelectAll}
          onExpandAsset={setExpandedAssetId}
          onUpdateAmount={updateCollateralAmount}
          onSetPercentage={setPercentage}
        />

        {/* Total Collateral Summary */}
        <AnimatePresence>
          {selectedAssetIds.length > 0 && (
            <motion.div
              variants={ITEM_VARIANTS}
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
            >
              <Card variant="bordered" className="bg-gradient-to-r from-altrion-500/10 to-transparent border-altrion-500/30">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-xl bg-altrion-500/20 flex items-center justify-center flex-shrink-0">
                      <Wallet size={20} className="text-altrion-400" />
                    </div>
                    <div className="min-w-0">
                      <h3 className="font-display text-base sm:text-xl font-semibold text-text-primary truncate">Total Collateral</h3>
                      <p className="text-xs sm:text-sm text-text-secondary">
                        {selectedAssetIds.length} asset{selectedAssetIds.length !== 1 ? 's' : ''} selected
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-4 sm:gap-6 flex-shrink-0">
                    <div className="hidden lg:flex items-center gap-4">
                      {selectedAssets.slice(0, 3).map((asset) => {
                        const amount = collateralAmounts[asset.id] || 0;
                        return (
                          <div key={asset.id} className="text-right">
                            <p className="text-xs text-text-muted">{asset.symbol}</p>
                            <p className="text-sm font-semibold text-text-primary">{formatCurrency(amount * asset.price)}</p>
                          </div>
                        );
                      })}
                      {selectedAssets.length > 3 && (
                        <div className="text-right">
                          <p className="text-xs text-text-muted">+{selectedAssets.length - 3} more</p>
                        </div>
                      )}
                    </div>
                    <div className="h-10 w-px bg-dark-border hidden lg:block" />
                    <div className="text-right">
                      <p className="text-xs text-text-muted">Total Value</p>
                      <p className="text-lg sm:text-2xl font-bold text-altrion-400">{formatCurrency(totalCollateralValue)}</p>
                    </div>
                  </div>
                </div>
              </Card>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Loan Options */}
        <LoanOptionsPanel
          loanMonths={loanMonths}
          payoutCurrency={payoutCurrency}
          payoutMethod={payoutMethod}
          onMonthsChange={setLoanMonths}
          onCurrencyChange={setPayoutCurrency}
          onPayoutMethodChange={setPayoutMethod}
        />

        {/* Action Buttons */}
        <motion.div variants={ITEM_VARIANTS} className="grid grid-cols-1 sm:grid-cols-2 gap-3 pb-8">
          <Button variant="secondary" onClick={() => navigate(ROUTES.DASHBOARD)} className="w-full">
            <ArrowLeft size={16} />
            Cancel
          </Button>
          <Tooltip content="Select at least one crypto asset" disabled={canContinueToReview}>
            <Button
              onClick={handleSubmit}
              disabled={!canContinueToReview}
              className="w-full"
            >
              <span className="hidden sm:inline">
                Review Application
                {selectedAssetIds.length > 0 && ` with ${selectedAssetIds.length} Asset${selectedAssetIds.length !== 1 ? 's' : ''}`}
              </span>
              <span className="sm:hidden">
                Review{selectedAssetIds.length > 0 && ` (${selectedAssetIds.length})`}
              </span>
              <ArrowUpRight size={16} />
            </Button>
          </Tooltip>
        </motion.div>
      </motion.div>
    </DashboardLayout>
  );
}
