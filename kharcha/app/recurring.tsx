import React, { useState } from "react";
import { View } from "react-native";
import { api } from "../src/api";
import { useAuth } from "../src/auth";
import { useLoad } from "../src/hooks";
import { CATEGORIES, TYPE_LABEL, evalExpr, money, thisMonth } from "../src/format";
import { useTheme } from "../src/theme";
import type { Recurring, TxType } from "../src/types";
import { Button, Card, Chips, Empty, ErrorBox, Field, Icon, Loading, Screen, Segmented, T } from "../src/components/ui";

export default function RecurringScreen() {
  const t = useTheme();
  const { user } = useAuth();
  const cur = user?.currency ?? "INR";
  const { data, error, loading, reload } = useLoad(() => api<Recurring[]>("GET", "/recurring"));
  const [adding, setAdding] = useState(false);
  const [type, setType] = useState<TxType>("expense");
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState("Bills");
  const [note, setNote] = useState("");
  const [day, setDay] = useState("1");
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<string | null>(null);

  const add = async () => {
    const amt = evalExpr(amount);
    const d = parseInt(day, 10);
    if (!amt || amt <= 0) return setFormError("Enter an amount greater than 0");
    if (!d || d < 1 || d > 31) return setFormError("Day of month must be 1–31");
    setBusy(true);
    setFormError(null);
    try {
      await api("POST", "/recurring", { type, amount: amt, category, note: note.trim(), dayOfMonth: d, startMonth: thisMonth() });
      await api("POST", "/recurring/sync", { today: new Date().toISOString().slice(0, 10) }).catch(() => {});
      setAdding(false); setAmount(""); setNote("");
      await reload();
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "Could not save");
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: string) => {
    if (confirm !== id) return setConfirm(id);
    await api("DELETE", `/recurring/${id}`).catch(() => {});
    setConfirm(null);
    void reload();
  };

  return (
    <Screen onRefresh={reload}>
      <T muted>These are added to your activity automatically on the chosen day each month, starting this month.</T>
      {error && !data ? <ErrorBox message={error} onRetry={reload} /> : null}
      {loading && !data ? <Loading /> : null}
      {data && data.length === 0 && !adding ? <Empty icon="repeat" title="Nothing recurring yet" hint="Add rent, salary, subscriptions or SIPs once and forget about them." /> : null}
      {data?.map((r) => (
        <Card key={r.id} style={{ gap: 8 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <Icon name="repeat" color={t.primary} />
            <View style={{ flex: 1 }}>
              <T weight="700">{r.category}{r.note ? ` · ${r.note}` : ""}</T>
              <T size={13} muted>{TYPE_LABEL[r.type]} on day {r.dayOfMonth} of every month</T>
            </View>
            <T weight="700" color={r.type === "expense" ? t.expense : r.type === "income" ? t.income : t.savings}>{money(r.amount, cur)}</T>
          </View>
          <Button title={confirm === r.id ? "Tap again to stop this" : "Stop"} variant={confirm === r.id ? "danger" : "ghost"} onPress={() => remove(r.id)} />
        </Card>
      ))}

      {adding ? (
        <Card style={{ gap: 12 }}>
          <T size={17} weight="700">New recurring item</T>
          {formError ? <ErrorBox message={formError} /> : null}
          <Segmented options={["expense", "income", "savings"] as TxType[]} value={type} onChange={(v) => { setType(v); setCategory(CATEGORIES[v][0]); }} labels={TYPE_LABEL} colors={{ expense: t.expense, income: t.income, savings: t.savings }} />
          <Field label="Amount" value={amount} onChangeText={setAmount} keyboardType="numbers-and-punctuation" placeholder="e.g. 15000" />
          <T size={13} weight="600" muted>Category</T>
          <Chips options={CATEGORIES[type]} value={category} onChange={setCategory} />
          <Field label="Note (optional)" value={note} onChangeText={setNote} placeholder="e.g. House rent" maxLength={200} />
          <Field label="Day of month" value={day} onChangeText={setDay} keyboardType="number-pad" maxLength={2} />
          <Button title="Save" onPress={add} loading={busy} />
          <Button title="Cancel" variant="ghost" onPress={() => setAdding(false)} />
        </Card>
      ) : (
        <Button title="Add recurring item" icon="plus" onPress={() => setAdding(true)} />
      )}
    </Screen>
  );
}
