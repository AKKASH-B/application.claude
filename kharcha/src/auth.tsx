import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { api, setOnUnauthorized, setToken } from "./api";
import { storage } from "./storage";
import type { User } from "./types";

const TOKEN_KEY = "kharcha.token";

interface AuthState {
  user: User | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (name: string, email: string, password: string, currency: string) => Promise<string>;
  resetPassword: (email: string, recoveryKey: string, newPassword: string) => Promise<string>;
  signOut: () => Promise<void>;
  setUser: (u: User) => void;
  adoptToken: (token: string) => Promise<void>;
}

const Ctx = createContext<AuthState | null>(null);
export const useAuth = () => {
  const c = useContext(Ctx);
  if (!c) throw new Error("useAuth outside provider");
  return c;
};

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUserState] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const clear = useCallback(async () => {
    setToken(null);
    await storage.del(TOKEN_KEY);
    setUserState(null);
  }, []);

  useEffect(() => {
    setOnUnauthorized(() => {
      void clear();
    });
    (async () => {
      const t = await storage.get(TOKEN_KEY);
      if (t) {
        setToken(t);
        try {
          const r = await api<{ user: User }>("GET", "/me");
          setUserState(r.user);
        } catch (e) {
          // Only drop the session when the server says it's invalid, not when offline.
          if ((e as { status?: number }).status === 401) await clear();
          else {
            // Offline start: keep the token, let screens show their own errors.
            setUserState({ id: "", name: "", email: "", currency: "INR", createdAt: "" });
          }
        }
      }
      setLoading(false);
    })();
    return () => setOnUnauthorized(null);
  }, [clear]);

  const finish = async (token: string, u: User) => {
    setToken(token);
    await storage.set(TOKEN_KEY, token);
    setUserState(u);
  };

  const value = useMemo<AuthState>(
    () => ({
      user,
      loading,
      signIn: async (email, password) => {
        const r = await api<{ token: string; user: User }>("POST", "/auth/login", { email, password });
        await finish(r.token, r.user);
      },
      signUp: async (name, email, password, currency) => {
        const r = await api<{ token: string; user: User; recoveryKey: string }>("POST", "/auth/signup", { name, email, password, currency });
        await finish(r.token, r.user);
        return r.recoveryKey;
      },
      resetPassword: async (email, recoveryKey, newPassword) => {
        const r = await api<{ token: string; user: User; recoveryKey: string }>("POST", "/auth/reset", { email, recoveryKey, newPassword });
        await finish(r.token, r.user);
        return r.recoveryKey;
      },
      signOut: clear,
      setUser: setUserState,
      adoptToken: async (t) => {
        setToken(t);
        await storage.set(TOKEN_KEY, t);
      },
    }),
    [user, loading, clear],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
