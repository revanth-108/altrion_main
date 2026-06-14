export interface BudgetIncomeSource {
  id: string;
  label: string;
  amount: number;
}

export interface BudgetBankAccount {
  id: string;
  label: string;
  balance: number;
  icon: string;
}

export interface BudgetOutflowItem {
  id: string;
  label: string;
  due: number;
}

export interface BudgetOutflowCategory {
  group: string;
  color: string;
  items: BudgetOutflowItem[];
}

export interface BudgetAllocation {
  id: string;
  fromId: string;
  toId: string;
  type: 'income-bank' | 'bank-outflow' | 'bank-bank';
  amount: number;
  date?: string;
  note?: string;
}

export interface BudgetData {
  incomeSources: BudgetIncomeSource[];
  bankAccounts: BudgetBankAccount[];
  outflowCategories: BudgetOutflowCategory[];
  allocations: BudgetAllocation[];
}
