/**
 * Worth It? API service
 *
 * Calls backend endpoints for session management, ratings, streaks,
 * preferences, history, and insights. Types live in types/worthIt.types.ts.
 */
import { api } from './api';
import type {
  SessionData,
  StreakData,
  PreferenceSummary,
  InsightsData,
  Last30DaysInsights,
  SessionHistoryData,
  WorthItRatingValue,
} from '@/types';

interface RateTransactionMeta {
  merchant: string;
  description: string;
  amount: number;
  category: string;
  date: string;
}

export const worthItService = {
  /** GET /worth-it/session */
  async getSession(): Promise<SessionData> {
    const { data } = await api.get<SessionData>('/worth-it/session');
    return data;
  },

  /** POST /worth-it/session/rate */
  async rateTransaction(
    transactionId: string,
    rating: WorthItRatingValue,
    meta: RateTransactionMeta,
  ): Promise<{ success: boolean; session_complete: boolean; ratings_count: number }> {
    const { data } = await api.post<{ success: boolean; session_complete: boolean; ratings_count: number }>(
      '/worth-it/session/rate',
      { transaction_id: transactionId, rating, ...meta },
    );
    return data;
  },

  /** POST /worth-it/session/skip */
  async skipSession(): Promise<void> {
    await api.post('/worth-it/session/skip', {});
  },

  /** GET /worth-it/streak */
  async getStreak(): Promise<StreakData> {
    const { data } = await api.get<StreakData>('/worth-it/streak');
    return data;
  },

  /** GET /worth-it/preferences */
  async getPreferences(): Promise<PreferenceSummary> {
    const { data } = await api.get<PreferenceSummary>('/worth-it/preferences');
    return data;
  },

  /** GET /worth-it/history */
  async getHistory(): Promise<SessionHistoryData> {
    const { data } = await api.get<SessionHistoryData>('/worth-it/history');
    return data;
  },

  /** GET /worth-it/session/:id/insights */
  async getSessionInsights(sessionId: string): Promise<InsightsData> {
    const { data } = await api.get<InsightsData>(`/worth-it/session/${sessionId}/insights`);
    return data;
  },

  /** GET /worth-it/insights/last-30-days */
  async getLast30DaysInsights(): Promise<Last30DaysInsights> {
    const { data } = await api.get<Last30DaysInsights>('/worth-it/insights/last-30-days');
    return data;
  },
};
