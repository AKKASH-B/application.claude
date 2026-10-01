import { z } from "zod";
import type { Db, Filter, ObjectId } from "mongodb";
import { HttpError, Reply, TX_TYPES, escapeRegex, isDate, isMonth, oid, parse, round2, ser } from "../util";
import type { Route } from "./types";

export interface TxDoc {
  _id: ObjectId;
  userId: ObjectId;
  type: (typeof TX_TYPES)[number];
  amount: number;
  category: string;
  note: string;
  date: string; // YYYY-MM-DD
  goalId?: string | null;
  splitId?: string;
  recurringKey?: string;
  createdAt: string;
}

export const txInput = z.object({
  type: z.enum(TX_TYPES),
  amount: z.number().positive("Amount must be more than 0").max(1e9).transform(round2),
  category: z.string().trim().min(1).max(30),
  note: z.string().trim().max(200).optional().default(""),
  date: z.string().refine(isDate, "Invalid date"),
  goalId: z.string().nullable().optional(),
});

function csvCell(v: string | number): string {
  let s = String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; // neutralise spreadsheet formulas
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export const transactionRoutes: Route[] = [
  {
    method: "GET",
    path: /^\/transactions$/,
    auth: true,
    run: async ({ db, user, query }) => {
      const filter: Filter<TxDoc> = { userId: user._id };
      const month = query.get("month");
      if (month) {
        if (!isMonth(month)) throw new HttpError(400, "Invalid month");
        filter.date = { $gte: `${month}-01`, $lte: `${month}-31` };
      }
      const type = query.get("type");
      if (type) {
        if (!(TX_TYPES as readonly string[]).includes(type)) throw new HttpError(400, "Invalid type");
        filter.type = type as TxDoc["type"];
      }
      const category = query.get("category");
      if (category) filter.category = category.slice(0, 30);
      const q = (query.get("q") || "").trim().slice(0, 60);
      if (q) {
        const re = new RegExp(escapeRegex(q), "i");
        filter.$or = [{ note: re }, { category: re }];
      }
      const limit = Math.min(Math.max(parseInt(query.get("limit") || "300", 10) || 300, 1), 1000);
      const rows = await db
        .collection<TxDoc>("transactions")
        .find(filter)
        .sort({ date: -1, createdAt: -1 })
        .limit(limit)
        .toArray();
      return rows.map(ser);
    },
  },
  {
    method: "GET",
    path: /^\/transactions\/export$/,
    auth: true,
    run: async ({ db, user, query }) => {
      const month = query.get("month");
      const filter: Filter<TxDoc> = { userId: user._id };
      if (month) {
        if (!isMonth(month)) throw new HttpError(400, "Invalid month");
        filter.date = { $gte: `${month}-01`, $lte: `${month}-31` };
      }
      const rows = await db.collection<TxDoc>("transactions").find(filter).sort({ date: 1, createdAt: 1 }).limit(20000).toArray();
      const lines = ["Date,Type,Category,Amount,Note"];
      for (const r of rows) lines.push([r.date, r.type, r.category, r.amount, r.note].map(csvCell).join(","));
      return new Reply(lines.join("\n"), 200, "text/csv; charset=utf-8");
    },
  },
  {
    method: "GET",
    path: /^\/transactions\/([^/]+)$/,
    auth: true,
    run: async ({ db, user, params }) => {
      const doc = await db.collection<TxDoc>("transactions").findOne({ _id: oid(params[0]), userId: user._id });
      if (!doc) throw new HttpError(404, "Transaction not found");
      return ser(doc);
    },
  },
  {
    method: "POST",
    path: /^\/transactions$/,
    auth: true,
    run: async ({ db, user, body }) => {
      const input = parse(txInput, body);
      const goalId = await validGoal(db, user._id, input);
      const doc = {
        userId: user._id,
        type: input.type,
        amount: input.amount,
        category: input.category,
        note: input.note,
        date: input.date,
        goalId,
        createdAt: new Date().toISOString(),
      };
      const r = await db.collection("transactions").insertOne(doc);
      return new Reply(ser({ _id: r.insertedId, ...doc }), 201);
    },
  },
  {
    method: "PUT",
    path: /^\/transactions\/([^/]+)$/,
    auth: true,
    run: async ({ db, user, body, params }) => {
      const input = parse(txInput, body);
      const goalId = await validGoal(db, user._id, input);
      const res = await db
        .collection<TxDoc>("transactions")
        .findOneAndUpdate(
          { _id: oid(params[0]), userId: user._id },
          { $set: { type: input.type, amount: input.amount, category: input.category, note: input.note, date: input.date, goalId } },
          { returnDocument: "after" },
        );
      if (!res) throw new HttpError(404, "Transaction not found");
      return ser(res);
    },
  },
  {
    method: "DELETE",
    path: /^\/transactions\/([^/]+)$/,
    auth: true,
    run: async ({ db, user, params }) => {
      const r = await db.collection<TxDoc>("transactions").deleteOne({ _id: oid(params[0]), userId: user._id });
      if (!r.deletedCount) throw new HttpError(404, "Transaction not found");
      return { ok: true };
    },
  },
];

async function validGoal(db: Db, userId: ObjectId, input: z.output<typeof txInput>): Promise<string | null> {
  if (input.type !== "savings" || !input.goalId) return null;
  const goal = await db.collection("goals").findOne({ _id: oid(input.goalId), userId });
  if (!goal) throw new HttpError(400, "That savings goal no longer exists");
  return input.goalId;
}
