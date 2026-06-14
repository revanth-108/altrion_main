export interface CashFlowSubcategory {
  name: string;
  amount: number;
}

export interface CashFlowCategory {
  id: string;
  name: string;
  amount: number;
  color: string;
  sub: CashFlowSubcategory[];
}

export interface CashFlowTransaction {
  date: string;
  month: number;
  year: number;
  desc: string;
  cat: string;
  catId: string;
  amount: number;
  pfcP: string;
  pfcD: string;
  account?: string;
}

export interface SankeyLayoutSub {
  name: string;
  amount: number;
  color: string;
  h: number;
  srcY0: number;
  srcY1: number;
  sY0: number;
  sY1: number;
}

export interface SankeyLayoutNode {
  id: string;
  name: string;
  amount: number;
  color: string;
  h: number;
  pct: string;
  iY0: number;
  iY1: number;
  cY0: number;
  cY1: number;
  subs: SankeyLayoutSub[];
}

/**
 * One node in the income-source column (the new leftmost column).
 * `srcY0/srcY1` are positions of the source's own node on the left.
 * `iY0/iY1` are positions on the income-aggregator side where this
 * source's ribbon connects.
 */
export interface SankeyIncomeSourceNode {
  id: string;
  name: string;
  amount: number;
  color: string;
  h: number;
  pct: string;
  srcY0: number;
  srcY1: number;
  iY0: number;
  iY1: number;
}
