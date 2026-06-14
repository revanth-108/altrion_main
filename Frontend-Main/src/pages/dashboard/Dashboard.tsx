import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui';
import { DashboardLayout } from '@/components/layout';
import { CONTAINER_VARIANTS, ITEM_VARIANTS, ROUTES, getAssetDetailRoute } from '@/constants';
import { usePortfolio, useRefreshPortfolio } from '@/hooks/queries/usePortfolio';
import { useAggregatedAssets } from '@/hooks/useAggregatedAssets';
import { useAssetMarketChart, usePortfolioMarketChart } from '@/hooks/useMarketChart';
import { useAuthStore, selectUser, useSubscriptionStore } from '@/store';
import { subscriptionService } from '@/services/subscription.service';
import { analysisService, ApiError } from '@/services';
import type { ChartPeriod } from '@/utils';
import {
  PortfolioHeader,
  PortfolioChart,
  AssetsTable,
  AssetAllocationCard,
  AllocationInsightsCard,
  PortfolioHealthCard,
  LoanEligibilityCard,
  ScoreHistoryChart,
} from './components';

export function Dashboard() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const user = useAuthStore(selectUser);

  // Silently prefetch Portfolio X-Ray in the background so it loads instantly
  // when the user navigates to it. The 5-second delay lets the dashboard render
  // first and avoids competing with the initial portfolio fetch.
  useEffect(() => {
    const id = setTimeout(() => {
      queryClient.prefetchQuery({
        queryKey: ['analysis', 'portfolio-xray'],
        queryFn: () => analysisService.getPortfolioXRay(),
        staleTime: 15 * 60 * 1000,
      });
    }, 5000);
    return () => clearTimeout(id);
  }, [queryClient]);
  const { setSubscription } = useSubscriptionStore();
  const rawFirstName = user?.displayName?.split(' ')[0] || user?.name?.split(' ')[0] || 'there';
  const firstName = rawFirstName.charAt(0).toUpperCase() + rawFirstName.slice(1).toLowerCase();

  const [activeTab, setActiveTab] = useState<'all' | 'crypto' | 'stocks' | 'cash'>('all');
  const [chartPeriod, setChartPeriod] = useState<ChartPeriod>('24H');
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null);
  const [selectedPlatform, setSelectedPlatform] = useState<string | null>(null);

  const { data: portfolio, isLoading: portfolioLoading } = usePortfolio();
  const refreshPortfolio = useRefreshPortfolio();
  const portfolioData = portfolio || { totalValue: 0, change24h: null, changeType: 'tracking_started' as const, changeValue: null, changePct: null, assets: [] };
  const aggregatedAssets = useAggregatedAssets(portfolioData.assets);

  const selectedAsset = selectedAssetId ? aggregatedAssets.find((a) => a.id === selectedAssetId) ?? null : null;

  // Memoize to prevent spurious chart re-fetches when only selectedPlatform changes
  const platformFilteredAssets = useMemo(
    () => selectedPlatform ? aggregatedAssets.filter((a) => a.platforms.includes(selectedPlatform)) : aggregatedAssets,
    [aggregatedAssets, selectedPlatform],
  );
  const platformFilteredTotal = useMemo(
    () => selectedPlatform ? platformFilteredAssets.reduce((sum, a) => sum + a.value, 0) : portfolioData.totalValue,
    [platformFilteredAssets, selectedPlatform, portfolioData.totalValue],
  );

  const { data: portfolioChartData, isLoading: portfolioChartLoading } = usePortfolioMarketChart(
    platformFilteredAssets,
    chartPeriod,
    platformFilteredTotal,
  );
  const { data: assetChartData, isLoading: assetChartLoading, isFetching: assetChartFetching } = useAssetMarketChart(selectedAsset?.symbol, chartPeriod);

  // Scale raw price points by the user's holding amount so the chart shows the VALUE of
  // the holding (amount × price) — consistent with what the header "Current" stat shows.
  const scaledAssetChartData = useMemo(() => {
    if (!selectedAsset || !assetChartData?.length) return assetChartData;
    const { amount } = selectedAsset;
    return assetChartData.map(point => ({ ...point, value: point.value * amount }));
  }, [assetChartData, selectedAsset]);

  const activeChartData = selectedAsset ? scaledAssetChartData : portfolioChartData;
  // Show loading when first fetching OR retrying after an error with no data yet
  const isChartLoading = selectedAsset
    ? (assetChartLoading || (assetChartFetching && !assetChartData?.length))
    : portfolioChartLoading;

  // Memoize category breakdowns — avoids re-running on every unrelated re-render
  const { cryptoValue, stocksValue, cashValue, cryptoPercent, stocksPercent, cashPercent } = useMemo(() => {
    const crypto = portfolioData.assets.filter((a) => a.type === 'crypto').reduce((s, a) => s + a.value, 0);
    const stocks = portfolioData.assets.filter((a) => a.type === 'stock').reduce((s, a) => s + a.value, 0);
    const cash   = portfolioData.assets.filter((a) => a.type === 'cash').reduce((s, a) => s + a.value, 0);
    return {
      cryptoValue: crypto,
      stocksValue: stocks,
      cashValue: cash,
      cryptoPercent: total > 0 ? (crypto / total) * 100 : 0,
      stocksPercent:  total > 0 ? (stocks / total) * 100 : 0,
      cashPercent:    total > 0 ? (cash   / total) * 100 : 0,
    };
  }, [portfolioData.assets, portfolioData.totalValue]);
  const total = portfolioData.totalValue;

  const handlePlatformSelect = (platform: string) => {
    setSelectedPlatform((prev) => (prev === platform ? null : platform));
  };

  // Click toggles chart selection; navigate is exposed separately via onViewDetails
  const handleAssetClick = (assetId: string) => {
    setSelectedAssetId((prev) => (prev === assetId ? null : assetId));
  };

  const handleViewAssetDetails = () => {
    if (selectedAsset) navigate(getAssetDetailRoute(selectedAsset.symbol));
  };

  useEffect(() => {
    const loadSubscription = async () => {
      try {
        const data = await subscriptionService.getMySubscription();
        setSubscription(data);
      } catch (error) {
        if (error instanceof ApiError && error.status === 404) {
          setSubscription(null);
          return;
        }
        console.error('Failed to load subscription:', error);
      }
    };

    loadSubscription();
  }, [setSubscription]);

  return (
    <DashboardLayout>
      <motion.div variants={CONTAINER_VARIANTS} initial="hidden" animate="visible" className="space-y-6">
        <motion.div variants={ITEM_VARIANTS} className="flex items-end justify-between gap-3">
          <div className="min-w-0">
            <h1 className="font-display text-2xl font-black leading-tight sm:text-4xl">
              <span className="text-text-primary">Welcome, {firstName}.</span>
              <br />
              <span className="text-altrion-400">Dashboard</span>
            </h1>
          </div>
          <div className="flex flex-shrink-0 items-center gap-3">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => refreshPortfolio.mutate()}
              disabled={refreshPortfolio.isPending}
              className="sm:px-6 sm:py-3 sm:text-base"
            >
              <RefreshCw size={16} className={refreshPortfolio.isPending ? 'animate-spin' : ''} />
              <span className="hidden sm:inline">Refresh Portfolio</span>
              <span className="sm:hidden">Refresh</span>
            </Button>
          </div>
        </motion.div>

        <PortfolioHeader
          totalValue={portfolioData.totalValue}
          changeType={portfolioData.changeType}
          changePct={portfolioData.changePct}
          cryptoValue={cryptoValue}
          stocksValue={stocksValue}
          cashValue={cashValue}
          isLoading={portfolioLoading}
          isRefreshing={refreshPortfolio.isPending}
          lastSyncedAt={portfolioData.lastSyncedAt}
        />

        <motion.div variants={ITEM_VARIANTS} className="grid grid-cols-1 gap-5 xl:grid-cols-3">
          <AssetAllocationCard cryptoPercent={cryptoPercent} stocksPercent={stocksPercent} cashPercent={cashPercent} />
          <AllocationInsightsCard assets={aggregatedAssets} totalValue={portfolioData.totalValue} />
          <PortfolioHealthCard />
        </motion.div>

        <motion.div variants={ITEM_VARIANTS}>
          <ScoreHistoryChart />
        </motion.div>

        <PortfolioChart
          totalValue={platformFilteredTotal}
          chartPeriod={chartPeriod}
          onPeriodChange={setChartPeriod}
          selectedAsset={selectedAsset}
          onClearSelection={() => setSelectedAssetId(null)}
          onViewDetails={handleViewAssetDetails}
          chartData={activeChartData}
          isChartLoading={isChartLoading}
          selectedPlatform={selectedPlatform}
        />

        <AssetsTable
          assets={aggregatedAssets}
          activeTab={activeTab}
          onTabChange={setActiveTab}
          selectedAssetId={selectedAssetId}
          onAssetClick={handleAssetClick}
          isLoading={portfolioLoading}
          selectedPlatform={selectedPlatform}
          onPlatformSelect={handlePlatformSelect}
        />

        <LoanEligibilityCard onApply={() => navigate(ROUTES.LOAN_APPLICATION)} />
      </motion.div>
    </DashboardLayout>
  );
}
