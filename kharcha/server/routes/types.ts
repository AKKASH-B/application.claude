import type { Db } from "mongodb";
import type { UserDoc } from "../db";

export interface Ctx {
  db: Db;
  user: UserDoc; // only valid when route.auth === true
  body: unknown;
  params: string[]; // regex capture groups
  query: URLSearchParams;
}

export interface Route {
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  path: RegExp;
  auth: boolean;
  run: (c: Ctx) => Promise<unknown>;
}
