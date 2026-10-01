import React, { useEffect, useState } from "react";
import { Pressable, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { api } from "../src/api";
import { useAuth } from "../src/auth";
import { addMonthsISO, evalExpr, money, todayISO } from "../src/format";
import { useTheme } from "../src/theme";
import type { Goal } from "../src/types";
import { Button, Card, ErrorBox, Field, ProgressBar, Screen, T } from "../src/components/ui";
import { DateField } from "../src/components/DateField";

export default function GoalScreen() {
  const t = useTheme();
  const router = useRouter();
  const { user } = useAuth();
  const cur = user?.currency ?? "INR";
  const { id } = useLocalSearchParams<{ id?: string }>();
  const [name, setName] = useState("");
  const [target, setTarget] = useState("");
  const [useDate, setUseDate] = useState(false);
  const [date, setDate] = useState(addMonthsISO(todayISO(), 6));
  const [goal, setGoal] = useState<Goal | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (!id) return;
    api<Goal[]>("GET", "/goals").then((list) => {
      const g = list.find((x) => x.id === id);
      if (!g) return;
      setGoal(g); setName(g.name); setTarget(String(g.target));
      if (g.targetDate) { setUseDate(true); setDate(g.targetDate); }
    }).catch((e) => setError(e.message));
  }, [id]);

  const save = async () => {
    const amt = evalExpr(target);
    if (!name.trim()) return setError("Give your goal a name");
    if (!amt || amt <= 0) return setError("Enter a target amount greater than 0");
    if (useDate && !/^\d{4}-\d{2}-\d{2}$/.test(date)) return setError("Enter the date as YYYY-MM-DD");
    setBusy(true);
    try {
      const body = { name: name.trim(), target: amt, targetDate: useDate ? date : null };
      if (id) await api("PUT", `/goals/${id}`, body);
      else await api("POST", "/goals", body);
      router.back();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save");
      setBusy(false);
    }
  };
  const remove = async () => {
    if (!confirmDelete) return setConfirmDelete(true);
    setBusy(true);
    try { await api("DELETE", `/goals/${id}`); router.back(); }
    catch (e) { setError(e instanceof Error ? e.message : "Could not delete"); setBusy(false); }
  };

  return (
    <Screen>
      {error ? <ErrorBox message={error} /> : null}
      {goal ? (
        <Card style={{ gap: 8 }}>
          <T size={13} muted>Saved so far</T>
          <T size={26} weight="800" color={t.savings}>{money(goal.saved, cur)}</T>
          <ProgressBar pct={(goal.saved / goal.target) * 100} color={t.savings} />
          <Button title="Add savings to this goal" variant="soft" icon="plus" onPress={() => router.push({ pathname: "/tx", params: { type: "savings", goalId: goal.id } })} />
        </Card>
      ) : null}
      <Field label="Goal name" value={name} onChangeText={setName} placeholder="e.g. Goa trip" maxLength={40} />
      <Field label="Target amount" value={target} onChangeText={setTarget} keyboardType="numbers-and-punctuation" placeholder="e.g. 50000" />
      <Pressable onPress={() => setUseDate((v) => !v)} style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
        <View style={{ width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: t.primary, backgroundColor: useDate ? t.primary : "transparent", alignItems: "center", justifyContent: "center" }}>
          {useDate ? <T size={14} color={t.onPrimary} weight="800">✓</T> : null}
        </View>
        <T>Set a target date</T>
      </Pressable>
      {useDate ? <DateField label="Target date" value={date} onChange={setDate} /> : null}
      <Button title={id ? "Save goal" : "Create goal"} onPress={save} loading={busy} />
      {id ? <Button title={confirmDelete ? "Tap again to delete this goal" : "Delete goal"} variant={confirmDelete ? "danger" : "ghost"} onPress={remove} disabled={busy} /> : null}
    </Screen>
  );
}
