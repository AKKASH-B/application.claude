export type TxType = "expense" | "income" | "savings";
export type Transaction = { id: string; type: TxType; amount: number; category: string; note?: string; date: string; created_at: string; goal_id?: string | null };
export type Budget = { id: string; category: string; monthly_limit: number; updated_at: string };
export type AdminUser = { id: string; username: string; email?: string; phone?: string; role: string; disabled: boolean; created_at?: string | null; transaction_count: number; balance: number };
export type SavingsGoal = { id: string; name: string; target: number; target_date?: string | null; celebrated: boolean; created_at: string; updated_at: string };
