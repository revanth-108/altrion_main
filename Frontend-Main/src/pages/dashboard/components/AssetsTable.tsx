import { memo, useCallback } from 'react';
import { motion } from 'framer-motion';
import { PieChart, ChevronRight, TrendingUp } from 'lucide-react';
import { Card, TableRowSkeleton } from '@/components/ui';
import { formatCurrency, formatPercent } from '@/utils';
import { PLATFORM_ICONS, ITEM_VARIANTS } from '@/constants';
import type { AggregatedAsset } from '@/hooks/useAggregatedAssets';
import type { AssetType } from '@/types';
import { SectionHeading } from './SectionHeading';

type TabType = 'all' | 'crypto' | 'stocks' | 'cash';

interface AssetsTableProps {
  assets: AggregatedAsset[];
  activeTab: TabType;
  onTabChange: (tab: TabType) => void;
  selectedAssetId?: string | null;
  onAssetClick?: (assetId: string) => void;
  isLoading?: boolean;
  selectedPlatform?: string | null;
  onPlatformSelect?: (platform: string) => void;
}

const TABS: { id: TabType; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'crypto', label: 'Crypto' },
  { id: 'stocks', label: 'Stocks' },
  { id: 'cash', label: 'Cash' },
];

export const AssetsTable = memo(function AssetsTable({
  assets,
  activeTab,
  onTabChange,
  selectedAssetId,
  onAssetClick,
  isLoading = false,
  selectedPlatform,
  onPlatformSelect,
}: AssetsTableProps) {
  const filteredAssets = useCallback(() => {
    const platformScopedAssets = selectedPlatform
      ? assets.filter((asset) => asset.platforms.includes(selectedPlatform))
      : assets;

    if (activeTab === 'all') return platformScopedAssets;
    const typeMap: Record<TabType, AssetType | null> = { all: null, crypto: 'crypto', stocks: 'stock', cash: 'cash' };
    return platformScopedAssets.filter((asset) => asset.type === typeMap[activeTab]);
  }, [assets, activeTab, selectedPlatform])();
  const selectedPlatformLabel = selectedPlatform
    ? selectedPlatform.charAt(0).toUpperCase() + selectedPlatform.slice(1)
    : null;

  return (
    <motion.div variants={ITEM_VARIANTS} className="mt-6" id="assets-table">
      <Card variant="bordered" padding="none">
        <div className="border-b border-dark-border p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <SectionHeading icon={<PieChart size={17} strokeWidth={1.75} />} title="Your Assets" eyebrow="Holdings" />
              <p className="mt-1 pl-7 text-xs text-text-muted">
                {selectedPlatformLabel
                  ? `Filtered to ${selectedPlatformLabel}. Click the platform icon again to clear.`
                  : 'Click any asset to view its chart above. Click again to deselect.'}
              </p>
            </div>
            <div className="flex w-full gap-1 overflow-x-auto rounded-full border border-white/6 bg-dark-elevated/70 p-1 sm:w-auto">
              {TABS.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => onTabChange(tab.id)}
                  className={`shrink-0 rounded-full px-4 py-1.5 text-sm font-medium transition-all ${
                    activeTab === tab.id
                      ? 'bg-dark-card text-text-primary shadow-[inset_0_0_0_1px_rgba(255,255,255,0.06)]'
                      : 'text-text-muted hover:text-text-primary'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px]">
            <thead>
              <tr className="border-b border-dark-border text-left text-sm text-text-muted">
                <th className="font-display px-3 py-3 font-medium sm:px-5">Asset</th>
                <th className="font-display px-3 py-3 font-medium sm:px-5">Price</th>
                <th className="font-display px-3 py-3 font-medium sm:px-5">Value</th>
                <th className="font-display px-3 py-3 font-medium sm:px-5">Holdings</th>
                <th className="font-display px-3 py-3 font-medium sm:px-5">24h Change</th>
                <th className="font-display px-3 py-3 font-medium sm:px-5">Platform</th>
                <th className="w-10 px-3 py-3" />
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <>
                  <TableRowSkeleton columns={7} />
                  <TableRowSkeleton columns={7} />
                  <TableRowSkeleton columns={7} />
                </>
              ) : (
                filteredAssets.length > 0 ? filteredAssets.map((asset, index) => (
                  <AssetRow
                    key={asset.id}
                    asset={asset}
                    index={index}
                    isSelected={selectedAssetId === asset.id}
                    onClick={onAssetClick}
                    selectedPlatform={selectedPlatform}
                    onPlatformSelect={onPlatformSelect}
                  />
                )) : (
                  <tr>
                    <td colSpan={7} className="px-5 py-12 text-center">
                      <p className="font-display text-base font-semibold text-text-primary">No assets in this view</p>
                      <p className="mt-1 text-sm text-text-muted">
                        Adjust the asset type or platform filter to review another slice of the portfolio.
                      </p>
                    </td>
                  </tr>
                )
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </motion.div>
  );
});

const AssetRow = memo(function AssetRow({
  asset,
  index,
  isSelected,
  onClick,
  selectedPlatform,
  onPlatformSelect,
}: {
  asset: AggregatedAsset;
  index: number;
  isSelected?: boolean;
  onClick?: (assetId: string) => void;
  selectedPlatform?: string | null;
  onPlatformSelect?: (platform: string) => void;
}) {
  const isFlat = Math.abs(asset.change24h) < 0.005;

  return (
    <motion.tr
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ delay: index * 0.05 }}
      className={`group cursor-pointer border-b border-dark-border/45 transition-colors hover:bg-white/[0.035] ${
        isSelected ? 'bg-altrion-500/10 border-altrion-500/20' : ''
      }`}
      onClick={() => onClick?.(asset.id)}
    >
      <td className="px-3 py-4 sm:px-5">
        <div className="flex items-center gap-2 sm:gap-3">
          <div className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full border sm:h-10 sm:w-10 transition-colors ${
            isSelected ? 'border-altrion-500/50 bg-altrion-500/20' : 'border-white/6 bg-dark-elevated'
          }`}>
            <span className={`text-xs font-bold sm:text-sm ${isSelected ? 'text-altrion-400' : 'text-text-secondary'}`}>
              {asset.symbol.slice(0, 2)}
            </span>
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-text-primary sm:text-base">{asset.name}</p>
            <p className="mt-0.5 text-xs uppercase tracking-[0.08em] text-text-muted">{asset.symbol || 'Unlabeled'}</p>
          </div>
        </div>
      </td>
      <td className="px-3 py-4 text-sm font-medium text-text-primary sm:px-5 sm:text-base">{formatCurrency(asset.price)}</td>
      <td className="px-3 py-4 text-sm font-semibold text-text-primary sm:px-5 sm:text-base">{formatCurrency(asset.value)}</td>
      <td className="px-3 py-4 text-sm text-text-secondary sm:px-5 sm:text-base">{asset.amount.toLocaleString()} {asset.symbol}</td>
      <td className="px-3 py-4 sm:px-5">
        <span className={`inline-flex min-w-[5.5rem] justify-start text-sm sm:text-base ${isFlat ? 'text-text-muted' : asset.change24h > 0 ? 'text-green-400' : 'text-red-400'}`}>
          {formatPercent(asset.change24h)}
        </span>
      </td>
      <td className="px-3 py-4 sm:px-5">
        <PlatformIcons platforms={asset.platforms} selectedPlatform={selectedPlatform} onPlatformSelect={onPlatformSelect} />
      </td>
      <td className="pl-0 pr-3 py-4 sm:pr-5">
        {isSelected ? (
          <TrendingUp size={16} className="text-altrion-400" />
        ) : (
          <ChevronRight size={20} className="text-text-muted opacity-0 transition-opacity group-hover:opacity-100" />
        )}
      </td>
    </motion.tr>
  );
});

