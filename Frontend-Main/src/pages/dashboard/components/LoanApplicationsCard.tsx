import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { FileText, ChevronRight, Calendar, AlertCircle } from 'lucide-react';
import { Card } from '../../../components/ui';
import { useLoanStore, type LoanApplication } from '../../../store/loanStore';
import { formatCurrency, formatDate } from '../../../utils';
import { getLoanDetailRoute } from '../../../constants';

const STATUS_STYLES = {
  pending: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  approved: 'bg-green-500/20 text-green-400 border-green-500/30',
  rejected: 'bg-red-500/20 text-red-400 border-red-500/30',
  active: 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30',
  completed: 'bg-gray-500/20 text-gray-400 border-gray-500/30',
} as const;

const STATUS_LABELS = {
  pending: 'Pending',
  approved: 'Approved',
  rejected: 'Rejected',
  active: 'Active',
  completed: 'Completed',
} as const;

function StatusBadge({ status }: { status: LoanApplication['status'] }) {
  return (
    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold border ${STATUS_STYLES[status]}`}>
      {STATUS_LABELS[status]}
    </span>
  );
}

export function LoanApplicationsCard() {
  const navigate = useNavigate();
  const { applications } = useLoanStore();

  const handleViewDetails = (loanId: string) => {
    navigate(getLoanDetailRoute(loanId));
  };

  return (
    <Card variant="bordered" padding="none">
      <div className="p-5 border-b border-dark-border">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-altrion-500/20 flex items-center justify-center">
            <FileText size={20} className="text-altrion-400" />
          </div>
          <h3 className="font-display text-xl font-semibold text-text-primary">Loan Applications</h3>
        </div>
      </div>

      {applications.length === 0 ? (
        <div className="p-8 text-center">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-dark-elevated flex items-center justify-center">
            <FileText size={24} className="text-text-muted" />
          </div>
          <h4 className="text-text-primary font-medium mb-1">No loan applications yet</h4>
          <p className="text-text-muted text-sm">
            Your loan applications will appear here once you apply.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="text-left text-text-muted text-sm border-b border-dark-border">
                <th className="font-display px-5 py-3 font-medium">Application ID</th>
                <th className="font-display px-5 py-3 font-medium">Loan Amount</th>
                <th className="font-display px-5 py-3 font-medium">Status</th>
                <th className="font-display px-5 py-3 font-medium">Date</th>
                <th className="px-3 py-3 w-10"></th>
              </tr>
            </thead>
            <tbody>
              {applications.map((loan, index) => (
                <motion.tr
                  key={loan.id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: index * 0.05 }}
                  className="border-b border-dark-border/50 hover:bg-dark-elevated/50 transition-colors cursor-pointer group"
                  onClick={() => handleViewDetails(loan.id)}
                >
                  <td className="px-5 py-4">
                    <span className="font-mono text-text-primary font-medium">{loan.id}</span>
                  </td>
                  <td className="px-5 py-4">
                    <span className="text-altrion-400 font-semibold">{formatCurrency(loan.loanAmount)}</span>
                  </td>
                  <td className="px-5 py-4">
                    <StatusBadge status={loan.status} />
                  </td>
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-1.5 text-text-secondary text-sm">
                      <Calendar size={14} />
                      <span>{formatDate(new Date(loan.submittedAt))}</span>
                    </div>
                  </td>
                  <td className="pl-0 pr-5 py-4">
                    <ChevronRight
                      size={20}
                      className="text-text-muted opacity-0 group-hover:opacity-100 transition-opacity"
                    />
                  </td>
                </motion.tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Info notice for pending applications */}
      {applications.some(app => app.status === 'pending') && (
        <div className="p-4 border-t border-dark-border bg-amber-500/5">
          <div className="flex items-start gap-2">
            <AlertCircle size={16} className="text-amber-400 mt-0.5 flex-shrink-0" />
            <p className="text-xs text-text-secondary">
              Pending applications are typically reviewed within 24-48 hours.
              Click on an application to view details or cancel.
            </p>
          </div>
        </div>
      )}
    </Card>
  );
}
