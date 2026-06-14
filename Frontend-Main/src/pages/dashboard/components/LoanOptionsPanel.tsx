import { memo } from 'react';
import { motion } from 'framer-motion';
import { Calendar, DollarSign, Landmark } from 'lucide-react';
import { Card } from '@/components/ui';
import { ITEM_VARIANTS } from '@/constants';
import { PAYOUT_METHOD_LABELS } from '@/constants/loan';
import type { PayoutCurrency, PayoutMethod } from '@/types';

interface LoanOptionsPanelProps {
  loanMonths: 6 | 12 | 18 | 24 | 36;
  payoutCurrency: PayoutCurrency;
  payoutMethod: PayoutMethod;
  onMonthsChange: (months: 6 | 12 | 18 | 24 | 36) => void;
  onCurrencyChange: (currency: PayoutCurrency) => void;
  onPayoutMethodChange: (method: PayoutMethod) => void;
}

const LOAN_TERMS = [6, 12, 18, 24, 36] as const;
const PAYOUT_CURRENCIES: PayoutCurrency[] = ['USD', 'USDT'];
const PAYOUT_METHODS: PayoutMethod[] = ['bank_transfer', 'stablecoin_transfer'];

export const LoanOptionsPanel = memo(function LoanOptionsPanel({
  loanMonths,
  payoutCurrency,
  payoutMethod,
  onMonthsChange,
  onCurrencyChange,
  onPayoutMethodChange,
}: LoanOptionsPanelProps) {
  return (
    <>
      {/* Loan Term */}
      <motion.div variants={ITEM_VARIANTS}>
        <Card variant="bordered">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-xl bg-blue-500/20 flex items-center justify-center">
              <Calendar size={20} className="text-blue-400" />
            </div>
            <h3 className="font-display text-xl font-semibold text-text-primary">Loan Term</h3>
          </div>

          <div className="grid grid-cols-5 gap-2">
            {LOAN_TERMS.map((months) => (
              <button
                key={months}
                onClick={() => onMonthsChange(months)}
                className={`py-2 rounded-lg text-sm font-medium transition-all ${
                  loanMonths === months
                    ? 'bg-altrion-500 text-text-primary'
                    : 'bg-dark-elevated text-text-muted hover:text-text-primary'
                }`}
              >
                {months} mo
              </button>
            ))}
          </div>
        </Card>
      </motion.div>

      {/* Payout Currency */}
      <motion.div variants={ITEM_VARIANTS}>
        <Card variant="bordered">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-xl bg-green-500/20 flex items-center justify-center">
              <DollarSign size={20} className="text-green-400" />
            </div>
            <h3 className="font-display text-xl font-semibold text-text-primary">Payout Currency</h3>
          </div>

          <div className="grid grid-cols-2 gap-2">
            {PAYOUT_CURRENCIES.map((currency) => (
              <button
                key={currency}
                onClick={() => onCurrencyChange(currency)}
                className={`py-2 rounded-lg text-sm font-medium transition-all ${
                  payoutCurrency === currency
                    ? 'bg-altrion-500 text-text-primary'
                    : 'bg-dark-elevated text-text-muted hover:text-text-primary'
                }`}
              >
                {currency}
              </button>
            ))}
          </div>
        </Card>
      </motion.div>

      {/* Payout Method */}
      <motion.div variants={ITEM_VARIANTS}>
        <Card variant="bordered">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-xl bg-purple-500/20 flex items-center justify-center">
              <Landmark size={20} className="text-purple-400" />
            </div>
            <h3 className="font-display text-xl font-semibold text-text-primary">Payout Method</h3>
          </div>

          <div className="grid grid-cols-2 gap-2">
            {PAYOUT_METHODS.map((method) => (
              <button
                key={method}
                onClick={() => onPayoutMethodChange(method)}
                className={`py-2 rounded-lg text-sm font-medium transition-all ${
                  payoutMethod === method
                    ? 'bg-altrion-500 text-text-primary'
                    : 'bg-dark-elevated text-text-muted hover:text-text-primary'
                }`}
              >
                {PAYOUT_METHOD_LABELS[method] || method}
              </button>
            ))}
          </div>
        </Card>
      </motion.div>
    </>
  );
});
