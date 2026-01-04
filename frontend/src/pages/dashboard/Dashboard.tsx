import { useState } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import {
  TrendingUp,
  TrendingDown,
  Plus,
  Wallet,
  ArrowUpRight,
  PieChart,
  Shield,
  ChevronDown,
  Check,
} from 'lucide-react';
import { Button, Card, Header } from '../../components/ui';
import { mockPortfolio, mockLoanEligibility, walletPlatforms } from '../../mock/data';
import { PLATFORM_ICONS } from '../../constants';
import { formatCurrency, formatPercent, generateChartData, normalizeChartY, normalizeChartX } from '../../utils';
import type { ChartPeriod } from '../../utils';
import { CONTAINER_VARIANTS, ITEM_VARIANTS, ROUTES } from '../../constants';

export function Dashboard() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<'all' | 'crypto' | 'stocks' | 'cash'>('all');
  const [chartPeriod, setChartPeriod] = useState<ChartPeriod>('24H');
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null);

  // Get selected asset
  const selectedAsset = selectedAssetId
    ? aggregatedAssets.find(a => a.id === selectedAssetId)
    : null;

  const filteredAssets = aggregatedAssets.filter(asset => {
    if (activeTab === 'all') return true;
    if (activeTab === 'crypto') return asset.type === 'crypto';
    if (activeTab === 'stocks') return asset.type === 'stock';
    if (activeTab === 'cash') return asset.type === 'stablecoin';
    return true;
  });

  // Navigate to loan application page
  const handleApplyForLoan = () => {
    navigate(ROUTES.LOAN_APPLICATION);
  };

  // Use selected asset value or total portfolio value for chart
  const chartBaseValue = selectedAsset ? selectedAsset.value : mockPortfolio.totalValue;

  // Memoize chart data to prevent regeneration on mouse move
  const chartData = useMemo(
    () => generateChartData(chartBaseValue, chartPeriod),
    [chartBaseValue, chartPeriod]
  );
  const maxValue = useMemo(() => Math.max(...chartData.map(d => d.value)), [chartData]);
  const minValue = useMemo(() => Math.min(...chartData.map(d => d.value)), [chartData]);

  // Calculate asset allocation percentages
  const cryptoValue = mockPortfolio.assets.filter(a => a.type === 'crypto').reduce((sum, a) => sum + a.value, 0);
  const stocksValue = mockPortfolio.assets.filter(a => a.type === 'stock').reduce((sum, a) => sum + a.value, 0);
  const cashValue = mockPortfolio.assets.filter(a => a.type === 'stablecoin').reduce((sum, a) => sum + a.value, 0);

  const cryptoPercent = (cryptoValue / mockPortfolio.totalValue) * 100;
  const stocksPercent = (stocksValue / mockPortfolio.totalValue) * 100;
  const cashPercent = (cashValue / mockPortfolio.totalValue) * 100;

  // Target allocation (you can make this user-configurable later)
  const targetAllocation = { crypto: 60, stocks: 30, cash: 10 };
  const isOutOfBalance =
    Math.abs(cryptoPercent - targetAllocation.crypto) > 5 ||
    Math.abs(stocksPercent - targetAllocation.stocks) > 5 ||
    Math.abs(cashPercent - targetAllocation.cash) > 5;

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
              <h1 className="font-display text-3xl font-bold text-text-primary">Dashboard</h1>
              <p className="text-text-secondary text-sm mt-0.5">Welcome back! Here's your portfolio overview.</p>
            </div>

            {/* Accounts Dropdown */}
            <div className="relative" ref={dropdownRef}>
              <Button
                onClick={() => setShowAccountsDropdown(!showAccountsDropdown)}
                variant={showAccountsDropdown ? 'primary' : 'primary'}
              >
                <Wallet size={18} />
                Accounts
                <ChevronDown
                  size={16}
                  className={`transition-transform ${showAccountsDropdown ? 'rotate-180' : ''}`}
                />
              </Button>

              <AnimatePresence>
                {showAccountsDropdown && (
                  <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    transition={{ duration: 0.15 }}
                    className="absolute right-0 top-full mt-2 w-72 bg-dark-card border border-dark-border rounded-xl shadow-xl z-50 overflow-hidden"
                  >
                    {/* Connected Accounts */}
                    {connectedAccounts.length > 0 && (
                      <div className="p-2 border-b border-dark-border">
                        <p className="text-xs text-text-muted px-2 py-1 uppercase tracking-wider">Connected Accounts</p>
                        {connectedAccounts.map((platform) => {
                          if (!platform) return null;
                          const config = PLATFORM_ICONS[platform.id];
                          const Icon = config?.icon;
                          const logo = config?.logo;
                          const color = config?.color || 'bg-gray-500/20';

                          return (
                            <div
                              key={platform.id}
                              className="flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-dark-elevated transition-colors"
                            >
                              <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${color}`}>
                                {logo ? (
                                  <img src={logo} alt={platform.name} className="w-5 h-5 object-contain" />
                                ) : Icon ? (
                                  <Icon size={16} />
                                ) : null}
                              </div>
                              <span className="text-sm text-text-primary flex-1">{platform.name}</span>
                              <Check size={14} className="text-green-500" />
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {/* No accounts message */}
                    {connectedAccounts.length === 0 && (
                      <div className="p-4 text-center border-b border-dark-border">
                        <p className="text-sm text-text-muted">No accounts connected yet</p>
                      </div>
                    )}

                    {/* Add Account Option */}
                    <div className="p-2">
                      <button
                        onClick={() => {
                          setShowAccountsDropdown(false);
                          navigate(ROUTES.CONNECT_SELECT);
                        }}
                        className="w-full flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-dark-elevated transition-colors text-altrion-400"
                      >
                        <div className="w-8 h-8 rounded-lg bg-altrion-500/20 flex items-center justify-center">
                          <Plus size={16} />
                        </div>
                        <span className="text-sm font-medium">Add Account</span>
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </motion.div>

          {/* Portfolio Value Card - Enhanced visual hierarchy */}
          <motion.div variants={ITEM_VARIANTS}>
            <Card variant="bordered" className="relative overflow-hidden bg-gradient-to-br from-dark-card via-dark-elevated to-dark-card border-altrion-500/20">
              {/* Subtle background pattern */}
              <div className="absolute inset-0 bg-grid-pattern opacity-5 pointer-events-none" />

              <div className="relative flex flex-col lg:flex-row lg:items-center lg:justify-between gap-5">
                <div>
                  <p className="font-display text-text-secondary text-sm mb-2 flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-altrion-500 animate-pulse" />
                    Total Portfolio Value
                  </p>
                  <div className="flex items-baseline gap-4">
                    <h2 className="text-5xl lg:text-6xl font-bold text-text-primary">
                      {formatCurrency(mockPortfolio.totalValue)}
                    </h2>
                    <div
                      className={`flex items-center gap-1 px-2.5 py-1.5 rounded-full text-xs font-semibold mb-2 ${
                        mockPortfolio.change24h >= 0
                          ? 'bg-green-500/20 text-green-400 border border-green-500/30'
                          : 'bg-red-500/20 text-red-400 border border-red-500/30'
                      }`}
                    >
                      {mockPortfolio.change24h >= 0 ? (
                        <TrendingUp size={14} />
                      ) : (
                        <TrendingDown size={14} />
                      )}
                      {formatPercent(mockPortfolio.change24h)}
                      <span className="text-xs opacity-75">24h</span>
                    </div>
                  </div>
                </div>

                <div className="flex gap-3">
                  <div className="text-center px-6 py-4 bg-dark-elevated/80 backdrop-blur rounded-xl border border-dark-border hover:border-altrion-500/30 transition-all">
                    <p className="text-text-muted text-xs mb-1 uppercase tracking-wider">Crypto</p>
                    <p className="text-text-primary font-bold text-lg">
                      {formatCurrency(
                        mockPortfolio.assets
                          .filter(a => a.type === 'crypto')
                          .reduce((sum, a) => sum + a.value, 0)
                      )}
                    </p>
                  </div>
                  <div className="text-center px-6 py-4 bg-dark-elevated/80 backdrop-blur rounded-xl border border-dark-border hover:border-altrion-500/30 transition-all">
                    <p className="text-text-muted text-xs mb-1 uppercase tracking-wider">Stocks</p>
                    <p className="text-text-primary font-bold text-lg">
                      {formatCurrency(
                        mockPortfolio.assets
                          .filter(a => a.type === 'stock')
                          .reduce((sum, a) => sum + a.value, 0)
                      )}
                    </p>
                  </div>
                  <div className="text-center px-6 py-4 bg-dark-elevated/80 backdrop-blur rounded-xl border border-dark-border hover:border-altrion-500/30 transition-all">
                    <p className="text-text-muted text-xs mb-1 uppercase tracking-wider">Cash</p>
                    <p className="text-text-primary font-bold text-lg">
                      {formatCurrency(
                        mockPortfolio.assets
                          .filter(a => a.type === 'stablecoin')
                          .reduce((sum, a) => sum + a.value, 0)
                      )}
                    </p>
                  </div>
                </div>
              </div>
            </Card>
          </motion.div>

          {/* Loan Eligibility */}
          <motion.div variants={ITEM_VARIANTS}>
            <Card variant="bordered">
              <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-5">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-altrion-500/20 flex items-center justify-center">
                    <Wallet size={20} className="text-altrion-400" />
                  </div>
                  <div>
                    <h3 className="font-display text-xl font-semibold text-text-primary">Loan Eligibility</h3>
                    <p className="text-sm text-text-secondary">Based on your portfolio</p>
                  </div>
                </div>

                <Button onClick={handleApplyForLoan}>
                  Apply for a Loan
                  <ArrowUpRight size={16} />
                </Button>
              </div>
            </Card>
          </motion.div>

          {/* Asset Allocation & Portfolio Health */}
          <motion.div variants={ITEM_VARIANTS} className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {/* Asset Allocation */}
            <Card variant="bordered">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-xl bg-purple-500/20 flex items-center justify-center">
                  <PieChart size={20} className="text-purple-400" />
                </div>
                <div>
                  <h3 className="font-display text-xl font-semibold text-text-primary">Asset Allocation</h3>
                  <p className="text-sm text-text-secondary">Portfolio distribution</p>
                </div>
              </div>

              {/* Pie Chart */}
              <div className="flex items-center justify-center mb-4">
                <svg width="140" height="140" viewBox="0 0 140 140">
                  <circle cx="70" cy="70" r="60" fill="none" stroke="#10b981" strokeWidth="20" strokeDasharray={`${cryptoPercent * 3.77} 377`} strokeDashoffset="0" transform="rotate(-90 70 70)" />
                  <circle cx="70" cy="70" r="60" fill="none" stroke="#3b82f6" strokeWidth="20" strokeDasharray={`${stocksPercent * 3.77} 377`} strokeDashoffset={`-${cryptoPercent * 3.77}`} transform="rotate(-90 70 70)" />
                  <circle cx="70" cy="70" r="60" fill="none" stroke="#f59e0b" strokeWidth="20" strokeDasharray={`${cashPercent * 3.77} 377`} strokeDashoffset={`-${(cryptoPercent + stocksPercent) * 3.77}`} transform="rotate(-90 70 70)" />
                </svg>
              </div>

              {/* Legend */}
              <div className="space-y-2 mb-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-green-500" />
                    <span className="text-sm text-text-secondary">Crypto</span>
                  </div>
                  <span className="text-sm font-semibold text-text-primary">{cryptoPercent.toFixed(1)}%</span>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-blue-500" />
                    <span className="text-sm text-text-secondary">Stocks</span>
                  </div>
                  <span className="text-sm font-semibold text-text-primary">{stocksPercent.toFixed(1)}%</span>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-amber-500" />
                    <span className="text-sm text-text-secondary">Cash</span>
                  </div>
                  <span className="text-sm font-semibold text-text-primary">{cashPercent.toFixed(1)}%</span>
                </div>
              </div>

              {isOutOfBalance && (
                <Button variant="secondary" fullWidth>
                  Rebalance Portfolio
                </Button>
              )}
            </Card>

            {/* Portfolio Health Score */}
            <Card variant="bordered">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-xl bg-accent-cyan/20 flex items-center justify-center">
                  <Shield size={20} className="text-accent-cyan" />
                </div>
                <div>
                  <h3 className="font-display text-xl font-semibold text-text-primary">Portfolio Health</h3>
                  <p className="text-sm text-text-secondary">Overall performance score</p>
                </div>
              </div>

              {/* Health Score Circle */}
              <div className="flex items-center justify-center mb-4">
                <div className="relative">
                  <svg width="140" height="140" viewBox="0 0 140 140">
                    <circle cx="70" cy="70" r="60" fill="none" stroke="#1f2937" strokeWidth="12" />
                    <circle
                      cx="70"
                      cy="70"
                      r="60"
                      fill="none"
                      stroke="#10b981"
                      strokeWidth="12"
                      strokeDasharray="377"
                      strokeDashoffset={377 - (377 * mockLoanEligibility.riskScore / 100)}
                      transform="rotate(-90 70 70)"
                      strokeLinecap="round"
                    />
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className="text-4xl font-bold text-text-primary">{mockLoanEligibility.riskScore}</span>
                    <span className="text-xs text-text-muted">/ 100</span>
                  </div>
                </div>
              </div>

              {/* Health Metrics */}
              <div className="space-y-3">
                <div className="flex items-center justify-between p-2 bg-dark-elevated rounded-lg">
                  <span className="text-sm text-text-secondary">Diversification</span>
                  <span className="text-sm font-semibold text-green-400">Good</span>
                </div>
                <div className="flex items-center justify-between p-2 bg-dark-elevated rounded-lg">
                  <span className="text-sm text-text-secondary">Risk Exposure</span>
                  <span className="text-sm font-semibold text-amber-400">Moderate</span>
                </div>
                <div className="flex items-center justify-between p-2 bg-dark-elevated rounded-lg">
                  <span className="text-sm text-text-secondary">Performance</span>
                  <span className="text-sm font-semibold text-green-400">Strong</span>
                </div>
              </div>
            </Card>
          </motion.div>

          {/* Portfolio Value Chart */}
          <motion.div variants={ITEM_VARIANTS}>
            <Card variant="bordered">
              <div className="flex items-center justify-between mb-5">
                <div className="flex items-center gap-3">
                  {selectedAsset ? (
                    <div className="w-10 h-10 rounded-full bg-dark-elevated flex items-center justify-center font-bold text-sm">
                      {selectedAsset.symbol.slice(0, 2)}
                    </div>
                  ) : (
                    <div className="w-10 h-10 rounded-xl bg-accent-cyan/20 flex items-center justify-center">
                      <TrendingUp size={20} className="text-accent-cyan" />
                    </div>
                  )}
                  <div>
                    <h3 className="font-display text-xl font-semibold text-text-primary">
                      {selectedAsset ? `${selectedAsset.name} (${selectedAsset.symbol})` : 'Portfolio Value'}
                    </h3>
                    <p className="text-sm text-text-secondary">
                      {selectedAsset ? (
                        <span className="flex items-center gap-2">
                          <span>{formatCurrency(selectedAsset.value)}</span>
                          <span className={selectedAsset.change24h >= 0 ? 'text-green-400' : 'text-red-400'}>
                            {formatPercent(selectedAsset.change24h)}
                          </span>
                          <button
                            onClick={() => setSelectedAssetId(null)}
                            className="text-altrion-400 hover:underline ml-2"
                          >
                            View all
                          </button>
                        </span>
                      ) : (
                        'Track your growth over time'
                      )}
                    </p>
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
                    <linearGradient id="chartGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                      <stop offset="0%" stopColor="#10b981" stopOpacity="0.3" />
                      <stop offset="100%" stopColor="#10b981" stopOpacity="0.0" />
                    </linearGradient>
                    <linearGradient id="lineGradient" x1="0%" y1="0%" x2="100%" y2="0%">
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
                    fill="url(#chartGradient)"
                  />

                  {/* Line */}
                  <path
                    d={chartData.map((point, i) => `${i === 0 ? 'M' : 'L'} ${normalizeChartX(i, chartData.length)},${normalizeChartY(point.value, minValue, maxValue)}`).join(' ')}
                    fill="none"
                    stroke="url(#lineGradient)"
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
                  // Show only first, middle, and last labels to avoid clutter
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

          {/* Assets Table */}
          <motion.div variants={ITEM_VARIANTS} className="mt-6" id="assets-table">
            <Card variant="bordered" padding="none">
              <div className="p-5 border-b border-dark-border">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-altrion-500/20 flex items-center justify-center">
                      <PieChart size={20} className="text-altrion-400" />
                    </div>
                    <div>
                      <h3 className="font-display text-xl font-semibold text-text-primary">Your Assets</h3>
                      <p className="text-sm text-text-secondary">Detailed breakdown of your holdings</p>
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
                      <th className="font-display px-5 py-3 font-medium">Asset</th>
                      <th className="font-display px-5 py-3 font-medium">Price</th>
                      <th className="font-display px-5 py-3 font-medium">Holdings</th>
                      <th className="font-display px-5 py-3 font-medium">Value</th>
                      <th className="font-display px-5 py-3 font-medium">24h Change</th>
                      <th className="font-display px-5 py-3 font-medium">Platform</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredAssets.map((asset, index) => (
                      <motion.tr
                        key={asset.id}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: index * 0.05 }}
                        className={`border-b border-dark-border/50 hover:bg-dark-elevated/50 transition-colors cursor-pointer ${
                          selectedAssetId === asset.id ? 'bg-altrion-500/10' : ''
                        }`}
                        onClick={() => setSelectedAssetId(selectedAssetId === asset.id ? null : asset.id)}
                      >
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
                            className={`${
                              asset.change24h >= 0 ? 'text-green-400' : 'text-red-400'
                            }`}
                          >
                            {formatPercent(asset.change24h)}
                          </span>
                        </td>
                        <td className="px-5 py-3">
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
                            {/* Plus button for additional wallets */}
                            {asset.platforms.length > 3 ? (
                              <div className="w-8 h-8 rounded-full bg-dark-elevated border-2 border-dark-border flex items-center justify-center cursor-pointer hover:bg-dark-card transition-colors">
                                <span className="text-xs font-bold text-text-muted">+{asset.platforms.length - 3}</span>
                              </div>
                            ) : (
                              <div className="w-8 h-8 rounded-full bg-dark-elevated border-2 border-dashed border-dark-border flex items-center justify-center cursor-pointer hover:bg-dark-card hover:border-altrion-500/50 transition-colors">
                                <span className="text-lg text-text-muted hover:text-altrion-400">+</span>
                              </div>
                            )}
                          </div>
                        </td>
                      </motion.tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          </motion.div>

        </motion.div>
      </main>
    </div>
  );
}
