import { memo } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { Shield, Plus, ArrowLeftRight } from 'lucide-react';
import { Button, Card } from '@/components/ui';
import { useToast } from '@/components/ui/Toast';
import { ITEM_VARIANTS, ROUTES } from '@/constants';

interface AssetActionButtonsProps {
  symbol: string;
}

export const AssetActionButtons = memo(function AssetActionButtons({
  symbol,
}: AssetActionButtonsProps) {
  const navigate = useNavigate();
  const { info } = useToast();

  const handleUseCollateral = () => {
    navigate(ROUTES.LOAN_APPLICATION, {
      state: { preSelectedSymbol: symbol },
    });
  };

  const handleAddMore = () => {
    navigate(ROUTES.CONNECT_SELECT);
  };

  const handleTransfer = () => {
    info('Coming Soon', 'Transfer between platforms coming soon!');
  };

  return (
    <motion.div variants={ITEM_VARIANTS}>
      <Card variant="bordered" className="bg-gradient-to-r from-dark-card via-dark-elevated to-dark-card">
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          <Button
            onClick={handleUseCollateral}
            size="lg"
          >
            <Shield size={18} />
            Use as Collateral
          </Button>

          <Button
            variant="secondary"
            onClick={handleAddMore}
            size="lg"
          >
            <Plus size={18} />
            Add More {symbol}
          </Button>

          <Button
            variant="ghost"
            onClick={handleTransfer}
            size="lg"
          >
            <ArrowLeftRight size={18} />
            Transfer Between Platforms
          </Button>
        </div>
      </Card>
    </motion.div>
  );
});
