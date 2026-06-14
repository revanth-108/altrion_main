import type { CashFlowCategory, CashFlowTransaction, SankeyLayoutNode, SankeyIncomeSourceNode } from '@/types/cashflow.types';

// Category metadata — id, name, color only. Amounts are always computed from transactions.
export const CASHFLOW_CATEGORIES: CashFlowCategory[] = [
  { id: 'housing',   name: 'Housing',          amount: 0, color: '#B5956A', sub: [] },
  { id: 'financial', name: 'Financial',         amount: 0, color: '#8B7AA0', sub: [] },
  { id: 'bills',     name: 'Bills & Utilities', amount: 0, color: '#5E8BA0', sub: [] },
  { id: 'savings',   name: 'Savings',           amount: 0, color: '#5E9175', sub: [] },
  { id: 'other',     name: 'Other',             amount: 0, color: '#9E9690', sub: [] },
  { id: 'food',      name: 'Food & Dining',     amount: 0, color: '#A07060', sub: [] },
];

export const CASHFLOW_ACCOUNTS = ['Chase Checking', 'Chase Savings', 'Amex Card'] as const;
export type CashFlowAccount = typeof CASHFLOW_ACCOUNTS[number];

export const CASHFLOW_TRANSACTIONS: CashFlowTransaction[] = [
  { date: 'Jan 1',  month: 1, year: 2026, desc: 'Paycheck',                    cat: 'Income',           catId: 'income',    amount:  4200.00, pfcP: 'INCOME',             pfcD: 'INCOME_SALARY',                                  account: 'Chase Checking' },
  { date: 'Jan 8',  month: 1, year: 2026, desc: 'Freelance Project',           cat: 'Income',           catId: 'income',    amount:   650.00, pfcP: 'INCOME',             pfcD: 'INCOME_FREELANCE',                               account: 'Chase Checking' },
  { date: 'Jan 14', month: 1, year: 2026, desc: 'Dividends',                   cat: 'Income',           catId: 'income',    amount:   180.00, pfcP: 'INCOME',             pfcD: 'INCOME_DIVIDENDS',                               account: 'Chase Savings' },
  { date: 'Jan 21', month: 1, year: 2026, desc: 'Tax Refund',                  cat: 'Income',           catId: 'income',    amount:   850.00, pfcP: 'INCOME',             pfcD: 'INCOME_TAX_REFUND',                              account: 'Chase Checking' },
  { date: 'Jan 1',  month: 1, year: 2026, desc: 'Monthly Mortgage',            cat: 'Mortgage',          catId: 'housing',   amount: -1385.00, pfcP: 'LOAN_PAYMENTS',      pfcD: 'LOAN_PAYMENTS_MORTGAGE_PAYMENT',                 account: 'Chase Checking' },
  { date: 'Jan 12', month: 1, year: 2026, desc: 'Paint & Brushes',             cat: 'Home Improvement',  catId: 'housing',   amount:   -54.30, pfcP: 'HOME_IMPROVEMENT',   pfcD: 'HOME_IMPROVEMENT_HARDWARE',                      account: 'Amex Card' },
  { date: 'Jan 14', month: 1, year: 2026, desc: 'Bathroom Caulk & Grout',      cat: 'Home Improvement',  catId: 'housing',   amount:   -28.90, pfcP: 'HOME_IMPROVEMENT',   pfcD: 'HOME_IMPROVEMENT_REPAIR_AND_MAINTENANCE',        account: 'Amex Card' },
  { date: 'Jan 17', month: 1, year: 2026, desc: 'Light Bulbs & Switch Plates', cat: 'Home Improvement',  catId: 'housing',   amount:   -31.75, pfcP: 'HOME_IMPROVEMENT',   pfcD: 'HOME_IMPROVEMENT_HARDWARE',                      account: 'Amex Card' },
  { date: 'Jan 22', month: 1, year: 2026, desc: 'New Curtains',                cat: 'Home Improvement',  catId: 'housing',   amount:   -93.05, pfcP: 'HOME_IMPROVEMENT',   pfcD: 'HOME_IMPROVEMENT_FURNITURE',                     account: 'Amex Card' },
  { date: 'Jan 2',  month: 1, year: 2026, desc: 'Student Loan Payment',        cat: 'Loan Repayment',    catId: 'financial', amount:  -500.23, pfcP: 'LOAN_PAYMENTS',      pfcD: 'LOAN_PAYMENTS_STUDENT_LOAN_PAYMENT',             account: 'Chase Checking' },
  { date: 'Jan 3',  month: 1, year: 2026, desc: 'Car Insurance',               cat: 'Insurance',         catId: 'financial', amount:  -112.45, pfcP: 'GENERAL_SERVICES',   pfcD: 'GENERAL_SERVICES_INSURANCE',                     account: 'Chase Checking' },
  { date: 'Jan 3',  month: 1, year: 2026, desc: 'Home Insurance',              cat: 'Insurance',         catId: 'financial', amount:   -89.00, pfcP: 'GENERAL_SERVICES',   pfcD: 'GENERAL_SERVICES_INSURANCE',                     account: 'Chase Checking' },
  { date: 'Jan 18', month: 1, year: 2026, desc: 'ATM Withdrawal',              cat: 'Cash & ATM',        catId: 'financial', amount:   -40.00, pfcP: 'BANK_FEES',          pfcD: 'BANK_FEES_ATM_FEES',                             account: 'Chase Checking' },
  { date: 'Jan 5',  month: 1, year: 2026, desc: 'Trash & Recycling Pickup',    cat: 'Garbage',           catId: 'bills',     amount:  -320.47, pfcP: 'RENT_AND_UTILITIES', pfcD: 'RENT_AND_UTILITIES_SEWAGE_AND_WASTE_MANAGEMENT', account: 'Chase Checking' },
  { date: 'Jan 7',  month: 1, year: 2026, desc: 'Electricity Bill',            cat: 'Other Utilities',   catId: 'bills',     amount:  -145.00, pfcP: 'RENT_AND_UTILITIES', pfcD: 'RENT_AND_UTILITIES_GAS_AND_ELECTRICITY',         account: 'Chase Checking' },
  { date: 'Jan 7',  month: 1, year: 2026, desc: 'Internet & Cable',            cat: 'Other Utilities',   catId: 'bills',     amount:   -89.99, pfcP: 'RENT_AND_UTILITIES', pfcD: 'RENT_AND_UTILITIES_INTERNET_AND_CABLE',          account: 'Amex Card' },
  { date: 'Jan 7',  month: 1, year: 2026, desc: 'Water & Sewage',              cat: 'Other Utilities',   catId: 'bills',     amount:   -63.00, pfcP: 'RENT_AND_UTILITIES', pfcD: 'RENT_AND_UTILITIES_WATER',                       account: 'Chase Checking' },
  { date: 'Jan 7',  month: 1, year: 2026, desc: 'Mobile Phone Plan',           cat: 'Other Utilities',   catId: 'bills',     amount:   -65.01, pfcP: 'RENT_AND_UTILITIES', pfcD: 'RENT_AND_UTILITIES_TELEPHONE',                   account: 'Amex Card' },
  { date: 'Jan 2',  month: 1, year: 2026, desc: 'Monthly Savings Transfer',    cat: 'Savings',           catId: 'savings',   amount:  -480.54, pfcP: 'TRANSFER_OUT',       pfcD: 'TRANSFER_OUT_SAVINGS',                           account: 'Chase Savings' },
  { date: 'Jan 3',  month: 1, year: 2026, desc: 'Weekly Grocery Run',          cat: 'Food & Dining',     catId: 'food',      amount:   -94.20, pfcP: 'FOOD_AND_DRINK',     pfcD: 'FOOD_AND_DRINK_GROCERIES',                       account: 'Amex Card' },
  { date: 'Jan 10', month: 1, year: 2026, desc: 'Weekly Grocery Run',          cat: 'Food & Dining',     catId: 'food',      amount:   -78.35, pfcP: 'FOOD_AND_DRINK',     pfcD: 'FOOD_AND_DRINK_GROCERIES',                       account: 'Amex Card' },
  { date: 'Jan 13', month: 1, year: 2026, desc: 'Family Dinner Out',           cat: 'Food & Dining',     catId: 'food',      amount:   -42.80, pfcP: 'FOOD_AND_DRINK',     pfcD: 'FOOD_AND_DRINK_RESTAURANT',                      account: 'Amex Card' },
  { date: 'Jan 17', month: 1, year: 2026, desc: 'Weekend Grocery Run',         cat: 'Food & Dining',     catId: 'food',      amount:   -67.50, pfcP: 'FOOD_AND_DRINK',     pfcD: 'FOOD_AND_DRINK_GROCERIES',                       account: 'Amex Card' },
  { date: 'Jan 24', month: 1, year: 2026, desc: 'Weekly Grocery Run',          cat: 'Food & Dining',     catId: 'food',      amount:   -49.50, pfcP: 'FOOD_AND_DRINK',     pfcD: 'FOOD_AND_DRINK_GROCERIES',                       account: 'Amex Card' },
  { date: 'Jan 4',  month: 1, year: 2026, desc: 'Streaming Services',          cat: 'Other',             catId: 'other',     amount:   -25.48, pfcP: 'ENTERTAINMENT',      pfcD: 'ENTERTAINMENT_TV_AND_MOVIES',                    account: 'Amex Card' },
  { date: 'Jan 6',  month: 1, year: 2026, desc: "Kids' School Supplies",       cat: 'Other',             catId: 'other',     amount:   -38.90, pfcP: 'GENERAL_MERCHANDISE', pfcD: 'GENERAL_MERCHANDISE_OFFICE_SUPPLIES',           account: 'Chase Checking' },
  { date: 'Jan 9',  month: 1, year: 2026, desc: 'Household Cleaning Supplies', cat: 'Other',             catId: 'other',     amount:   -24.65, pfcP: 'GENERAL_MERCHANDISE', pfcD: 'GENERAL_MERCHANDISE_DISCOUNT_STORES',           account: 'Amex Card' },
  { date: 'Jan 11', month: 1, year: 2026, desc: 'Pet Food & Supplies',         cat: 'Other',             catId: 'other',     amount:   -56.40, pfcP: 'GENERAL_MERCHANDISE', pfcD: 'GENERAL_MERCHANDISE_PET_SUPPLIES',              account: 'Amex Card' },
  { date: 'Jan 20', month: 1, year: 2026, desc: 'Clothing — Winter Clearance', cat: 'Other',             catId: 'other',     amount:   -72.80, pfcP: 'GENERAL_MERCHANDISE', pfcD: 'GENERAL_MERCHANDISE_CLOTHING_AND_ACCESSORIES',  account: 'Amex Card' },
  { date: 'Jan 27', month: 1, year: 2026, desc: 'Birthday Gift',               cat: 'Other',             catId: 'other',     amount:   -47.98, pfcP: 'GENERAL_MERCHANDISE', pfcD: 'GENERAL_MERCHANDISE_GIFTS_AND_NOVELTIES',       account: 'Amex Card' },
  { date: 'Jan 15', month: 1, year: 2026, desc: 'Over-the-Counter Medicine',   cat: 'Other',             catId: 'other',     amount:   -18.75, pfcP: 'MEDICAL',            pfcD: 'MEDICAL_PHARMACIES_AND_SUPPLEMENTS',             account: 'Amex Card' },
  { date: 'Jan 19', month: 1, year: 2026, desc: "Kids' Activity Fee",          cat: 'Other',             catId: 'other',     amount:   -60.00, pfcP: 'GENERAL_SERVICES',   pfcD: 'GENERAL_SERVICES_CHILDCARE',                     account: 'Chase Checking' },
  { date: 'Jan 23', month: 1, year: 2026, desc: 'Haircuts (Family)',           cat: 'Other',             catId: 'other',     amount:   -48.00, pfcP: 'PERSONAL_CARE',      pfcD: 'PERSONAL_CARE_HAIR_AND_BEAUTY',                  account: 'Chase Checking' },
  { date: 'Jan 29', month: 1, year: 2026, desc: 'Gas Station Fill-up',         cat: 'Other',             catId: 'other',     amount:   -76.00, pfcP: 'TRANSPORTATION',     pfcD: 'TRANSPORTATION_GAS',                             account: 'Amex Card' },
];

