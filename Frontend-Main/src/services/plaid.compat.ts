import type { PlaidBalancesResponse } from '@/types';

/**
 * Compatibility adapter for legacy Plaid payload shapes.
 *
 * Keep all old-key parsing here so dashboard code does not need to branch on
 * both the current response envelope and the older `data` wrapper.
 */
export const normalizePlaidBalancesPayload = (raw: unknown): PlaidBalancesResponse | undefined => {
  if (!raw || typeof raw !== 'object') return undefined;
  const candidate = raw as { accounts?: PlaidBalancesResponse['accounts']; data?: PlaidBalancesResponse };
  if (Array.isArray(candidate.accounts)) {
    return candidate as PlaidBalancesResponse;
  }
  if (candidate.data && Array.isArray(candidate.data.accounts)) {
    return candidate.data;
  }
  return undefined;
};
