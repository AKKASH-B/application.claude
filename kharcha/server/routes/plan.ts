import { z } from "zod";
import { randomUUID } from "crypto";
import type { ObjectId } from "mongodb";
import {
  HttpError,
  Reply,
  cleanToday,
  daysInMonth,
  isDate,
  isMonth,
  oid,
  pad,
  parse,
  round2,
  ser,
  shiftMonth,
  TX_TYPES,
} from "../util";
import type { Route } from "./types";

/* ------------------------------ budgets ------------------------------ */

const budgetInput = z.object({
  category: z.string().trim().min(1).max(30),
  limit: z.number().positive("Limit must be more than 0").max(1e9).transform(round2),
});

export const budgetRoutes: Route[] = [
  {
    method: "GET",
    path: /^\/budgets$/,
    auth: true,
    run: async ({ db, user }) => (await db.collection("budgets").find({ userId: user._id }).sort({ category: 1 }).toArray()).map(ser),
  },
  {
    method: "PUT",
    path: /^\/budgets$/,
    auth: true,
    run: async ({ db, user, body }) => {
      const input = parse(budgetInput, body);
      await db
        .collection("budgets")
        .updateOne({ userId: user._id, category: input.category }, { $set: { limit: input.limit } }, { upsert: true });
      return input;
    },
  },
  {
    method: "DELETE",
    path: /^\/budgets\/([^/]+)$/,
    auth: true,
    run: async ({ db, user, params }) => {
      await db.collection("budgets").deleteOne({ userId: user._id, category: decodeURIComponent(params[0]) });
      return { ok: true };
    },
  },
];

/* ------------------------------- goals ------------------------------- */

const goalInput = z.object({
  name: z.string().trim().min(1, "Give the goal a name").max(40),
  target: z.number().positive("Target must be more than 0").max(1e10).transform(round2),
  targetDate: z
    .string()
    .refine(isDate, "Invalid date")
    .nullable()
    .optional(),
});

async function goalsWithSaved(db: import("mongodb").Db, userId: ObjectId) {
  const goals = await db.collection("goals").find({ userId }).sort({ createdAt: 1 }).toArray();
  const sums = await db
    .collection("transactions")
    .aggregate<{ _id: string; total: number }>([
      { $match: { userId, type: "savings", goalId: { $type: "string" } } },
      { $group: { _id: "$goalId", total: { $sum: "$amount" } } },
    ])
    .toArray();
  const byGoal = new Map(sums.map((s) => [s._id, s.total]));
  return goals.map((g) => ({ ...ser(g as never), saved: round2(byGoal.get(g._id.toString()) || 0) }));
}

export const goalRoutes: Route[] = [
  {
    method: "GET",
    path: /^\/goals$/,
    auth: true,
    run: async ({ db, user }) => goalsWithSaved(db, user._id),
  },
  {
    method: "POST",
    path: /^\/goals$/,
    auth: true,
    run: async ({ db, user, body }) => {
      const input = parse(goalInput, body);
      if ((await db.collection("goals").countDocuments({ userId: user._id })) >= 30) throw new HttpError(400, "You can have up to 30 goals");
      const doc = { userId: user._id, name: input.name, target: input.target, targetDate: input.targetDate ?? null, celebrated: false, createdAt: new Date().toISOString() };
      const r = await db.collection("goals").insertOne(doc);
      return new Reply({ ...ser({ _id: r.insertedId, ...doc }), saved: 0 }, 201);
    },
  },
  {
    method: "PUT",
    path: /^\/goals\/([^/]+)$/,
    auth: true,
    run: async ({ db, user, body, params }) => {
      const input = parse(goalInput.extend({ celebrated: z.boolean().optional() }), body);
      const set: Record<string, unknown> = { name: input.name, target: input.target, targetDate: input.targetDate ?? null };
      if (input.celebrated !== undefined) set.celebrated = input.celebrated;
      const r = await db.collection("goals").updateOne({ _id: oid(params[0]), userId: user._id }, { $set: set });
      if (!r.matchedCount) throw new HttpError(404, "Goal not found");
      return { ok: true };
    },
  },
  {
    method: "POST",
    path: /^\/goals\/([^/]+)\/celebrated$/,
    auth: true,
    run: async ({ db, user, params }) => {
      await db.collection("goals").updateOne({ _id: oid(params[0]), userId: user._id }, { $set: { celebrated: true } });
      return { ok: true };
    },
  },
  {
    method: "DELETE",
    path: /^\/goals\/([^/]+)$/,
    auth: true,
    run: async ({ db, user, params }) => {
      const id = oid(params[0]);
      const r = await db.collection("goals").deleteOne({ _id: id, userId: user._id });
      if (!r.deletedCount) throw new HttpError(404, "Goal not found");
      // Keep the savings history but detach it from the removed goal.
      await db.collection("transactions").updateMany({ userId: user._id, goalId: id.toString() }, { $set: { goalId: null } });
      return { ok: true };
    },
  },
];

/* ---------------------------- recurring rules ---------------------------- */

const recurringInput = z.object({
  type: z.enum(TX_TYPES),
  amount: z.number().positive().max(1e9).transform(round2),
  category: z.string().trim().min(1).max(30),
  note: z.string().trim().max(200).optional().default(""),
  dayOfMonth: z.number().int().min(1).max(31),
  startMonth: z.string().refine(isMonth, "Invalid month"),
});

