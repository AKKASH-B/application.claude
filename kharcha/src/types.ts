export type TxType = "expense" | "income" | "savings";

export interface User {
  id: string;
  name: string;
  email: string;
  currency: string;
  createdAt: string;
}
export interface Tx {
  id: string;
  type: TxType;
  amount: number;
  category: string;
  note: string;
  date: string;
  goalId?: string | null;
  splitId?: string;
  recurringKey?: string;
}
export interface Budget { category: string; limit: number }
export interface Goal { id: string; name: string; target: number; targetDate: string | null; saved: number; celebrated: boolean }
export interface Recurring { id: string; type: TxType; amount: number; category: string; note: string; dayOfMonth: number; startMonth: string }
export interface SplitMember { id: string; name: string; share: number; paid: boolean }
export interface Split { id: string; title: string; total: number; myShare: number; date: string; members: SplitMember[] }
export interface Summary {
  month: string;
  today: string;
  spent: number;
  received: number;
  saved: number;
  balance: number;
  savedTotal: number;
  previous: { month: string; spent: number; received: number; saved: number };
  changePct: number | null;
  categories: { category: string; amount: number; pct: number }[];
  daily: { day: number; spent: number }[];
  budgets: { category: string; limit: number; spent: number }[];
  avgDaily: number;
  projected: number;
  safeToSpend: { perDay: number; remaining: number; daysLeft: number; basis: "budget" | "income" } | null;
  noSpendStreak: number;
  largest: { amount: number; category: string; note: string; date: string } | null;
  count: number;
}
