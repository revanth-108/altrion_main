import type { BudgetData, Portfolio, User } from '@/types';
import { normalizePlaidBalancesPayload } from '@/services/plaid.compat';

export interface PlaidBalanceAccount {
  account_id: string;
  name: string;
  type: string;
  subtype?: string | null;
  current?: number | null;
  available?: number | null;
  limit?: number | null;
  currency?: string | null;
}

export interface PlaidBalancesPayload {
  success?: boolean;
  accounts?: PlaidBalanceAccount[];
  account_count?: number;
  source?: string;
}

export interface SyncedPlanningInputs {
  currentBalance: number;
  netWorth: number;
  annualIncome: number;
  annualExpenses: number;
  annualSavings: number;
  currentAge: number | null;
  retirementAge: number | null;
  yearsToGoal: number;
  targetAmount: number;
  liquidReserves: number;
  liabilities: number;
}

export interface PlanningTargetClass {
  name: string;
  actual: number;
  target: number;
}

export interface FinancialPlanResult {
  netWorthSummary: {
    totalAssets: number;
    totalLiabilities: number;
    netWorth: number;
  };
  retirementReadiness: {
    yearsToRetirement: number;
    requiredSavings: number;
    currentTrajectoryValue: number;
    gapOrSurplus: number;
    onTrack: boolean;
  };
  annualSurplus: number;
  savingsRate: number;
  cashFlowProjection: Array<{
    year: number;
    age: number;
    income: number;
    expenses: number;
    savings: number;
    portfolioValue: number;
  }>;
  milestones: Array<{
    year: number;
    name: string;
    description: string;
    status: string;
  }>;
  savingsGap: number;
  suggestedAllocation: Record<string, number>;
  scenarioCommentary: string;
}

const SAVINGS_HINT = /(savings|save|reserve|emergency|retirement|401k|ira|invest)/i;
const LIABILITY_SUBTYPE_HINT = /(credit|loan|mortgage|student|heloc|line of credit)/i;
const DEPOSITORY_SUBTYPE_HINT = /(checking|savings|cash|money market|hsa|cd)/i;

const PLANNING_ALLOCATIONS: Array<{ maxYears: number; allocation: Record<string, number> }> = [
  {
    maxYears: 5,
    allocation: {
      'US Equity': 25,
      'Intl Equity': 10,
      'Fixed Income': 45,
      'Real Estate': 5,
      Crypto: 0,
      Cash: 15,
      Other: 0,
    },
  },
  {
    maxYears: 10,
    allocation: {
      'US Equity': 35,
      'Intl Equity': 15,
      'Fixed Income': 35,
      'Real Estate': 5,
      Crypto: 0,
      Cash: 10,
      Other: 0,
    },
  },
  {
    maxYears: 20,
    allocation: {
      'US Equity': 45,
      'Intl Equity': 20,
      'Fixed Income': 25,
      'Real Estate': 5,
      Crypto: 0,
      Cash: 5,
      Other: 0,
    },
  },
  {
    maxYears: 999,
    allocation: {
      'US Equity': 55,
      'Intl Equity': 25,
      'Fixed Income': 10,
      'Real Estate': 5,
      Crypto: 0,
      Cash: 5,
      Other: 0,
    },
  },
];