// Week ranges (Jan 2026 — hardcoded; mirrors the static dataset)
export const CASHFLOW_WEEKS = [
  { id: 'all', label: 'Full month', start: 1, end: 31 },
  { id: 'w1', label: 'Week 1: Jan 1–7', start: 1, end: 7 },
  { id: 'w2', label: 'Week 2: Jan 8–14', start: 8, end: 14 },
  { id: 'w3', label: 'Week 3: Jan 15–21', start: 15, end: 21 },
  { id: 'w4', label: 'Week 4: Jan 22–28', start: 22, end: 28 },
  { id: 'w5', label: 'Week 5: Jan 29–31', start: 29, end: 31 },
] as const;

// Parse "Jan N" date strings; falls back to 0 on bad input.
export function parseCashflowDay(date: string): number {
  const match = date.match(/(\d+)/);
  return match ? parseInt(match[1], 10) : 0;
}

export function getTransactionsForMonth(month: number, year: number): CashFlowTransaction[] {
  return CASHFLOW_TRANSACTIONS.filter(t => t.month === month && t.year === year);
}

// Derives category amounts and sub-breakdowns from a set of transactions.
// Category metadata (id, name, color) comes from CASHFLOW_CATEGORIES.
export function buildCategoriesFromTransactions(transactions: CashFlowTransaction[]): CashFlowCategory[] {
  return CASHFLOW_CATEGORIES
    .map(cat => {
      const catTxns = transactions.filter(t => t.catId === cat.id && t.amount < 0);
      const amount = catTxns.reduce((s, t) => s + Math.abs(t.amount), 0);

      const subMap = new Map<string, number>();
      catTxns.forEach(t => subMap.set(t.cat, (subMap.get(t.cat) ?? 0) + Math.abs(t.amount)));

      const subEntries = [...subMap.entries()];
      const sub = subEntries.length > 1
        ? subEntries.map(([name, subAmount]) => ({ name, amount: subAmount }))
        : [];

      return { ...cat, amount, sub };
    })
    .filter(cat => cat.amount > 0);
}

