import React, { useEffect, useMemo, useState } from "react";
import { Pressable, View } from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { api } from "../../src/api";
import { useAuth } from "../../src/auth";
import { useLoad } from "../../src/hooks";
import { compact, daysInMonth, money, monthLabel, pad, prettyDate, shiftMonth, thisMonth, TYPE_LABEL } from "../../src/format";
import { useTheme } from "../../src/theme";
import type { Tx } from "../../src/types";
import { Card, Chips, Empty, ErrorBox, Field, Loading, MonthSwitcher, Screen, Segmented, T } from "../../src/components/ui";
import { TxRow } from "../../src/components/TxRow";
import { Fab } from "../../src/components/Fab";

type Filter = "all" | "expense" | "income" | "savings";

export default function Activity() {
  const t = useTheme();
  const router = useRouter();
  const { user } = useAuth();
  const cur = user?.currency ?? "INR";
  const [month, setMonth] = useState(thisMonth());
  const [filter, setFilter] = useState<Filter>("all");
  const [view, setView] = useState<"list" | "calendar">("list");
  const [q, setQ] = useState("");
  const [qs, setQs] = useState("");
  const [day, setDay] = useState<string | null>(null);

  useEffect(() => { const h = setTimeout(() => setQs(q.trim()), 350); return () => clearTimeout(h); }, [q]);
  useEffect(() => setDay(null), [month]);

  const { data, error, loading, reload } = useLoad(
    () => api<Tx[]>("GET", `/transactions?month=${month}&limit=1000${filter !== "all" ? `&type=${filter}` : ""}${qs ? `&q=${encodeURIComponent(qs)}` : ""}`),
    [month, filter, qs],
  );

  const shown = useMemo(() => (day ? (data ?? []).filter((x) => x.date === day) : data ?? []), [data, day]);
  const groups = useMemo(() => {
    const m = new Map<string, Tx[]>();
    for (const x of shown) m.set(x.date, [...(m.get(x.date) ?? []), x]);
    return [...m.entries()];
  }, [shown]);

  const perDay = useMemo(() => {
    const m = new Map<string, number>();
    for (const x of data ?? []) if (x.type === "expense") m.set(x.date, (m.get(x.date) ?? 0) + x.amount);
    return m;
  }, [data]);

  const open = (id: string) => router.push({ pathname: "/tx", params: { id } });
  const dim = daysInMonth(month);
  const firstDow = new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)) - 1, 1).getDay();

  return (
    <SafeAreaView edges={[]} style={{ flex: 1, backgroundColor: t.bg }}>
      <Screen onRefresh={reload} refreshing={loading && !!data} padBottom={100}>
        <MonthSwitcher month={month} label={monthLabel(month)} onPrev={() => setMonth(shiftMonth(month, -1))} onNext={() => setMonth(shiftMonth(month, 1))} nextDisabled={month >= shiftMonth(thisMonth(), 1)} />
        <Segmented options={["list", "calendar"] as const} value={view} onChange={setView} labels={{ list: "List", calendar: "Calendar" }} />
        <Field value={q} onChangeText={setQ} placeholder="Search notes or categories" autoCapitalize="none" returnKeyType="search" />
        <Chips<Filter> options={["all", "expense", "income", "savings"]} value={filter} onChange={setFilter} labels={{ all: "All", ...TYPE_LABEL }} />

        {error && !data ? <ErrorBox message={error} onRetry={reload} /> : null}
        {loading && !data ? <Loading /> : null}

        {view === "calendar" ? (
          <Card style={{ gap: 6 }}>
            <View style={{ flexDirection: "row" }}>
              {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => <View key={i} style={{ flex: 1, alignItems: "center" }}><T size={12} muted>{d}</T></View>)}
            </View>
            <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
              {Array.from({ length: firstDow }, (_, i) => <View key={`b${i}`} style={{ width: `${100 / 7}%`, height: 52 }} />)}
              {Array.from({ length: dim }, (_, i) => {
                const iso = `${month}-${pad(i + 1)}`;
                const spent = perDay.get(iso) ?? 0;
                const sel = day === iso;
                return (
                  <Pressable key={iso} onPress={() => setDay(sel ? null : iso)} style={{ width: `${100 / 7}%`, height: 52, padding: 2 }}>
                    <View style={{ flex: 1, borderRadius: 10, alignItems: "center", justifyContent: "center", backgroundColor: sel ? t.primary : spent > 0 ? t.primarySoft : "transparent" }}>
                      <T size={14} weight="600" color={sel ? t.onPrimary : t.text}>{i + 1}</T>
                      {spent > 0 ? <T size={9} color={sel ? t.onPrimary : t.expense}>{compact(spent)}</T> : null}
                    </View>
                  </Pressable>
                );
              })}
            </View>
            {day ? <T size={13} muted style={{ textAlign: "center" }}>Showing {prettyDate(day)} · tap the day again to clear</T> : null}
          </Card>
        ) : null}

        {data && shown.length === 0 ? <Empty icon="search" title="Nothing here" hint={qs || filter !== "all" || day ? "Try clearing the filters." : "No transactions in this month yet."} /> : null}

        {groups.map(([date, list]) => {
          const net = list.reduce((s, x) => s + (x.type === "income" ? x.amount : x.type === "expense" ? -x.amount : 0), 0);
          return (
            <View key={date} style={{ gap: 4 }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", paddingHorizontal: 4 }}>
                <T size={13} weight="700" muted>{prettyDate(date)}</T>
                <T size={13} muted>{net === 0 ? "" : money(net, cur, { sign: true })}</T>
              </View>
              <Card style={{ paddingVertical: 4 }}>
                {list.map((x) => <TxRow key={x.id} tx={x} currency={cur} onPress={() => open(x.id)} />)}
              </Card>
            </View>
          );
        })}
      </Screen>
      <Fab date={day ?? undefined} />
    </SafeAreaView>
  );
}
