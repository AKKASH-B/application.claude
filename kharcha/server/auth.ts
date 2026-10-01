import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { randomBytes } from "crypto";
import type { Db } from "mongodb";
import type { UserDoc } from "./db";
import { HttpError, oid } from "./util";

function secret(): string {
  const s = process.env.JWT_SECRET;
  if (!s || s.length < 24) throw new HttpError(500, "Server is not configured (JWT_SECRET must be 24+ characters)");
  return s;
}

export function signToken(u: UserDoc): string {
  return jwt.sign({ sub: u._id.toString(), tv: u.tokenVersion }, secret(), { expiresIn: "30d" });
}

export async function authenticate(db: Db, header: string | undefined): Promise<UserDoc> {
  const m = /^Bearer (.+)$/.exec(header || "");
  if (!m) throw new HttpError(401, "Please sign in");
  let payload: jwt.JwtPayload;
  try {
    payload = jwt.verify(m[1], secret()) as jwt.JwtPayload;
  } catch {
    throw new HttpError(401, "Session expired, please sign in again");
  }
  const user = await db.collection<UserDoc>("users").findOne({ _id: oid(String(payload.sub)) });
  if (!user || user.tokenVersion !== payload.tv) throw new HttpError(401, "Session expired, please sign in again");
  return user;
}

export const hashSecret = (s: string) => bcrypt.hash(s, 10);
export const checkSecret = (s: string, hash: string) => bcrypt.compare(s, hash);
// Used to keep timing similar when an account does not exist.
let dummy: string | undefined;
export const dummyHash = () => (dummy ??= bcrypt.hashSync("kharcha-dummy", 10));

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export function newRecoveryKey(): string {
  const bytes = randomBytes(16);
  let out = "";
  for (let i = 0; i < 16; i++) {
    out += ALPHABET[bytes[i] % ALPHABET.length];
    if (i % 4 === 3 && i < 15) out += "-";
  }
  return out;
}
export const normalizeKey = (k: string) => k.toUpperCase().replace(/[^A-Z0-9]/g, "");
