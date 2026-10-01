import React from "react";
import { Pressable, View } from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { api } from "../../src/api";
import { useAuth } from "../../src/auth";
import { useLoad } from "../../src/hooks";
import { CATEGORIES, CATEGORY_ICON, money, monthsBetween, prettyDate, todayISO } from "../../src/format";
import { useTheme } from "../../src/theme";
import type { Goal, Summary } from "../../src/types";
import { Button, Card, Empty, ErrorBox, Icon, Loading, ProgressBar, Screen, SectionTitle, T } from "../../src/components/ui";

export default function Plan() {
  const t = useTheme();
  const router = useRouter();
  const { user } = useAuth();
  const cur = user?.currency ?? "INR";

  const { data, error, loading, reload } = useLoad(async () => {
    const [summary, goals] = await Promise.all([api<Summary>("GET", `/summary?today=${todayISO()}`), api<Goal[]>("GET", "/goals")]);
    return { summary, goals };
  });

  const budgetFor = (c: string) => data?.summary.budgets.find((b) => b.category === c);
  const budgeted = CATEGORIES.expense.filter((c) => budgetFor(c));
  const unbudgeted = CATEGORIES.expense.filter((c) => !budgetFor(c));

  const dismissCelebration = async (g: Goal) => {
    await api("POST", `/goals/${g.id}/celebrated`).catch(() => {});
    void reload();
  };

  return (
    <SafeAreaView edges={[]} style={{ flex: 1, backgroundColor: t.bg }}>
      <Screen onRefresh={reload} refreshing={loading && !!data}>
        {error && !data ? <ErrorBox message={error} onRetry={reload} /> : null}
        {loading && !data ? <Loading /> : null}

        {data ? (
          <>
            <SectionTitle title="Monthly budgets" />
            {budgeted.length === 0 ? (
              <Card><Empty icon="sliders" title="No budgets yet" hint="Set a monthly limit for a category and Kharcha will warn you before you overspend." /></Card>
            ) : (
              <Card style={{ gap: 16 }}>
                {budgeted.map((c) => {
                  const b = budgetFor(c)!;
                  const pct = (b.spent / b.limit) * 100;
                  return (
                    <Pressable key={c} onPress={() => router.push({ pathname: "/budget", params: { category: c } })} style={{ gap: 6 }}>
                      <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                        <T weight="600">{c}</T>
                        <T size={13} color={pct > 100 ? t.danger : t.muted}>{money(b.spent, cur, { decimals: false })} / {money(b.limit, cur, { decimals: false })}</T>
                      </View>
                      <ProgressBar pct={pct} over={pct > 100} color={pct >= 80 ? t.warn : t.primary} />
                    </Pressable>
                  );
                })}
              </Card>
            )}
            <Card style={{ gap: 10 }}>
              <T size={13} weight="600" muted>Add a budget</T>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                {unbudgeted.map((c) => (
                  <Pressable key={c} onPress={() => router.push({ pathname: "/budget", params: { category: c } })} style={{ flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 8, paddingHorizontal: 12, borderRadius: 999, backgroundColor: t.input, borderWidth: 1, borderColor: t.border }}>
                    <Icon name={CATEGORY_ICON[c] ?? "circle"} size={14} />
                    <T size={13}>{c}</T>
                  </Pressable>
                ))}
              </View>
            </Card>

            <SectionTitle title="Savings goals" action="+ New goal" onAction={() => router.push("/goal")} />
            {data.goals.length === 0 ? (
              <Card><Empty icon="target" title="Save towards something" hint="Create a goal — a trip, a phone, an emergency fund — and track your progress." action="Create a goal" onAction={() => router.push("/goal")} /></Card>
            ) : (
              data.goals.map((g) => {
                const pct = (g.saved / g.target) * 100;
                const done = g.saved >= g.target;
                const left = Math.max(g.target - g.saved, 0);
                const today = todayISO();
                const nudge = !done && g.targetDate && g.targetDate > today ? Math.ceil(left / monthsBetween(today, g.targetDate)) : null;
                return (
                  <Card key={g.id} onPress={() => router.push({ pathname: "/goal", params: { id: g.id } })} style={{ gap: 8 }}>
                    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                      <T size={16} weight="700">{g.name}</T>
                      <T size={13} weight="700" color={done ? t.income : t.savings}>{done ? "Reached 🎉" : `${Math.round(pct)}%`}</T>
                    </View>
                    <ProgressBar pct={pct} color={done ? t.income : t.savings} />
                    <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                      <T size={13} muted>{money(g.saved, cur, { decimals: false })} of {money(g.target, cur, { decimals: false })}</T>
                      {g.targetDate ? <T size={13} muted>by {prettyDate(g.targetDate)}</T> : null}
                    </View>
                    {nudge ? <T size={13} color={t.primary} weight="600">Save {money(nudge, cur, { decimals: false })}/month to get there on time</T> : null}
                    {done && !g.celebrated ? <Button title="Awesome — dismiss" variant="soft" onPress={() => dismissCelebration(g)} /> : null}
                  </Card>
                );
              })
            )}

            <SectionTitle title="More tools" />
            <Card style={{ paddingVertical: 4 }}>
              {[
                { icon: "repeat", title: "Recurring transactions", hint: "Rent, salary, subscriptions — added automatically", path: "/recurring" },
                { icon: "users", title: "Split bills", hint: "Track who owes you for shared expenses", path: "/splits" },
              ].map((r, i) => (
                <Pressable key={r.path} onPress={() => router.push(r.path as never)} style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 14, borderTopWidth: i ? 1 : 0, borderTopColor: t.border }}>
                  <Icon name={r.icon} color={t.primary} />
                  <View style={{ flex: 1 }}><T weight="600">{r.title}</T><T size={12} muted>{r.hint}</T></View>
                  <Icon name="chevron-right" size={18} color={t.muted} />
                </Pressable>
              ))}
            </Card>
          </>
        ) : null}
      </Screen>
    </SafeAreaView>
  );
}
