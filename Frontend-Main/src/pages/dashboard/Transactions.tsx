import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, Search, Filter, X } from 'lucide-react';
import { DashboardLayout } from '@/components/layout';
import { Card, Button, TableRowSkeleton, DateRangeFilter } from '@/components/ui';
import { TransactionSyncControls } from '@/components/plaid/TransactionSyncControls';
import type { DateRange } from '@/components/ui';
import { CONTAINER_VARIANTS, ITEM_VARIANTS } from '@/constants';
import { usePlaidTransactionSyncStatus, usePlaidTransactions, useSyncPlaidTransactionUpdates } from '@/hooks/queries/usePlaid';
import { formatCurrency } from '@/utils';
import type { PlaidTransactionsResponse } from '@/types';

const CATEGORY_COLORS: Record<string, string> = {
  FOOD_AND_DRINK:     'bg-orange-500/20 text-orange-300',
  TRANSPORTATION:     'bg-blue-500/20 text-blue-300',
  TRAVEL:             'bg-purple-500/20 text-purple-300',
  INCOME:             'bg-green-500/20 text-green-300',
  ENTERTAINMENT:      'bg-pink-500/20 text-pink-300',
  PERSONAL_CARE:      'bg-teal-500/20 text-teal-300',
  GENERAL_MERCHANDISE:'bg-yellow-500/20 text-yellow-300',
  TRANSFER_IN:        'bg-green-500/20 text-green-300',
  TRANSFER_OUT:       'bg-red-500/20 text-red-300',
  RENT_AND_UTILITIES: 'bg-cyan-500/20 text-cyan-300',
  LOAN_PAYMENTS:      'bg-indigo-500/20 text-indigo-300',
  MEDICAL:            'bg-rose-500/20 text-rose-300',
  HOME_IMPROVEMENT:   'bg-amber-500/20 text-amber-300',
};

const PRESET_CATEGORIES = [
  'FOOD_AND_DRINK',
  'TRANSPORTATION',
  'TRAVEL',
  'INCOME',
  'ENTERTAINMENT',
  'PERSONAL_CARE',
  'GENERAL_MERCHANDISE',
  'TRANSFER_OUT',
  'RENT_AND_UTILITIES',
  'LOAN_PAYMENTS',
  'MEDICAL',
  'HOME_IMPROVEMENT',
];

function getCategoryColor(category: string): string {
  return CATEGORY_COLORS[category] || 'bg-dark-elevated text-text-secondary';
}

function formatCategory(category: string): string {
  return category
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, c => c.toUpperCase());
}

interface ManualTransaction {
  id: string;
  date: string;
  merchant_name: string;
  name: string;
  payment_type: 'Cash' | 'Other';
  category_primary: string;
  amount: number;
  isManual: true;
}

interface AddTransactionForm {
  date: string;
  merchant: string;
  paymentType: 'Cash' | 'Other';
  category: string;
  amount: string;
}

const EMPTY_FORM: AddTransactionForm = {
  date: new Date().toISOString().split('T')[0],
  merchant: '',
  paymentType: 'Cash',
  category: 'FOOD_AND_DRINK',
  amount: '',
};

