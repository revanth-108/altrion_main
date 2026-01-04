import {
  DollarSign,
  Building2,
  Truck,
  Landmark,
} from 'lucide-react';
import type { PlatformIcon } from '../types';

export const PLATFORM_ICONS: Record<string, PlatformIcon> = {
  // Crypto Wallets
  metamask: { logo: '/metamask.png', color: 'bg-orange-500/20' },
  coinbase: { logo: '/coinbase.svg', color: 'bg-blue-500/20' },
  binance: { logo: '/binance.png', color: 'bg-yellow-500/20' },
  phantom: { logo: '/phantom.jpg', color: 'bg-purple-500/20' },
  ledger: { logo: '/ledger.png', color: 'bg-slate-500/20' },
  trustwallet: { logo: '/trustwallet.webp', color: 'bg-cyan-500/20' },

  // Banks
  chase: { icon: DollarSign, color: 'bg-blue-600/20 text-blue-500' },
  bofa: { icon: Building2, color: 'bg-red-600/20 text-red-500' },
  wells: { icon: Truck, color: 'bg-yellow-600/20 text-yellow-500' },
  citi: { icon: Landmark, color: 'bg-blue-500/20 text-blue-400' },

  // Brokerages
  robinhood: { logo: '/robinhood.svg', color: 'bg-green-500/20' },
  schwab: { logo: '/Charles_Schwab.png', color: 'bg-cyan-600/20' },
  fidelity: { logo: '/fidelity.jpg', color: 'bg-green-600/20' },
  etrade: { logo: '/etrade.svg', color: 'bg-purple-600/20' },
};