// Sankey layout constants
const VH = 560;
const PY = 24;
const NW = 10;
const CAT_GAP = 8;
const SRC_GAP = 6;
// 200px reserved on the left for source labels ("Freelance Project", etc.)
export const SANKEY_VW = 1440;
export const SANKEY_VH = VH;
export const SANKEY_XSRC = 200;  // Income source nodes (NEW leftmost column)
export const SANKEY_XI = 500;    // Income aggregator (single white bar)
export const SANKEY_XC = 830;    // Categories
export const SANKEY_XS = 1200;   // Subcategories
export const SANKEY_NW = NW;

const AVAIL_H = VH - PY * 2;

// Distinct colors for income sources — drawn from the green/cyan/teal family
// so they read as "income" while still being distinguishable.
const INCOME_SOURCE_PALETTE = [
  '#5E9175', // muted green
  '#5E9090', // teal
  '#7AAF9E', // sage
  '#6B9EB5', // soft blue
  '#9EB57A', // olive
  '#5E7A9E', // dusk blue
];

export function getIncomeSourceColor(index: number): string {
  return INCOME_SOURCE_PALETTE[index % INCOME_SOURCE_PALETTE.length];
}

/**
 * Group income transactions by description (e.g. "Paycheck", "Tax Refund")
 * into discrete income sources. Returns sources sorted largest first.
 */
