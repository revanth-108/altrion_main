export const BillingCycle = {
  MONTHLY: 'monthly',
  YEARLY: 'yearly',
  QUARTERLY: 'quarterly',
  LIFETIME: 'lifetime',
} as const;

export type BillingCycle = (typeof BillingCycle)[keyof typeof BillingCycle];

export const SubscriptionStatus = {
  TRIALING: 'trialing',
  ACTIVE: 'active',
  PAST_DUE: 'past_due',
  CANCELED: 'canceled',
  UNPAID: 'unpaid',
  INCOMPLETE: 'incomplete',
  PAUSED: 'paused',
  LIFETIME: 'lifetime',
} as const;

export type SubscriptionStatus =
  (typeof SubscriptionStatus)[keyof typeof SubscriptionStatus];

export const DiscountType = {
  PERCENTAGE: 'percentage',
  FIXED: 'fixed',
} as const;

export type DiscountType = (typeof DiscountType)[keyof typeof DiscountType];

export interface SubscriptionPlan {
  id: string;
  name: string;
  gateway_plan_id?: string;
  gateway_product_id?: string;
  billing_cycle: BillingCycle;
  base_price: number;
  currency: string;
  is_active: boolean;
  features: Record<string, any>;
  created_at: string;
  updated_at: string;
}

export interface Subscription {
  id: string;
  user_id: string;
  plan_id?: string;
  gateway_subscription_id?: string;
  gateway_customer_id?: string;
  gateway_payment_profile_id?: string;
  gateway_checkout_session_id?: string;
  status: SubscriptionStatus;
  current_period_start: string;
  current_period_end: string;
  trial_start?: string;
  trial_end?: string;
  cancel_at_period_end: boolean;
  canceled_at?: string;
  created_at: string;
  updated_at: string;
  plan?: SubscriptionPlan;
  is_active: boolean;
  days_until_renewal?: number;
}

export interface SubscriptionOverride {
  id: string;
  user_id: string;
  override_price?: number;
  discount_percentage?: number;
  discount_fixed?: number;
  is_waived: boolean;
  waive_reason?: string;
  override_reason?: string;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface SubscriptionWithOverride extends Subscription {
  override?: SubscriptionOverride;
  effective_price?: number;
}

export interface PromoCode {
  id: string;
  code: string;
  gateway_coupon_id?: string;
  discount_type: DiscountType;
  discount_value: number;
  max_redemptions?: number;
  redemptions_count: number;
  valid_from: string;
  valid_until?: string;
  is_active: boolean;
  applies_to_plan_ids?: string[];
  created_at: string;
  updated_at: string;
}

export interface PaymentMethod {
  id: string;
  user_id: string;
  gateway_payment_method_id: string;
  type: string;
  last4?: string;
  brand?: string;
  exp_month?: number;
  exp_year?: number;
  is_default: boolean;
  created_at: string;
  updated_at: string;
}

export interface CheckoutSessionResponse {
  session_id: string;
  url: string;
  publishable_key: string | null;
  provider?: 'bofa_secure_acceptance' | 'local_mock' | string;
  method?: 'GET' | 'POST' | string;
  fields?: Record<string, string> | null;
}

export interface CustomerPortalResponse {
  url: string;
}

export interface SubscriptionAnalytics {
  total_subscribers: number;
  active_subscribers: number;
  trialing_subscribers: number;
  canceled_subscribers: number;
  monthly_recurring_revenue: number;
  annual_recurring_revenue: number;
  churn_rate: number;
  average_revenue_per_user: number;
  lifetime_value: number;
  trial_conversion_rate: number;
}

// Request types
export interface CreateCheckoutSessionRequest {
  plan_id: string;
  promo_code?: string;
  success_url?: string;
  cancel_url?: string;
}

export interface CancelSubscriptionRequest {
  immediately?: boolean;
  reason?: string;
}

export interface ApplyPromoCodeRequest {
  code: string;
}

export interface PriceOverrideRequest {
  override_price: number;
  reason: string;
}

export interface DiscountRequest {
  discount_type: DiscountType;
  discount_value: number;
  reason: string;
}

export interface WaiveSubscriptionRequest {
  reason: string;
}

export interface BulkDiscountRequest {
  discount_type: DiscountType;
  discount_value: number;
  reason: string;
  user_ids?: string[];
}

export interface UpdatePlanPriceRequest {
  new_price: number;
  reason: string;
}

export interface CreateSubscriptionPlanRequest {
  name: string;
  billing_cycle: BillingCycle;
  base_price: number;
  currency?: string;
  gateway_plan_id?: string;
  gateway_product_id?: string;
  is_active?: boolean;
  features?: Record<string, any>;
}

export interface UpdateSubscriptionPlanRequest {
  name?: string;
  billing_cycle?: BillingCycle;
  base_price?: number;
  currency?: string;
  gateway_plan_id?: string;
  gateway_product_id?: string;
  is_active?: boolean;
  features?: Record<string, any>;
}

export interface CreatePromoCodeRequest {
  code: string;
  discount_type: DiscountType;
  discount_value: number;
  max_redemptions?: number;
  valid_from?: string;
  valid_until?: string;
  applies_to_plan_ids?: string[];
}

export interface AdminApplyPromoCodeRequest {
  code: string;
  user_ids?: string[];
}

export interface SubscriptionListFilters {
  status?: SubscriptionStatus;
  plan_id?: string;
  has_override?: boolean;
  is_waived?: boolean;
  page?: number;
  page_size?: number;
}
