import { storage } from "@/src/utils/storage";
const API = `${process.env.EXPO_PUBLIC_BACKEND_URL || ""}/api`;
const TOKEN_KEY = "spendpulse-auth-token";
export type User = { id: string; username: string; phone: string; role?: string };

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = await storage.secureGet(TOKEN_KEY, null);
  const response = await fetch(`${API}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(init.headers || {}) },
  });
  const body = response.status === 204 ? null : await response.json().catch(() => ({}));
  if (!response.ok) {
    const err = new Error(body?.detail || "Something went wrong") as Error & { status?: number; detail?: string };
    err.status = response.status;
    err.detail = body?.detail;
    throw err;
  }
  return body as T;
}

export type SignupInput = { username: string; phone: string; pin: string };
export type SignupResponse = { access_token: string; backup_code: string };

export async function signUp(input: SignupInput) {
  const result = await request<SignupResponse>("/auth/signup", {
    method: "POST",
    body: JSON.stringify({ username: input.username, phone: input.phone, pin: input.pin }),
  });
  await storage.secureSet(TOKEN_KEY, result.access_token);
  const user = await request<User>("/me");
  return { user, backupCode: result.backup_code };
}

export async function signIn(username: string, pin: string) {
  const result = await request<{ access_token: string }>("/auth/login", { method: "POST", body: JSON.stringify({ username, pin }) });
  await storage.secureSet(TOKEN_KEY, result.access_token);
  return request<User>("/me");
}

export async function restoreSession() {
  const token = await storage.secureGet(TOKEN_KEY, null);
  if (!token) return null;
  try { return await request<User>("/me"); } catch { await storage.secureRemove(TOKEN_KEY); return null; }
}

export async function signOut() {
  try { await request("/auth/logout", { method: "POST" }); } finally { await storage.secureRemove(TOKEN_KEY); }
}

export async function changePin(currentPin: string, newPin: string) {
  return request<{ ok: boolean }>("/auth/change-pin", {
    method: "POST",
    body: JSON.stringify({ current_pin: currentPin, new_pin: newPin }),
  });
}

export async function resetPin(username: string, newPin: string, backupCode?: string, phone?: string) {
  return request<{ ok: boolean }>("/auth/reset-pin", {
    method: "POST",
    body: JSON.stringify({ username, new_pin: newPin, ...(backupCode && { backup_code: backupCode }), ...(phone && { phone }) }),
  });
}

export async function authorizedRequest<T>(path: string, init: RequestInit = {}) { return request<T>(path, init); }