export function buildIncomeSourcesFromTransactions(
  transactions: CashFlowTransaction[],
): { id: string; name: string; amount: number }[] {
  const map = new Map<string, number>();
  for (const t of transactions) {
    if (t.amount > 0) {
      map.set(t.desc, (map.get(t.desc) ?? 0) + t.amount);
    }
  }
  const total = [...map.values()].reduce((s, v) => s + v, 0);
  const MIN_PCT = 0.02;
  const minAmount = total * MIN_PCT;

  const all = [...map.entries()]
    .map(([name, amount]) => ({
      id: name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
      name,
      amount,
    }))
    .sort((a, b) => b.amount - a.amount);

  const big = all.filter(s => s.amount >= minAmount);
  const smallSum = all.filter(s => s.amount < minAmount).reduce((s, x) => s + x.amount, 0);
  if (smallSum > 0) {
    big.push({ id: 'other-income', name: 'Other', amount: smallSum });
  }
  return big;
}

/**
 * Layout for the new leftmost income-source column.
 * Each source has its own bar on the left (srcY) and a corresponding
 * stacked region on the income aggregator (iY) the ribbon connects to.
 */
export function buildIncomeSourcesLayout(
  sources: { id: string; name: string; amount: number }[],
  totalIncome: number,
): SankeyIncomeSourceNode[] {
  if (totalIncome <= 0 || sources.length === 0) return [];
  const scale = AVAIL_H / totalIncome;

  // Heights for the source bars (left side). Reserve a tiny gap between them.
  const totalGap = (sources.length - 1) * SRC_GAP;
  const usableH = Math.max(40, AVAIL_H - totalGap);
  const usableScale = usableH / totalIncome;

  let srcY = PY + (AVAIL_H - (sources.reduce((s, x) => s + x.amount * usableScale, 0) + totalGap)) / 2;
  let aggY = PY;

  return sources.map((s, i) => {
    const srcH = s.amount * usableScale;
    const aggH = s.amount * scale;
    const node: SankeyIncomeSourceNode = {
      id: s.id,
      name: s.name,
      amount: s.amount,
      color: getIncomeSourceColor(i),
      h: srcH,
      pct: ((s.amount / totalIncome) * 100).toFixed(1),
      srcY0: srcY,
      srcY1: srcY + srcH,
      iY0: aggY,
      iY1: aggY + aggH,
    };
    srcY += srcH + SRC_GAP;
    aggY += aggH;
    return node;
  });
}

