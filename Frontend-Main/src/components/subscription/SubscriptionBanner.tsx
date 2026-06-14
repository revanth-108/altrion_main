import { useEffect, useState } from 'react';
import { AlertCircle, Clock, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useSubscriptionStore } from '../../store';

export const SubscriptionBanner: React.FC = () => {
  const navigate = useNavigate();
  const [dismissed, setDismissed] = useState(false);
  const { subscription, trialDaysRemaining, isTrialing } = useSubscriptionStore();

  useEffect(() => {
    // Reset dismissed state when trial days change
    setDismissed(false);
  }, [trialDaysRemaining()]);

  if (!subscription || dismissed || !isTrialing()) {
    return null;
  }

  const daysLeft = trialDaysRemaining();
  
  if (daysLeft === null || daysLeft > 7) {
    return null; // Don't show banner if more than 7 days left
  }

  const getVariant = () => {
    if (daysLeft <= 1) return 'urgent';
    if (daysLeft <= 3) return 'warning';
    return 'info';
  };

  const variant = getVariant();

  const styles = {
    urgent: 'bg-red-50 border-red-200 text-red-900',
    warning: 'bg-orange-50 border-orange-200 text-orange-900',
    info: 'bg-blue-50 border-blue-200 text-blue-900',
  };

  const iconStyles = {
    urgent: 'text-red-500',
    warning: 'text-orange-500',
    info: 'text-blue-500',
  };

  return (
    <div className={`border-b ${styles[variant]} px-4 py-3`}>
      <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 flex-1">
          {daysLeft <= 1 ? (
            <AlertCircle className={`h-5 w-5 flex-shrink-0 ${iconStyles[variant]}`} />
          ) : (
            <Clock className={`h-5 w-5 flex-shrink-0 ${iconStyles[variant]}`} />
          )}
          
          <div className="flex-1">
            <p className="font-medium">
              {daysLeft === 0 && 'Your trial ends today!'}
              {daysLeft === 1 && 'Your trial ends tomorrow!'}
              {daysLeft > 1 && `Your trial ends in ${daysLeft} days`}
            </p>
            <p className="text-sm opacity-90">
              Subscribe now to continue accessing your portfolio and loan features.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => navigate('/pricing')}
            className={`px-4 py-2 rounded-lg font-medium transition-colors ${
              variant === 'urgent'
                ? 'bg-red-600 text-white hover:bg-red-700'
                : variant === 'warning'
                ? 'bg-orange-600 text-white hover:bg-orange-700'
                : 'bg-blue-600 text-white hover:bg-blue-700'
            }`}
          >
            View Plans
          </button>
          
          <button
            onClick={() => setDismissed(true)}
            className="p-2 hover:bg-black/5 rounded-lg transition-colors"
            aria-label="Dismiss"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
};

export default SubscriptionBanner;
