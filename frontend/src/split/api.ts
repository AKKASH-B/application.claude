import { authorizedRequest } from "@/src/auth";
import type { Friend, SplitMode, SplitSession } from "./types";

type SplitMemberPayload = {
  id?: string;
  name: string;
  phone?: string | null;
  share_value: number;
  owed_amount: number;
  settled: boolean;
  is_payer: boolean;
};

type CreateSplitInput = {
  total_amount: number;
  note?: string;
  mode: SplitMode;
  members: SplitMemberPayload[];
  create_transaction?: boolean;
  transaction_id?: string | null;
  date?: string | null;
  category?: string | null;
};

type UpdateSplitInput = Partial<Omit<CreateSplitInput, "create_transaction" | "transaction_id" | "date" | "category">>;

export const splitApi = {
  list: () => authorizedRequest<SplitSession[]>("/splits"),
  get: (id: string) => authorizedRequest<SplitSession>(`/splits/${id}`),
  create: (data: CreateSplitInput) =>
    authorizedRequest<SplitSession>("/splits", { method: "POST", body: JSON.stringify(data) }),
  update: (id: string, data: UpdateSplitInput) =>
    authorizedRequest<SplitSession>(`/splits/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  settleMember: (splitId: string, memberId: string, settled: boolean) =>
    authorizedRequest<SplitSession>(`/splits/${splitId}/members/${memberId}/settle`, {
      method: "PUT",
      body: JSON.stringify({ settled }),
    }),
  remove: (id: string) => authorizedRequest<{ ok: boolean }>(`/splits/${id}`, { method: "DELETE" }),
};

export const friendApi = {
  list: () => authorizedRequest<Friend[]>("/friends"),
  add: (name: string, phone?: string) =>
    authorizedRequest<Friend>("/friends", { method: "POST", body: JSON.stringify({ name, phone: phone || null }) }),
  remove: (id: string) => authorizedRequest<{ ok: boolean }>(`/friends/${id}`, { method: "DELETE" }),
};
