import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui';

type TransactionSyncControlsProps = {
  hasTransactionUpdates: boolean;
  showBalanceRefresh?: boolean;
  onRefreshBalances?: () => void;
  onSyncTransactions?: () => void;
  refreshBalancesLoading?: boolean;
  syncTransactionsLoading?: boolean;
};

export function TransactionSyncControls({
  hasTransactionUpdates,
  showBalanceRefresh = true,
  onRefreshBalances,
  onSyncTransactions,
  refreshBalancesLoading = false,
  syncTransactionsLoading = false,
}: TransactionSyncControlsProps) {
  return (
    <div className="flex flex-wrap gap-3">
      {showBalanceRefresh && onRefreshBalances && (
        <Button variant="secondary" onClick={onRefreshBalances} loading={refreshBalancesLoading}>
          <RefreshCw size={16} />
          Refresh balances
        </Button>
      )}

      {hasTransactionUpdates && onSyncTransactions && (
        <Button variant="primary" onClick={onSyncTransactions} loading={syncTransactionsLoading}>
          <RefreshCw size={16} />
          Sync new transactions
        </Button>
      )}
    </div>
  );
}
