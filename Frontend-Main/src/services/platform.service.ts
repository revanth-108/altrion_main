import type { Platform, ConnectedAccount, ConnectionStatus } from '@/types';
import type { PlatformCredentials, ApiKeyCredentials } from '@/schemas';
import { api } from './api';

const simulateDelay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

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

      const bankPlatforms = platforms
        .filter((platform) => platform.id === 'plaid')
        .map((platform) => ({
          ...platform,
          name: 'Bank Account',
        }));
      const fallbackPlaid: Platform = {
        id: 'plaid',
        name: 'Bank Account',
        icon: '/wallet-logos/plaid.svg',
        category: 'bank',
      };

      return {
        crypto: [],
        banks: bankPlatforms.length > 0 ? bankPlatforms : [fallbackPlaid],
        brokers: [],
      };
    } catch (error) {
      console.error('Failed to fetch platforms:', error);
      return {
        crypto: [],
        banks: [
          {
            id: 'plaid',
            name: 'Bank Account',
            icon: '/wallet-logos/plaid.svg',
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
   * Exchange a Plaid public_token for a permanent access_token.
   * Called after user completes the Plaid Link UI flow.
   * Uses the new dedicated /plaid/exchange-token endpoint instead of
   * the generic /platforms/plaid/connect endpoint.
   */
  async exchangePlaidToken(publicToken: string): Promise<{
    success: boolean;
    persisted?: boolean;
    item_id: string;
    accounts: Array<{
      provider_account_id: string;
      name: string;
      type: string;
      subtype: string;
      mask: string;
    }>;
    account_count: number;
  }> {
    const { data } = await api.post<{
      success: boolean;
      persisted?: boolean;
      item_id: string;
      accounts: Array<{
        provider_account_id: string;
        name: string;
        type: string;
        subtype: string;
        mask: string;
      }>;
      account_count: number;
    }>('/plaid/exchange-token', {
      public_token: publicToken,
    });
    return data;
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
  async getConnectedPlatforms(): Promise<ConnectedAccount[]> {
    try {
      const { data } = await api.get<Array<{
        platform: BackendPlatform;
        accounts: Array<{
          id: string;
          provider: string;
          provider_account_id: string;
          name: string;
          account_type: string | null;
          subtype: string | null;
          classification?: 'asset' | 'liability' | 'other';
          role_label?: string | null;
          mask: string | null;
          institution_name: string | null;
          item_id: string | null;
          balance_available: number | null;
          balance_current: number | null;
          balance_limit: number | null;
          balance_currency: string | null;
          debt_amount?: number | null;
          last_synced_at: string | null;
          error_message: string | null;
        }>;
      }>>('/platforms/connected');
      
      // Transform to frontend format
      const platforms: ConnectedAccount[] = [];
      data.forEach((item) => {
        item.accounts.forEach((account) => {
          platforms.push({
            id: account.id,
            provider: account.provider,
            providerAccountId: account.provider_account_id,
            name: account.name,
            icon: item.platform.icon,
            category: item.platform.category,
            accountType: account.account_type,
            subtype: account.subtype,
            classification: account.classification,
            roleLabel: account.role_label,
            mask: account.mask,
            institutionName: account.institution_name,
            itemId: account.item_id,
            balanceAvailable: account.balance_available,
            balanceCurrent: account.balance_current,
            balanceLimit: account.balance_limit,
            balanceCurrency: account.balance_currency,
            debtAmount: account.debt_amount,
            lastSyncedAt: account.last_synced_at,
            errorMessage: account.error_message,
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
    void _platformId;
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
