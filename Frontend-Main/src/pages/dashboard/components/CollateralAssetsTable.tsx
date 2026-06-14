import React, { memo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  PieChart,
  TrendingUp,
  TrendingDown,
  ChevronDown,
  Minus,
  Plus,
} from 'lucide-react';
import { Card, Checkbox } from '@/components/ui';
import { PLATFORM_ICONS, ITEM_VARIANTS } from '@/constants';
import { formatCurrency, formatPercent } from '@/utils';
import type { AggregatedAsset } from '@/hooks/useAggregatedAssets';
import type { AssetType } from '@/types';

type TabType = 'all' | 'crypto' | 'stocks' | 'cash';

interface CollateralAssetsTableProps {
  assets: AggregatedAsset[];
  activeTab: TabType;
  onTabChange: (tab: TabType) => void;
  selectedAssetIds: string[];
  collateralAmounts: Record<string, number>;
  expandedAssetId: string | null;
  onSelectAsset: (assetId: string) => void;
  onSelectAll: () => void;
  onExpandAsset: (assetId: string | null) => void;
  onUpdateAmount: (assetId: string, amount: number) => void;
  onSetPercentage: (assetId: string, percent: number) => void;
}

const TABS: { id: TabType; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'crypto', label: 'Crypto' },
  { id: 'stocks', label: 'Stocks' },
  { id: 'cash', label: 'Cash' },
];

