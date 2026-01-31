import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Wallet,
  TrendingUp,
  TrendingDown,
  ArrowUpRight,
  PieChart,
  ChevronDown,
  Minus,
  Plus,
  Calendar,
  DollarSign,
  Landmark,
} from 'lucide-react';
import { Button, Card, Header, Checkbox, Tooltip } from '../../components/ui';
import { formatCurrency, formatPercent, generateChartData, normalizeChartY, normalizeChartX } from '../../utils';
import type { ChartPeriod } from '../../utils';
import { CONTAINER_VARIANTS, ITEM_VARIANTS, ROUTES } from '../../constants';
import type { PayoutCurrency, BankOption } from '@/types';
import { usePortfolio } from '../../hooks/queries/usePortfolio';

// Type for collateral amounts
type CollateralAmounts = Record<string, number>;

// Platform logos mapping
const PLATFORM_LOGOS: Record<string, string> = {
  'Coinbase': '/coinbase.svg',
  'MetaMask': '/metamask.png',
  'Robinhood': '/robinhood.svg',
};

export function LoanApplication() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<'all' | 'crypto' | 'stocks' | 'cash'>('all');
  const [chartPeriod, setChartPeriod] = useState<ChartPeriod>('24H');
  const [selectedAssetIds, setSelectedAssetIds] = useState<string[]>([]);
  const [collateralAmounts, setCollateralAmounts] = useState<CollateralAmounts>({});
  const [expandedAssetId, setExpandedAssetId] = useState<string | null>(null);
  const [loanMonths, setLoanMonths] = useState<6 | 12 | 18 | 24 | 36>(12);
  const [payoutCurrency, setPayoutCurrency] = useState<PayoutCurrency>('USD');
  const [selectedBank, setSelectedBank] = useState<BankOption>('chase');
  const [hoveredPoint, setHoveredPoint] = useState<{ index: number; x: number; y: number } | null>(null);
  const { data: portfolio } = usePortfolio();
  const portfolioData = portfolio || { totalValue: 0, change24h: 0, assets: [] };

  // Aggregate assets by symbol (combine same assets from different platforms)
  const aggregatedAssets = useMemo(() => {
    const assetMap = new Map<string, {
      id: string;
      symbol: string;
      name: string;
      amount: number;
      value: number;
      price: number;
      change24h: number;
      platforms: string[];
      type: 'crypto' | 'stock' | 'stablecoin';
    }>();

    portfolioData.assets.forEach(asset => {
      const existing = assetMap.get(asset.symbol);
      if (existing) {
        existing.amount += asset.amount;
        existing.value += asset.value;
        const platforms = asset.platform.split(', ').filter(Boolean);
        platforms.forEach(platform => {
          if (!existing.platforms.includes(platform)) {
            existing.platforms.push(platform);
          }
        });
      } else {
        const platforms = asset.platform.split(', ').filter(Boolean);
        assetMap.set(asset.symbol, {
          id: asset.id,
          symbol: asset.symbol,
          name: asset.name,
          amount: asset.amount,
          value: asset.value,
          price: asset.price,
          change24h: asset.change24h,
          platforms: platforms.length > 0 ? platforms : [asset.platform],
          type: asset.type,
        });
      }
    });

    return Array.from(assetMap.values());
  }, [portfolioData.assets]);

  const filteredAssets = aggregatedAssets.filter(asset => {
    if (activeTab === 'all') return true;
    if (activeTab === 'crypto') return asset.type === 'crypto';
    if (activeTab === 'stocks') return asset.type === 'stock';
    if (activeTab === 'cash') return asset.type === 'stablecoin';
    return true;
  });

  // Handle individual asset selection
  const handleSelectAsset = (assetId: string) => {
    const asset = aggregatedAssets.find(a => a.id === assetId);
    if (!asset) return;

    setSelectedAssetIds(prev => {
      if (prev.includes(assetId)) {
        // Deselecting - remove from collateral amounts and collapse
        setCollateralAmounts(amounts => {
          const newAmounts = { ...amounts };
          delete newAmounts[assetId];
          return newAmounts;
        });
        setExpandedAssetId(current => current === assetId ? null : current);
        return prev.filter(id => id !== assetId);
      } else {
        // Selecting - set default amount to full holdings and expand
        setCollateralAmounts(amounts => ({
          ...amounts,
          [assetId]: asset.amount
        }));
        setExpandedAssetId(assetId);
        return [...prev, assetId];
      }
    });
  };

  // Handle select all for current filtered view
  const handleSelectAll = () => {
    const filteredAssetIds = filteredAssets.map(a => a.id);
    const allSelected = filteredAssetIds.every(id => selectedAssetIds.includes(id));

    if (allSelected) {
      // Deselect all
      setSelectedAssetIds(prev => prev.filter(id => !filteredAssetIds.includes(id)));
      setCollateralAmounts(amounts => {
        const newAmounts = { ...amounts };
        filteredAssetIds.forEach(id => delete newAmounts[id]);
        return newAmounts;
      });
      setExpandedAssetId(null);
    } else {
      // Select all with full amounts
      setSelectedAssetIds(prev => {
        const newIds = filteredAssetIds.filter(id => !prev.includes(id));
        return [...prev, ...newIds];
      });
      setCollateralAmounts(amounts => {
        const newAmounts = { ...amounts };
        filteredAssets.forEach(asset => {
          if (!newAmounts[asset.id]) {
            newAmounts[asset.id] = asset.amount;
          }
        });
        return newAmounts;
      });
    }
  };

  // Update collateral amount for an asset
  const updateCollateralAmount = (assetId: string, amount: number) => {
    const asset = aggregatedAssets.find(a => a.id === assetId);
    if (!asset) return;

    // Clamp amount between 0 and max holdings
    const clampedAmount = Math.max(0, Math.min(amount, asset.amount));
    setCollateralAmounts(prev => ({
      ...prev,
      [assetId]: clampedAmount
    }));
  };

  // Set percentage of holdings
  const setPercentage = (assetId: string, percent: number) => {
    const asset = aggregatedAssets.find(a => a.id === assetId);
    if (!asset) return;

    const amount = (asset.amount * percent) / 100;
    updateCollateralAmount(assetId, amount);
  };

  // Calculate checkbox states
  const filteredAssetIds = filteredAssets.map(a => a.id);
  const selectedCount = filteredAssetIds.filter(id => selectedAssetIds.includes(id)).length;
  const isAllSelected = selectedCount === filteredAssetIds.length && filteredAssetIds.length > 0;
  const isIndeterminate = selectedCount > 0 && selectedCount < filteredAssetIds.length;

  // Get selected assets with their collateral amounts
  const selectedAssets = aggregatedAssets.filter(
    asset => selectedAssetIds.includes(asset.id)
  );

  // Calculate loan parameters based on selected collateral amounts
  const totalCollateralValue = selectedAssets.reduce((sum, asset) => {
    const amount = collateralAmounts[asset.id] || 0;
    return sum + (amount * asset.price);
  }, 0);

  // Chart data - memoized to prevent regeneration on mouse move
  const chartData = useMemo(
    () => generateChartData(portfolioData.totalValue, chartPeriod),
    [portfolioData.totalValue, chartPeriod]
  );
  const maxValue = useMemo(() => Math.max(...chartData.map(d => d.value)), [chartData]);
  const minValue = useMemo(() => Math.min(...chartData.map(d => d.value)), [chartData]);

  const handleSubmit = () => {
    if (selectedAssetIds.length === 0) return;

    // Build request for loan API - only include crypto assets
    const cryptoAssets = selectedAssets.filter(asset => asset.type === 'crypto' || asset.type === 'stablecoin');
    
    if (cryptoAssets.length === 0) {
      // TODO: Show error - only crypto assets supported
      return;
    }

    // Navigate to review with selection data (API will be called on confirm)
    navigate(ROUTES.LOAN_REVIEW, { 
      state: { 
        loanRequest: {
          assets: cryptoAssets.map(asset => ({
            symbol: asset.symbol,
            allocation_usd: (collateralAmounts[asset.id] || 0) * asset.price,
          })),
          months: loanMonths,
          payout_currency: payoutCurrency,
          bank: selectedBank,
        },
        selectedAssets: selectedAssets.map(asset => ({
          name: asset.name,
          symbol: asset.symbol,
          amount: collateralAmounts[asset.id] || 0,
          value: (collateralAmounts[asset.id] || 0) * asset.price,
        })),
        totalCollateral: totalCollateralValue,
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

      <main className="max-w-7xl mx-auto px-5 py-6">
        <motion.div
          variants={CONTAINER_VARIANTS}
          initial="hidden"
          animate="visible"
          className="space-y-6"
        >
          {/* Header */}
          <motion.div variants={ITEM_VARIANTS} className="flex items-center justify-between">
            <div>
              <h1 className="font-display text-3xl font-bold text-text-primary">Apply for a Loan</h1>
              <p className="text-text-secondary text-sm mt-0.5">
                Select your assets as collateral and see how they're performing
              </p>
            </div>
            <Button variant="secondary" onClick={() => navigate(ROUTES.DASHBOARD)}>
              <ArrowLeft size={18} />
              Back to Dashboard
            </Button>
          </motion.div>

          {/* Loan Eligibility Card - Updates based on selection */}
          <motion.div variants={ITEM_VARIANTS}>
            <Card variant="bordered" className="bg-gradient-to-br from-dark-card via-dark-elevated to-dark-card border-altrion-500/20">
              <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-5">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-altrion-500/20 flex items-center justify-center">
                    <Wallet size={20} className="text-altrion-400" />
                  </div>
                  <div>
                    <h3 className="font-display text-xl font-semibold text-text-primary">
                      {selectedAssetIds.length > 0 ? 'Loan Details' : 'Loan Eligibility'}
                    </h3>
                    <p className="text-sm text-text-secondary">
                      {selectedAssetIds.length > 0
                        ? `Based on ${selectedAssetIds.length} selected asset${selectedAssetIds.length !== 1 ? 's' : ''}`
                        : 'Select assets below to calculate your loan'}
                    </p>
                  </div>
                </div>

                <div className="flex items-baseline gap-2">
                  <span className="text-text-muted text-xs">
                    {selectedAssetIds.length > 0 ? 'Total Collateral' : 'Max Portfolio Value'}
                  </span>
                  <span className="text-xl font-bold text-text-primary">
                    {formatCurrency(selectedAssetIds.length > 0 ? totalCollateralValue : portfolioData.totalValue)}
                  </span>
                </div>
              </div>
            </Card>
          </motion.div>

          {/* Portfolio Value Chart */}
          <motion.div variants={ITEM_VARIANTS}>
            <Card variant="bordered">
              <div className="flex items-center justify-between mb-5">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-accent-cyan/20 flex items-center justify-center">
                    <TrendingUp size={20} className="text-accent-cyan" />
                  </div>
                  <div>
                    <h3 className="font-display text-xl font-semibold text-text-primary">Portfolio Performance</h3>
                    <p className="text-sm text-text-secondary">See how your assets are performing before using as collateral</p>
                  </div>
                </div>

                {/* Time Period Filters */}
                <div className="flex gap-1 bg-dark-elevated p-1 rounded-lg">
                  {(['1H', '24H', '7D', '1M', '1Y'] as const).map((period) => (
                    <button
                      key={period}
                      onClick={() => setChartPeriod(period)}
                      className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                        chartPeriod === period
                          ? 'bg-altrion-500 text-text-primary'
                          : 'text-text-muted hover:text-text-primary'
                      }`}
                    >
                      {period}
                    </button>
                  ))}
                </div>
              </div>

              {/* Chart */}
              <div
                className="relative h-64 w-full pl-10"
                onMouseMove={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect();
                  const x = e.clientX - rect.left - 40; // Subtract padding
                  const chartWidth = rect.width - 40;
                  const index = Math.round((x / chartWidth) * (chartData.length - 1));
                  if (index >= 0 && index < chartData.length) {
                    setHoveredPoint({ index, x: e.clientX - rect.left, y: e.clientY - rect.top });
                  }
                }}
                onMouseLeave={() => setHoveredPoint(null)}
              >
                <svg className="w-full h-full" viewBox="0 0 800 200" preserveAspectRatio="none">
                  {/* Gradient Definitions */}
                  <defs>
                    <linearGradient id="loanChartGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                      <stop offset="0%" stopColor="#10b981" stopOpacity="0.3" />
                      <stop offset="100%" stopColor="#10b981" stopOpacity="0.0" />
                    </linearGradient>
                    <linearGradient id="loanLineGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                      <stop offset="0%" stopColor="#34d399" />
                      <stop offset="100%" stopColor="#10b981" />
                    </linearGradient>
                  </defs>

                  {/* Grid Lines */}
                  {[0, 1, 2, 3, 4].map((i) => (
                    <line
                      key={i}
                      x1="0"
                      y1={i * 50}
                      x2="800"
                      y2={i * 50}
                      stroke="#1f2937"
                      strokeWidth="1"
                      strokeDasharray="4 4"
                    />
                  ))}

                  {/* Area Fill */}
                  <path
                    d={`M 0,200 ${chartData.map((point, i) => `L ${normalizeChartX(i, chartData.length)},${normalizeChartY(point.value, minValue, maxValue)}`).join(' ')} L 800,200 Z`}
                    fill="url(#loanChartGradient)"
                  />

                  {/* Line */}
                  <path
                    d={chartData.map((point, i) => `${i === 0 ? 'M' : 'L'} ${normalizeChartX(i, chartData.length)},${normalizeChartY(point.value, minValue, maxValue)}`).join(' ')}
                    fill="none"
                    stroke="url(#loanLineGradient)"
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />

                  {/* Crosshair Line */}
                  {hoveredPoint && (
                    <line
                      x1={normalizeChartX(hoveredPoint.index, chartData.length)}
                      y1="0"
                      x2={normalizeChartX(hoveredPoint.index, chartData.length)}
                      y2="200"
                      stroke="#10b981"
                      strokeWidth="1"
                      strokeDasharray="4 4"
                      opacity="0.7"
                    />
                  )}

                  {/* Data Points */}
                  {chartData.map((point, i) => (
                    <circle
                      key={i}
                      cx={normalizeChartX(i, chartData.length)}
                      cy={normalizeChartY(point.value, minValue, maxValue)}
                      r={hoveredPoint?.index === i ? 6 : 4}
                      fill="#10b981"
                      className={hoveredPoint?.index === i ? 'opacity-100' : 'opacity-0'}
                      style={{ transition: 'all 0.15s ease' }}
                    />
                  ))}

                  {/* Highlighted Point Glow */}
                  {hoveredPoint && (
                    <circle
                      cx={normalizeChartX(hoveredPoint.index, chartData.length)}
                      cy={normalizeChartY(chartData[hoveredPoint.index].value, minValue, maxValue)}
                      r="10"
                      fill="#10b981"
                      opacity="0.3"
                    />
                  )}
                </svg>

                {/* Tooltip */}
                {hoveredPoint && (
                  <div
                    className="absolute z-10 pointer-events-none"
                    style={{
                      left: `${hoveredPoint.x}px`,
                      top: '10px',
                      transform: 'translateX(-50%)',
                    }}
                  >
                    <div className="bg-dark-card border border-dark-border rounded-lg px-3 py-2 shadow-lg">
                      <p className="text-lg font-bold text-altrion-400">
                        {formatCurrency(chartData[hoveredPoint.index].value)}
                      </p>
                      <p className="text-xs text-text-muted">
                        {chartData[hoveredPoint.index].label}
                      </p>
                    </div>
                  </div>
                )}

                {/* Value Labels on Y-axis */}
                <div className="absolute left-0 top-0 h-full flex flex-col justify-between py-2">
                  {[maxValue, (maxValue + minValue) / 2, minValue].map((val, i) => (
                    <span key={i} className="text-xs text-text-muted w-9 text-right">
                      ${(val / 1000).toFixed(0)}k
                    </span>
                  ))}
                </div>
              </div>

              {/* X-axis Labels */}
              <div className="flex justify-between mt-3 pl-10 pr-2">
                {chartData.map((point, i) => {
                  if (chartPeriod === '1M' || chartPeriod === '24H') {
                    if (i === 0 || i === Math.floor(chartData.length / 2) || i === chartData.length - 1) {
                      return (
                        <span key={i} className="text-xs text-text-muted">
                          {point.label}
                        </span>
                      );
                    }
                    return <span key={i} />;
                  }
                  return (
                    <span key={i} className="text-xs text-text-muted">
                      {point.label}
                    </span>
                  );
                })}
              </div>
            </Card>
          </motion.div>

          {/* Assets Table with Selection */}
          <motion.div variants={ITEM_VARIANTS}>
            <Card variant="bordered" padding="none">
              <div className="p-5 border-b border-dark-border">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-altrion-500/20 flex items-center justify-center">
                      <PieChart size={20} className="text-altrion-400" />
                    </div>
                    <div>
                      <h3 className="font-display text-xl font-semibold text-text-primary">Select Collateral Assets</h3>
                      <p className="text-sm text-text-secondary">Choose assets to use as loan collateral</p>
                    </div>
                  </div>

                  {/* Filter Tabs */}
                  <div className="flex gap-1 bg-dark-elevated p-1 rounded-lg">
                    {(['all', 'crypto', 'stocks', 'cash'] as const).map((tab) => (
                      <button
                        key={tab}
                        onClick={() => setActiveTab(tab)}
                        className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${
                          activeTab === tab
                            ? 'bg-dark-card text-text-primary'
                            : 'text-text-muted hover:text-text-primary'
                        }`}
                      >
                        {tab.charAt(0).toUpperCase() + tab.slice(1)}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Table */}
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="text-left text-text-muted text-sm border-b border-dark-border">
                      <th className="font-display px-5 py-3 font-medium w-12">
                        <Checkbox
                          checked={isAllSelected}
                          indeterminate={isIndeterminate}
                          onChange={handleSelectAll}
                        />
                      </th>
                      <th className="font-display px-5 py-3 font-medium">Asset</th>
                      <th className="font-display px-5 py-3 font-medium">Price</th>
                      <th className="font-display px-5 py-3 font-medium">Holdings</th>
                      <th className="font-display px-5 py-3 font-medium">Value</th>
                      <th className="font-display px-5 py-3 font-medium">24h Change</th>
                      <th className="font-display px-5 py-3 font-medium">Platform</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredAssets.map((asset, index) => {
                      const isSelected = selectedAssetIds.includes(asset.id);
                      const isExpanded = expandedAssetId === asset.id;
                      const collateralAmount = collateralAmounts[asset.id] || 0;
                      const collateralValue = collateralAmount * asset.price;
                      const percentUsed = asset.amount > 0 ? (collateralAmount / asset.amount) * 100 : 0;

                      return (
                        <React.Fragment key={asset.id}>
                        <motion.tr
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          transition={{ delay: index * 0.05 }}
                          className={`border-b border-dark-border/50 hover:bg-dark-elevated/50 transition-colors cursor-pointer ${
                            isSelected ? 'bg-altrion-500/10' : ''
                          }`}
                          onClick={() => handleSelectAsset(asset.id)}
                        >
                          <td className="px-5 py-3 align-top" onClick={e => e.stopPropagation()}>
                            <Checkbox
                              checked={isSelected}
                              onChange={() => handleSelectAsset(asset.id)}
                            />
                          </td>
                          <td className="px-5 py-3">
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 rounded-full bg-dark-elevated flex items-center justify-center font-bold text-sm">
                                {asset.symbol.slice(0, 2)}
                              </div>
                              <div>
                                <p className="font-medium text-text-primary">{asset.name}</p>
                                <p className="text-text-muted text-sm">{asset.symbol}</p>
                              </div>
                            </div>
                          </td>
                          <td className="px-5 py-3 text-text-primary font-semibold">
                            {formatCurrency(asset.price)}
                          </td>
                          <td className="px-5 py-3 text-text-primary">
                            {asset.amount.toLocaleString()} {asset.symbol}
                          </td>
                          <td className="px-5 py-3 font-semibold text-text-primary">
                            {formatCurrency(asset.value)}
                          </td>
                          <td className="px-5 py-3">
                            <span
                              className={`flex items-center gap-1 ${
                                asset.change24h >= 0 ? 'text-green-400' : 'text-red-400'
                              }`}
                            >
                              {asset.change24h >= 0 ? (
                                <TrendingUp size={14} />
                              ) : (
                                <TrendingDown size={14} />
                              )}
                              {formatPercent(asset.change24h)}
                            </span>
                          </td>
                          <td className="px-5 py-3">
                            <div className="flex items-center gap-2">
                              {/* Platform icons - overlapping design */}
                              <div className="flex items-center -space-x-2">
                                {[...asset.platforms].sort().slice(0, 3).map((platform) => (
                                  <div
                                    key={platform}
                                    className="group relative"
                                  >
                                    {/* Circular icon */}
                                    <div className="w-8 h-8 rounded-full bg-dark-card border-2 border-dark-bg flex items-center justify-center overflow-hidden cursor-pointer transition-all group-hover:scale-105 group-hover:z-10 group-hover:border-dark-border">
                                      {PLATFORM_LOGOS[platform] ? (
                                        <img
                                          src={PLATFORM_LOGOS[platform]}
                                          alt={platform}
                                          className="w-5 h-5 object-contain"
                                        />
                                      ) : (
                                        <span className="text-xs font-bold text-text-muted">
                                          {platform.slice(0, 2).toUpperCase()}
                                        </span>
                                      )}
                                    </div>
                                    {/* Tooltip above icon */}
                                    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 flex items-center h-7 px-2.5 rounded-full bg-dark-card border border-dark-border shadow-lg opacity-0 group-hover:opacity-100 transition-opacity duration-150 pointer-events-none z-50">
                                      <span className="text-xs font-medium text-text-primary whitespace-nowrap">
                                        {platform}
                                      </span>
                                    </div>
                                  </div>
                                ))}
                                {/* Plus button for additional platforms */}
                                {asset.platforms.length > 3 && (
                                  <div className="w-8 h-8 rounded-full bg-dark-elevated border-2 border-dark-border flex items-center justify-center">
                                    <span className="text-xs font-bold text-text-muted">+{asset.platforms.length - 3}</span>
                                  </div>
                                )}
                              </div>
                              {isSelected && (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setExpandedAssetId(isExpanded ? null : asset.id);
                                  }}
                                  className={`p-1 rounded-md hover:bg-dark-elevated transition-all ${isExpanded ? 'bg-dark-elevated' : ''}`}
                                >
                                  <ChevronDown
                                    size={18}
                                    className={`text-text-muted transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                                  />
                                </button>
                              )}
                            </div>
                          </td>
                        </motion.tr>
                        {/* Expandable Collateral Amount Section */}
                        <AnimatePresence>
                          {isSelected && isExpanded && (
                            <motion.tr
                              key={`${asset.id}-expanded`}
                              initial={{ opacity: 0 }}
                              animate={{ opacity: 1 }}
                              exit={{ opacity: 0 }}
                              className="border-b border-dark-border/50 bg-altrion-500/5"
                            >
                              <td colSpan={7} className="px-5 py-4" onClick={e => e.stopPropagation()}>
                                <div className="p-4 bg-dark-elevated rounded-xl border border-dark-border">
                                  <div className="flex items-center justify-between mb-3">
                                    <p className="text-sm font-medium text-text-secondary">
                                      Collateral Amount
                                    </p>
                                    <p className="text-sm text-text-muted">
                                      Max: {asset.amount.toLocaleString()} {asset.symbol}
                                    </p>
                                  </div>

                                  <div className="grid grid-cols-2 gap-4">
                                    {/* Left Column - Amount Controls */}
                                    <div>
                                      {/* Amount Input with +/- buttons */}
                                      <div className="flex items-center gap-2 mb-3">
                                        <button
                                          onClick={() => updateCollateralAmount(asset.id, collateralAmount - (asset.amount * 0.1))}
                                          className="w-10 h-10 rounded-lg bg-dark-card border border-dark-border hover:border-altrion-500/50 flex items-center justify-center text-text-primary transition-colors"
                                        >
                                          <Minus size={16} />
                                        </button>
                                        <div className="flex-1 relative">
                                          <input
                                            type="number"
                                            value={collateralAmount}
                                            onChange={(e) => updateCollateralAmount(asset.id, parseFloat(e.target.value) || 0)}
                                            className="w-full h-10 px-4 pr-16 bg-dark-card border border-dark-border rounded-lg text-text-primary text-center font-semibold focus:outline-none focus:border-altrion-500"
                                            step={asset.amount * 0.01}
                                            min={0}
                                            max={asset.amount}
                                          />
                                          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted text-sm font-medium">
                                            {asset.symbol}
                                          </span>
                                        </div>
                                        <button
                                          onClick={() => updateCollateralAmount(asset.id, collateralAmount + (asset.amount * 0.1))}
                                          className="w-10 h-10 rounded-lg bg-dark-card border border-dark-border hover:border-altrion-500/50 flex items-center justify-center text-text-primary transition-colors"
                                        >
                                          <Plus size={16} />
                                        </button>
                                      </div>

                                      {/* Slider */}
                                      <div className="mb-3">
                                        <input
                                          type="range"
                                          min={0}
                                          max={asset.amount}
                                          step={asset.amount * 0.01}
                                          value={collateralAmount}
                                          onChange={(e) => updateCollateralAmount(asset.id, parseFloat(e.target.value))}
                                          className="w-full h-2 rounded-lg appearance-none cursor-pointer"
                                          style={{
                                            background: `linear-gradient(to right, #10b981 0%, #10b981 ${percentUsed}%, #111827 ${percentUsed}%, #111827 100%)`
                                          }}
                                        />
                                      </div>

                                      {/* Percentage Quick Select */}
                                      <div className="flex gap-2">
                                        {[25, 50, 75, 100].map((percent) => (
                                          <button
                                            key={percent}
                                            onClick={() => setPercentage(asset.id, percent)}
                                            className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${
                                              Math.abs(percentUsed - percent) < 1
                                                ? 'bg-altrion-500 text-text-primary'
                                                : 'bg-dark-card border border-dark-border text-text-secondary hover:border-altrion-500/50'
                                            }`}
                                          >
                                            {percent}%
                                          </button>
                                        ))}
                                      </div>
                                    </div>

                                    {/* Right Column - Summary */}
                                    <div className="flex items-center gap-4 p-4 bg-dark-card rounded-lg">
                                      <div className="flex-1">
                                        <p className="text-xs text-text-muted mb-1">Collateral Value</p>
                                        <p className="text-2xl font-bold text-altrion-400">
                                          {formatCurrency(collateralValue)}
                                        </p>
                                      </div>
                                      <div className="h-12 w-px bg-dark-border" />
                                      <div className="text-center">
                                        <p className="text-xs text-text-muted mb-1">Open LTV</p>
                                        <p className="text-lg font-semibold text-text-primary">70%</p>
                                      </div>
                                      <div className="h-12 w-px bg-dark-border" />
                                      <div className="text-center">
                                        <p className="text-xs text-text-muted mb-1">Close LTV</p>
                                        <p className="text-lg font-semibold text-amber-400">83%</p>
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              </td>
                            </motion.tr>
                          )}
                        </AnimatePresence>
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Card>
          </motion.div>

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
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-altrion-500/20 flex items-center justify-center">
                        <Wallet size={20} className="text-altrion-400" />
                      </div>
                      <div>
                        <h3 className="font-display text-xl font-semibold text-text-primary">Total Collateral</h3>
                        <p className="text-sm text-text-secondary">
                          {selectedAssetIds.length} asset{selectedAssetIds.length !== 1 ? 's' : ''} selected
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-6">
                      {/* Individual asset breakdown */}
                      <div className="hidden lg:flex items-center gap-4">
                        {selectedAssets.slice(0, 3).map((asset) => {
                          const amount = collateralAmounts[asset.id] || 0;
                          const value = amount * asset.price;
                          return (
                            <div key={asset.id} className="text-right">
                              <p className="text-xs text-text-muted">{asset.symbol}</p>
                              <p className="text-sm font-semibold text-text-primary">{formatCurrency(value)}</p>
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

                      {/* Total Value */}
                      <div className="text-right">
                        <p className="text-xs text-text-muted">Total Value</p>
                        <p className="text-2xl font-bold text-altrion-400">{formatCurrency(totalCollateralValue)}</p>
                      </div>
                    </div>
                  </div>
                </Card>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Loan Term Selection */}
          <motion.div variants={ITEM_VARIANTS}>
            <Card variant="bordered">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-blue-500/20 flex items-center justify-center">
                    <Calendar size={20} className="text-blue-400" />
                  </div>
                  <div>
                    <h3 className="font-display text-xl font-semibold text-text-primary">Loan Term</h3>
                    <p className="text-sm text-text-secondary">Select your preferred loan duration</p>
                  </div>
                </div>

                <div className="flex gap-2">
                  {([6, 12, 18, 24, 36] as const).map((months) => (
                    <button
                      key={months}
                      onClick={() => setLoanMonths(months)}
                      className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                        loanMonths === months
                          ? 'bg-altrion-500 text-text-primary'
                          : 'bg-dark-elevated text-text-muted hover:text-text-primary'
                      }`}
                    >
                      {months} mo
                    </button>
                  ))}
                </div>
              </div>
            </Card>
          </motion.div>

          {/* Payout Options */}
          <motion.div variants={ITEM_VARIANTS}>
            <Card variant="bordered">
              <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-5">
                {/* Payout Currency */}
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-green-500/20 flex items-center justify-center">
                    <DollarSign size={20} className="text-green-400" />
                  </div>
                  <div>
                    <h3 className="font-display text-xl font-semibold text-text-primary">Payout Currency</h3>
                    <p className="text-sm text-text-secondary">How would you like to receive your loan?</p>
                  </div>
                </div>

                <div className="flex gap-2">
                  {(['USD', 'USDT'] as const).map((currency) => (
                    <button
                      key={currency}
                      onClick={() => setPayoutCurrency(currency)}
                      className={`px-6 py-2 rounded-lg text-sm font-medium transition-all ${
                        payoutCurrency === currency
                          ? 'bg-altrion-500 text-text-primary'
                          : 'bg-dark-elevated text-text-muted hover:text-text-primary'
                      }`}
                    >
                      {currency}
                    </button>
                  ))}
                </div>
              </div>
            </Card>
          </motion.div>

          {/* Bank Selection */}
          <motion.div variants={ITEM_VARIANTS}>
            <Card variant="bordered">
              <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-5">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-purple-500/20 flex items-center justify-center">
                    <Landmark size={20} className="text-purple-400" />
                  </div>
                  <div>
                    <h3 className="font-display text-xl font-semibold text-text-primary">Bank Account</h3>
                    <p className="text-sm text-text-secondary">Select your bank for payout</p>
                  </div>
                </div>

                <div className="flex gap-2">
                  {([
                    { value: 'chase' as const, label: 'Chase' },
                    { value: 'bofa' as const, label: 'Bank of America' },
                  ]).map((bank) => (
                    <button
                      key={bank.value}
                      onClick={() => setSelectedBank(bank.value)}
                      className={`px-6 py-2 rounded-lg text-sm font-medium transition-all ${
                        selectedBank === bank.value
                          ? 'bg-altrion-500 text-text-primary'
                          : 'bg-dark-elevated text-text-muted hover:text-text-primary'
                      }`}
                    >
                      {bank.label}
                    </button>
                  ))}
                </div>
              </div>
            </Card>
          </motion.div>

          {/* Action Buttons */}
          <motion.div variants={ITEM_VARIANTS} className="flex gap-4 justify-center pb-8">
            <Button
              variant="secondary"
              onClick={() => navigate(ROUTES.DASHBOARD)}
            >
              <ArrowLeft size={16} />
              Cancel
            </Button>
            <Tooltip
              content="Select at least one asset"
              disabled={selectedAssetIds.length > 0}
            >
              <Button
                onClick={handleSubmit}
                disabled={selectedAssetIds.length === 0}
                size="lg"
              >
                Review Application
                {selectedAssetIds.length > 0 && ` with ${selectedAssetIds.length} Asset${selectedAssetIds.length !== 1 ? 's' : ''}`}
                <ArrowUpRight size={16} />
              </Button>
            </Tooltip>
          </motion.div>
        </motion.div>
      </main>
    </div>
  );
}
