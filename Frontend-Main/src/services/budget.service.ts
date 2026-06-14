import { api } from './api';
import type { BudgetData, BudgetAllocation } from '@/types';

// ── Backend raw types ────────────────────────────────────────────────────────

interface RawIncomeSource {
  id: string;
  label: string;
  amount: string;
  frequency?: string;
  stream_id?: string;
}

interface RawBankAccount {
  id: string;
  label: string;
  institution?: string;
  balance: string;
  subtype?: string;
}

interface RawOutflowItem {
  id: string;
  label: string;
  due: string;
  frequency?: string;
  stream_id?: string;
}

interface RawAllocation {
  id: number;
  source_id: string;
  target_id: string;
  allocation_type: BudgetAllocation['type'];
  amount: string;
  note?: string;
  due_date?: string;
}

interface RawBudgetResponse {
  income_sources: RawIncomeSource[];
  bank_accounts: RawBankAccount[];
  outflow_categories: RawOutflowItem[];
  allocations: RawAllocation[];
}

// ── Icon map ─────────────────────────────────────────────────────────────────

const BANK_ICON_MAP: Record<string, string> = {
  'checking':       '🏦',
  'savings':        '💰',
  'money market':   '📈',
  'cd':             '🏛',
  'hsa':            '🏥',
  'cash management':'💵',
};

const bankIcon = (subtype?: string): string =>
  (subtype && BANK_ICON_MAP[subtype.toLowerCase()]) || '🏦';

// ── Transform ────────────────────────────────────────────────────────────────
//
// Maps the backend snake_case response to the shape expected by BudgetData.
// This lives in the service layer so that Budget.tsx and the hook remain
// decoupled from the API contract — only this file needs updating if the
// backend shape changes.

function transformBudgetResponse(raw: RawBudgetResponse): BudgetData {
  const incomeSources = raw.income_sources.map((s) => ({
    id: s.id,
    label: s.label,
    amount: parseFloat(s.amount) || 0,
  }));

  const bankAccounts = raw.bank_accounts.map((b) => ({
    id: b.id,
    label: b.label,
    balance: parseFloat(b.balance) || 0,
    icon: bankIcon(b.subtype),
  }));

  // The backend currently returns a flat outflow list with no category info.
  // Group everything under a single "Recurring Expenses" bucket for now.
  // TODO: expand into per-category grouping once Plaid transaction categories
  //       are available from the backend.
  const outflowCategories = [
    {
      group: 'Recurring Expenses',
      color: '#FF6B6B',
      items: raw.outflow_categories.map((o) => ({
        id: o.id,
        label: o.label,
        due: parseFloat(o.due) || 0,
      })),
    },
  ];

  const allocations: BudgetAllocation[] = raw.allocations.map((a) => ({
    id: String(a.id),
    fromId: a.source_id,
    toId: a.target_id,
    type: a.allocation_type,
    amount: parseFloat(a.amount) || 0,
    ...(a.note     ? { note: a.note }         : {}),
    ...(a.due_date ? { date: a.due_date }      : {}),
  }));

  return { incomeSources, bankAccounts, outflowCategories, allocations };
}

// ── AllocationCreateSchema (matches backend) ──────────────────────────────────

interface AllocationPayload {
  source_id: string;
  target_id: string;
  allocation_type: BudgetAllocation['type'];
  amount: number;
  note?: string;
  due_date?: string;
}

// ── Service ───────────────────────────────────────────────────────────────────

export const budgetService = {
  getBudgetData: async (): Promise<BudgetData> => {
    const response = await api.get<RawBudgetResponse>('/budget');
    return transformBudgetResponse(response.data);
  },

  deleteAllocation: async (allocationId: number): Promise<{ success: boolean }> => {
    const response = await api.delete<{ success: boolean }>(`/budget/allocations/${allocationId}`);
    return response.data;
  },

  saveAllocation: async (allocation: BudgetAllocation): Promise<{ success: boolean }> => {
    const payload: AllocationPayload = {
      source_id:       allocation.fromId,
      target_id:       allocation.toId,
      allocation_type: allocation.type,
      amount:          allocation.amount,
      ...(allocation.note ? { note: allocation.note }           : {}),
      ...(allocation.date ? { due_date: allocation.date }       : {}),
    };
    const response = await api.post<{ success: boolean }>('/budget/allocations', payload);
    return response.data;
  },
};

