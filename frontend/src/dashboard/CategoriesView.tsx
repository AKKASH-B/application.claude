import { Feather } from "@expo/vector-icons";
import { Pressable, Text, View, ScrollView } from "react-native";
import { COLORS, TRANSFERRED_CATEGORIES, monthLabel, shiftMonth } from "./constants";
import { styles } from "./styles";
import { Bar } from "./primitives";
import type { Transaction } from "./types";

export function CategoriesView({ data, max, budgetMap, onEditBudget, transactions, month, onMonthChange }: { data: { category: string; amount: number }[]; max: number; budgetMap: Record<string, number>; onEditBudget: (c: string) => void; transactions: Transaction[]; month: string; onMonthChange: (m: string) => void }) {
  const selectedMonth = month; // shared with the Overview month picker

  // Filter data by selected month
  const monthTransactions = transactions.filter(t => t.date.startsWith(selectedMonth) && t.type === "expense");
  const monthData = TRANSFERRED_CATEGORIES.map(c => ({
    category: c,
    amount: monthTransactions.filter(t => t.category === c).reduce((s, t) => s + t.amount, 0)
  }));
  const monthMax = Math.max(...monthData.map(d => d.amount), 1);

  return (
    <ScrollView showsVerticalScrollIndicator={false}>
      <View style={styles.monthPicker}>
        <Pressable onPress={() => onMonthChange(shiftMonth(selectedMonth, -1))} style={styles.monthNav}>
          <Feather name="chevron-left" size={18} color={COLORS.ink} />
        </Pressable>
        <Text style={styles.monthText}>{monthLabel(selectedMonth)}</Text>
        <Pressable onPress={() => onMonthChange(shiftMonth(selectedMonth, 1))} style={styles.monthNav}>
          <Feather name="chevron-right" size={18} color={COLORS.ink} />
        </Pressable>
      </View>

      <View style={styles.card}>
        <View style={styles.rowBetween}>
          <Text style={styles.cardTitle}>Category performance</Text>
          <Text style={styles.sectionSub}>Tap to set budget</Text>
        </View>
        {TRANSFERRED_CATEGORIES.map((c) => {
          const amount = monthData.find((x) => x.category === c)?.amount || 0;
          const limit = budgetMap[c];
          return (
            <Pressable key={c} testID={`budget-row-${c.toLowerCase()}`} onPress={() => onEditBudget(c)} style={styles.budgetRow}>
              <View style={{ flex: 1 }}>
                <Bar category={c} amount={amount} max={monthMax} limit={limit} />
              </View>
              <Feather name={limit ? "edit-2" : "plus-circle"} size={16} color={COLORS.muted} style={{ marginLeft: 10, marginTop: 6 }} />
            </Pressable>
          );
        })}
      </View>
    </ScrollView>
  );
}
