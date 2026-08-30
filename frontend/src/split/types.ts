export type SplitMode = "equal" | "unequal" | "shares";

export type SplitMember = {
  id: string;
  name: string;
  phone?: string | null;
  share_value: number;
  owed_amount: number;
  settled: boolean;
  is_payer: boolean;
};

export type SplitSession = {
  id: string;
  total_amount: number;
  note: string;
  mode: SplitMode;
  members: SplitMember[];
  transaction_id: string | null;
  finalized: boolean;
  created_at: string;
  updated_at: string;
};

export type Friend = {
  id: string;
  name: string;
  phone?: string | null;
  created_at: string;
};

export type DraftMember = {
  id: string;
  name: string;
  phone?: string | null;
  share_value: number; // for shares mode; 1 by default
  custom_amount: string; // for unequal mode; user-entered string
  is_payer: boolean;
  settled: boolean;
};

export type SplitDraft = {
  totalAmount: string;
  note: string;
  mode: SplitMode;
  members: DraftMember[];
  createTransaction: boolean;
};
