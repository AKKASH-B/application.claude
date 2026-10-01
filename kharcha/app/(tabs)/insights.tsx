import React, { useState } from "react";
import { View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { api } from "../../src/api";
import { useAuth } from "../../src/auth";
import { useLoad } from "../../src/hooks";
import { money, monthLabel, monthShort, prettyDate, shiftMonth, thisMonth, todayISO } from "../../src/format";
import { CHART_COLORS, useTheme } from "../../src/theme";
import type { Summary } from "../../src/types";
import { Card, Empty, ErrorBox, Icon, Loading, MonthSwitcher, Screen, SectionTitle, T } from "../../src/components/ui";
import { Donut, DailyBars } from "../../src/components/charts";

export default function Insights() {
  const t = useTheme();
  const { user } = useAuth();
  const cur = user?.currency ?? "INR";
  const [month, setMonth] = useState(thisMonth());
  const { data: s, error, loading, reload } = useLoad(() => api<Summary>("GET", `/summary?month=${month}&today=${todayISO()}`), [month]);

  const delta = (now: number, before: number, goodWhenUp: boolean) => {
    if (before === 0 && now === 0) return null;
    const diff = now - before;
    const up = diff > 0;
    const good = goodWhenUp ? up : !up;
    return { text: `${up ? "▲" : "▼"} ${money(Math.abs(diff), cur)}`, color: diff === 0 ? t.muted : good ? t.income : t.expense };
  };

  const tips: string[] = [];
  if (s) {
    if (s.changePct !== null && s.spent > 0) tips.push(s.changePct > 0 ? `You spent ${s.changePct}% more than in ${monthShort(s.previous.month)}.` : s.changePct < 0 ? `Nice — you spent ${Math.abs(s.changePct)}% less than in ${monthShort(s.previous.month)}.` : `Spending is the same as ${monthShort(s.previous.month)}.`);
    if (s.categories[0]) tips.push(`${s.categories[0].category} is your biggest category at ${s.categories[0].pct}% of spending.`);
    if (s.received > 0 && s.saved > 0) tips.push(`You saved ${Math.round((s.saved / s.received) * 100)}% of what you received.`);
    if (s.received > 0 && s.spent > s.received) tips.push("You spent more than you received this month.");
  }

  return (
    <SafeAreaView edges={[]} style={{ flex: 1, backgroundColor: t.bg }}>
      <Screen onRefresh={reload} refreshing={loading && !!s}>
        <MonthSwitcher month={month} label={monthLabel(month)} onPrev={() => setMonth(shiftMonth(month, -1))} onNext={() => setMonth(shiftMonth(month, 1))} nextDisabled={month >= thisMonth()} />
        {error && !s ? <ErrorBox message={error} onRetry={reload} /> : null}
        {loading && !s ? <Loading /> : null}
        {s && s.count === 0 ? <Empty icon="bar-chart-2" title="No data for this month" hint="Add a few transactions and your insights will appear here." /> : null}

        {s && s.count > 0 ? (
          <>
            <Card style={{ gap: 14 }}>
              <T weight="700">Where your money went</T>
              {s.categories.length === 0 ? <T muted>No spending recorded this month.</T> : (
                <View style={{ flexDirection: "row", alignItems: "center", gap: 16, flexWrap: "wrap", justifyContent: "center" }}>
                  <Donut data={s.categories.map((c) => ({ label: c.category, value: c.amount }))} centerTop="Spent" centerBottom={money(s.spent, cur, { decimals: false })} />
                  <View style={{ flex: 1, minWidth: 150, gap: 8 }}>
                    {s.categories.slice(0, 7).map((c, i) => (
                      <View key={c.category} style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                        <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }} />
                        <T size={13} style={{ flex: 1 }} numberOfLines={1}>{c.category}</T>
                        <T size={13} weight="600">{money(c.amount, cur, { decimals: false })}</T>
                        <T size={12} muted style={{ width: 34, textAlign: "right" }}>{c.pct}%</T>
                      </View>
                    ))}
                  </View>
                </View>
              )}
            </Card>

            <Card style={{ gap: 10 }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                <T weight="700">Daily spending</T>
                <T size={13} muted>avg {money(s.avgDaily, cur, { decimals: false })}/day</T>
              </View>
              <DailyBars daily={s.daily} highlightDay={s.month === thisMonth() ? Number(s.today.slice(8)) : undefined} />
            </Card>

            <Card style={{ gap: 12 }}>
              <T weight="700">vs {monthLabel(s.previous.month)}</T>
              {([
                ["Spent", s.spent, s.previous.spent, false],
                ["Received", s.received, s.previous.received, true],
                ["Saved", s.saved, s.previous.saved, true],
              ] as const).map(([label, now, before, good]) => {
                const d = delta(now, before, good);
                return (
                  <View key={label} style={{ flexDirection: "row", alignItems: "center" }}>
                    <T style={{ flex: 1 }} muted>{label}</T>
                    <T weight="700" style={{ marginRight: 12 }}>{money(now, cur, { decimals: false })}</T>
                    <T size={13} weight="600" color={d?.color ?? t.muted} style={{ width: 96, textAlign: "right" }}>{d ? d.text : "—"}</T>
                  </View>
                );
              })}
            </Card>

            {s.largest ? (
              <Card style={{ flexDirection: "row", gap: 12, alignItems: "center" }}>
                <Icon name="trending-up" color={t.expense} />
                <View style={{ flex: 1 }}>
                  <T size={13} muted>Biggest expense</T>
                  <T weight="700">{money(s.largest.amount, cur)} · {s.largest.category}</T>
                  <T size={12} muted>{prettyDate(s.largest.date)}{s.largest.note ? ` · ${s.largest.note}` : ""}</T>
                </View>
              </Card>
            ) : null}

            {tips.length > 0 ? (
              <>
                <SectionTitle title="Highlights" />
                <Card style={{ gap: 10 }}>
                  {tips.map((tip) => (
                    <View key={tip} style={{ flexDirection: "row", gap: 10 }}>
                      <Icon name="zap" size={16} color={t.savings} />
                      <T size={14} style={{ flex: 1 }}>{tip}</T>
                    </View>
                  ))}
                </Card>
              </>
            ) : null}
          </>
        ) : null}
      </Screen>
    </SafeAreaView>
  );
}
