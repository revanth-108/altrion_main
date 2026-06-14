import {
  DollarSign,
  Truck,
  Landmark,
} from 'lucide-react';
import type { PlatformIcon } from '../types';

export const PLATFORM_ICONS: Record<string, PlatformIcon> = {
  // Crypto Wallets
  metamask: { logo: '/wallet-logos/metamask.png', color: 'bg-orange-500/20' },
  coinbase: { logo: '/wallet-logos/coinbase.svg', color: 'bg-blue-500/20' },
  binance: { logo: '/wallet-logos/binance.png', color: 'bg-yellow-500/20' },
  phantom: { logo: '/wallet-logos/phantom.jpg', color: 'bg-purple-500/20' },
  ledger: { logo: '/wallet-logos/ledger.png', color: 'bg-slate-500/20' },
  trustwallet: { logo: '/wallet-logos/trustwallet.webp', color: 'bg-cyan-500/20' },
  wallet: { logo: '/wallet-logos/wallet.svg', color: 'bg-emerald-500/20' },

  // Banks
  chase: { icon: DollarSign, color: 'bg-blue-600/20 text-blue-500' },
  wells: { icon: Truck, color: 'bg-yellow-600/20 text-yellow-500' },
  citi: { icon: Landmark, color: 'bg-blue-500/20 text-blue-400' },
  plaid: { logo: '/wallet-logos/plaid.svg', color: 'bg-indigo-500/20' },

  // Brokerages
  robinhood: { logo: '/wallet-logos/robinhood.svg', color: 'bg-green-500/20' },
  schwab: { logo: '/wallet-logos/Charles_Schwab.png', color: 'bg-cyan-600/20' },
  fidelity: { logo: '/wallet-logos/fidelity.jpg', color: 'bg-green-600/20' },
  etrade: { logo: '/wallet-logos/etrade.svg', color: 'bg-purple-600/20' },
};