export function buildSankeyLayout(categories: CashFlowCategory[], income: number): SankeyLayoutNode[] {
  if (income === 0 || categories.length === 0) return [];
  const aggScale = AVAIL_H / income;

  const expensesTotal = categories.reduce((s, c) => s + c.amount, 0);
  const surplus = Math.max(0, income - expensesTotal);
  const augmented: CashFlowCategory[] = surplus > 0
    ? [...categories, {
        id: 'surplus',
        name: 'Surplus',
        amount: surplus,
        color: '#4ade80',
        sub: [],
      }]
    : categories;

  const totalGap = (augmented.length - 1) * CAT_GAP;
  const catUsableH = Math.max(40, AVAIL_H - totalGap);
  const catScale = catUsableH / income;

  const cats = augmented.map(c => ({
    ...c,
    h: c.amount * aggScale,
    catH: c.amount * catScale,
    pct: (c.amount / income * 100).toFixed(1),
  }));
  const catColH = cats.reduce((s, c) => s + c.catH, 0) + totalGap;
  let catY = PY + (AVAIL_H - catColH) / 2;
  let incY = PY;

  return cats.map(cat => {
    const node: SankeyLayoutNode = {
      ...cat,
      h: cat.catH,
      iY0: incY,
      iY1: incY + cat.h,
      cY0: catY,
      cY1: catY + cat.catH,
      subs: [],
    };
    let srcY = catY;
    let subY = catY;
    node.subs = cat.sub.map((s, i) => {
      const sh = (s.amount / cat.amount) * cat.catH;
      const sub = {
        ...s,
        color: cat.color,
        h: sh,
        srcY0: srcY,
        srcY1: srcY + sh,
        sY0: subY,
        sY1: subY + sh,
      };
      srcY += sh;
      subY += sh + (i < cat.sub.length - 1 ? 3 : 0);
      return sub;
    });
    incY += cat.h;
    catY += cat.catH + CAT_GAP;
    return node;
  });
}

