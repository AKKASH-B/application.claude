import { useMemo, useState } from "react";
import { Feather } from "@expo/vector-icons";
import { Pressable, Text, View } from "react-native";
import Calendar, { prettyDate, todayIso } from "@/src/components/Calendar";
import type { Transaction } from "./types";
import { COLORS } from "./constants";
import { styles } from "./styles";
import { Metric, TransactionRow } from "./primitives";

export function CalendarView({ transactions, onOpenTx, onAdd }: { transactions: Transaction[]; onOpenTx: (t: Transaction) => void; onAdd: () => void }) {
  const [selected, setSelected] = useState(todayIso());
  const marked = useMemo(() => {
    const m: Record<string, number> = {};
    for (const t of transactions) m[t.date] = (m[t.date] || 0) + 1;
    return m;
  }, [transactions]);
  const dayTx = useMemo(() => transactions.filter((t) => t.date === selected), [transactions, selected]);
  const daySpent = dayTx.filter((t) => t.type === "expense").reduce((s, t) => s + t.amount, 0);
  const dayIncome = dayTx.filter((t) => t.type === "income").reduce((s, t) => s + t.amount, 0);
  const daySavings = dayTx.filter((t) => t.type === "savings").reduce((s, t) => s + t.amount, 0);
  return (
    <View style={{ gap: 16 }}>
      <Calendar selected={selected} onSelect={setSelected} markedDates={marked} allowFuture />
      <View style={styles.sectionHeader}>
        <View style={{ flex: 1 }}><Text style={styles.sectionTitle} numberOfLines={1}>{prettyDate(selected)}</Text><Text style={styles.sectionSub}>{dayTx.length} {dayTx.length === 1 ? "entry" : "entries"} on this day</Text></View>
        <Pressable testID="calendar-add" onPress={onAdd} style={styles.addSmall}><Feather name="plus" size={18} color="#FFF" /></Pressable>
      </View>
      <View style={styles.summaryGrid}>
        <Metric label="Transferred" value={daySpent} tone={COLORS.red} icon="arrow-up-right" />
        <Metric label="Received" value={dayIncome} tone={COLORS.green} icon="arrow-down-left" />
        <Metric label="Savings" value={daySavings} tone={COLORS.gold} icon="pie-chart" />
      </View>
      <View style={styles.card} testID="calendar-day-list">
        {dayTx.length === 0 ? <Text style={styles.emptyText}>No entries on {prettyDate(selected)}. Tap + to add one for this date.</Text> : dayTx.map((t) => <TransactionRow key={t.id} t={t} onLongPress={() => onOpenTx(t)} />)}
      </View>
    </View>
  );
}
