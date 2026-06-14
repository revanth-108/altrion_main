import { useState } from 'react';
import { motion } from 'framer-motion';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { Button, Card } from '@/components/ui';
import { DashboardLayout } from '@/components/layout';
import { useAssetDetail } from '@/hooks';
import { CONTAINER_VARIANTS, ITEM_VARIANTS, ROUTES } from '@/constants';
import type { ChartPeriod } from '@/utils';

import { AssetHero } from './components/AssetHero';
import { AssetPriceChart } from './components/AssetPriceChart';
import { PlatformHoldingsAccordion } from './components/PlatformHoldingsAccordion';
import { MarketStatsCard } from './components/MarketStatsCard';
import { AssetActionButtons } from './components/AssetActionButtons';
import { PriceCalculator } from './components/PriceCalculator';
import { AssetInsightCard } from './components/AssetInsightCard';

const bucketForAssetType = (type: 'crypto' | 'stock' | 'cash'): 'crypto' | 'stocks' | 'cash' => {
  if (type === 'crypto') return 'crypto';
  if (type === 'cash') return 'cash';
  return 'stocks';
};

export function AssetDetail() {
  const navigate = useNavigate();
  const { symbol } = useParams<{ symbol: string }>();
  const [chartPeriod, setChartPeriod] = useState<ChartPeriod>('24H');

  const { asset, error } = useAssetDetail(symbol || '');

  if (error || !asset) {
    return (
      <DashboardLayout>
        <motion.div
          variants={CONTAINER_VARIANTS}
          initial="hidden"
          animate="visible"
          className="space-y-6"
        >
          <motion.div variants={ITEM_VARIANTS}>
            <Button variant="secondary" onClick={() => navigate(ROUTES.DASHBOARD)}>
              <ArrowLeft size={18} />
              Back to Dashboard
            </Button>
          </motion.div>

          <motion.div variants={ITEM_VARIANTS}>
            <Card variant="bordered" className="text-center py-12">
              <div className="w-16 h-16 rounded-full bg-red-500/20 flex items-center justify-center mx-auto mb-4">
                <span className="text-3xl">?</span>
              </div>
              <h2 className="font-display text-2xl font-bold text-text-primary mb-2">
                Asset Not Found
              </h2>
              <p className="text-text-secondary mb-6">
                {error || `The asset "${symbol}" was not found in your portfolio.`}
              </p>
              <Button onClick={() => navigate(ROUTES.DASHBOARD)}>
                Return to Dashboard
              </Button>
            </Card>
          </motion.div>
        </motion.div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <motion.div
        variants={CONTAINER_VARIANTS}
        initial="hidden"
        animate="visible"
        className="space-y-6"
      >
        {/* Back Navigation */}
        <motion.div variants={ITEM_VARIANTS}>
          <Button variant="secondary" onClick={() => navigate(ROUTES.DASHBOARD)}>
            <ArrowLeft size={18} />
            Back to Dashboard
          </Button>
        </motion.div>

        {/* Asset Hero */}
        <AssetHero asset={asset} />

        {/* Price Chart */}
        <AssetPriceChart
          symbol={asset.symbol}
          name={asset.name}
          baseValue={asset.totalValue}
          chartPeriod={chartPeriod}
          onPeriodChange={setChartPeriod}
        />

        {/* Two Column Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="space-y-6">
            <PlatformHoldingsAccordion
              holdings={asset.holdings}
              symbol={asset.symbol}
              totalValue={asset.totalValue}
            />
            <PriceCalculator
              symbol={asset.symbol}
              price={asset.price}
            />
          </div>

          <MarketStatsCard
            marketStats={asset.marketStats}
            symbol={asset.symbol}
          />
          <AssetInsightCard
            bucket={bucketForAssetType(asset.type)}
            symbol={asset.symbol}
          />
        </div>

        {/* Action Buttons */}
        <AssetActionButtons symbol={asset.symbol} />
      </motion.div>
    </DashboardLayout>
  );
}
