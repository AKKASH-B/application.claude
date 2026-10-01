import React, { useState } from "react";
import { Pressable, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { api } from "../src/api";
import { useAuth } from "../src/auth";
import { useLoad } from "../src/hooks";
import { money, prettyDate } from "../src/format";
import { useTheme } from "../src/theme";
import type { Split } from "../src/types";
import { Button, Card, ErrorBox, Loading, Screen, T } from "../src/components/ui";

export default function SplitDetail() {
  const t = useTheme();
  const router = useRouter();
  const { user } = useAuth();
  const cur = user?.currency ?? "INR";
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data, error, loading, reload } = useLoad(async () => (await api<Split[]>("GET", "/splits")).find((s) => s.id === id) ?? null, [id]);
  const [confirm, setConfirm] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const toggle = async (memberId: string, paid: boolean) => {
    try { await api("PUT", `/splits/${id}/members/${memberId}`, { paid }); await reload(); }
    catch (e) { setErr(e instanceof Error ? e.message : "Could not update"); }
  };
  const remove = async () => {
    if (!confirm) return setConfirm(true);
    try { await api("DELETE", `/splits/${id}`); router.back(); }
    catch (e) { setErr(e instanceof Error ? e.message : "Could not delete"); }
  };

  if (loading && !data) return <Loading />;
  if (error) return <Screen><ErrorBox message={error} onRetry={reload} /></Screen>;
  if (!data) return <Screen><T muted>This split no longer exists.</T></Screen>;

  return (
    <Screen>
      {err ? <ErrorBox message={err} /> : null}
      <Card style={{ gap: 4 }}>
        <T size={20} weight="800">{data.title}</T>
        <T size={13} muted>{prettyDate(data.date)}</T>
        <T size={13} muted>Total {money(data.total, cur)} · your share {money(data.myShare, cur)}</T>
      </Card>
      <T size={13} weight="700" muted>Tap a person when they've paid you back</T>
      <Card style={{ paddingVertical: 4 }}>
        {data.members.map((m, i) => (
          <Pressable key={m.id} onPress={() => toggle(m.id, !m.paid)} style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 14, borderTopWidth: i ? 1 : 0, borderTopColor: t.border }}>
            <View style={{ width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: m.paid ? t.income : t.border, backgroundColor: m.paid ? t.income : "transparent", alignItems: "center", justifyContent: "center" }}>
              {m.paid ? <T size={14} color="#fff" weight="800">✓</T> : null}
            </View>
            <T style={{ flex: 1 }} weight="600">{m.name}</T>
            <T weight="700" color={m.paid ? t.income : t.savings}>{money(m.share, cur)}</T>
          </Pressable>
        ))}
      </Card>
      <Button title={confirm ? "Tap again to delete (also removes your share expense)" : "Delete split"} variant={confirm ? "danger" : "ghost"} onPress={remove} />
    </Screen>
  );
}
