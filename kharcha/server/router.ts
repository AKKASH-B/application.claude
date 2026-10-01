import { authenticate } from "./auth";
import { getDb } from "./db";
import { HttpError, Reply } from "./util";
import { authRoutes } from "./routes/auth";
import { transactionRoutes } from "./routes/transactions";
import { summaryRoutes } from "./routes/summary";
import { budgetRoutes, goalRoutes, recurringRoutes, splitRoutes } from "./routes/plan";
import type { Route } from "./routes/types";

const routes: Route[] = [
  {
    method: "GET",
    path: /^\/health$/,
    auth: false,
    run: async () => ({ ok: true, service: "kharcha", time: new Date().toISOString() }),
  },
  ...authRoutes,
  ...transactionRoutes,
  ...summaryRoutes,
  ...budgetRoutes,
  ...goalRoutes,
  ...recurringRoutes,
  ...splitRoutes,
];

export interface Incoming {
  method: string;
  path: string; // without the /api prefix
  query: URLSearchParams;
  body: unknown;
  authorization?: string;
}

export async function handle(req: Incoming): Promise<Reply> {
  const path = req.path.replace(/\/+$/, "") || "/";
  let matchedPath = false;
  for (const r of routes) {
    const m = r.path.exec(path);
    if (!m) continue;
    matchedPath = true;
    if (r.method !== req.method) continue;
    // /health must work even before the database is configured.
    if (path === "/health") return new Reply(await r.run({} as never));
    const db = await getDb();
    const user = r.auth ? await authenticate(db, req.authorization) : (undefined as never);
    const out = await r.run({ db, user, body: req.body, params: m.slice(1), query: req.query });
    return out instanceof Reply ? out : new Reply(out);
  }
  throw new HttpError(matchedPath ? 405 : 404, matchedPath ? "Method not allowed" : "Not found");
}
