import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { worthItService } from '@/services/worthIt.service';
import type {
  SessionData,
  StreakData,
  PreferenceSummary,
  InsightsData,
  Last30DaysInsights,
  SessionHistoryData,
} from '@/types';

export const worthItKeys = {
  all: ['worth-it'] as const,
  session: () => [...worthItKeys.all, 'session'] as const,
  streak: () => [...worthItKeys.all, 'streak'] as const,
  preferences: () => [...worthItKeys.all, 'preferences'] as const,
  history: () => [...worthItKeys.all, 'history'] as const,
  insights: (id: string) => [...worthItKeys.all, 'insights', id] as const,
  last30DaysInsights: () => [...worthItKeys.all, 'insights', 'last-30-days'] as const,
};

export function useWorthItSession() {
  return useQuery<SessionData>({
    queryKey: worthItKeys.session(),
    queryFn: () => worthItService.getSession(),
    staleTime: 30 * 1000,
    retry: 1,
  });
}

export function useRateTransaction() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      transactionId,
      rating,
      merchant,
      description,
      amount,
      category,
      date,
    }: {
      transactionId: string;
      rating: 'keep' | 'cut' | 'skip';
      merchant: string;
      description: string;
      amount: number;
      category: string;
      date: string;
    }) =>
      worthItService.rateTransaction(transactionId, rating, {
        merchant,
        description,
        amount,
        category,
        date,
      }),
    onMutate: async ({ transactionId, rating }) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: worthItKeys.session() });

      // Snapshot previous value
      const previousSession = queryClient.getQueryData<SessionData>(worthItKeys.session());

      // Optimistically update
      if (previousSession) {
        queryClient.setQueryData<SessionData>(worthItKeys.session(), {
          ...previousSession,
          ratings: { ...previousSession.ratings, [transactionId]: rating },
        });
      }

      return { previousSession };
    },
    onError: (_err, _vars, context) => {
      // Roll back on error
      if (context?.previousSession) {
        queryClient.setQueryData(worthItKeys.session(), context.previousSession);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: worthItKeys.all });
    },
  });
}

export function useSkipSession() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => worthItService.skipSession(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: worthItKeys.session() });
      queryClient.invalidateQueries({ queryKey: worthItKeys.streak() });
    },
  });
}

export function useWorthItStreak() {
  return useQuery<StreakData>({
    queryKey: worthItKeys.streak(),
    queryFn: () => worthItService.getStreak(),
    staleTime: 60 * 1000,
  });
}

export function useWorthItPreferences() {
  return useQuery<PreferenceSummary>({
    queryKey: worthItKeys.preferences(),
    queryFn: () => worthItService.getPreferences(),
    staleTime: 5 * 60 * 1000,
  });
}

export function useWorthItHistory() {
  return useQuery<SessionHistoryData>({
    queryKey: worthItKeys.history(),
    queryFn: () => worthItService.getHistory(),
    staleTime: 60 * 1000,
  });
}

export function useSessionInsights(sessionId?: string) {
  return useQuery<InsightsData>({
    queryKey: worthItKeys.insights(sessionId || ''),
    queryFn: () => worthItService.getSessionInsights(sessionId!),
    staleTime: Infinity,
    enabled: Boolean(sessionId),
  });
}

export function useWorthItLast30DaysInsights() {
  return useQuery<Last30DaysInsights>({
    queryKey: worthItKeys.last30DaysInsights(),
    queryFn: () => worthItService.getLast30DaysInsights(),
    staleTime: 5 * 60 * 1000,
  });
}
