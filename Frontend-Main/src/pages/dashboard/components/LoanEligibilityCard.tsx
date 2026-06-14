import { memo } from 'react';
import { motion } from 'framer-motion';
import { Wallet, ArrowUpRight } from 'lucide-react';
import { Button, Card } from '@/components/ui';
import { ITEM_VARIANTS } from '@/constants';
import { SectionHeading } from './SectionHeading';

interface LoanEligibilityCardProps {
  onApply?: () => void;
}

export const LoanEligibilityCard = memo(function LoanEligibilityCard({
  onApply,
}: LoanEligibilityCardProps) {
  return (
    <motion.div variants={ITEM_VARIANTS}>
      <Card variant="bordered">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-5">
          <div>
            <SectionHeading
              icon={<Wallet size={17} strokeWidth={1.75} />}
              title="Review portfolio LTV"
              eyebrow="Credit estimate"
            />
            <p className="mt-2 pl-7 text-sm text-text-muted">
              Estimate borrowing capacity from eligible collateral in this portfolio.
            </p>
          </div>

          <Button onClick={onApply} size="sm">
            Review LTV
            <ArrowUpRight size={16} />
          </Button>
        </div>
      </Card>
    </motion.div>
  );
});
