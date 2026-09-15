import { Feather } from "@expo/vector-icons";
import { Pressable, Text, View } from "react-native";
import type { SavingsGoal } from "./types";
import { COLORS, dateLabel, money, monthsUntil } from "./constants";
import { styles } from "./styles";
import { ProgressRing } from "./primitives";

export function GoalCard({ goal, saved, onEdit }: { goal: SavingsGoal; saved: number; onEdit: () => void }) {
  const pct = goal.target > 0 ? (saved / goal.target) * 100 : 0;
  const reached = saved >= goal.target;
  const remaining = Math.max(0, goal.target - saved);
  let nudge = reached ? "Goal reached — nice work!" : `${money(remaining)} to go`;
  if (!reached && goal.target_date) {
    const months = monthsUntil(goal.target_date);
    if (months >= 1) nudge = `Save ${money(remaining / months)}/mo to reach by ${dateLabel(goal.target_date)}`;
    else nudge = `Add ${money(remaining)} to reach your ${dateLabel(goal.target_date)} target`;
  }
  return (
    <View testID={`savings-goal-card-${goal.id}`} style={styles.goalCard}>
      <ProgressRing pct={pct} color={reached ? COLORS.green : COLORS.gold} />
      <View style={styles.goalInfo}>
        <View style={styles.goalHeadRow}>
          <Text style={styles.cardTitleTight} numberOfLines={1}>{goal.name}</Text>
          <Pressable testID={`edit-savings-goal-${goal.id}`} onPress={onEdit} hitSlop={10}><Feather name="edit-2" size={16} color={COLORS.muted} /></Pressable>
        </View>
        <Text style={styles.goalSaved}>{money(saved)} <Text style={styles.goalTarget}>/ {money(goal.target)}</Text></Text>
        {reached
          ? <View testID={`goal-badge-${goal.id}`} style={styles.goalBadge}><Feather name="award" size={12} color={COLORS.green} /><Text style={styles.goalBadgeText}>Reached</Text></View>
          : <Text testID={`goal-nudge-${goal.id}`} style={styles.goalRemaining}>{nudge}</Text>}
      </View>
    </View>
  );
}
