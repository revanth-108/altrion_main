import { api } from './api';
import type {
  Subscription,
  SubscriptionWithOverride,
  SubscriptionPlan,
  CreateCheckoutSessionRequest,
  CheckoutSessionResponse,
  CancelSubscriptionRequest,
  ApplyPromoCodeRequest,
} from '../types';

export const subscriptionService = {
  /**
   * Get current user's subscription
   */
  async getMySubscription(): Promise<SubscriptionWithOverride> {
    const response = await api.get<SubscriptionWithOverride>('/subscriptions/me');
    return response.data;
  },

  /**
   * Get all available subscription plans
   */
  async getPlans(): Promise<SubscriptionPlan[]> {
    const response = await api.get<SubscriptionPlan[]>('/subscriptions/plans');
    return response.data;
  },

  /**
   * Create a checkout session for subscription
   */
  async createCheckoutSession(
    data: CreateCheckoutSessionRequest
  ): Promise<CheckoutSessionResponse> {
    const response = await api.post<CheckoutSessionResponse>('/subscriptions/checkout', data);
    return response.data;
  },

  /**
   * Cancel subscription
   */
  async cancelSubscription(data: CancelSubscriptionRequest = {}): Promise<{ success: boolean; message: string; subscription: Subscription }> {
    const response = await api.post<{ success: boolean; message: string; subscription: Subscription }>('/subscriptions/cancel', data);
    return response.data;
  },

  /**
   * Reactivate a canceled subscription
   */
  async reactivateSubscription(): Promise<{ success: boolean; message: string; subscription: Subscription }> {
    const response = await api.post<{ success: boolean; message: string; subscription: Subscription }>('/subscriptions/reactivate', {});
    return response.data;
  },

  /**
   * Validate a promo code
   */
  async applyPromoCode(data: ApplyPromoCodeRequest): Promise<{ success: boolean; message: string; promo_code: any }> {
    const response = await api.post<{ success: boolean; message: string; promo_code: any }>('/subscriptions/apply-promo', data);
    return response.data;
  },

  /**
   * Get the current user's BofA payment history
   */
  async getMyBofaPayments(): Promise<any[]> {
    const response = await api.get<any[]>('/subscriptions/payments/bofa');
    return response.data;
  },

  /**
   * Confirm a BofA HPP payment using the signed redirect params.
   * Called from the success page so activation works even without a public webhook.
   */
  async confirmHppPayment(params: Record<string, string>): Promise<{ success: boolean; decision: string; status?: string }> {
    const response = await api.post<{ success: boolean; decision: string; status?: string }>(
      '/subscriptions/confirm-payment',
      params,
    );
    return response.data;
  },
};
