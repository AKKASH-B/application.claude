import type { Transaction } from "./types";

// A "streak day" is a day (in the phone's local time) on which the user ENTERED at least one transaction.
// We use when it was entered (created_at), not the date picked on the transaction, so back-dating can't fake a streak.
const pad = (n: number) => String(n).padStart(2, "0");
export const localDay = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const dayNumber = (iso: string) => { const [y, m, d] = iso.split("-").map(Number); return Math.round(Date.UTC(y, m - 1, d) / 86400000); };
const shiftDay = (iso: string, delta: number) => { const [y, m, d] = iso.split("-").map(Number); return localDay(new Date(y, m - 1, d + delta)); };

export type StreakInfo = {
  current: number;        // consecutive days up to today (or yesterday, if today isn't logged yet)
  longest: number;
  activeDays: number;     // total distinct days with an entry
  loggedToday: boolean;
  atRisk: boolean;        // streak is alive but today still needs an entry
  last7: { day: string; label: string; active: boolean; isToday: boolean }[];
};

export function computeStreak(transactions: Transaction[], now: Date = new Date()): StreakInfo {
  const days = new Set<string>();
  for (const t of transactions) {
    const created = t.created_at ? new Date(t.created_at) : null;
    if (created && !Number.isNaN(created.getTime())) days.add(localDay(created));
  }
  const today = localDay(now);
  const yesterday = shiftDay(today, -1);
  const loggedToday = days.has(today);

  // Current streak: walk back from today (or yesterday when today is still open).
  let current = 0;
  let cursor = loggedToday ? today : days.has(yesterday) ? yesterday : null;
  while (cursor && days.has(cursor)) { current += 1; cursor = shiftDay(cursor, -1); }

  // Longest streak over all history.
  const sorted = [...days].map(dayNumber).sort((a, b) => a - b);
  let longest = 0, run = 0, prev: number | null = null;
  for (const n of sorted) {
    run = prev !== null && n === prev + 1 ? run + 1 : 1;
    if (run > longest) longest = run;
    prev = n;
  }

  const last7 = Array.from({ length: 7 }, (_, i) => {
    const day = shiftDay(today, i - 6);
    const [y, m, d] = day.split("-").map(Number);
    return { day, label: "SMTWTFS"[new Date(y, m - 1, d).getDay()], active: days.has(day), isToday: day === today };
  });

  return { current, longest, activeDays: days.size, loggedToday, atRisk: current > 0 && !loggedToday, last7 };
}
