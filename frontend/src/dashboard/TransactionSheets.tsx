import { useEffect, useState } from "react";
import { Feather } from "@expo/vector-icons";
import { ActivityIndicator, Alert, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import ConfettiCannon from "react-native-confetti-cannon";
import type { SavingsGoal, Transaction } from "./types";
import { COLORS, GOAL_PRESETS, addMonthsIso, money, monthsUntil } from "./constants";
import { styles, authStyles } from "./styles";

export function TransactionActionsSheet({ t, onClose, onEdit, onDelete }: { t: Transaction | null; onClose: () => void; onEdit: (t: Transaction) => void; onDelete: (t: Transaction) => void }) {
  return (
    <Modal visible={!!t} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.modalShade} onPress={onClose}>
        <Pressable style={styles.modal} onPress={(e) => e.stopPropagation()}>
          <View style={styles.modalHead}>
            <Text style={styles.modalTitle}>{t?.category}</Text>
            <Pressable testID="close-actions" onPress={onClose}><Feather name="x" size={22} color={COLORS.muted} /></Pressable>
          </View>
          <Text style={styles.emptyText}>{t?.type === "income" ? "Received" : t?.type === "savings" ? "Saved" : "Transferred"} · {t ? money(t.amount) : ""} · {t?.date}</Text>
          {t?.note ? <Text style={styles.emptyText}>Note: {t.note}</Text> : null}
          <Pressable testID="edit-transaction" onPress={() => t && onEdit(t)} style={styles.actionBtn}>
            <Feather name="edit-2" size={18} color={COLORS.ink} />
            <Text style={styles.actionText}>Edit transaction</Text>
          </Pressable>
          <Pressable testID="delete-transaction" onPress={() => t && onDelete(t)} style={[styles.actionBtn, styles.actionBtnDanger]}>
            <Feather name="trash-2" size={18} color={COLORS.red} />
            <Text style={[styles.actionText, { color: COLORS.red }]}>Delete transaction</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

export function ConfirmDeleteSheet({ t, onCancel, onConfirm }: { t: Transaction | null; onCancel: () => void; onConfirm: (t: Transaction) => void }) {
  return (
    <Modal visible={!!t} transparent animationType="fade" onRequestClose={onCancel}>
      <Pressable style={styles.modalShade} onPress={onCancel}>
        <Pressable style={styles.modal} onPress={(e) => e.stopPropagation()}>
          <View style={styles.modalHead}>
            <Text style={styles.modalTitle}>Delete transaction?</Text>
            <Pressable testID="close-confirm-delete" onPress={onCancel}><Feather name="x" size={22} color={COLORS.muted} /></Pressable>
          </View>
          <Text style={styles.emptyText}>{t ? `${t.category} · ${money(t.amount)} · ${t.date}` : ""}</Text>
          <Text style={styles.emptyText}>This can’t be undone.</Text>
          <Pressable testID="confirm-delete" onPress={() => t && onConfirm(t)} style={[styles.save, { backgroundColor: COLORS.red }]}>
            <Text style={styles.saveText}>Delete transaction</Text>
          </Pressable>
          <Pressable testID="cancel-delete" onPress={onCancel} style={styles.remove}><Text style={authStyles.linkText}>Cancel</Text></Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

export function BudgetSheet({ category, currentLimit, onClose, onSave, onRemove }: { category: string | null; currentLimit?: number; onClose: () => void; onSave: (c: string, l: number) => void; onRemove: (c: string) => void }) {
  const [value, setValue] = useState("");
  useEffect(() => { setValue(currentLimit ? String(currentLimit) : ""); }, [currentLimit, category]);
  const submit = () => {
    if (!category) return;
    const n = Number(value);
    if (!n || n <= 0) return Alert.alert("Enter a limit", "Set a monthly limit greater than zero.");
    onSave(category, n);
  };
  return (
    <Modal visible={!!category} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={styles.modalShade}>
        <View style={styles.modal}>
          <View style={styles.modalHead}>
            <Text style={styles.modalTitle}>Budget · {category}</Text>
            <Pressable testID="close-budget-sheet" onPress={onClose}><Feather name="x" size={22} color={COLORS.muted} /></Pressable>
          </View>
          <Text style={styles.emptyText}>Set a monthly limit for {category}. We’ll alert you when spending is close.</Text>
          <Text style={styles.inputLabel}>MONTHLY LIMIT</Text>
          <TextInput testID="budget-amount" value={value} onChangeText={setValue} keyboardType="decimal-pad" placeholder="₹ 0" placeholderTextColor="#A9AAA5" style={styles.input} />
          <Pressable testID="save-budget" onPress={submit} style={styles.save}><Text style={styles.saveText}>Save budget</Text></Pressable>
          {currentLimit ? <Pressable testID="remove-budget" onPress={() => category && onRemove(category)} style={styles.remove}><Text style={styles.removeText}>Remove budget</Text></Pressable> : null}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

export function SavingsGoalSheet({ visible, goal, saved, onClose, onSave, onRemove }: { visible: boolean; goal: SavingsGoal | null; saved: number; onClose: () => void; onSave: (d: { name: string; target: number; target_date: string | null }) => void; onRemove: () => void }) {
  const [name, setName] = useState("");
  const [value, setValue] = useState("");
  const [preset, setPreset] = useState<number | null>(null);
  useEffect(() => {
    if (visible) {
      setName(goal?.name || "");
      setValue(goal?.target ? String(goal.target) : "");
      setPreset(goal?.target_date ? Math.max(1, monthsUntil(goal.target_date)) : null);
    }
  }, [goal, visible]);
  const submit = () => {
    const trimmed = name.trim();
    if (!trimmed) return Alert.alert("Name your goal", "Give this goal a short name, e.g. Emergency Fund.");
    const n = Number(value);
    if (!n || n <= 0) return Alert.alert("Enter a target", "Set a savings target greater than zero.");
    onSave({ name: trimmed, target: n, target_date: preset ? addMonthsIso(preset) : null });
  };
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={styles.modalShade}>
        <View style={styles.modal}>
          <View style={styles.modalHead}>
            <Text style={styles.modalTitle}>{goal ? "Edit goal" : "New savings goal"}</Text>
            <Pressable testID="close-savings-goal" onPress={onClose}><Feather name="x" size={22} color={COLORS.muted} /></Pressable>
          </View>
          {goal ? <Text style={styles.emptyText}>You’ve set aside {money(saved)} toward this goal.</Text> : <Text style={styles.emptyText}>Name a target, then fund it from the Savings tab.</Text>}
          <Text style={styles.inputLabel}>GOAL NAME</Text>
          <TextInput testID="savings-goal-name" value={name} onChangeText={setName} placeholder="e.g. Emergency Fund" placeholderTextColor="#A9AAA5" style={styles.input} />
          <Text style={styles.inputLabel}>TARGET AMOUNT</Text>
          <TextInput testID="savings-goal-amount" value={value} onChangeText={setValue} keyboardType="decimal-pad" placeholder="₹ 0" placeholderTextColor="#A9AAA5" style={styles.input} />
          <Text style={styles.inputLabel}>REACH BY</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
            {GOAL_PRESETS.map((p) => <Pressable testID={`goal-preset-${p.months ?? "none"}`} key={p.label} onPress={() => setPreset(p.months)} style={[styles.chip, preset === p.months && styles.chipActive]}><Text style={[styles.chipText, preset === p.months && styles.chipTextActive]}>{p.label}</Text></Pressable>)}
          </ScrollView>
          <Pressable testID="save-savings-goal" onPress={submit} style={styles.save}><Text style={styles.saveText}>{goal ? "Save changes" : "Create goal"}</Text></Pressable>
          {goal ? <Pressable testID="remove-savings-goal" onPress={onRemove} style={styles.remove}><Text style={styles.removeText}>Delete goal</Text></Pressable> : null}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

export function CelebrationOverlay({ goal, onClose }: { goal: SavingsGoal | null; onClose: () => void }) {
  return (
    <Modal visible={!!goal} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.celebrateShade} testID="goal-celebration">
        {goal ? <ConfettiCannon count={140} origin={{ x: 200, y: -20 }} fadeOut autoStart explosionSpeed={380} fallSpeed={2600} /> : null}
        <View style={styles.celebrateCard}>
          <View style={styles.celebrateBadge}><Feather name="award" size={34} color={COLORS.gold} /></View>
          <Text style={styles.celebrateTitle}>Goal reached! 🎉</Text>
          <Text style={styles.celebrateName}>{goal?.name}</Text>
          <Text style={styles.celebrateSub}>You hit your {goal ? money(goal.target) : ""} target. Amazing discipline — time to set the next one!</Text>
          <Pressable testID="celebration-done" onPress={onClose} style={styles.save}><Text style={styles.saveText}>Nice!</Text></Pressable>
        </View>
      </View>
    </Modal>
  );
}
