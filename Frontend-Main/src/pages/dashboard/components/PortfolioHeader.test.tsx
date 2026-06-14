import { describe, expect, it } from 'vitest';

import { render, screen } from '@/test/test-utils';

import { PortfolioHeader } from './PortfolioHeader';

describe('PortfolioHeader', () => {
  it('renders 24h unavailable when change is null', () => {
    render(
      <PortfolioHeader
        totalValue={93504.91}
        changeType="tracking_started"
        changePct={null}
        cryptoValue={0}
        stocksValue={12985.14}
        cashValue={80519.77}
      />,
    );

    expect(screen.getByText('Tracking started - building insights')).toBeInTheDocument();
  });

  it('renders a positive 24h change percentage', () => {
    render(
      <PortfolioHeader
        totalValue={93504.91}
        changeType="24h"
        changePct={3.25}
        cryptoValue={1500}
        stocksValue={12985.14}
        cashValue={79019.77}
      />,
    );

    expect(screen.getByText('+3.25% (24h)')).toBeInTheDocument();
  });

  it('renders a negative since-last change percentage', () => {
    render(
      <PortfolioHeader
        totalValue={93504.91}
        changeType="since_last"
        changePct={-1.5}
        cryptoValue={1500}
        stocksValue={12985.14}
        cashValue={79019.77}
      />,
    );

    expect(screen.getByText('-1.50% since last check')).toBeInTheDocument();
  });

  it('renders zero change as no change', () => {
    render(
      <PortfolioHeader
        totalValue={93504.91}
        changeType="since_last"
        changePct={0}
        cryptoValue={1500}
        stocksValue={12985.14}
        cashValue={79019.77}
      />,
    );

    expect(screen.getByText('No change since last check')).toBeInTheDocument();
  });
});