export const recurringRoutes: Route[] = [
  {
    method: "GET",
    path: /^\/recurring$/,
    auth: true,
    run: async ({ db, user }) => (await db.collection("recurring").find({ userId: user._id }).sort({ createdAt: 1 }).toArray()).map(ser),
  },
  {
    method: "POST",
    path: /^\/recurring$/,
    auth: true,
    run: async ({ db, user, body }) => {
      const input = parse(recurringInput, body);
      if ((await db.collection("recurring").countDocuments({ userId: user._id })) >= 50) throw new HttpError(400, "You can have up to 50 recurring items");
      const doc = { userId: user._id, ...input, createdAt: new Date().toISOString() };
      const r = await db.collection("recurring").insertOne(doc);
      return new Reply(ser({ _id: r.insertedId, ...doc }), 201);
    },
  },
  {
    method: "DELETE",
    path: /^\/recurring\/([^/]+)$/,
    auth: true,
    run: async ({ db, user, params }) => {
      await db.collection("recurring").deleteOne({ _id: oid(params[0]), userId: user._id });
      return { ok: true };
    },
  },
  {
    // Called when the app opens: turns every due recurring rule into real transactions (idempotent).
    method: "POST",
    path: /^\/recurring\/sync$/,
    auth: true,
    run: async ({ db, user, body }) => {
      const today = cleanToday((body as { today?: string } | undefined)?.today);
      const thisMonth = today.slice(0, 7);
      const earliest = shiftMonth(thisMonth, -24);
      const rules = await db.collection("recurring").find({ userId: user._id }).toArray();
      let created = 0;
      for (const rule of rules) {
        let ym = String(rule.startMonth) > earliest ? String(rule.startMonth) : earliest;
        for (; ym <= thisMonth; ym = shiftMonth(ym, 1)) {
          const date = `${ym}-${pad(Math.min(Number(rule.dayOfMonth), daysInMonth(ym)))}`;
          if (date > today) continue;
          const r = await db.collection("transactions").updateOne(
            { userId: user._id, recurringKey: `${rule._id.toString()}:${ym}` },
            {
              $setOnInsert: {
                userId: user._id,
                type: rule.type,
                amount: rule.amount,
                category: rule.category,
                note: rule.note || "Recurring",
                date,
                goalId: null,
                recurringKey: `${rule._id.toString()}:${ym}`,
                createdAt: new Date().toISOString(),
              },
            },
            { upsert: true },
          );
          created += r.upsertedCount;
        }
      }
      return { created };
    },
  },
];

/* ------------------------------ split bills ------------------------------ */

const splitInput = z.object({
  title: z.string().trim().min(1, "Give the bill a title").max(60),
  total: z.number().positive("Total must be more than 0").max(1e9).transform(round2),
  date: z.string().refine(isDate, "Invalid date"),
  members: z
    .array(z.object({ name: z.string().trim().min(1, "Enter a name").max(40), share: z.number().min(0).max(1e9).transform(round2) }))
    .min(1, "Add at least one person")
    .max(20),
  addToExpenses: z.boolean().optional().default(true),
});

export const splitRoutes: Route[] = [
  {
    method: "GET",
    path: /^\/splits$/,
    auth: true,
    run: async ({ db, user }) => (await db.collection("splits").find({ userId: user._id }).sort({ date: -1, createdAt: -1 }).limit(200).toArray()).map(ser),
  },
  {
    method: "POST",
    path: /^\/splits$/,
    auth: true,
    run: async ({ db, user, body }) => {
      const input = parse(splitInput, body);
      const others = round2(input.members.reduce((s, m) => s + m.share, 0));
      if (others > input.total + 0.01) throw new HttpError(400, "Shares add up to more than the total");
      const myShare = round2(input.total - others);
      const doc = {
        userId: user._id,
        title: input.title,
        total: input.total,
        date: input.date,
        myShare,
        members: input.members.map((m) => ({ id: randomUUID(), name: m.name, share: m.share, paid: false })),
        txId: null as string | null,
        createdAt: new Date().toISOString(),
      };
      const r = await db.collection("splits").insertOne(doc);
      if (input.addToExpenses && myShare > 0) {
        const tx = await db.collection("transactions").insertOne({
          userId: user._id,
          type: "expense",
          amount: myShare,
          category: "Split",
          note: `Split: ${input.title}`,
          date: input.date,
          goalId: null,
          splitId: r.insertedId.toString(),
          createdAt: new Date().toISOString(),
        });
        doc.txId = tx.insertedId.toString();
        await db.collection("splits").updateOne({ _id: r.insertedId }, { $set: { txId: doc.txId } });
      }
      return new Reply(ser({ _id: r.insertedId, ...doc }), 201);
    },
  },
  {
    method: "PUT",
    path: /^\/splits\/([^/]+)\/members\/([^/]+)$/,
    auth: true,
    run: async ({ db, user, params, body }) => {
      const { paid } = parse(z.object({ paid: z.boolean() }), body);
      const r = await db
        .collection("splits")
        .updateOne({ _id: oid(params[0]), userId: user._id, "members.id": params[1] }, { $set: { "members.$.paid": paid } });
      if (!r.matchedCount) throw new HttpError(404, "Not found");
      return { ok: true };
    },
  },
  {
    method: "DELETE",
    path: /^\/splits\/([^/]+)$/,
    auth: true,
    run: async ({ db, user, params }) => {
      const id = oid(params[0]);
      const r = await db.collection("splits").deleteOne({ _id: id, userId: user._id });
      if (!r.deletedCount) throw new HttpError(404, "Not found");
      await db.collection("transactions").deleteMany({ userId: user._id, splitId: id.toString() });
      return { ok: true };
    },
  },
];
