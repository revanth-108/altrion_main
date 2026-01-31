import type { Platform, ConnectionStatus } from '@/types';
import type { PlatformCredentials, ApiKeyCredentials } from '@/schemas';
import { api } from './api';

// Backend response types
interface BackendPlatform {
  id: string;
  name: string;
  icon: string;
  category: 'crypto' | 'bank' | 'broker';
}

interface BackendConnectionResponse {
  platform_id: string;
  status: 'pending' | 'connecting' | 'success' | 'error';
  message?: string;
  account_id?: string;
}

export interface ConnectionResult {
  platformId: string;
  status: ConnectionStatus;
  message?: string;
}

export const platformService = {
  /**
   * Get all available platforms
   */
  async getPlatforms(): Promise<{ crypto: Platform[]; banks: Platform[]; brokers: Platform[] }> {
    try {
      const { data } = await api.get<BackendPlatform[]>('/platforms');
      
      const platforms: Platform[] = data.map((platform) => ({
        id: platform.id,
        name: platform.name,
        icon: platform.icon,
        category: platform.category,
      }));

      const walletPlatforms = platforms.filter((platform) => platform.id === 'wallet');
      const bankPlatforms = platforms.filter((platform) => platform.id === 'plaid');
      const fallbackWallet: Platform = {
        id: 'wallet',
        name: 'Wallet',
        icon: '/wallet.svg',
        category: 'crypto',
      };

      const cryptoPlatforms = walletPlatforms.length > 0 ? walletPlatforms : [fallbackWallet];
      return {
        crypto: cryptoPlatforms,
        banks: bankPlatforms,
        brokers: [],
      };
    } catch (error) {
      console.error('Failed to fetch platforms:', error);
      return {
        crypto: [
          {
            id: 'wallet',
            name: 'Wallet',
            icon: '/wallet.svg',
            category: 'crypto',
          },
        ],
        banks: [
          {
            id: 'plaid',
            name: 'Plaid',
            icon: '/plaid.svg',
            category: 'bank',
          },
        ],
        brokers: [],
      };
    }
  },

  /**
   * Connect to a platform using credentials
   */
  async connectWithCredentials(
    platformId: string,
    credentials: PlatformCredentials | Record<string, string>
  ): Promise<ConnectionResult> {
    try {
      const { data } = await api.post<BackendConnectionResponse>(
        `/platforms/${platformId}/connect`,
        { credentials }
      );
      
      return {
        platformId: data.platform_id,
        status: data.status as ConnectionStatus,
        message: data.message,
      };
    } catch (error) {
      console.error('Failed to connect platform:', error);
      return {
        platformId,
        status: 'error',
        message: 'Failed to connect. Please check your credentials.',
      };
    }
  },

  async getPlaidLinkToken(): Promise<string> {
    const { data } = await api.post<{ success: boolean; link_token: string }>('/plaid/link-token');
    return data.link_token;
  },

  /**
   * Connect to a platform using API keys
   */
  async connectWithApiKey(
    platformId: string,
    apiCredentials: ApiKeyCredentials
  ): Promise<ConnectionResult> {
    try {
      const { data } = await api.post<BackendConnectionResponse>(
        `/platforms/${platformId}/connect`,
        {
          api_key: apiCredentials.apiKey,
          api_secret: apiCredentials.apiSecret,
        }
      );
      
      return {
        platformId: data.platform_id,
        status: data.status as ConnectionStatus,
        message: data.message,
      };
    } catch (error) {
      console.error('Failed to connect platform with API key:', error);
      return {
        platformId,
        status: 'error',
        message: 'Invalid API credentials.',
      };
    }
  },

  /**
   * Disconnect from a platform
   */
  async disconnect(platformId: string): Promise<void> {
    try {
      await api.delete(`/platforms/${platformId}/connection`);
    } catch (error) {
      console.error('Failed to disconnect platform:', error);
      throw error;
    }
  },

  /**
   * Get connected platforms
   */
  async getConnectedPlatforms(): Promise<Platform[]> {
    try {
      const { data } = await api.get<Array<{
        platform: BackendPlatform;
        accounts: Array<{
          id: string;
          name: string;
          last_synced_at: string | null;
          error_message: string | null;
        }>;
      }>>('/platforms/connected');
      
      // Transform to frontend format
      const platforms: Platform[] = [];
      data.forEach((item) => {
        item.accounts.forEach((account) => {
          platforms.push({
            id: account.id,
            name: account.name,
            icon: item.platform.icon,
            category: item.platform.category,
          });
        });
      });
      
      return platforms;
    } catch (error) {
      console.error('Failed to fetch connected platforms:', error);
      return [];
    }
  },

  /**
   * Verify platform connection status
   */
  async verifyConnection(platformId: string): Promise<ConnectionResult> {
    // TODO: Replace with real API call
    // const { data } = await api.get(`/platforms/${platformId}/verify`);
    // return data;

    await simulateDelay(500);
    
    return {
      platformId,
      status: 'success',
      message: 'Connection verified',
    };
  },

  /**
   * Sync data from a connected platform
   */
  async syncPlatform(_platformId: string): Promise<{ syncedAt: string }> {
    // TODO: Replace with real API call
    // const { data } = await api.post(`/platforms/${platformId}/sync`);
    // return data;

    await simulateDelay(2000);
    
    return {
      syncedAt: new Date().toISOString(),
    };
  },
};

export default platformService;
