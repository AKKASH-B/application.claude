import { z } from "zod";
import type { Collection } from "mongodb";
import type { UserDoc } from "../db";
import { CURRENCIES, HttpError, Reply, parse } from "../util";
import { checkSecret, dummyHash, hashSecret, newRecoveryKey, normalizeKey, signToken } from "../auth";
import type { Route } from "./types";

const MAX_FAILS = 5;
const LOCK_MS = 15 * 60 * 1000;

const email = z.string().trim().toLowerCase().email("Enter a valid email").max(120);
const password = z.string().min(8, "Password must be at least 8 characters").max(100);

export const publicUser = (u: UserDoc) => ({
  id: u._id.toString(),
  name: u.name,
  email: u.email,
  currency: u.currency,
  createdAt: u.createdAt,
});

function assertNotLocked(u: UserDoc) {
  if (u.lockUntil && u.lockUntil > Date.now()) {
    const mins = Math.ceil((u.lockUntil - Date.now()) / 60000);
    throw new HttpError(429, `Too many attempts. Try again in ${mins} minute${mins === 1 ? "" : "s"}.`);
  }
}

async function registerFailure(users: Collection<UserDoc>, u: UserDoc) {
  const failed = (u.failed || 0) + 1;
  const set: Partial<UserDoc> = { failed };
  if (failed >= MAX_FAILS) {
    set.lockUntil = Date.now() + LOCK_MS;
    set.failed = 0;
  }
  await users.updateOne({ _id: u._id }, { $set: set });
}

export const authRoutes: Route[] = [
  {
    method: "POST",
    path: /^\/auth\/signup$/,
    auth: false,
    run: async ({ db, body }) => {
      const input = parse(
        z.object({
          name: z.string().trim().min(1, "Enter your name").max(60),
          email,
          password,
          currency: z.enum(CURRENCIES).optional().default("INR"),
        }),
        body,
      );
      const users = db.collection<UserDoc>("users");
      if (await users.findOne({ email: input.email })) throw new HttpError(409, "That email is already registered");
      const recoveryKey = newRecoveryKey();
      const doc: Omit<UserDoc, "_id"> = {
        name: input.name,
        email: input.email,
        passwordHash: await hashSecret(input.password),
        recoveryHash: await hashSecret(normalizeKey(recoveryKey)),
        currency: input.currency,
        tokenVersion: 0,
        failed: 0,
        createdAt: new Date().toISOString(),
      };
      let id;
      try {
        id = (await users.insertOne(doc as UserDoc)).insertedId;
      } catch (e) {
        if ((e as { code?: number }).code === 11000) throw new HttpError(409, "That email is already registered");
        throw e;
      }
      const user = { ...doc, _id: id } as UserDoc;
      return new Reply({ token: signToken(user), user: publicUser(user), recoveryKey }, 201);
    },
  },
  {
    method: "POST",
    path: /^\/auth\/login$/,
    auth: false,
    run: async ({ db, body }) => {
      const input = parse(z.object({ email, password: z.string().min(1).max(100) }), body);
      const users = db.collection<UserDoc>("users");
      const user = await users.findOne({ email: input.email });
      if (!user) {
        await checkSecret(input.password, dummyHash());
        throw new HttpError(401, "Invalid email or password");
      }
      assertNotLocked(user);
      if (!(await checkSecret(input.password, user.passwordHash))) {
        await registerFailure(users, user);
        throw new HttpError(401, "Invalid email or password");
      }
      if (user.failed || user.lockUntil) await users.updateOne({ _id: user._id }, { $set: { failed: 0 }, $unset: { lockUntil: "" } });
      return { token: signToken(user), user: publicUser(user) };
    },
  },
  {
    // Password reset without email: uses the recovery key shown once at sign-up.
    method: "POST",
    path: /^\/auth\/reset$/,
    auth: false,
    run: async ({ db, body }) => {
      const input = parse(
        z.object({ email, recoveryKey: z.string().min(8).max(40), newPassword: password }),
        body,
      );
      const users = db.collection<UserDoc>("users");
      const user = await users.findOne({ email: input.email });
      if (!user) {
        await checkSecret("x", dummyHash());
        throw new HttpError(401, "Email or recovery key is incorrect");
      }
      assertNotLocked(user);
      if (!(await checkSecret(normalizeKey(input.recoveryKey), user.recoveryHash))) {
        await registerFailure(users, user);
        throw new HttpError(401, "Email or recovery key is incorrect");
      }
      const recoveryKey = newRecoveryKey();
      const tokenVersion = user.tokenVersion + 1;
      await users.updateOne(
        { _id: user._id },
        {
          $set: {
            passwordHash: await hashSecret(input.newPassword),
            recoveryHash: await hashSecret(normalizeKey(recoveryKey)),
            tokenVersion,
            failed: 0,
          },
          $unset: { lockUntil: "" },
        },
      );
      const fresh = { ...user, tokenVersion };
      return { token: signToken(fresh), user: publicUser(fresh), recoveryKey };
    },
  },
  {
    method: "POST",
    path: /^\/auth\/change-password$/,
    auth: true,
    run: async ({ db, user, body }) => {
      const input = parse(z.object({ currentPassword: z.string().min(1).max(100), newPassword: password }), body);
      if (!(await checkSecret(input.currentPassword, user.passwordHash))) throw new HttpError(401, "Current password is incorrect");
      const tokenVersion = user.tokenVersion + 1;
      await db
        .collection<UserDoc>("users")
        .updateOne({ _id: user._id }, { $set: { passwordHash: await hashSecret(input.newPassword), tokenVersion } });
      return { token: signToken({ ...user, tokenVersion }) };
    },
  },
  {
    // Signs the account out of every device.
    method: "POST",
    path: /^\/auth\/logout-all$/,
    auth: true,
    run: async ({ db, user }) => {
      await db.collection<UserDoc>("users").updateOne({ _id: user._id }, { $inc: { tokenVersion: 1 } });
      return { ok: true };
    },
  },
  {
    method: "GET",
    path: /^\/me$/,
    auth: true,
    run: async ({ user }) => ({ user: publicUser(user) }),
  },
  {
    method: "PATCH",
    path: /^\/me$/,
    auth: true,
    run: async ({ db, user, body }) => {
      const input = parse(
        z.object({ name: z.string().trim().min(1).max(60).optional(), currency: z.enum(CURRENCIES).optional() }),
        body,
      );
      await db.collection<UserDoc>("users").updateOne({ _id: user._id }, { $set: input });
      return { user: publicUser({ ...user, ...input }) };
    },
  },
  {
    // Permanent account + data deletion (required by Google Play and the App Store).
    method: "DELETE",
    path: /^\/me$/,
    auth: true,
    run: async ({ db, user, body }) => {
      const input = parse(z.object({ password: z.string().min(1).max(100) }), body);
      if (!(await checkSecret(input.password, user.passwordHash))) throw new HttpError(401, "Password is incorrect");
      const userId = user._id;
      await Promise.all(
        ["transactions", "budgets", "goals", "recurring", "splits"].map((c) => db.collection(c).deleteMany({ userId })),
      );
      await db.collection("users").deleteOne({ _id: userId });
      return { ok: true };
    },
  },
];
