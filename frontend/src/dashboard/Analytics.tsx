import { Feather } from "@expo/vector-icons";
import { Text, View } from "react-native";
import type { Transaction } from "./types";
import { COLORS, money, monthLabel, shiftMonth } from "./constants";
import { styles } from "./styles";
import { Bar } from "./primitives";

export function Analytics({ spent, income, data, max, transactions, month }: { spent: number; income: number; data: { category: string; amount: number }[]; max: number; transactions: Transaction[]; month: string }) {
  const prevMonth = shiftMonth(month, -1);
  const totalsFor = (ym: string) => {
    const rows = transactions.filter((t) => t.date.startsWith(ym));
    return {
      spent: rows.filter((t) => t.type === "expense").reduce((s, t) => s + t.amount, 0),
      income: rows.filter((t) => t.type === "income").reduce((s, t) => s + t.amount, 0),
      savings: rows.filter((t) => t.type === "savings").reduce((s, t) => s + t.amount, 0),
    };
  };
  const cur = totalsFor(month);
  const prev = totalsFor(prevMonth);
  const rows: { label: string; a: number; b: number; tone: string; goodDown: boolean }[] = [
    { label: "Transferred", a: cur.spent, b: prev.spent, tone: COLORS.red, goodDown: true },
    { label: "Received", a: cur.income, b: prev.income, tone: COLORS.green, goodDown: false },
    { label: "Savings", a: cur.savings, b: prev.savings, tone: COLORS.gold, goodDown: false },
  ];
  return <>
    <View style={styles.card}>
      <View style={styles.rowBetween}>
        <Text style={styles.cardTitle}>Month vs month</Text>
        <Text style={styles.sectionSub}>{monthLabel(month).split(" ")[0]} vs {monthLabel(prevMonth).split(" ")[0]}</Text>
      </View>
      {rows.map((r) => {
        const diff = r.a - r.b;
        const pct = r.b > 0 ? Math.round((diff / r.b) * 100) : (r.a > 0 ? 100 : 0);
        const up = diff > 0;
        const good = up ? !r.goodDown : r.goodDown;
        const noChange = Math.abs(diff) < 0.5;
        return (
          <View key={r.label} testID={`compare-row-${r.label.toLowerCase()}`} style={styles.compareRow}>
            <View style={[styles.metricIcon, { backgroundColor: `${r.tone}18`, marginBottom: 0 }]}><View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: r.tone }} /></View>
            <View style={{ flex: 1 }}>
              <Text style={styles.compareLabel}>{r.label}</Text>
              <Text style={styles.compareSub}>Was {money(r.b)}</Text>
            </View>
            <View style={{ alignItems: "flex-end" }}>
              <Text style={styles.compareValue}>{money(r.a)}</Text>
              {noChange ? <Text style={styles.compareFlat}>No change</Text> : (
                <View style={styles.compareDeltaRow}>
                  <Feather name={up ? "arrow-up-right" : "arrow-down-right"} size={12} color={good ? COLORS.green : COLORS.red} />
                  <Text style={[styles.compareDelta, { color: good ? COLORS.green : COLORS.red }]}>{Math.abs(pct)}%</Text>
                </View>
              )}
            </View>
          </View>
        );
      })}
    </View>
    <View style={styles.card}><Text style={styles.cardTitle}>Cash flow this month</Text><View style={styles.flow}><View style={[styles.flowBar, { height: Math.max(18, Math.min(130, income / Math.max(income, spent, 1) * 130)), backgroundColor: COLORS.green }]} /><View style={[styles.flowBar, { height: Math.max(18, Math.min(130, spent / Math.max(income, spent, 1) * 130)), backgroundColor: COLORS.red }]} /></View><View style={styles.flowLabels}><Text style={styles.emptyText}>Received {money(income)}</Text><Text style={styles.emptyText}>Transferred {money(spent)}</Text></View></View>
    <View style={styles.card}><Text style={styles.cardTitle}>Top categories</Text>{data.length ? data.map((x) => <Bar key={x.category} category={x.category} amount={x.amount} max={max} />) : <Text style={styles.emptyText}>Not enough data for trends yet.</Text>}</View>
  </>;
}