// ── Plaid real-data helpers ───────────────────────────────────────────────────

export const PLAID_CATEGORY_COLORS: Record<string, string> = {
  FOOD_AND_DRINK:      '#A07060',
  TRANSPORTATION:      '#5E8BA0',
  TRAVEL:              '#8B7AA0',
  INCOME:              '#5E9175',
  ENTERTAINMENT:       '#9E6080',
  PERSONAL_CARE:       '#5E9090',
  GENERAL_MERCHANDISE: '#9E9690',
  TRANSFER_IN:         '#5E9175',
  TRANSFER_OUT:        '#B5956A',
  RENT_AND_UTILITIES:  '#5E7A9E',
  LOAN_PAYMENTS:       '#7A7AAF',
  MEDICAL:             '#C07070',
  HOME_IMPROVEMENT:    '#B5A06A',
  BANK_FEES:           '#8E8E7A',
  OTHER:               '#9E9690',
};

export function formatPlaidCategoryName(name: string): string {
  return name
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, c => c.toUpperCase());
}

export function getColorForCatId(catId: string): string {
  return CASHFLOW_CAT_COLOR_MAP[catId]
    ?? PLAID_CATEGORY_COLORS[catId]
    ?? '#9E9690';
}

// Builds CashFlowCategory[] + income from raw Plaid transaction objects.
// Plaid convention: positive amount = debit (expense), negative = credit (income).
export function buildCategoriesFromPlaidTransactions(plaidTxns: any[]): {
  categories: CashFlowCategory[];
  income: number;
} {
  const income = plaidTxns
    .filter(t => t.amount < 0)
    .reduce((s, t) => s + Math.abs(t.amount), 0);

  const catMap = new Map<string, { amount: number; subMap: Map<string, number>; color: string }>();

  plaidTxns.filter(t => t.amount > 0).forEach(t => {
    const catKey: string = t.category_primary || 'OTHER';
    if (!catMap.has(catKey)) {
      catMap.set(catKey, {
        amount: 0,
        subMap: new Map(),
        color: PLAID_CATEGORY_COLORS[catKey] ?? '#9E9690',
      });
    }
    const cat = catMap.get(catKey)!;
    cat.amount += t.amount;

    const detailed: string = t.category_detailed || catKey;
    const subName = detailed.startsWith(catKey + '_')
      ? detailed.slice(catKey.length + 1)
      : detailed;
    cat.subMap.set(subName, (cat.subMap.get(subName) ?? 0) + t.amount);
  });

  const categories: CashFlowCategory[] = [...catMap.entries()]
    .map(([id, { amount, subMap, color }]) => {
      const subEntries = [...subMap.entries()];
      const sub = subEntries.length > 1
        ? subEntries.map(([name, subAmount]) => ({
            name: formatPlaidCategoryName(name),
            amount: parseFloat(subAmount.toFixed(2)),
          }))
        : [];
      return {
        id,
        name: formatPlaidCategoryName(id),
        amount: parseFloat(amount.toFixed(2)),
        color,
        sub,
      };
    })
    .sort((a, b) => b.amount - a.amount);

  return { categories, income: parseFloat(income.toFixed(2)) };
}

export function ribbon(x1: number, yT1: number, yB1: number, x2: number, yT2: number, yB2: number): string {
  const cx = (x1 + x2) / 2;
  return `M${x1} ${yT1} C${cx} ${yT1},${cx} ${yT2},${x2} ${yT2} L${x2} ${yB2} C${cx} ${yB2},${cx} ${yB1},${x1} ${yB1}Z`;
}

export function fmtCurrency(n: number): string {
  return '$' + Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export const CASHFLOW_CAT_COLOR_MAP: Record<string, string> = Object.fromEntries([
  ...CASHFLOW_CATEGORIES.map(c => [c.id, c.color]),
  ['income', '#5E9175'],
]);
