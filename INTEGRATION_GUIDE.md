# 🔌 Quick Integration Guide

This guide shows how to integrate subscription features into your existing pages.

## 1️⃣ Add Trial Banner to Dashboard

**File**: `Frontend-Main/src/components/layout/DashboardLayout.tsx`

Add import:
```tsx
import { SubscriptionBanner } from '../subscription';
```

Add to layout (before your main content):
```tsx
export const DashboardLayout = ({ children }) => {
  return (
    <div>
      <Header />
      <SubscriptionBanner />  {/* Add this line */}
      <main>{children}</main>
      <Footer />
    </div>
  );
};
```

---

## 2️⃣ Add Subscription Status to Profile Page

**File**: `Frontend-Main/src/pages/dashboard/Profile.tsx`

Add import:
```tsx
import { SubscriptionStatus } from '../../components/subscription';
```

Add section (in your profile page):
```tsx
export const Profile = () => {
  return (
    <DashboardLayout>
      {/* Existing profile content */}
      
      {/* Add subscription section */}
      <section className="mt-8">
        <h2 className="text-2xl font-bold mb-4">Subscription</h2>
        <SubscriptionStatus />
      </section>
    </DashboardLayout>
  );
};
```

---

## 3️⃣ Protect Expensive Features (Optional)

Wrap any feature you want to gate behind subscription:

```tsx
import { SubscriptionGate } from '../../components/subscription';

export const ExpensiveFeature = () => {
  return (
    <SubscriptionGate fallbackPath="/pricing">
      {/* This content only shows to subscribed users */}
      <div>Premium Feature Content</div>
    </SubscriptionGate>
  );
};
```

---

## 4️⃣ Add Subscription Link to Navigation

**File**: `Frontend-Main/src/components/ui/Header.tsx` or navigation component

Add link to manage subscription:

```tsx
import { ROUTES } from '../../constants';

// In your navigation menu:
<a href={ROUTES.SUBSCRIPTION}>
  Subscription
</a>

// Or with React Router:
<Link to={ROUTES.SUBSCRIPTION}>
  Subscription
</Link>
```

---

## 5️⃣ Add Admin Links (For Admin Users Only)

In your admin navigation or profile dropdown:

```tsx
import { ROUTES } from '../../constants';
import { useAuthStore } from '../../store';

const isAdmin = () => {
  const user = useAuthStore(state => state.user);
  const adminEmails = ['admin@altrion.com']; // Or fetch from config
  return user && adminEmails.includes(user.email);
};

// In navigation:
{isAdmin() && (
  <>
    <Link to={ROUTES.ADMIN_DASHBOARD}>Admin Analytics</Link>
    <Link to={ROUTES.ADMIN_SUBSCRIPTIONS}>Manage Subscriptions</Link>
  </>
)}
```

---

## 6️⃣ Use Subscription State Anywhere

Access subscription info in any component:

```tsx
import { useSubscriptionStore } from '../../store';

const MyComponent = () => {
  const { 
    subscription,
    hasActiveAccess,
    isTrialing,
    trialDaysRemaining,
    isExpired
  } = useSubscriptionStore();

  // Check access
  if (!hasActiveAccess()) {
    return <div>Please subscribe to access this feature</div>;
  }

  // Show trial info
  if (isTrialing()) {
    return <div>Trial: {trialDaysRemaining()} days left</div>;
  }

  // Show subscription info
  return <div>Subscribed to {subscription?.plan?.name}</div>;
};
```

---

## 7️⃣ Check Subscription Status on Mount

Load subscription when app starts:

```tsx
// In App.tsx or a layout component
import { useEffect } from 'react';
import { useSubscriptionStore } from './store';
import { subscriptionService } from './services/subscription.service';

const App = () => {
  const { setSubscription, setLoading } = useSubscriptionStore();

  useEffect(() => {
    const loadSubscription = async () => {
      try {
        setLoading(true);
        const sub = await subscriptionService.getMySubscription();
        setSubscription(sub);
      } catch (error) {
        console.error('Failed to load subscription:', error);
      } finally {
        setLoading(false);
      }
    };

    // Only load if user is authenticated
    const token = localStorage.getItem('altrion-auth');
    if (token) {
      loadSubscription();
    }
  }, []);

  return <AppRoutes />;
};
```

---

## 🎨 **Styling Examples**

### Custom Trial Badge
```tsx
import { useSubscriptionStore } from '../store';

const TrialBadge = () => {
  const { isTrialing, trialDaysRemaining } = useSubscriptionStore();
  
  if (!isTrialing()) return null;
  
  return (
    <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-blue-100 text-blue-800">
      🎁 Trial: {trialDaysRemaining()} days left
    </span>
  );
};
```

### Custom Paywall
```tsx
import { useSubscriptionStore } from '../store';
import { useNavigate } from 'react-router-dom';

const CustomPaywall = () => {
  const navigate = useNavigate();
  const { hasActiveAccess } = useSubscriptionStore();
  
  if (hasActiveAccess()) return null;
  
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-2xl p-8 max-w-md text-center">
        <h2 className="text-2xl font-bold mb-4">Upgrade to Pro</h2>
        <p className="text-gray-600 mb-6">
          This feature requires an active subscription.
        </p>
        <button
          onClick={() => navigate('/pricing')}
          className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          View Plans
        </button>
      </div>
    </div>
  );
};
```

---

## 📱 **API Integration Examples**

### Get Subscription in a Component
```tsx
import { useQuery } from '@tanstack/react-query';
import { subscriptionService } from '../services/subscription.service';

const MyComponent = () => {
  const { data: subscription, isLoading } = useQuery({
    queryKey: ['subscription'],
    queryFn: () => subscriptionService.getMySubscription(),
  });

  if (isLoading) return <div>Loading...</div>;
  
  return <div>Status: {subscription?.status}</div>;
};
```

### Create Checkout Session
```tsx
const handleSubscribe = async (planId: string) => {
  try {
    const response = await subscriptionService.createCheckoutSession({
      plan_id: planId,
      promo_code: 'OPTIONAL_CODE'
    });
    
    // Redirect to payment gateway checkout
    window.location.href = response.url;
  } catch (error) {
    console.error('Checkout failed:', error);
  }
};
```

---

## 🔧 **Common Customizations**

### Change Trial Period
**Backend**: `Backend-Main/.env`
```bash
DEFAULT_TRIAL_DAYS=30  # Change from 14 to 30 days
```

### Change When Banner Shows
**File**: `SubscriptionBanner.tsx` line 19
```tsx
if (daysLeft === null || daysLeft > 7) {
  return null; // Change 7 to show earlier/later
}
```

### Add More Plan Features
**Database**: Update `subscription_plans.features` column
```sql
UPDATE subscription_plans 
SET features = '{"accounts": "unlimited", "refresh": "real-time", "support": "priority", "analytics": true}'
WHERE id = 'plan_id';
```

---

## ✨ **Everything is Ready!**

Just add payment gateway keys and you can:
- ✅ Accept payments
- ✅ Manage subscriptions
- ✅ Control pricing
- ✅ View analytics
- ✅ Apply discounts
- ✅ Track everything

**No additional code needed!** 🎊
