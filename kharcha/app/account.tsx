import React, { useState } from "react";
import { useRouter } from "expo-router";
import { api } from "../src/api";
import { useAuth } from "../src/auth";
import { CURRENCY_LIST } from "../src/format";
import { useTheme } from "../src/theme";
import type { User } from "../src/types";
import { Button, Card, Chips, ErrorBox, Field, Screen, T } from "../src/components/ui";

export default function Account() {
  const t = useTheme();
  const router = useRouter();
  const { user, setUser, signOut, adoptToken } = useAuth();
  const [name, setName] = useState(user?.name ?? "");
  const [currency, setCurrency] = useState(user?.currency ?? "INR");
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [delPw, setDelPw] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const run = async (key: string, fn: () => Promise<void>) => {
    setBusy(key); setError(null); setMsg(null);
    try { await fn(); } catch (e) { setError(e instanceof Error ? e.message : "Something went wrong"); }
    finally { setBusy(null); }
  };

  return (
    <Screen>
      {error ? <ErrorBox message={error} /> : null}
      {msg ? <Card style={{ borderColor: t.income }}><T color={t.income} weight="600">{msg}</T></Card> : null}

      <Card style={{ gap: 12 }}>
        <T size={17} weight="700">Profile</T>
        <Field label="Name" value={name} onChangeText={setName} maxLength={60} />
        <T size={13} weight="600" muted>Currency</T>
        <Chips options={CURRENCY_LIST} value={currency} onChange={setCurrency} />
        <Button title="Save profile" loading={busy === "profile"} onPress={() => run("profile", async () => {
          const r = await api<{ user: User }>("PATCH", "/me", { name: name.trim(), currency });
          setUser(r.user); setMsg("Profile updated");
        })} />
      </Card>

      <Card style={{ gap: 12 }}>
        <T size={17} weight="700">Change password</T>
        <Field label="Current password" value={current} onChangeText={setCurrent} secureTextEntry />
        <Field label="New password (8+ characters)" value={next} onChangeText={setNext} secureTextEntry autoComplete="new-password" />
        <Button title="Change password" variant="soft" loading={busy === "pw"} onPress={() => run("pw", async () => {
          const r = await api<{ token: string }>("POST", "/auth/change-password", { currentPassword: current, newPassword: next });
          await adoptToken(r.token); setCurrent(""); setNext(""); setMsg("Password changed. Other devices were signed out.");
        })} />
        <Button title="Sign out of all devices" variant="ghost" loading={busy === "all"} onPress={() => run("all", async () => {
          await api("POST", "/auth/logout-all"); await signOut(); router.replace("/login");
        })} />
      </Card>

      <Card style={{ gap: 12, borderColor: t.danger }}>
        <T size={17} weight="700" color={t.danger}>Delete account</T>
        <T size={13} muted>This permanently deletes your account and every transaction, budget, goal and split. It cannot be undone.</T>
        <Field label="Confirm with your password" value={delPw} onChangeText={setDelPw} secureTextEntry />
        <Button
          title={confirmDelete ? "Tap again to permanently delete" : "Delete my account"}
          variant="danger"
          disabled={!delPw}
          loading={busy === "del"}
          onPress={() => {
            if (!confirmDelete) return setConfirmDelete(true);
            void run("del", async () => {
              await api("DELETE", "/me", { password: delPw });
              await signOut();
              router.replace("/login");
            });
          }}
        />
      </Card>
    </Screen>
  );
}
