import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { TransactionSyncControls } from './TransactionSyncControls';

describe('TransactionSyncControls', () => {
  it('hides the transaction sync button until updates are available', () => {
    render(
      <TransactionSyncControls
        hasTransactionUpdates={false}
        onRefreshBalances={() => {}}
      />,
    );

    expect(screen.getByText('Refresh balances')).toBeInTheDocument();
    expect(screen.queryByText('Sync new transactions')).not.toBeInTheDocument();
  });

  it('shows the transaction sync button when the backend says updates are ready', () => {
    const onSync = vi.fn();
    render(
      <TransactionSyncControls
        hasTransactionUpdates
        showBalanceRefresh={false}
        onSyncTransactions={onSync}
      />,
    );

    const button = screen.getByText('Sync new transactions');
    fireEvent.click(button);

    expect(onSync).toHaveBeenCalledTimes(1);
  });
});
