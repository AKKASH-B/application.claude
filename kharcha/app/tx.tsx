import React, { useEffect, useMemo, useState } from "react";
import { Pressable, TextInput, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { api } from "../src/api";
import { useAuth } from "../src/auth";
import { CATEGORIES, TYPE_LABEL, evalExpr, money, todayISO } from "../src/format";
import { radius, useTheme } from "../src/theme";
import type { Goal, Tx, TxType } from "../src/types";
import { Button, Card, Chips, ErrorBox, Field, Loading, Screen, Segmented, T } from "../src/components/ui";
import { DateField } from "../src/components/DateField";

const OPS = ["+", "−", "×", "÷", "(", ")"];

export default function TxScreen() {
  const t = useTheme();
  const router = useRouter();
  const { user } = useAuth();
  const cur = user?.currency ?? "INR";
  const params = useLocalSearchParams<{ id?: string; date?: string; type?: string; goalId?: string }>();
  const editingId = params.id;

  const [type, setType] = useState<TxType>((params.type as TxType) || "expense");
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState("Food");
  const [note, setNote] = useState("");
  const [date, setDate] = useState(params.date || todayISO());
  const [goalId, setGoalId] = useState<string | null>(params.goalId ?? null);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [loading, setLoading] = useState(!!editingId);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    api<Goal[]>("GET", "/goals").then(setGoals).catch(() => {});
    if (!editingId) return;
    api<Tx>("GET", `/transactions/${editingId}`)
      .then((x) => {
        setType(x.type); setAmount(String(x.amount)); setCategory(x.category); setNote(x.note); setDate(x.date); setGoalId(x.goalId ?? null);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [editingId]);

  const result = useMemo(() => evalExpr(amount), [amount]);
  const isExpression = /[+\-×÷*/x()]/i.test(amount.replace(/^-/, ""));
  const cats = CATEGORIES[type];

  const changeType = (v: TxType) => {
    setType(v);
    if (!CATEGORIES[v].includes(category)) setCategory(CATEGORIES[v][0]);
    if (v !== "savings") setGoalId(null);
  };

  const save = async () => {
    if (!result || result <= 0) return setError("Enter an amount greater than 0");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return setError("Enter the date as YYYY-MM-DD");
    setBusy(true);
    setError(null);
    try {
      const body = { type, amount: result, category, note: note.trim(), date, goalId: type === "savings" ? goalId : null };
      if (editingId) await api("PUT", `/transactions/${editingId}`, body);
      else await api("POST", "/transactions", body);
      router.back();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save");
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!confirmDelete) return setConfirmDelete(true);
    setBusy(true);
    try {
      await api("DELETE", `/transactions/${editingId}`);
      router.back();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not delete");
      setBusy(false);
    }
  };

  if (loading) return <Loading />;
  const color = type === "expense" ? t.expense : type === "income" ? t.income : t.savings;

  return (
    <Screen>
      {error ? <ErrorBox message={error} /> : null}
      <Segmented
        options={["expense", "income", "savings"] as TxType[]}
        value={type}
        onChange={changeType}
        labels={TYPE_LABEL}
        colors={{ expense: t.expense, income: t.income, savings: t.savings }}
      />
      <Card style={{ gap: 8 }}>
        <T size={13} weight="600" muted>Amount</T>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <T size={30} weight="800" color={color}>{money(0, cur).replace("0", "")}</T>
          <TextInput
            testID="tx-amount"
            value={amount}
            onChangeText={setAmount}
            placeholder="0"
            placeholderTextColor={t.muted}
            keyboardType="numbers-and-punctuation"
            autoFocus={!editingId}
            style={{ flex: 1, fontSize: 34, fontWeight: "800", color: t.text, paddingVertical: 4 }}
          />
        </View>
        <View style={{ flexDirection: "row", gap: 6, flexWrap: "wrap" }}>
          {OPS.map((op) => (
            <Pressable key={op} onPress={() => setAmount((a) => a + (op === "−" ? "-" : op))} style={{ paddingVertical: 8, paddingHorizontal: 14, borderRadius: radius.sm, backgroundColor: t.input, borderWidth: 1, borderColor: t.border }}>
              <T weight="700">{op}</T>
            </Pressable>
          ))}
          <Pressable onPress={() => setAmount((a) => a.slice(0, -1))} style={{ paddingVertical: 8, paddingHorizontal: 14, borderRadius: radius.sm, backgroundColor: t.input, borderWidth: 1, borderColor: t.border }}>
            <T weight="700">⌫</T>
          </Pressable>
        </View>
        {isExpression ? (
          <T size={14} muted>= <T weight="700" color={result === null ? t.danger : t.text}>{result === null ? "incomplete" : money(result, cur)}</T></T>
        ) : (
          <T size={12} muted>Tip: you can type sums like 120+45×2</T>
        )}
      </Card>

      <T size={13} weight="600" muted>Category</T>
      <Chips options={cats} value={category} onChange={setCategory} />

      {type === "savings" && goals.length > 0 ? (
        <>
          <T size={13} weight="600" muted>Savings goal (optional)</T>
          <Chips
            options={["none", ...goals.map((g) => g.id)]}
            value={goalId ?? "none"}
            onChange={(v) => setGoalId(v === "none" ? null : v)}
            labels={{ none: "General", ...Object.fromEntries(goals.map((g) => [g.id, g.name])) }}
          />
        </>
      ) : null}

      <Field label="Note (optional)" value={note} onChangeText={setNote} placeholder="e.g. Lunch with team" maxLength={200} />
      <DateField value={date} onChange={setDate} />

      <Button title={editingId ? "Save changes" : "Add transaction"} onPress={save} loading={busy} testID="tx-save" />
      {editingId ? <Button title={confirmDelete ? "Tap again to delete for good" : "Delete"} variant={confirmDelete ? "danger" : "ghost"} onPress={remove} disabled={busy} /> : null}
    </Screen>
  );
}
