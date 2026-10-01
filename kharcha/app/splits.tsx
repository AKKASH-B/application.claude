import React from "react";
import { View } from "react-native";
import { useRouter } from "expo-router";
import { api } from "../src/api";
import { useAuth } from "../src/auth";
import { useLoad } from "../src/hooks";
import { money, prettyDate } from "../src/format";
import { useTheme } from "../src/theme";
import type { Split } from "../src/types";
import { Button, Card, Empty, ErrorBox, Loading, Screen, T } from "../src/components/ui";

export const owedTo = (s: Split) => s.members.filter((m) => !m.paid).reduce((a, m) => a + m.share, 0);

export default function Splits() {
  const t = useTheme();
  const router = useRouter();
  const { user } = useAuth();
  const cur = user?.currency ?? "INR";
  const { data, error, loading, reload } = useLoad(() => api<Split[]>("GET", "/splits"));
  const totalOwed = (data ?? []).reduce((a, s) => a + owedTo(s), 0);

  return (
    <Screen onRefresh={reload}>
      {error && !data ? <ErrorBox message={error} onRetry={reload} /> : null}
      {loading && !data ? <Loading /> : null}
      {data ? (
        <Card style={{ gap: 2 }}>
          <T size={13} muted>Friends still owe you</T>
          <T size={28} weight="800" color={totalOwed > 0 ? t.savings : t.income}>{money(totalOwed, cur)}</T>
        </Card>
      ) : null}
      <Button title="Split a new bill" icon="plus" onPress={() => router.push("/split-new")} />
      {data && data.length === 0 ? <Empty icon="users" title="No split bills yet" hint="Split a dinner or a trip and tick people off as they pay you back." /> : null}
      {data?.map((s) => {
        const owed = owedTo(s);
        return (
          <Card key={s.id} onPress={() => router.push({ pathname: "/split", params: { id: s.id } })} style={{ gap: 4 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
              <T size={16} weight="700">{s.title}</T>
              <T weight="700">{money(s.total, cur)}</T>
            </View>
            <T size={13} muted>{prettyDate(s.date)} · {s.members.length + 1} people</T>
            <T size={13} weight="600" color={owed > 0 ? t.savings : t.income}>{owed > 0 ? `${money(owed, cur)} still to collect` : "Everyone has paid ✓"}</T>
          </Card>
        );
      })}
    </Screen>
  );
}
