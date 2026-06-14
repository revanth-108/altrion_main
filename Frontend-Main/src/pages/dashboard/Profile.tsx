import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { DashboardLayout } from '../../components/layout';
import { CONTAINER_VARIANTS, ITEM_VARIANTS, ROUTES } from '../../constants';
import { ProfileHeader, ConnectedAccountsCard } from './components';
import { SubscriptionStatus } from '../../components/subscription';
import { subscriptionService } from '../../services/subscription.service';
import type { SubscriptionPlan } from '../../types';

export function Profile() {
  const navigate = useNavigate();
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);

  useEffect(() => {
    const loadPlans = async () => {
      try {
        const result = await subscriptionService.getPlans();
        setPlans(result);
      } catch {
        setPlans([]);
      }
    };
    loadPlans();
  }, []);

  return (
    <DashboardLayout>
      <motion.div
        variants={CONTAINER_VARIANTS}
        initial="hidden"
        animate="visible"
        className="space-y-6"
      >
        {/* Page Title */}
        <motion.div variants={ITEM_VARIANTS} className="flex items-center gap-3">
          <button
            onClick={() => navigate(ROUTES.DASHBOARD)}
            className="p-1.5 rounded-lg text-text-secondary hover:bg-dark-elevated hover:text-text-primary transition-colors"
          >
            <ArrowLeft size={20} />
          </button>
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-text-primary">Profile</h1>
        </motion.div>

        {/* Profile Header */}
        <motion.div variants={ITEM_VARIANTS}>
          <ProfileHeader />
        </motion.div>

        {/* Subscription Status */}
        <motion.div variants={ITEM_VARIANTS}>
          <SubscriptionStatus plans={plans} />
        </motion.div>

        {/* Connected Accounts */}
        <motion.div variants={ITEM_VARIANTS}>
          <ConnectedAccountsCard />
        </motion.div>
      </motion.div>
    </DashboardLayout>
  );
}
