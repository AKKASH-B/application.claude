import type { TxType } from "./types";

export const COLORS = { bg: "#F9F8F6", ink: "#1C1C1E", muted: "#777773", green: "#4A6B5D", pale: "#E5EBE8", card: "#FFFFFF", line: "#E5E4E0", red: "#B23B3B", gold: "#C28E38", negBalance: "#FF8A8A", gray: "#777773" };
export const TRANSFERRED_CATEGORIES = ["Food", "Transport", "Bills", "Rent", "Shopping", "Health", "Travel", "Other"];
export const RECEIVED_CATEGORIES = ["Salary", "Interest", "Trading", "Other"];
export const SAVINGS_CATEGORIES = ["Emergency Fund", "Goal", "Investment", "Retirement", "Other"];
export const categoriesFor = (type: TxType) => (type === "expense" ? TRANSFERRED_CATEGORIES : type === "income" ? RECEIVED_CATEGORIES : SAVINGS_CATEGORIES);
export const money = (n: number) => {
  const sign = n < 0 ? '-' : '';
  const absFormatted = Math.abs(n).toLocaleString("en-IN", { maximumFractionDigits: 0 });
  return `${sign}₹${absFormatted}`;
};
export const monthLabel = (ym: string) => { const [y, m] = ym.split("-").map(Number); return new Date(y, m - 1, 1).toLocaleDateString("en-IN", { month: "long", year: "numeric" }); };
// Local-time helpers: toISOString() is UTC, which shows the wrong month/day for a few hours around midnight in India.
const localIso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
export const nowMonth = () => localIso(new Date()).slice(0, 7);
export const shiftMonth = (ym: string, delta: number) => { const [y, m] = ym.split("-").map(Number); const d = new Date(y, m - 1 + delta, 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`; };
export const addMonthsIso = (n: number) => { const d = new Date(); d.setMonth(d.getMonth() + n); return localIso(d); };
export const dateLabel = (iso: string) => new Date(iso + "T00:00:00").toLocaleDateString("en-IN", { month: "short", year: "numeric" });
export const monthsUntil = (iso: string) => { const now = new Date(); const t = new Date(iso + "T00:00:00"); return (t.getFullYear() - now.getFullYear()) * 12 + (t.getMonth() - now.getMonth()); };
export const GOAL_PRESETS: { label: string; months: number | null }[] = [{ label: "No date", months: null }, { label: "3 mo", months: 3 }, { label: "6 mo", months: 6 }, { label: "1 yr", months: 12 }, { label: "2 yr", months: 24 }];
