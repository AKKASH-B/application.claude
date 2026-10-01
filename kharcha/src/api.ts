import { API_URL } from "./config";

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

let token: string | null = null;
let onUnauthorized: (() => void) | null = null;
export const setToken = (t: string | null) => {
  token = t;
};
export const setOnUnauthorized = (fn: (() => void) | null) => {
  onUnauthorized = fn;
};

async function request(method: string, path: string, body?: unknown): Promise<{ res: Response; text: string }> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 25000);
  try {
    const res = await fetch(`${API_URL}/api${path}`, {
      method,
      headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: ctrl.signal,
    });
    return { res, text: await res.text() };
  } catch {
    throw new ApiError(0, "Can't reach the server. Check your internet connection and try again.");
  } finally {
    clearTimeout(timer);
  }
}

function fail(res: Response, text: string): never {
  let msg = `Request failed (${res.status})`;
  try {
    const j = JSON.parse(text);
    if (j?.error) msg = j.error;
  } catch {}
  if (res.status === 401 && token) onUnauthorized?.();
  throw new ApiError(res.status, msg);
}

export async function api<T = unknown>(method: string, path: string, body?: unknown): Promise<T> {
  const { res, text } = await request(method, path, body);
  if (!res.ok) fail(res, text);
  return (text ? JSON.parse(text) : null) as T;
}

export async function apiText(path: string): Promise<string> {
  const { res, text } = await request("GET", path);
  if (!res.ok) fail(res, text);
  return text;
}
