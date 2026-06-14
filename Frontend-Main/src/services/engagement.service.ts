import { api } from './api';

export const engagementService = {
  recordPageView(data: {
    path: string;
    title?: string;
    duration_ms: number;
    referrer?: string;
    started_at?: string;
    metadata?: Record<string, unknown>;
  }) {
    return api.post('/engagement/page-view', data, { timeout: 5000 });
  },
};
