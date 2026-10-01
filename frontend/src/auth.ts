import { storage } from "@/src/utils/storage";
const API = `${process.env.EXPO_PUBLIC_BACKEND_URL || ""}/api`;
const TOKEN_KEY = "spendpulse-auth-token";
export type User = { id: string; username: string; phone?: string; email?: string; role?: string };

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

export type SignupInput = { username: string; email: string; pin: string };

export async function signUp(input: SignupInput) {
  const result = await request<{ access_token: string }>("/auth/signup", {
    method: "POST",
    body: JSON.stringify({ username: input.username, email: input.email, pin: input.pin }),
  });
  await storage.secureSet(TOKEN_KEY, result.access_token);
  const user = await request<User>("/me");
  return { user };
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

export async function requestOtp(email: string) {
  return request<{ ok: boolean; message?: string }>("/auth/request-otp", {
    method: "POST",
    body: JSON.stringify({ email }),
  });
}

export async function resetPin(email: string, otp: string, newPin: string) {
  return request<{ ok: boolean }>("/auth/reset-pin", {
    method: "POST",
    body: JSON.stringify({ email, otp, new_pin: newPin }),
  });
}

export async function deleteAccount(currentPin: string) {
  const result = await request<{ ok: boolean }>("/me/delete", {
    method: "POST",
    body: JSON.stringify({ current_pin: currentPin }),
  });
  await storage.secureRemove(TOKEN_KEY);
  return result;
}

export async function setRecoveryEmail(email: string, currentPin: string) {
  return request<{ ok: boolean; message?: string }>("/auth/set-email", {
    method: "POST",
    body: JSON.stringify({ email, current_pin: currentPin }),
  });
}

export async function verifyRecoveryEmail(email: string, otp: string) {
  return request<{ ok: boolean; email: string }>("/auth/verify-email", {
    method: "POST",
    body: JSON.stringify({ email, otp }),
  });
}

export async function authorizedRequest<T>(path: string, init: RequestInit = {}) { return request<T>(path, init); }
