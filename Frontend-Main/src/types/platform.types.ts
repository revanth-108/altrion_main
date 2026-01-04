export type PlatformCategory = 'crypto' | 'bank' | 'broker';

export interface Platform {
  id: string;
  name: string;
  icon: string;
  category: PlatformCategory;
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
