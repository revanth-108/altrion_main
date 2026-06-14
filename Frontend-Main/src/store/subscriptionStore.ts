import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { SubscriptionWithOverride, SubscriptionStatus } from '../types';

interface SubscriptionState {
  subscription: SubscriptionWithOverride | null;
  isLoading: boolean;
  error: string | null;
  
  // Computed properties
  hasActiveAccess: () => boolean;
  trialDaysRemaining: () => number | null;
  isTrialing: () => boolean;
  isExpired: () => boolean;
  
  // Actions
  setSubscription: (subscription: SubscriptionWithOverride | null) => void;
  setLoading: (isLoading: boolean) => void;
  setError: (error: string | null) => void;
  clearSubscription: () => void;
}

const useSubscriptionStore = create<SubscriptionState>()(
  persist(
    (set, get) => ({
      subscription: null,
      isLoading: false,
      error: null,

      // Computed: Check if user has active access
      hasActiveAccess: () => {
        const { subscription } = get();
        if (!subscription) return false;
        
        // Check for waived subscription
        if (subscription.override?.is_waived) return true;
        
        // Check subscription status
        const activeStatuses: SubscriptionStatus[] = [
          'trialing' as SubscriptionStatus,
          'active' as SubscriptionStatus,
          'lifetime' as SubscriptionStatus,
        ];
        
        return activeStatuses.includes(subscription.status);
      },

      // Computed: Get remaining trial days
      trialDaysRemaining: () => {
        const { subscription } = get();
        if (!subscription || !subscription.trial_end) return null;
        
        const now = new Date();
        const trialEnd = new Date(subscription.trial_end);
        const diff = trialEnd.getTime() - now.getTime();
        const days = Math.ceil(diff / (1000 * 60 * 60 * 24));
        
        return days > 0 ? days : 0;
      },

      // Computed: Check if user is in trial
      isTrialing: () => {
        const { subscription } = get();
        return subscription?.status === ('trialing' as SubscriptionStatus);
      },

      // Computed: Check if subscription is expired
      isExpired: () => {
        const { subscription } = get();
        if (!subscription) return true;
        
        const expiredStatuses: SubscriptionStatus[] = [
          'canceled' as SubscriptionStatus,
          'unpaid' as SubscriptionStatus,
          'incomplete' as SubscriptionStatus,
          'past_due' as SubscriptionStatus,
        ];
        
        return expiredStatuses.includes(subscription.status);
      },

      // Actions
      setSubscription: (subscription) => set({ subscription, error: null }),
      
      setLoading: (isLoading) => set({ isLoading }),
      
      setError: (error) => set({ error, isLoading: false }),
      
      clearSubscription: () => set({ subscription: null, error: null, isLoading: false }),
    }),
    {
      name: 'altrion-subscription',
      partialize: (state) => ({
        subscription: state.subscription,
      }),
    }
  )
);

export default useSubscriptionStore;
