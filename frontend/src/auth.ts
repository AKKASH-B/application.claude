import { storage } from "@/src/utils/storage";

const API = `${process.env.EXPO_PUBLIC_BACKEND_URL || ""}/api`;
const TOKEN_KEY = "spendpulse-auth-token";

export type User = { id: string; username: string; phone: string; email: string; role?: string; email_verified?: boolean };

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

export type SignupInput = { username: string; phone: string; email: string; password: string; confirmPassword: string };

export async function signUp(input: SignupInput) {
  return request<{ ok: boolean; username: string; email: string; message: string }>("/auth/signup", {
    method: "POST",
    body: JSON.stringify({ username: input.username, phone: input.phone, email: input.email, password: input.password, confirm_password: input.confirmPassword }),
  });
}

export async function verifyEmail(username: string, code: string) {
  const result = await request<{ access_token: string }>("/auth/verify-email", { method: "POST", body: JSON.stringify({ username, code }) });
  await storage.secureSet(TOKEN_KEY, result.access_token);
  return request<User>("/me");
}

export async function resendVerification(username: string) {
  return request<{ ok: boolean; message: string }>("/auth/resend-verification", { method: "POST", body: JSON.stringify({ username }) });
}

export async function signIn(username: string, password: string) {
  const result = await request<{ access_token: string }>("/auth/login", { method: "POST", body: JSON.stringify({ username, password }) });
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

export async function forgotPassword(username: string) {
  return request<{ ok: boolean; message: string }>("/auth/forgot-password", { method: "POST", body: JSON.stringify({ username }) });
}

export async function resetPassword(username: string, code: string, newPassword: string) {
  const result = await request<{ access_token: string }>("/auth/reset-password", { method: "POST", body: JSON.stringify({ username, code, new_password: newPassword }) });
  await storage.secureSet(TOKEN_KEY, result.access_token);
  return request<User>("/me");
}

export async function authorizedRequest<T>(path: string, init: RequestInit = {}) { return request<T>(path, init); }
