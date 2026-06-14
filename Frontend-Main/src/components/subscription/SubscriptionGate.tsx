import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSubscriptionStore } from '../../store';
import { subscriptionService } from '../../services/subscription.service';

interface SubscriptionGateProps {
  children: React.ReactNode;
  fallbackPath?: string;
}

export const SubscriptionGate: React.FC<SubscriptionGateProps> = ({
  children,
  fallbackPath = '/pricing',
}) => {
  const navigate = useNavigate();
  const { hasActiveAccess, isLoading, setSubscription, setLoading, setError } = useSubscriptionStore();

  useEffect(() => {
    const checkSubscription = async () => {
      try {
        setLoading(true);
        const sub = await subscriptionService.getMySubscription();
        setSubscription(sub);

        // Check if user has active access
        if (!hasActiveAccess()) {
          navigate(fallbackPath);
        }
      } catch (error: any) {
        console.error('Subscription check failed:', error);
        
        // If 402 Payment Required, redirect to pricing
        if (error.status === 402 || error.response?.status === 402) {
          setError('Subscription required');
          navigate(fallbackPath);
        }
      } finally {
        setLoading(false);
      }
    };

    checkSubscription();
  }, [navigate, fallbackPath, hasActiveAccess, setSubscription, setLoading, setError]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Checking subscription...</p>
        </div>
      </div>
    );
  }

  if (!hasActiveAccess()) {
    return null; // Will redirect
  }

  return <>{children}</>;
};

export default SubscriptionGate;
