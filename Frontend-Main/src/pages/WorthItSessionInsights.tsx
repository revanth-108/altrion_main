import { useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ROUTES } from '@/constants';
import { useSessionInsights, useWorthItLast30DaysInsights } from '@/hooks/queries/useWorthIt';
import { SessionInsights } from '@/components/worthit/SessionInsights';
import { Last30DaysInsightsPanel } from '@/components/worthit/Last30DaysInsightsPanel';
import { DashboardLayout } from '@/components/layout';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';

export function WorthItSessionInsights() {
  const navigate = useNavigate();
  const { sessionId } = useParams<{ sessionId: string }>();
  const { data: insights, isLoading, isError } = useSessionInsights(sessionId);
  const { data: rollingInsights, isLoading: isRollingInsightsLoading } = useWorthItLast30DaysInsights();

  useEffect(() => {
    if (!sessionId) {
      navigate(ROUTES.WORTH_IT_HISTORY, { replace: true });
    }
  }, [sessionId, navigate]);

  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="flex min-h-[calc(100vh-8rem)] items-center justify-center">
          <Card variant="bordered" padding="lg" className="max-w-md text-center">
            <p className="text-sm text-text-muted">Loading insights...</p>
          </Card>
        </div>
      </DashboardLayout>
    );
  }

  if (isError || !insights) {
    return (
      <DashboardLayout>
        <div className="flex min-h-[calc(100vh-8rem)] items-center justify-center">
          <Card variant="bordered" padding="lg" className="max-w-md text-center">
            <h2 className="font-display text-xl font-bold text-text-primary">Could not load insights</h2>
            <p className="mt-2 text-sm text-text-muted">Try opening another completed session or return to history.</p>
            <div className="mt-6 flex gap-3">
              <Button onClick={() => navigate(ROUTES.WORTH_IT_HISTORY)} variant="primary" fullWidth>
                Back to History
              </Button>
              <Button onClick={() => navigate(ROUTES.WORTH_IT)} variant="ghost" fullWidth>
                Review Transactions
              </Button>
            </div>
          </Card>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-8">
        <SessionInsights
          insights={insights}
          title="Session details"
          subtitle="A closer look at what felt worth it, what did not, and what the transactions showed."
          backRoute={ROUTES.WORTH_IT_HISTORY}
          backLabel="Back to History"
          primaryCtaRoute={ROUTES.WORTH_IT}
          primaryCtaLabel="Review More"
          secondaryCtaRoute={ROUTES.DASHBOARD}
          secondaryCtaLabel="Dashboard"
        />
        <div className="px-4 pb-8 lg:px-8">
          <Last30DaysInsightsPanel insights={rollingInsights} isLoading={isRollingInsightsLoading} />
        </div>
      </div>
    </DashboardLayout>
  );
}
