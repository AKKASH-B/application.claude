import React, { useState } from "react";
import { Pressable, View } from "react-native";
import { useRouter } from "expo-router";
import { api } from "../src/api";
import { useAuth } from "../src/auth";
import { evalExpr, money, todayISO } from "../src/format";
import { useTheme } from "../src/theme";
import { Button, Card, ErrorBox, Field, Icon, Screen, Segmented, T } from "../src/components/ui";
import { DateField } from "../src/components/DateField";

export default function SplitNew() {
  const t = useTheme();
  const router = useRouter();
  const { user } = useAuth();
  const cur = user?.currency ?? "INR";
  const [title, setTitle] = useState("");
  const [total, setTotal] = useState("");
  const [date, setDate] = useState(todayISO());
  const [mode, setMode] = useState<"equal" | "custom">("equal");
  const [names, setNames] = useState<string[]>([""]);
  const [custom, setCustom] = useState<string[]>([""]);
  const [addToExpenses, setAddToExpenses] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const amount = evalExpr(total) ?? 0;
  const filled = names.map((n, i) => ({ name: n.trim(), i })).filter((x) => x.name);
  const equalShare = filled.length ? Math.round((amount / (filled.length + 1)) * 100) / 100 : 0;

  const setName = (i: number, v: string) => setNames((a) => a.map((x, j) => (j === i ? v : x)));
  const setCust = (i: number, v: string) => setCustom((a) => a.map((x, j) => (j === i ? v : x)));
  const addPerson = () => { setNames((a) => [...a, ""]); setCustom((a) => [...a, ""]); };
  const removePerson = (i: number) => { setNames((a) => (a.length > 1 ? a.filter((_, j) => j !== i) : a)); setCustom((a) => (a.length > 1 ? a.filter((_, j) => j !== i) : a)); };

  const save = async () => {
    if (!title.trim()) return setError("Give the bill a title");
    if (amount <= 0) return setError("Enter the total bill amount");
    if (filled.length === 0) return setError("Add at least one person");
    const members = filled.map((f) => ({ name: f.name, share: mode === "equal" ? equalShare : evalExpr(custom[f.i] || "0") ?? 0 }));
    if (members.some((m) => m.share <= 0)) return setError("Every person needs a share greater than 0");
    setBusy(true);
    setError(null);
    try {
      await api("POST", "/splits", { title: title.trim(), total: amount, date, members, addToExpenses });
      router.back();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save");
      setBusy(false);
    }
  };

  return (
    <Screen>
      {error ? <ErrorBox message={error} /> : null}
      <Field label="What was it for?" value={title} onChangeText={setTitle} placeholder="e.g. Dinner at Meghana's" maxLength={60} />
      <Field label="Total bill (you paid)" value={total} onChangeText={setTotal} keyboardType="decimal-pad" placeholder="e.g. 2400" />
      <DateField value={date} onChange={setDate} />
      <Segmented options={["equal", "custom"] as const} value={mode} onChange={setMode} labels={{ equal: "Split equally", custom: "Custom amounts" }} />
      <Card style={{ gap: 10 }}>
        <T weight="700">Who shared it with you?</T>
        {names.map((n, i) => (
          <View key={i} style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
            <View style={{ flex: 1 }}><Field value={n} onChangeText={(v) => setName(i, v)} placeholder={`Person ${i + 1}`} maxLength={40} /></View>
            {mode === "custom" ? <View style={{ width: 100 }}><Field value={custom[i]} onChangeText={(v) => setCust(i, v)} keyboardType="decimal-pad" placeholder="Share" /></View> : null}
            {names.length > 1 ? <Pressable onPress={() => removePerson(i)} hitSlop={8}><Icon name="x" size={18} color={t.muted} /></Pressable> : null}
          </View>
        ))}
        <Button title="Add another person" variant="ghost" icon="user-plus" onPress={addPerson} />
        {mode === "equal" && filled.length > 0 && amount > 0 ? <T size={13} muted>{filled.length + 1} people · {money(equalShare, cur)} each (including you)</T> : null}
      </Card>
      <Pressable onPress={() => setAddToExpenses((v) => !v)} style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
        <View style={{ width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: t.primary, backgroundColor: addToExpenses ? t.primary : "transparent", alignItems: "center", justifyContent: "center" }}>
          {addToExpenses ? <T size={14} color={t.onPrimary} weight="800">✓</T> : null}
        </View>
        <T style={{ flex: 1 }}>Also record my own share as an expense</T>
      </Pressable>
      <Button title="Save split" onPress={save} loading={busy} />
    </Screen>
  );
}
