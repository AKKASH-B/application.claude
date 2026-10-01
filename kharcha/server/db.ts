import { MongoClient, Db, ObjectId } from "mongodb";
import { HttpError } from "./util";

export interface UserDoc {
  _id: ObjectId;
  name: string;
  email: string;
  passwordHash: string;
  recoveryHash: string;
  currency: string;
  tokenVersion: number;
  failed: number;
  lockUntil?: number;
  createdAt: string;
}

type Cache = { client: MongoClient; db: Db };
const g = globalThis as unknown as { __kharchaMongo?: Promise<Cache> };

async function ensureIndexes(db: Db) {
  await Promise.all([
    db.collection("users").createIndex({ email: 1 }, { unique: true }),
    db.collection("transactions").createIndex({ userId: 1, date: -1 }),
    db.collection("transactions").createIndex(
      { userId: 1, recurringKey: 1 },
      { unique: true, partialFilterExpression: { recurringKey: { $type: "string" } } },
    ),
    db.collection("budgets").createIndex({ userId: 1, category: 1 }, { unique: true }),
    db.collection("goals").createIndex({ userId: 1 }),
    db.collection("recurring").createIndex({ userId: 1 }),
    db.collection("splits").createIndex({ userId: 1, date: -1 }),
  ]);
}

/** Cached across warm serverless invocations. */
export function getDb(): Promise<Db> {
  if (!g.__kharchaMongo) {
    const uri = process.env.MONGODB_URI;
    if (!uri) throw new HttpError(500, "Server is not configured (MONGODB_URI is missing)");
    g.__kharchaMongo = (async () => {
      const client = new MongoClient(uri, { maxPoolSize: 5, serverSelectionTimeoutMS: 8000 });
      await client.connect();
      const db = client.db(process.env.DB_NAME || "kharcha");
      await ensureIndexes(db);
      return { client, db };
    })().catch((e) => {
      g.__kharchaMongo = undefined;
      throw e;
    });
  }
  return g.__kharchaMongo.then((c) => c.db);
}
