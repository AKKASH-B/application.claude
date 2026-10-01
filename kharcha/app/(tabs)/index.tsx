import React, { useEffect, useState } from "react";
import { Pressable, View } from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { api } from "../../src/api";
import { useAuth } from "../../src/auth";
import { useLoad } from "../../src/hooks";
import { money, prettyDate, todayISO } from "../../src/format";
import { useTheme } from "../../src/theme";
import type { Summary, Tx } from "../../src/types";
import { Card, Empty, ErrorBox, Icon, Loading, ProgressBar, Screen, SectionTitle, T } from "../../src/components/ui";
import { TxRow } from "../../src/components/TxRow";
import { Fab } from "../../src/components/Fab";

export default function Home() {
  const t = useTheme();
  const router = useRouter();
  const { user } = useAuth();
  const cur = user?.currency ?? "INR";
  const [hidden, setHidden] = useState(false);

  const { data, error, loading, reload } = useLoad(async () => {
    const today = todayISO();
    const [summary, recent] = await Promise.all([
      api<Summary>("GET", `/summary?today=${today}`),
      api<Tx[]>("GET", "/transactions?limit=6"),
    ]);
    return { summary, recent };
  });

  // Turn due recurring rules into real transactions once per app open.
  useEffect(() => {
    api<{ created: number }>("POST", "/recurring/sync", { today: todayISO() })
      .then((r) => { if (r.created > 0) void reload(); })
      .catch(() => {});
  }, [reload]);

  const s = data?.summary;
  const mask = (n: number, opts?: { sign?: boolean }) => (hidden ? "••••" : money(n, cur, opts));
  const warnings = (s?.budgets ?? []).filter((b) => b.spent >= b.limit * 0.8).sort((a, b) => b.spent / b.limit - a.spent / a.limit);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.bg }} edges={["top"]}>
      <Screen onRefresh={reload} refreshing={loading && !!data} padBottom={100}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
          <View>
            <T size={22} weight="800">Hi{user?.name ? `, ${user.name.split(" ")[0]}` : ""} 👋</T>
            <T size={13} muted>{prettyDate(todayISO())}</T>
          </View>
          <Pressable onPress={() => setHidden((h) => !h)} hitSlop={12} accessibilityLabel="Hide or show amounts" style={{ padding: 8 }}>
            <Icon name={hidden ? "eye-off" : "eye"} />
          </Pressable>
        </View>

        {error && !data ? <ErrorBox message={error} onRetry={reload} /> : null}
        {loading && !data ? <Loading /> : null}

        {s ? (
          <>
            <Card style={{ backgroundColor: t.primary, borderColor: t.primary, gap: 14 }}>
              <View>
                <T size={13} color={t.onPrimary} style={{ opacity: 0.8 }}>Available balance</T>
                <T size={34} weight="800" color={t.onPrimary} style={{ marginTop: 2 }}>{mask(s.balance)}</T>
              </View>
              <View style={{ flexDirection: "row", gap: 8 }}>
                {[
                  { label: "Spent", value: s.spent },
                  { label: "Received", value: s.received },
                  { label: "Saved", value: s.saved },
                ].map((m) => (
                  <View key={m.label} style={{ flex: 1, backgroundColor: "rgba(255,255,255,0.14)", borderRadius: 12, padding: 10 }}>
                    <T size={11} color={t.onPrimary} style={{ opacity: 0.8 }}>{m.label} · this month</T>
                    <T size={16} weight="700" color={t.onPrimary}>{mask(m.value)}</T>
                  </View>
                ))}
              </View>
            </Card>

            {s.balance < 0 ? (
              <Card style={{ borderColor: t.warn }}>
                <T weight="700" color={t.warn}>You're overspent</T>
                <T size={13} muted>Spending and savings are {money(Math.abs(s.balance), cur)} more than what you've recorded as received.</T>
              </Card>
            ) : null}

            {s.safeToSpend ? (
              <Card style={{ gap: 6 }}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                  <T weight="700">Safe to spend today</T>
                  <Icon name="shield" size={18} color={t.primary} />
                </View>
                <T size={28} weight="800" color={s.safeToSpend.perDay > 0 ? t.primary : t.danger}>{mask(s.safeToSpend.perDay)}</T>
                <T size={13} muted>
                  {s.safeToSpend.remaining > 0
                    ? `${money(s.safeToSpend.remaining, cur)} left of your ${s.safeToSpend.basis === "budget" ? "budgets" : "income"} for ${s.safeToSpend.daysLeft} more day${s.safeToSpend.daysLeft === 1 ? "" : "s"}`
                    : s.safeToSpend.basis === "budget" ? "You've used up this month's budgets." : "You've spent everything you received this month."}
                </T>
              </Card>
            ) : null}

            <View style={{ flexDirection: "row", gap: 10 }}>
              <Card style={{ flex: 1, gap: 2 }}>
                <T size={12} muted>Projected month spend</T>
                <T size={18} weight="700">{mask(s.projected)}</T>
                <T size={12} muted>avg {mask(s.avgDaily)}/day</T>
              </Card>
              <Card style={{ flex: 1, gap: 2 }}>
                <T size={12} muted>No-spend streak</T>
                <T size={18} weight="700">{s.noSpendStreak} day{s.noSpendStreak === 1 ? "" : "s"} 🔥</T>
                <T size={12} muted>{s.noSpendStreak > 0 ? "Keep it going" : "Spent something today"}</T>
              </Card>
            </View>

            {warnings.length > 0 ? (
              <Card style={{ gap: 10 }}>
                <T weight="700">Budget check</T>
                {warnings.slice(0, 3).map((b) => (
                  <View key={b.category} style={{ gap: 4 }}>
                    <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                      <T size={14}>{b.category}</T>
                      <T size={13} color={b.spent > b.limit ? t.danger : t.warn} weight="600">
                        {b.spent > b.limit ? `Over by ${money(b.spent - b.limit, cur)}` : `${Math.round((b.spent / b.limit) * 100)}% used`}
                      </T>
                    </View>
                    <ProgressBar pct={(b.spent / b.limit) * 100} over={b.spent > b.limit} color={t.warn} />
                  </View>
                ))}
              </Card>
            ) : null}
          </>
        ) : null}

        {data ? (
          <>
            <SectionTitle title="Recent activity" action="See all" onAction={() => router.push("/(tabs)/activity")} />
            <Card style={{ paddingVertical: 6 }}>
              {data.recent.length === 0 ? (
                <Empty icon="plus-circle" title="No transactions yet" hint="Tap + to add your first expense or income." />
              ) : (
                data.recent.map((tx) => (
                  <View key={tx.id}>
                    <TxRow tx={tx} currency={cur} onPress={() => router.push({ pathname: "/tx", params: { id: tx.id } })} />
                    <T size={11} muted style={{ marginTop: -6, marginLeft: 54, marginBottom: 4 }}>{prettyDate(tx.date)}</T>
                  </View>
                ))
              )}
            </Card>
          </>
        ) : null}
      </Screen>
      <Fab />
    </SafeAreaView>
  );
}
