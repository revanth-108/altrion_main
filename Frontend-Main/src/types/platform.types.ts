export type PlatformCategory = 'crypto' | 'bank' | 'broker';

export interface Platform {
  id: string;
  name: string;
  icon: string;
  category: PlatformCategory;
}

export interface ConnectedAccount extends Platform {
  provider: string;
  providerAccountId: string;
  accountType: string | null;
  subtype: string | null;
  classification?: 'asset' | 'liability' | 'other';
  roleLabel?: string | null;
  mask: string | null;
  institutionName: string | null;
  itemId: string | null;
  balanceAvailable: number | null;
  balanceCurrent: number | null;
  balanceLimit: number | null;
  balanceCurrency: string | null;
  debtAmount?: number | null;
  lastSyncedAt: string | null;
  errorMessage: string | null;
}

export interface WalletPlatforms {
  crypto: Platform[];
  banks: Platform[];
  brokers: Platform[];
}

export type ConnectionStatus = 'pending' | 'connecting' | 'success' | 'error';

export interface ConnectionState {
  platformId: string;
  status: ConnectionStatus;
}

export interface PlatformIcon {
  icon?: any;
  logo?: string;
  color: string;
}