export const CollateralAssetsTable = memo(function CollateralAssetsTable({
  assets,
  activeTab,
  onTabChange,
  selectedAssetIds,
  collateralAmounts,
  expandedAssetId,
  onSelectAsset,
  onSelectAll,
  onExpandAsset,
  onUpdateAmount,
  onSetPercentage,
}: CollateralAssetsTableProps) {
  const filteredAssets = useCallback(() => {
    if (activeTab === 'all') return assets;
    const typeMap: Record<TabType, AssetType | null> = {
      all: null,
      crypto: 'crypto',
      stocks: 'stock',
      cash: 'cash',
    };
    return assets.filter((asset) => asset.type === typeMap[activeTab]);
  }, [assets, activeTab])();

  const filteredIds = filteredAssets.map(a => a.id);
  const selectedCount = filteredIds.filter(id => selectedAssetIds.includes(id)).length;
  const isAllSelected = selectedCount === filteredIds.length && filteredIds.length > 0;
  const isIndeterminate = selectedCount > 0 && selectedCount < filteredIds.length;

  return (
    <motion.div variants={ITEM_VARIANTS}>
      <Card variant="bordered" padding="none">
        <div className="p-5 border-b border-dark-border">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-altrion-500/20 flex items-center justify-center">
                <PieChart size={20} className="text-altrion-400" />
              </div>
              <h3 className="font-display text-xl font-semibold text-text-primary">Select Collateral Assets</h3>
            </div>

            <div className="flex gap-1 bg-dark-elevated p-1 rounded-lg">
              {TABS.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => onTabChange(tab.id)}
                  className={`flex-1 sm:flex-initial px-4 py-1.5 rounded-md text-sm font-medium transition-all ${
                    activeTab === tab.id
                      ? 'bg-dark-card text-text-primary'
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
          <table className="w-full min-w-[700px]">
            <thead>
              <tr className="text-left text-text-muted text-sm border-b border-dark-border">
                <th className="font-display px-3 sm:px-5 py-3 font-medium w-10 sm:w-12">
                  <Checkbox
                    checked={isAllSelected}
                    indeterminate={isIndeterminate}
                    onChange={onSelectAll}
                  />
                </th>
                <th className="font-display px-3 sm:px-5 py-3 font-medium">Asset</th>
                <th className="font-display px-3 sm:px-5 py-3 font-medium">Price</th>
                <th className="font-display px-3 sm:px-5 py-3 font-medium">Holdings</th>
                <th className="font-display px-3 sm:px-5 py-3 font-medium">Value</th>
                <th className="font-display px-3 sm:px-5 py-3 font-medium">24h Change</th>
                <th className="font-display px-3 sm:px-5 py-3 font-medium">Platform</th>
              </tr>
            </thead>
            <tbody>
              {filteredAssets.map((asset, index) => (
                <CollateralAssetRow
                  key={asset.id}
                  asset={asset}
                  index={index}
                  isSelected={selectedAssetIds.includes(asset.id)}
                  isExpanded={expandedAssetId === asset.id}
                  collateralAmount={collateralAmounts[asset.id] || 0}
                  onSelect={onSelectAsset}
                  onExpand={onExpandAsset}
                  onUpdateAmount={onUpdateAmount}
                  onSetPercentage={onSetPercentage}
                />
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </motion.div>
  );
});

const CollateralAssetRow = memo(function CollateralAssetRow({
  asset,
  index,
  isSelected,
  isExpanded,
  collateralAmount,
  onSelect,
  onExpand,
  onUpdateAmount,
  onSetPercentage,
}: {
  asset: AggregatedAsset;
  index: number;
  isSelected: boolean;
  isExpanded: boolean;
  collateralAmount: number;
  onSelect: (id: string) => void;
  onExpand: (id: string | null) => void;
  onUpdateAmount: (id: string, amount: number) => void;
  onSetPercentage: (id: string, percent: number) => void;
}) {
  const collateralValue = collateralAmount * asset.price;
  const percentUsed = asset.amount > 0 ? (collateralAmount / asset.amount) * 100 : 0;
  const isFlat = Math.abs(asset.change24h) < 0.005;

  return (
    <React.Fragment>
      <motion.tr
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: index * 0.05 }}
        className={`border-b border-dark-border/50 hover:bg-dark-elevated/50 transition-colors cursor-pointer ${
          isSelected ? 'bg-altrion-500/10' : ''
        }`}
        onClick={() => onSelect(asset.id)}
      >
        <td className="px-3 sm:px-5 py-3 align-top" onClick={e => e.stopPropagation()}>
          <Checkbox checked={isSelected} onChange={() => onSelect(asset.id)} />
        </td>
        <td className="px-3 sm:px-5 py-3">
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-dark-elevated flex items-center justify-center font-bold text-xs sm:text-sm flex-shrink-0">
              {asset.symbol.slice(0, 2)}
            </div>
            <div className="min-w-0">
              <p className="font-medium text-text-primary text-sm sm:text-base truncate">{asset.name}</p>
              <p className="text-text-muted text-xs sm:text-sm">{asset.symbol}</p>
            </div>
          </div>
        </td>
        <td className="px-3 sm:px-5 py-3 text-text-primary font-semibold text-sm sm:text-base">
          {formatCurrency(asset.price)}
        </td>
        <td className="px-3 sm:px-5 py-3 text-text-primary text-sm sm:text-base">
          {asset.amount.toLocaleString()} {asset.symbol}
        </td>
        <td className="px-3 sm:px-5 py-3 font-semibold text-text-primary text-sm sm:text-base">
          {formatCurrency(asset.value)}
        </td>
        <td className="px-3 sm:px-5 py-3">
          <span className={`flex items-center gap-1 text-sm sm:text-base ${isFlat ? 'text-text-muted' : asset.change24h > 0 ? 'text-green-400' : 'text-red-400'}`}>
            {isFlat ? <Minus size={14} /> : asset.change24h > 0 ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
            {formatPercent(asset.change24h)}
          </span>
        </td>
        <td className="px-3 sm:px-5 py-3">
          <div className="flex items-center gap-2">
            <PlatformIcons platforms={asset.platforms} />
            {isSelected && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onExpand(isExpanded ? null : asset.id);
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
                  <p className="text-sm font-medium text-text-secondary">Collateral Amount</p>
                  <p className="text-sm text-text-muted">
                    Max: {asset.amount.toLocaleString()} {asset.symbol}
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <div className="flex items-center gap-2 mb-3">
                      <button
                        onClick={() => onUpdateAmount(asset.id, collateralAmount - (asset.amount * 0.1))}
                        className="w-10 h-10 rounded-lg bg-dark-card border border-dark-border hover:border-altrion-500/50 flex items-center justify-center text-text-primary transition-colors"
                      >
                        <Minus size={16} />
                      </button>
                      <div className="flex-1 relative">
                        <input
                          type="number"
                          value={collateralAmount}
                          onChange={(e) => onUpdateAmount(asset.id, parseFloat(e.target.value) || 0)}
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
                        onClick={() => onUpdateAmount(asset.id, collateralAmount + (asset.amount * 0.1))}
                        className="w-10 h-10 rounded-lg bg-dark-card border border-dark-border hover:border-altrion-500/50 flex items-center justify-center text-text-primary transition-colors"
                      >
                        <Plus size={16} />
                      </button>
                    </div>

                    <div className="mb-3">
                      <input
                        type="range"
                        min={0}
                        max={asset.amount}
                        step={asset.amount * 0.01}
                        value={collateralAmount}
                        onChange={(e) => onUpdateAmount(asset.id, parseFloat(e.target.value))}
                        className="w-full h-2 rounded-lg appearance-none cursor-pointer"
                        style={{
                          background: `linear-gradient(to right, #10b981 0%, #10b981 ${percentUsed}%, #111827 ${percentUsed}%, #111827 100%)`
                        }}
                      />
                    </div>

                    <div className="flex gap-2">
                      {[25, 50, 75, 100].map((percent) => (
                        <button
                          key={percent}
                          onClick={() => onSetPercentage(asset.id, percent)}
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
});

const PlatformIcons = memo(function PlatformIcons({ platforms }: { platforms: string[] }) {
  return (
    <div className="flex items-center -space-x-2">
      {[...platforms].sort().slice(0, 3).map((platform) => {
        const config = PLATFORM_ICONS[platform];
        const Logo = config?.logo;
        const Icon = config?.icon;
        return (
          <div key={platform} className="group relative">
            <div className="w-8 h-8 rounded-full bg-dark-card border-2 border-dark-bg flex items-center justify-center overflow-hidden cursor-pointer transition-all group-hover:scale-105 group-hover:z-10 group-hover:border-dark-border">
              {Logo ? (
                <img src={Logo} alt={platform} className="w-5 h-5 object-contain" />
              ) : Icon ? (
                <Icon size={16} />
              ) : (
                <span className="text-xs font-bold text-text-muted">{platform.slice(0, 2).toUpperCase()}</span>
              )}
            </div>
            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 flex items-center h-7 px-2.5 rounded-full bg-dark-card border border-dark-border shadow-lg opacity-0 group-hover:opacity-100 transition-opacity duration-150 pointer-events-none z-50">
              <span className="text-xs font-medium text-text-primary whitespace-nowrap">{platform}</span>
            </div>
          </div>
        );
      })}
      {platforms.length > 3 && (
        <div className="w-8 h-8 rounded-full bg-dark-elevated border-2 border-dark-border flex items-center justify-center">
          <span className="text-xs font-bold text-text-muted">+{platforms.length - 3}</span>
        </div>
      )}
    </div>
  );
});
