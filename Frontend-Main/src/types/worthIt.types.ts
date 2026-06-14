export interface WorthItTransaction {
  id: string;
  merchant: string;
  description: string;
  amount: number;
  category: string;
  date: string;
  initial: string;
}

export type WorthItRatingValue = 'keep' | 'cut' | 'skip';

export interface SessionData {
  session_id: string;
  week_label: string;
  transactions: WorthItTransaction[];
  ratings: Record<string, WorthItRatingValue>;
  streak: number;
  session_complete: boolean;
  session_skipped: boolean;
}

export interface StreakData {
  streak: number;
  longest_streak: number;
  last_completed_week: string | null;
  total_sessions_completed: number;
}

export interface PreferenceSummary {
  top_kept_categories: string[];
  top_cut_categories: string[];
  cut_subscriptions: string[];
  total_ratings: number;
  model_confidence: number;
}

export interface CategoryBreakdown {
  keep_count: number;
  cut_count: number;
  skip_count: number;
  total_amount: number;
}

export interface InsightTransaction {
  id: string;
  merchant: string;
  description: string;
  amount: number;
  category: string;
  date: string;
  initial: string;
  rating: WorthItRatingValue;
}

export interface InsightsData {
  total_reviewed_count: number;
  keep_count: number;
  cut_count: number;
  skip_count: number;
  keep_total_amount: number;
  cut_total_amount: number;
  skip_total_amount: number;
  top_kept_categories: string[];
  top_cut_categories: string[];
  biggest_kept_transaction: InsightTransaction | null;
  biggest_cut_transaction: InsightTransaction | null;
  recent_happy_transactions: InsightTransaction[];
  recent_not_happy_transactions: InsightTransaction[];
  summary_message: string;
  category_breakdown: Record<string, CategoryBreakdown>;
  total_saved_estimate: number;
  recurring_cuts: string[];
  week_over_week_trend: 'improving' | 'declining' | 'stable';
}

export interface Last30DaysInsights {
  total_reviewed_count: number;
  keep_count: number;
  cut_count: number;
  skip_count: number;
  keep_total_amount: number;
  cut_total_amount: number;
  skip_total_amount: number;
  top_kept_categories: string[];
  top_cut_categories: string[];
  recent_happy_transactions: InsightTransaction[];
  recent_not_happy_transactions: InsightTransaction[];
  biggest_kept_transaction: InsightTransaction | null;
  biggest_cut_transaction: InsightTransaction | null;
  summary_message: string;
}

export interface SessionHistoryItem {
  session_id: string;
  week_label: string;
  status: string;
  keep_count: number;
  cut_count: number;
  skip_count: number;
  reviewed_count: number;
  keep_total_amount: number;
  cut_total_amount: number;
  skip_total_amount: number;
  summary_message: string;
  completed_at: string | null;
}

export interface SessionHistoryData {
  sessions: SessionHistoryItem[];
}
