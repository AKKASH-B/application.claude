import { HttpError, cleanToday, daysInMonth, isMonth, round2, shiftMonth } from "../util";
import type { TxDoc } from "./transactions";
import type { Route } from "./types";

function totals(list: TxDoc[]) {
  let spent = 0,
    received = 0,
    saved = 0;
  for (const t of list) {
    if (t.type === "expense") spent += t.amount;
    else if (t.type === "income") received += t.amount;
    else saved += t.amount;
  }
  return { spent: round2(spent), received: round2(received), saved: round2(saved) };
}

export const summaryRoutes: Route[] = [
  {
    method: "GET",
    path: /^\/summary$/,
    auth: true,
    run: async ({ db, user, query }) => {
      const today = cleanToday(query.get("today"));
      const month = query.get("month") || today.slice(0, 7);
      if (!isMonth(month)) throw new HttpError(400, "Invalid month");
      const userId = user._id;
      const col = db.collection<TxDoc>("transactions");
      const range = (ym: string) => ({ $gte: `${ym}-01`, $lte: `${ym}-31` });
      const prevMonth = shiftMonth(month, -1);

      const [txs, prevTxs, allTime, budgetDocs] = await Promise.all([
        col.find({ userId, date: range(month) }).toArray(),
        col.find({ userId, date: range(prevMonth) }).toArray(),
        col.aggregate<{ _id: string; total: number }>([{ $match: { userId } }, { $group: { _id: "$type", total: { $sum: "$amount" } } }]).toArray(),
        db.collection("budgets").find({ userId }).toArray(),
      ]);

      const cur = totals(txs);
      const prev = totals(prevTxs);
      const all = { expense: 0, income: 0, savings: 0 } as Record<string, number>;
      for (const a of allTime) all[a._id] = a.total;
      // Money moved into savings is no longer spendable, so it reduces the available balance.
      const balance = round2(all.income - all.expense - all.savings);
      const savedTotal = round2(all.savings);

      const dim = daysInMonth(month);
      const daily = Array.from({ length: dim }, (_, i) => ({ day: i + 1, spent: 0 }));
      const catMap = new Map<string, number>();
      let largest: TxDoc | null = null;
      for (const t of txs) {
        if (t.type !== "expense") continue;
        daily[Number(t.date.slice(8, 10)) - 1].spent += t.amount;
        catMap.set(t.category, (catMap.get(t.category) || 0) + t.amount);
        if (!largest || t.amount > largest.amount) largest = t;
      }
      daily.forEach((d) => (d.spent = round2(d.spent)));
      const categories = [...catMap.entries()]
        .map(([category, amount]) => ({ category, amount: round2(amount), pct: cur.spent ? Math.round((amount / cur.spent) * 100) : 0 }))
        .sort((a, b) => b.amount - a.amount);

      const budgets = budgetDocs.map((b) => ({
        category: String(b.category),
        limit: Number(b.limit),
        spent: round2(catMap.get(String(b.category)) || 0),
      }));
      const totalBudget = budgets.reduce((s, b) => s + b.limit, 0);

      const thisMonth = today.slice(0, 7);
      const isCurrent = month === thisMonth;
      const dayOfMonth = Number(today.slice(8, 10));
      const elapsed = isCurrent ? dayOfMonth : month < thisMonth ? dim : 0;
      const avgDaily = elapsed ? round2(cur.spent / elapsed) : 0;
      const projected = isCurrent && elapsed ? round2((cur.spent / elapsed) * dim) : cur.spent;

      let safeToSpend: { perDay: number; remaining: number; daysLeft: number; basis: "budget" | "income" } | null = null;
      if (isCurrent) {
        const daysLeft = dim - dayOfMonth + 1;
        const basis = totalBudget > 0 ? "budget" : "income";
        const remaining = basis === "budget" ? totalBudget - cur.spent : cur.received - cur.spent - cur.saved;
        if (basis === "budget" || cur.received > 0) {
          safeToSpend = { perDay: remaining > 0 ? round2(remaining / daysLeft) : 0, remaining: round2(remaining), daysLeft, basis };
        }
      }

      let noSpendStreak = 0;
      if (isCurrent) {
        for (let d = dayOfMonth; d >= 1 && daily[d - 1].spent === 0; d--) noSpendStreak++;
      }

      return {
        month,
        today,
        ...cur,
        balance,
        savedTotal,
        previous: { month: prevMonth, ...prev },
        changePct: prev.spent > 0 ? Math.round(((cur.spent - prev.spent) / prev.spent) * 100) : null,
        categories,
        daily,
        budgets,
        avgDaily,
        projected,
        safeToSpend,
        noSpendStreak,
        largest: largest ? { amount: largest.amount, category: largest.category, note: largest.note, date: largest.date } : null,
        count: txs.length,
      };
    },
  },
];
