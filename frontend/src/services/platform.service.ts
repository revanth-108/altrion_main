import type { Platform, ConnectionStatus } from '@/types';
import type { PlatformCredentials, ApiKeyCredentials } from '@/schemas';
import { walletPlatforms } from '@/mock/data';

// Simulated delay for demo purposes
const simulateDelay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export interface ConnectionResult {
  platformId: string;
  status: ConnectionStatus;
  message?: string;
}

export const platformService = {
  /**
   * Get all available platforms
   */
  async getPlatforms(): Promise<typeof walletPlatforms> {
    // TODO: Replace with real API call
    // const { data } = await api.get('/platforms');
    // return data;

    await simulateDelay(300);
    return walletPlatforms;
  },

  /**
   * Connect to a platform using credentials
   */
  async connectWithCredentials(
    platformId: string,
    _credentials: PlatformCredentials
  ): Promise<ConnectionResult> {
    // TODO: Replace with real API call
    // const { data } = await api.post(`/platforms/${platformId}/connect`, credentials);
    // return data;

    await simulateDelay(1500 + Math.random() * 1500);
    
    // 90% success rate for demo
    const success = Math.random() > 0.1;
    
    return {
      platformId,
      status: success ? 'success' : 'error',
      message: success ? 'Connected successfully' : 'Failed to connect. Please check your credentials.',
    };
  },

  /**
   * Connect to a platform using API keys
   */
  async connectWithApiKey(
    platformId: string,
    _apiCredentials: ApiKeyCredentials
  ): Promise<ConnectionResult> {
    // TODO: Replace with real API call
    // const { data } = await api.post(`/platforms/${platformId}/connect-api`, apiCredentials);
    // return data;

    await simulateDelay(1500 + Math.random() * 1000);
    
    const success = Math.random() > 0.1;
    
    return {
      platformId,
      status: success ? 'success' : 'error',
      message: success ? 'API connected successfully' : 'Invalid API credentials.',
    };
  },

  /**
   * Disconnect from a platform
   */
  async disconnect(_platformId: string): Promise<void> {
    // TODO: Replace with real API call
    // await api.delete(`/platforms/${platformId}/connection`);

    await simulateDelay(500);
  },

  /**
   * Get connected platforms
   */
  async getConnectedPlatforms(): Promise<Platform[]> {
    // TODO: Replace with real API call
    // const { data } = await api.get<Platform[]>('/platforms/connected');
    // return data;

    await simulateDelay(300);
    return [];
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