export const fmtMoney = (n: number | null | undefined) => {
  if (n === null || n === undefined || Number.isNaN(n)) return '—';
  const abs = Math.abs(n);
  if (abs >= 1_000_000_000) return `${n < 0 ? '-' : ''}$${(abs / 1_000_000_000).toFixed(2)}B`;
  if (abs >= 1_000_000) return `${n < 0 ? '-' : ''}$${(abs / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `${n < 0 ? '-' : ''}$${(abs / 1_000).toFixed(1)}k`;
  return `${n < 0 ? '-' : ''}$${abs.toFixed(0)}`;
};

export const fmtPercentValue = (n: number | null | undefined, digits = 1) =>
  n === null || n === undefined || Number.isNaN(n) ? '—' : `${n.toFixed(digits)}%`;

export const fmtRate = (n: number | null | undefined, digits = 1) =>
  n === null || n === undefined || Number.isNaN(n) ? '—' : `${(n * 100).toFixed(digits)}%`;

export const clampPercent = (n: number) => Math.max(0, Math.min(100, n));

export const calcAgeFromDob = (dateOfBirth?: string): number | null => {
  if (!dateOfBirth) return null;

  const dob = new Date(`${dateOfBirth}T00:00:00`);
  if (Number.isNaN(dob.getTime())) return null;

  const now = new Date();
  let age = now.getFullYear() - dob.getFullYear();
  const monthDiff = now.getMonth() - dob.getMonth();
  const dayDiff = now.getDate() - dob.getDate();

  if (monthDiff < 0 || (monthDiff === 0 && dayDiff < 0)) {
    age -= 1;
  }

  return age > 0 ? age : null;
};

const getBudgetOutflowItems = (budgetData?: BudgetData) =>
  budgetData?.outflowCategories.flatMap((category) => category.items) ?? [];

export const sumBudgetMonthlyIncome = (budgetData?: BudgetData): number =>
  budgetData?.incomeSources.reduce((sum, source) => sum + source.amount, 0) ?? 0;

export const sumBudgetMonthlySavings = (budgetData?: BudgetData): number => {
  if (!budgetData) return 0;

  const savingsBankIds = new Set(
    budgetData.bankAccounts
      .filter((account) => SAVINGS_HINT.test(account.id) || SAVINGS_HINT.test(account.label))
      .map((account) => account.id),
  );

  const transferSavings = budgetData.allocations
    .filter((allocation) => savingsBankIds.has(allocation.toId))
    .reduce((sum, allocation) => sum + allocation.amount, 0);

  if (transferSavings > 0) return transferSavings;

  return getBudgetOutflowItems(budgetData)
    .filter((item) => SAVINGS_HINT.test(item.id) || SAVINGS_HINT.test(item.label))
    .reduce((sum, item) => sum + item.due, 0);
};

export const sumBudgetMonthlyExpenses = (budgetData?: BudgetData): number =>
  getBudgetOutflowItems(budgetData)
    .filter((item) => !SAVINGS_HINT.test(item.id) && !SAVINGS_HINT.test(item.label))
    .reduce((sum, item) => sum + item.due, 0);

export const extractPlaidBalancesPayload = (raw: unknown): PlaidBalancesPayload | undefined => {
  // Compatibility adapter stays centralized in the service layer so the
  // dashboard only deals with one normalized payload shape.
  return normalizePlaidBalancesPayload(raw) as PlaidBalancesPayload | undefined;
};

export const getLiquidReservesFromPlaid = (payload?: PlaidBalancesPayload): number => {
  if (!payload?.accounts?.length) return 0;
  return payload.accounts
    .filter(
      (account) =>
        account.type?.toLowerCase() === 'depository' ||
        DEPOSITORY_SUBTYPE_HINT.test(account.subtype ?? ''),
    )
    .reduce((sum, account) => sum + Math.max(Number(account.current ?? 0), 0), 0);
};

export const getLiabilitiesFromPlaid = (payload?: PlaidBalancesPayload): number => {
  if (!payload?.accounts?.length) return 0;
  return payload.accounts
    .filter(
      (account) =>
        account.type?.toLowerCase() === 'loan' ||
        account.type?.toLowerCase() === 'credit' ||
        LIABILITY_SUBTYPE_HINT.test(account.subtype ?? ''),
    )
    .reduce((sum, account) => sum + Math.abs(Number(account.current ?? 0)), 0);
};

const getPortfolioCash = (portfolio?: Portfolio): number =>
  portfolio?.assets
    ?.filter((asset) => asset.type === 'cash')
    .reduce((sum, asset) => sum + asset.value, 0) ?? 0;

export const deriveSyncedPlanningInputs = (
  user: User | null,
  portfolio?: Portfolio,
  budgetData?: BudgetData,
  plaidBalances?: PlaidBalancesPayload,
): SyncedPlanningInputs => {
  const annualIncome = Math.round(sumBudgetMonthlyIncome(budgetData) * 12 || user?.annualIncome || 0);
  const annualExpenses = Math.round(sumBudgetMonthlyExpenses(budgetData) * 12 || (annualIncome > 0 ? annualIncome * 0.6 : 0));
  const annualSavingsFromBudget = Math.round(sumBudgetMonthlySavings(budgetData) * 12);
  const annualSavings = Math.max(
    annualSavingsFromBudget,
    Math.round(annualIncome > 0 ? Math.max(annualIncome - annualExpenses, 0) : 0),
  );
  const currentAge = calcAgeFromDob(user?.dateOfBirth) ?? null;
  const retirementAge =
    currentAge !== null && user?.yearsToRetirement
      ? currentAge + user.yearsToRetirement
      : user?.yearsToRetirement
        ? user.yearsToRetirement + 35
        : 65;
  const yearsToGoal = Math.max(
    1,
    retirementAge && currentAge !== null
      ? retirementAge - currentAge
      : user?.yearsToRetirement ?? 12,
  );
  const liquidReserves = Math.round(
    getLiquidReservesFromPlaid(plaidBalances) || getPortfolioCash(portfolio),
  );
  const liabilities = Math.round(getLiabilitiesFromPlaid(plaidBalances));
  const totalAssets = Math.round(portfolio?.totalValue ?? 0);
  const netWorth = Math.max(totalAssets - liabilities, 0);
  const futureExpenses = annualExpenses > 0 ? annualExpenses * ((1 + 0.03) ** yearsToGoal) : 0;
  const targetAmount = Math.round(
    futureExpenses > 0 ? futureExpenses * 25 : Math.max(netWorth * 2.2, 250000),
  );

  return {
    currentBalance: Math.max(totalAssets, netWorth),
    netWorth,
    annualIncome,
    annualExpenses,
    annualSavings,
    currentAge,
    retirementAge,
    yearsToGoal,
    targetAmount,
    liquidReserves,
    liabilities,
  };
};

export const calcFutureValue = (
  presentValue: number,
  annualRatePct: number,
  annualContribution: number,
  contributionGrowthPct: number,
  years: number,
) => {
  if (years <= 0) return presentValue;

  const rate = annualRatePct / 100;
  const contributionGrowth = contributionGrowthPct / 100;
  let balance = presentValue;
  let contribution = annualContribution;

  for (let year = 0; year < years; year += 1) {
    balance = balance * (1 + rate) + contribution;
    contribution = contribution * (1 + contributionGrowth);
  }

  return balance;
};

export const calcAfterTaxRatePct = (
  grossRatePct: number,
  taxablePortionPct: number,
  capitalGainsRatePct: number,
  incomeRatePct: number,
) => {
  const blendedRatePct = (capitalGainsRatePct + incomeRatePct) / 2;
  const annualTaxDrag = (taxablePortionPct / 100) * (blendedRatePct / 100);
  return grossRatePct * (1 - annualTaxDrag);
};

export const allocationForHorizon = (years: number): Record<string, number> => {
  const target = PLANNING_ALLOCATIONS.find((row) => years <= row.maxYears);
  return { ...(target ?? PLANNING_ALLOCATIONS[PLANNING_ALLOCATIONS.length - 1]).allocation };
};

export const deriveAllocationFromPortfolio = (portfolio?: Portfolio): Record<string, number> => {
  if (!portfolio?.assets?.length || portfolio.totalValue <= 0) {
    return allocationForHorizon(12);
  }

  const buckets: Record<string, number> = {
    'US Equity': 0,
    'Intl Equity': 0,
    'Fixed Income': 0,
    'Real Estate': 0,
    Crypto: 0,
    Cash: 0,
    Other: 0,
  };

  for (const asset of portfolio.assets) {
    if (asset.type === 'stock') {
      buckets['US Equity'] += asset.value;
    } else if (asset.type === 'crypto') {
      buckets.Crypto += asset.value;
    } else if (asset.type === 'cash') {
      buckets.Cash += asset.value;
    } else {
      buckets.Other += asset.value;
    }
  }

  return Object.fromEntries(
    Object.entries(buckets).map(([key, value]) => [
      key,
      portfolio.totalValue > 0 ? Number(((value / portfolio.totalValue) * 100).toFixed(1)) : 0,
    ]),
  );
};

export const buildPlanningTargetRows = (
  actual: Record<string, number>,
  target: Record<string, number>,
): PlanningTargetClass[] =>
  Object.keys({ ...actual, ...target }).map((name) => ({
    name,
    actual: actual[name] ?? 0,
    target: target[name] ?? 0,
  }));

export const monthsOfCoverage = (liquidReserves: number, annualExpenses: number) => {
  if (annualExpenses <= 0) return null;
  return liquidReserves / (annualExpenses / 12);
};

export const buildFinancialPlan = ({
  age,
  retirementTarget,
  income,
  expenses,
  assets,
  liabilities,
  expectedReturns,
  inflation,
}: {
  age: number;
  retirementTarget: number;
  income: number;
  expenses: number;
  assets: number;
  liabilities: number;
  expectedReturns: number;
  inflation: number;
}): FinancialPlanResult => {
  const netWorth = assets - liabilities;
  const yearsToRetirement = Math.max(retirementTarget - age, 0);
  const annualSavings = income - expenses;
  const savingsRate = income > 0 ? (annualSavings / income) * 100 : 0;

  const cashFlowProjection: FinancialPlanResult['cashFlowProjection'] = [];
  let portfolioValue = assets;
  let projectedIncome = income;
  let projectedExpenses = expenses;

  for (let year = 0; year <= yearsToRetirement; year += 1) {
    const currentAge = age + year;
    if (year > 0) {
      projectedIncome *= 1 + inflation;
      projectedExpenses *= 1 + inflation;
      const savings = projectedIncome - projectedExpenses;
      portfolioValue = portfolioValue * (1 + expectedReturns) + savings;
    }

    cashFlowProjection.push({
      year,
      age: currentAge,
      income: Number(projectedIncome.toFixed(2)),
      expenses: Number(projectedExpenses.toFixed(2)),
      savings: Number((projectedIncome - projectedExpenses).toFixed(2)),
      portfolioValue: Number(portfolioValue.toFixed(2)),
    });
  }

  const currentYear = new Date().getFullYear();
  const milestones: FinancialPlanResult['milestones'] = [
    {
      year: currentYear,
      name: 'Current savings pace',
      description: `Annual surplus is ${fmtMoney(annualSavings)} and savings rate is ${fmtPercentValue(savingsRate, 1)}.`,
      status: 'Reached',
    },
  ];

  if (yearsToRetirement > 0 && cashFlowProjection.length > 1) {
    const midpointIndex = Math.min(
      cashFlowProjection.length - 1,
      Math.max(1, Math.floor(yearsToRetirement / 2)),
    );
    const midpoint = cashFlowProjection[midpointIndex];
    milestones.push({
      year: currentYear + midpointIndex,
      name: 'Midpoint projection check',
      description: `Projected portfolio reaches ${fmtMoney(midpoint.portfolioValue)} with annual savings near ${fmtMoney(midpoint.savings)}.`,
      status: 'Next',
    });
    milestones.push({
      year: currentYear + yearsToRetirement,
      name: 'Retirement target',
      description: `Projected retirement portfolio is ${fmtMoney(portfolioValue)} at age ${retirementTarget}.`,
      status: 'Projected',
    });
  }

  const finalExpenses = expenses * ((1 + inflation) ** yearsToRetirement);
  const requiredSavings = finalExpenses * 25;
  const gapOrSurplus = portfolioValue - requiredSavings;
  const onTrack = gapOrSurplus >= 0;

  let savingsGap = 0;
  if (!onTrack && yearsToRetirement > 0) {
    const annuityFactor =
      expectedReturns === 0
        ? yearsToRetirement
        : (((1 + expectedReturns) ** yearsToRetirement - 1) / expectedReturns);
    const additionalAnnual = annuityFactor ? Math.abs(gapOrSurplus) / annuityFactor : 0;
    savingsGap = Number((additionalAnnual / 12).toFixed(2));
  }

  if (cashFlowProjection.some((row) => row.portfolioValue >= 1_000_000)) {
    const millionCross = cashFlowProjection.find((row) => row.portfolioValue >= 1_000_000);
    if (millionCross) {
      milestones.push({
        year: currentYear + millionCross.year,
        name: 'Portfolio crosses $1M',
        description: `Projected investable assets exceed $1M around age ${millionCross.age}.`,
        status: 'Projected',
      });
    }
  }

  const parts = [
    `Based on current assets of ${fmtMoney(assets)} and annual savings of ${fmtMoney(annualSavings)}, the projected portfolio at age ${retirementTarget} is ${fmtMoney(portfolioValue)}.`,
    onTrack
      ? `This exceeds the estimated retirement need of ${fmtMoney(requiredSavings)} by ${fmtMoney(gapOrSurplus)}.`
      : `This falls short of the estimated retirement need of ${fmtMoney(requiredSavings)} by ${fmtMoney(Math.abs(gapOrSurplus))}.`,
    yearsToRetirement <= 5
      ? 'With retirement approaching soon, capital preservation and income resilience matter more than maximizing growth.'
      : yearsToRetirement <= 10
        ? 'With a mid-range horizon, a balanced mix of growth and stability is usually more appropriate than an extreme allocation.'
        : 'With a longer horizon, maintaining a growth tilt can be reasonable as long as diversification remains intact.',
  ];

  return {
    netWorthSummary: {
      totalAssets: Number(assets.toFixed(2)),
      totalLiabilities: Number(liabilities.toFixed(2)),
      netWorth: Number(netWorth.toFixed(2)),
    },
    retirementReadiness: {
      yearsToRetirement,
      requiredSavings: Number(requiredSavings.toFixed(2)),
      currentTrajectoryValue: Number(portfolioValue.toFixed(2)),
      gapOrSurplus: Number(gapOrSurplus.toFixed(2)),
      onTrack,
    },
    annualSurplus: Number(annualSavings.toFixed(2)),
    savingsRate: Number(savingsRate.toFixed(2)),
    cashFlowProjection,
    milestones: milestones.slice(0, 5),
    savingsGap,
    suggestedAllocation: allocationForHorizon(yearsToRetirement),
    scenarioCommentary: parts.join(' '),
  };
};
