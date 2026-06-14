import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Link2, CheckCircle, Plus } from 'lucide-react';
import { Button, Card } from '../../../components/ui';
import { usePortfolio } from '../../../hooks';
import { formatCurrency } from '../../../utils';
import { ROUTES } from '../../../constants';

const PLATFORM_LOGOS: Record<string, string> = {
  'Coinbase': '/coinbase.svg',
  'MetaMask': '/metamask.png',
  'Robinhood': '/robinhood.svg',
};

interface ConnectedPlatform {
  name: string;
  assetsCount: number;
  totalValue: number;
}

export function ConnectedAccountsCard() {
  const navigate = useNavigate();
  const { data: portfolio } = usePortfolio();

  // Extract unique platforms and calculate their stats from portfolio data
  const connectedPlatforms = useMemo<ConnectedPlatform[]>(() => {
    if (!portfolio?.assets) return [];

    const platformMap = new Map<string, { assetsCount: number; totalValue: number }>();

    portfolio.assets.forEach(asset => {
      const existing = platformMap.get(asset.platform);
      if (existing) {
        existing.assetsCount += 1;
        existing.totalValue += asset.value;
      } else {
        platformMap.set(asset.platform, {
          assetsCount: 1,
          totalValue: asset.value,
        });
      }
    });

    return Array.from(platformMap.entries())
      .map(([name, stats]) => ({
        name,
        ...stats,
      }))
      .sort((a, b) => b.totalValue - a.totalValue);
  }, [portfolio]);

  return (
    <Card variant="bordered">
      <div className="flex items-center justify-between gap-2 sm:gap-3 mb-5">
        <div className="flex items-center gap-2 sm:gap-3">
          <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl bg-purple-500/20 flex items-center justify-center flex-shrink-0">
            <Link2 size={16} className="text-purple-400 sm:hidden" />
            <Link2 size={20} className="text-purple-400 hidden sm:block" />
          </div>
          <h3 className="font-display text-base sm:text-xl font-semibold text-text-primary">Connected Accounts</h3>
        </div>
        <Button variant="secondary" size="sm" onClick={() => navigate(ROUTES.CONNECT_SELECT)} className="flex-shrink-0 text-xs sm:text-sm">
          <Plus size={14} className="sm:hidden" />
          <Plus size={16} className="hidden sm:block" />
          <span className="hidden sm:inline">Add Account</span>
          <span className="sm:hidden">Add</span>
        </Button>
      </div>

      <div className="space-y-3">
        {connectedPlatforms.map((platform) => (
          <div
            key={platform.name}
            className="flex items-center justify-between gap-3 p-3 sm:p-4 bg-dark-elevated rounded-xl border border-dark-border/50 hover:border-dark-border transition-colors"
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 rounded-full bg-dark-card flex items-center justify-center overflow-hidden flex-shrink-0">
                {PLATFORM_LOGOS[platform.name] ? (
                  <img
                    src={PLATFORM_LOGOS[platform.name]}
                    alt={platform.name}
                    className="w-6 h-6 object-contain"
                  />
                ) : (
                  <span className="text-sm font-bold text-text-muted">
                    {platform.name.slice(0, 2).toUpperCase()}
                  </span>
                )}
              </div>
              <div className="min-w-0">
                <p className="font-medium text-text-primary text-sm sm:text-base truncate">{platform.name}</p>
                <p className="text-xs text-text-muted">
                  {platform.assetsCount} {platform.assetsCount === 1 ? 'asset' : 'assets'}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 sm:gap-4 flex-shrink-0">
              <p className="font-semibold text-text-primary text-sm sm:text-base">{formatCurrency(platform.totalValue)}</p>
              <div className="hidden sm:flex items-center gap-1.5">
                <CheckCircle size={14} className="text-green-400" />
                <span className="text-xs text-green-400 font-medium">Connected</span>
              </div>
              <CheckCircle size={14} className="text-green-400 sm:hidden flex-shrink-0" />
            </div>
          </div>
        ))}
      </div>

      {connectedPlatforms.length === 0 && (
        <div className="p-8 text-center">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-dark-elevated flex items-center justify-center">
            <Link2 size={24} className="text-text-muted" />
          </div>
          <h4 className="text-text-primary font-medium mb-1">No accounts connected</h4>
          <p className="text-text-muted text-sm mb-4">
            Connect your wallets and accounts to view them here.
          </p>
          <Button onClick={() => navigate(ROUTES.CONNECT_SELECT)}>
            <Plus size={16} />
            Connect Account
          </Button>
        </div>
      )}
    </Card>
  );
}