const PlatformIcons = memo(function PlatformIcons({
  platforms,
  selectedPlatform,
  onPlatformSelect,
}: {
  platforms: string[];
  selectedPlatform?: string | null;
  onPlatformSelect?: (platform: string) => void;
}) {
  return (
    <div className="flex items-center -space-x-2">
      {[...platforms].sort().slice(0, 3).map((platform) => {
        const config = PLATFORM_ICONS[platform];
        const Logo = config?.logo;
        const Icon = config?.icon;
        const isSelected = selectedPlatform === platform;
        return (
          <div key={platform} className="group/platform relative">
            <button
              type="button"
              title={`Filter by ${platform}`}
              aria-pressed={isSelected}
              aria-label={`${isSelected ? 'Clear' : 'Filter by'} ${platform}`}
              onClick={(e) => {
                e.stopPropagation();
                onPlatformSelect?.(platform);
              }}
              className={`flex h-8 w-8 cursor-pointer items-center justify-center overflow-hidden rounded-full border-2 transition-all group-hover/platform:z-10 group-hover/platform:scale-105 ${
                isSelected
                  ? 'z-10 scale-110 border-altrion-400 bg-altrion-500/20 ring-2 ring-altrion-400/40'
                  : 'border-dark-bg bg-dark-card group-hover/platform:border-dark-border'
              }`}
            >
              {Logo ? (
                <img src={Logo} alt={platform} className="h-5 w-5 object-contain" />
              ) : Icon ? (
                <Icon size={16} />
              ) : (
                <span className="text-xs font-bold text-text-muted">{platform.slice(0, 2).toUpperCase()}</span>
              )}
            </button>
            <div className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-2 flex h-7 -translate-x-1/2 items-center rounded-full border border-dark-border bg-dark-card px-2.5 opacity-0 shadow-lg transition-opacity duration-150 group-hover/platform:opacity-100">
              <span className="whitespace-nowrap text-xs font-medium text-text-primary">{isSelected ? `✓ ${platform}` : platform}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
});