function AddTransactionModal({
  onClose,
  onAdd,
}: {
  onClose: () => void;
  onAdd: (txn: ManualTransaction) => void;
}) {
  const [form, setForm] = useState<AddTransactionForm>(EMPTY_FORM);
  const [error, setError] = useState('');

  const handleSubmit = (e: React.BaseSyntheticEvent) => {
    e.preventDefault();
    if (!form.merchant.trim()) { setError('Merchant is required.'); return; }
    if (!form.amount || isNaN(parseFloat(form.amount)) || parseFloat(form.amount) <= 0) {
      setError('Enter a valid positive amount.');
      return;
    }

    onAdd({
      id: `manual-${Date.now()}`,
      date: form.date,
      merchant_name: form.merchant.trim(),
      name: form.merchant.trim(),
      payment_type: form.paymentType,
      category_primary: form.category,
      amount: parseFloat(parseFloat(form.amount).toFixed(2)),
      isManual: true,
    });
    onClose();
  };

  const inputClass =
    'w-full px-3 py-2 bg-dark-elevated border border-dark-border rounded-lg text-text-primary text-sm placeholder:text-text-muted focus:outline-none focus:border-altrion-500/50 transition-colors';
  const labelClass = 'block text-xs text-text-muted font-medium mb-1.5 uppercase tracking-wider';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 12 }}
        transition={{ duration: 0.18 }}
        className="relative w-full max-w-md bg-dark-card border border-dark-border rounded-2xl shadow-2xl"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-dark-border">
          <h2 className="font-display text-lg font-bold text-text-primary">Add Transaction</h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-text-muted hover:text-text-primary hover:bg-dark-elevated transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          {/* Date */}
          <div>
            <label className={labelClass}>Date</label>
            <input
              type="date"
              value={form.date}
              max={new Date().toISOString().split('T')[0]}
              onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
              className={inputClass}
              style={{ colorScheme: 'dark' }}
              required
            />
          </div>

          {/* Merchant */}
          <div>
            <label className={labelClass}>Merchant</label>
            <input
              type="text"
              placeholder="e.g. Starbucks"
              value={form.merchant}
              onChange={e => setForm(f => ({ ...f, merchant: e.target.value }))}
              className={inputClass}
              required
            />
          </div>

          {/* Payment Type */}
          <div>
            <label className={labelClass}>Payment Type</label>
            <div className="flex gap-2">
              {(['Cash', 'Other'] as const).map(type => (
                <button
                  key={type}
                  type="button"
                  onClick={() => setForm(f => ({ ...f, paymentType: type }))}
                  className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-all ${
                    form.paymentType === type
                      ? 'bg-altrion-500/20 border-altrion-500/60 text-altrion-400'
                      : 'bg-dark-elevated border-dark-border text-text-muted hover:border-dark-border/80'
                  }`}
                >
                  {type}
                </button>
              ))}
            </div>
          </div>

          {/* Category */}
          <div>
            <label className={labelClass}>Category</label>
            <select
              value={form.category}
              onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
              className={inputClass}
              style={{ colorScheme: 'dark' }}
            >
              {PRESET_CATEGORIES.map(cat => (
                <option key={cat} value={cat}>{formatCategory(cat)}</option>
              ))}
            </select>
          </div>

          {/* Amount */}
          <div>
            <label className={labelClass}>Amount ($)</label>
            <input
              type="number"
              placeholder="0.00"
              min="0.01"
              step="0.01"
              value={form.amount}
              onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
              className={inputClass}
              required
            />
          </div>

          {error && (
            <p className="text-xs text-red-400 -mt-1">{error}</p>
          )}

          {/* Actions */}
          <div className="flex gap-3 pt-1">
            <Button type="button" variant="ghost" className="flex-1" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" className="flex-1">
              Add Transaction
            </Button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}

export function Transactions() {
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [showModal, setShowModal] = useState(false);
  const [manualTransactions, setManualTransactions] = useState<ManualTransaction[]>([]);
  const [dateRange, setDateRange] = useState<DateRange>({ startDate: null, endDate: null });
  const { data: syncStatus } = usePlaidTransactionSyncStatus();
  const syncTransactions = useSyncPlaidTransactionUpdates();

  const handleFilterChange = (range: DateRange) => setDateRange(range);

  const { data, isLoading } = usePlaidTransactions(
    dateRange.startDate || dateRange.endDate
      ? { start_date: dateRange.startDate ?? undefined, end_date: dateRange.endDate ?? undefined }
      : undefined,
  );

  const resData = data as PlaidTransactionsResponse | undefined;
  const apiTransactions = resData?.transactions || [];
  const total = resData?.total_transactions || 0;

  const allTransactions = [...manualTransactions, ...apiTransactions];

  const categories = ['all', ...Array.from(new Set(
    allTransactions.map((t: any) => t.category_primary).filter(Boolean)
  ))];

  const filtered = allTransactions.filter((t: any) => {
    const matchesSearch = !search ||
      t.name?.toLowerCase().includes(search.toLowerCase()) ||
      t.merchant_name?.toLowerCase().includes(search.toLowerCase());
    const matchesCategory = categoryFilter === 'all' || t.category_primary === categoryFilter;
    return matchesSearch && matchesCategory;
  });

  const handleAdd = (txn: ManualTransaction) => {
    setManualTransactions(prev => [txn, ...prev]);
  };

  return (
    <DashboardLayout>
      <motion.div
        variants={CONTAINER_VARIANTS}
        initial="hidden"
        animate="visible"
        className="space-y-6"
      >
        {/* Header */}
        <motion.div variants={ITEM_VARIANTS} className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="font-display text-2xl sm:text-4xl font-black leading-tight">
              <span className="text-text-primary">Transactions</span>
            </h1>
            <p className="text-text-secondary text-sm mt-1">Last 30 days</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <TransactionSyncControls
              hasTransactionUpdates={syncStatus?.status === 'updates_available' || Boolean(syncStatus?.hasTransactionUpdates)}
              showBalanceRefresh={false}
              onSyncTransactions={() => syncTransactions.mutate()}
              syncTransactionsLoading={syncTransactions.isPending}
            />
            <Button
              variant="primary"
              size="sm"
              onClick={() => setShowModal(true)}
            >
              <Plus size={16} />
              <span className="hidden sm:inline">Add Transaction</span>
            </Button>
          </div>
        </motion.div>

        {/* Filters */}
        <motion.div variants={ITEM_VARIANTS} className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
            <input
              type="text"
              placeholder="Search transactions..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-dark-elevated border border-dark-border rounded-lg text-text-primary text-sm placeholder:text-text-muted focus:outline-none focus:border-altrion-500/50"
            />
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-2 overflow-x-auto pb-1">
              <Filter size={14} className="text-text-muted flex-shrink-0" />
              {categories.slice(0, 6).map(cat => (
                <button
                  key={cat}
                  onClick={() => setCategoryFilter(cat)}
                  className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                    categoryFilter === cat
                      ? 'bg-altrion-500 text-white'
                      : 'bg-dark-elevated text-text-secondary border border-dark-border hover:border-altrion-500/30'
                  }`}
                >
                  {cat === 'all' ? 'All' : formatCategory(cat)}
                </button>
              ))}
            </div>
            <DateRangeFilter onChange={handleFilterChange} />
          </div>
        </motion.div>

        {/* Transactions Table */}
        <motion.div variants={ITEM_VARIANTS}>
          <Card variant="bordered" className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-dark-border">
                    <th className="text-left px-4 py-3 text-text-muted text-xs uppercase tracking-wider">Date</th>
                    <th className="text-left px-4 py-3 text-text-muted text-xs uppercase tracking-wider">Merchant</th>
                    <th className="text-left px-4 py-3 text-text-muted text-xs uppercase tracking-wider hidden sm:table-cell">Payment From</th>
                    <th className="text-left px-4 py-3 text-text-muted text-xs uppercase tracking-wider hidden sm:table-cell">Category</th>
                    <th className="text-right px-4 py-3 text-text-muted text-xs uppercase tracking-wider">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {isLoading ? (
                    Array.from({ length: 8 }).map((_, i) => (
                      <tr key={i} className="border-b border-dark-border/50">
                        <td colSpan={5} className="px-4 py-3">
                          <TableRowSkeleton />
                        </td>
                      </tr>
                    ))
                  ) : filtered.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-12 text-center text-text-muted text-sm">
                        {search || categoryFilter !== 'all'
                          ? 'No transactions match your filters.'
                          : 'No transactions found. Add one above.'}
                      </td>
                    </tr>
                  ) : (
                    filtered.map((txn: any, i: number) => (
                      <tr
                        key={txn.transaction_id || txn.id || i}
                        className="border-b border-dark-border/50 hover:bg-dark-elevated/50 transition-colors"
                      >
                        <td className="px-4 py-3 text-text-secondary text-sm whitespace-nowrap">
                          {txn.date}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            {txn.isManual && (
                              <span className="shrink-0 w-1.5 h-1.5 rounded-full bg-altrion-400" title="Manually added" />
                            )}
                            <div>
                              <div className="font-medium text-text-primary text-sm">
                                {txn.merchant_name || txn.name}
                              </div>
                              {txn.merchant_name && txn.name !== txn.merchant_name && (
                                <div className="text-text-muted text-xs mt-0.5">{txn.name}</div>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 hidden sm:table-cell text-sm text-text-secondary capitalize">
                          {txn.payment_type ?? txn.payment_channel ?? '—'}
                        </td>
                        <td className="px-4 py-3 hidden sm:table-cell">
                          {txn.category_primary && (
                            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${getCategoryColor(txn.category_primary)}`}>
                              {formatCategory(txn.category_primary)}
                            </span>
                          )}
                        </td>
                        <td className={`px-4 py-3 text-right font-semibold text-sm whitespace-nowrap ${
                          txn.amount < 0 ? 'text-green-400' : 'text-text-primary'
                        }`}>
                          {txn.amount < 0 ? '+' : ''}{formatCurrency(Math.abs(txn.amount))}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            {!isLoading && filtered.length > 0 && (
              <div className="px-4 py-3 border-t border-dark-border text-text-muted text-xs">
                Showing {filtered.length} of {total + manualTransactions.length} transactions
              </div>
            )}
          </Card>
        </motion.div>
      </motion.div>

      {/* Add Transaction Modal */}
      <AnimatePresence>
        {showModal && (
          <AddTransactionModal
            onClose={() => setShowModal(false)}
            onAdd={handleAdd}
          />
        )}
      </AnimatePresence>
    </DashboardLayout>
  );
}
