import { ObjectId } from "mongodb";
import type { z } from "zod";

export class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

/** A non-default response (custom status / content type). */
export class Reply {
  constructor(
    public data: unknown,
    public status = 200,
    public contentType?: string,
    public headers?: Record<string, string>,
  ) {}
}

export const CURRENCIES = ["INR", "USD", "EUR", "GBP", "AED", "SGD", "AUD", "CAD", "JPY"] as const;
export const TX_TYPES = ["expense", "income", "savings"] as const;
export type TxType = (typeof TX_TYPES)[number];

export const pad = (n: number) => String(n).padStart(2, "0");
export const round2 = (n: number) => Math.round(n * 100) / 100;

export function isDate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(s + "T00:00:00Z");
  return !isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}
export const isMonth = (s: string) => /^\d{4}-(0[1-9]|1[0-2])$/.test(s);

export function daysInMonth(ym: string): number {
  const [y, m] = ym.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}
export function shiftMonth(ym: string, delta: number): string {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`;
}

export function oid(id: string): ObjectId {
  if (!ObjectId.isValid(id)) throw new HttpError(404, "Not found");
  return new ObjectId(id);
}

/** Mongo doc -> JSON (renames _id to id, hides userId). */
export function ser<T extends { _id: ObjectId }>(doc: T): Record<string, unknown> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { _id, userId: _u, ...rest } = doc as any;
  return { id: _id.toString(), ...rest };
}

export function parse<S extends z.ZodTypeAny>(schema: S, data: unknown): z.output<S> {
  const r = schema.safeParse(data ?? {});
  if (!r.success) {
    const i = r.error.issues[0];
    const where = i.path.join(".");
    throw new HttpError(400, where ? `${where}: ${i.message}` : i.message);
  }
  return r.data;
}

export const serverToday = () => new Date().toISOString().slice(0, 10);

/** The client sends its local "today"; accept it only if it is within 2 days of server time. */
export function cleanToday(s?: string | null): string {
  if (s && isDate(s)) {
    const diff = Math.abs(Date.parse(s + "T00:00:00Z") - Date.parse(serverToday() + "T00:00:00Z"));
    if (diff <= 2 * 86400000) return s;
  }
  return serverToday();
}

export const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
