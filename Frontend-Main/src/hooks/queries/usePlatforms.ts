import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { platformService, type ConnectionResult } from '@/services';
import type { PlatformCredentials } from '@/schemas';

export const platformKeys = {
  all: ['platforms'] as const,
  list: () => [...platformKeys.all, 'list'] as const,
  connected: () => [...platformKeys.all, 'connected'] as const,
};

export function usePlatforms() {
  return useQuery({
    queryKey: platformKeys.list(),
    queryFn: () => platformService.getPlatforms(),
    staleTime: 5 * 60 * 1000, // 5 minutes - platforms don't change often
  });
}

export function useConnectedPlatforms() {
  return useQuery({
    queryKey: platformKeys.connected(),
    queryFn: () => platformService.getConnectedPlatforms(),
    staleTime: 30 * 1000, // 30 seconds
  });
}

export function useConnectPlatform() {
  const queryClient = useQueryClient();

  return useMutation<ConnectionResult, Error, { platformId: string; credentials: PlatformCredentials | Record<string, string> }>({
    mutationFn: ({ platformId, credentials }) =>
      platformService.connectWithCredentials(platformId, credentials),
    onSuccess: () => {
      // Invalidate connected platforms to refetch
      queryClient.invalidateQueries({ queryKey: platformKeys.connected() });
    },
  });
}

export function useDisconnectPlatform() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (platformId: string) => platformService.disconnect(platformId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: platformKeys.connected() });
    },
  });
}

export function useSyncPlatform() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (platformId: string) => platformService.syncPlatform(platformId),
    onSuccess: () => {
      // Invalidate portfolio data after sync
      queryClient.invalidateQueries({ queryKey: ['portfolio'] });
    },
  });
}
