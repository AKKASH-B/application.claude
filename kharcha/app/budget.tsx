import React, { useEffect, useState } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { api } from "../src/api";
import { useAuth } from "../src/auth";
import { evalExpr, money } from "../src/format";
import type { Budget } from "../src/types";
import { Button, ErrorBox, Field, Screen, T } from "../src/components/ui";

export default function BudgetScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { category = "Other" } = useLocalSearchParams<{ category: string }>();
  const [limit, setLimit] = useState("");
  const [existing, setExisting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<Budget[]>("GET", "/budgets").then((list) => {
      const b = list.find((x) => x.category === category);
      if (b) { setLimit(String(b.limit)); setExisting(true); }
    }).catch(() => {});
  }, [category]);

  const value = evalExpr(limit);

  const save = async () => {
    if (!value || value <= 0) return setError("Enter a monthly limit greater than 0");
    setBusy(true);
    try {
      await api("PUT", "/budgets", { category, limit: value });
      router.back();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save");
      setBusy(false);
    }
  };
  const remove = async () => {
    setBusy(true);
    try {
      await api("DELETE", `/budgets/${encodeURIComponent(category)}`);
      router.back();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not remove");
      setBusy(false);
    }
  };

  return (
    <Screen>
      <T size={20} weight="800">{category} budget</T>
      <T muted>The most you want to spend on {category} each month.</T>
      {error ? <ErrorBox message={error} /> : null}
      <Field label="Monthly limit" value={limit} onChangeText={setLimit} keyboardType="numbers-and-punctuation" placeholder="e.g. 5000" autoFocus />
      {value ? <T size={13} muted>{money(value, user?.currency ?? "INR")} per month</T> : null}
      <Button title="Save budget" onPress={save} loading={busy} />
      {existing ? <Button title="Remove budget" variant="ghost" onPress={remove} disabled={busy} /> : null}
    </Screen>
  );
}
