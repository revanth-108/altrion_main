import { PricingPlans } from '../components/subscription';
import { DashboardLayout } from '../components/layout';

export const Pricing: React.FC = () => {
  return (
    <DashboardLayout>
      <div className="max-w-7xl mx-auto py-6">
        <PricingPlans />
      </div>
    </DashboardLayout>
  );
};

export default Pricing;
