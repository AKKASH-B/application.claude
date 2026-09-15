import { Feather } from "@expo/vector-icons";
import { Pressable, Text, View } from "react-native";
import { COLORS, TRANSFERRED_CATEGORIES } from "./constants";
import { styles } from "./styles";
import { Bar } from "./primitives";

export function CategoriesView({ data, max, budgetMap, onEditBudget }: { data: { category: string; amount: number }[]; max: number; budgetMap: Record<string, number>; onEditBudget: (c: string) => void }) {
  return (
    <View style={styles.card}>
      <View style={styles.rowBetween}>
        <Text style={styles.cardTitle}>Category performance</Text>
        <Text style={styles.sectionSub}>Tap to set budget</Text>
      </View>
      {TRANSFERRED_CATEGORIES.map((c) => {
        const amount = data.find((x) => x.category === c)?.amount || 0;
        const limit = budgetMap[c];
        return (
          <Pressable key={c} testID={`budget-row-${c.toLowerCase()}`} onPress={() => onEditBudget(c)} style={styles.budgetRow}>
            <View style={{ flex: 1 }}>
              <Bar category={c} amount={amount} max={max} limit={limit} />
            </View>
            <Feather name={limit ? "edit-2" : "plus-circle"} size={16} color={COLORS.muted} style={{ marginLeft: 10, marginTop: 6 }} />
          </Pressable>
        );
      })}
    </View>
  );
}
