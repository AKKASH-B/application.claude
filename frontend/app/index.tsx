import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Alert, KeyboardAvoidingView, Modal, Platform, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { router } from "expo-router";
import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import Calendar, { prettyDate, todayIso } from "@/src/components/Calendar";
import Calculator from "@/src/components/Calculator";
import { authorizedRequest, restoreSession, signOut, User } from "@/src/auth";
import type { Budget, SavingsGoal, Transaction, TxType } from "@/src/dashboard/types";
import { COLORS, SAVINGS_CATEGORIES, TRANSFERRED_CATEGORIES, categoriesFor, money, monthLabel, nowMonth, shiftMonth } from "@/src/dashboard/constants";
import { styles, authStyles } from "@/src/dashboard/styles";
import { Bar, Empty, Metric, TransactionRow } from "@/src/dashboard/primitives";
import { GoalCard } from "@/src/dashboard/GoalCard";
import { CategoriesView } from "@/src/dashboard/CategoriesView";
import { Analytics } from "@/src/dashboard/Analytics";
import { CalendarView } from "@/src/dashboard/CalendarView";
import { AuthScreen } from "@/src/dashboard/AuthScreen";
import { BudgetSheet, CelebrationOverlay, ConfirmDeleteSheet, SavingsGoalSheet, TransactionActionsSheet } from "@/src/dashboard/TransactionSheets";
import { ChangePasswordSheet, DeleteAccountSheet, RecoveryEmailSheet, SettingsSheet } from "@/src/dashboard/SettingsSheet";
import { AdminSheet } from "@/src/dashboard/AdminSheet";
import { DailySpendAnalysisTab } from "@/src/dashboard/DailySpendAnalysisTab";
import { RecentActivityGrouped } from "@/src/dashboard/RecentActivityGrouped";
import { CalculatorTab } from "@/src/dashboard/CalculatorTab";
import { PlanningTab } from "@/src/dashboard/PlanningTab";
import { ChecklistTab } from "@/src/dashboard/ChecklistTab";

export default function Index() {
  const [user, setUser] = useState<User | null>(null);
  const [checking, setChecking] = useState(true);
  useEffect(() => { restoreSession().then(setUser).finally(() => setChecking(false)); }, []);
  if (checking) return <SafeAreaView style={styles.safe}><ActivityIndicator color={COLORS.green} style={styles.loader} /></SafeAreaView>;
  if (!user) return <AuthScreen onAuthenticated={setUser} />;
  return <Dashboard user={user} onSignedOut={() => setUser(null)} />;
}

function Dashboard({ user, onSignedOut }: { user: User; onSignedOut: () => void }) {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("Overview");
  const [month, setMonth] = useState(nowMonth());
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const pickMenu = (action: () => void) => { setMenuOpen(false); setTimeout(action, 60); };
  const [changePwOpen, setChangePwOpen] = useState(false);
  const [recoveryOpen, setRecoveryOpen] = useState(false);
  const [deleteAcctOpen, setDeleteAcctOpen] = useState(false);
  const [recoveryEmail, setRecoveryEmailState] = useState(user.email || "");
  const [adminOpen, setAdminOpen] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<Transaction | null>(null);
  const [actionsFor, setActionsFor] = useState<Transaction | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Transaction | null>(null);
  const [budgetSheet, setBudgetSheet] = useState<string | null>(null);
  const [savingsGoals, setSavingsGoals] = useState<SavingsGoal[]>([]);
  const [goalSheetOpen, setGoalSheetOpen] = useState(false);
  const [editingGoal, setEditingGoal] = useState<SavingsGoal | null>(null);
  const [celebrateGoal, setCelebrateGoal] = useState<SavingsGoal | null>(null);
  const [splitPrompt, setSplitPrompt] = useState<{ amount: number; note: string } | null>(null);
  const [splitAsked, setSplitAsked] = useState(false);
  const [splitSaving, setSplitSaving] = useState(false);
  const [form, setForm] = useState({ amount: "", category: "Food", note: "", type: "expense" as TxType, goalId: null as string | null, date: todayIso() });
  const [calcOpen, setCalcOpen] = useState(false);
  const [datePickerOpen, setDatePickerOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      const [tx, bd, goals] = await Promise.all([
        authorizedRequest<Transaction[]>("/transactions"),
        authorizedRequest<Budget[]>("/budgets"),
        authorizedRequest<SavingsGoal[]>("/savings-goals"),
      ]);
      setTransactions(tx);
      setBudgets(bd);
      setSavingsGoals(goals);
    } catch {
      Alert.alert("Couldn't load data", "Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { load(); }, [load]);
  const current = useMemo(() => transactions.filter((t) => t.date.startsWith(month)), [transactions, month]);
  const recentSorted = useMemo(() => [...current].sort((a, b) => {
    const at = new Date(`${a.date}T${(a.created_at || "").split("T")[1] || "00:00:00"}`).getTime();
    const bt = new Date(`${b.date}T${(b.created_at || "").split("T")[1] || "00:00:00"}`).getTime();
    return bt - at;
  }), [current]);
  const spent = current.filter((t) => t.type === "expense").reduce((s, t) => s + t.amount, 0);
  const income = current.filter((t) => t.type === "income").reduce((s, t) => s + t.amount, 0);
  const savings = current.filter((t) => t.type === "savings").reduce((s, t) => s + t.amount, 0);
  const savedByGoal = useMemo(() => {
    const map: Record<string, number> = {};
    for (const t of transactions) if (t.type === "savings" && t.goal_id) map[t.goal_id] = (map[t.goal_id] || 0) + t.amount;
    return map;
  }, [transactions]);
  const rawBalance = transactions.reduce((s, t) => s + (t.type === "income" ? t.amount : -t.amount), 0); // expenses AND savings leave the available balance
  const balance = Math.abs(rawBalance) < 0.5 ? 0 : Math.round(rawBalance * 100) / 100;
  const byCategory = TRANSFERRED_CATEGORIES.map((category) => ({ category, amount: current.filter((t) => t.type === "expense" && t.category === category).reduce((s, t) => s + t.amount, 0) })).filter((x) => x.amount > 0).sort((a, b) => b.amount - a.amount);
  const max = byCategory[0]?.amount || 1;
  const budgetMap = useMemo(() => Object.fromEntries(budgets.map((b) => [b.category, b.monthly_limit])) as Record<string, number>, [budgets]);
  const overBudget = useMemo(() => byCategory.filter((x) => budgetMap[x.category] && x.amount > budgetMap[x.category]), [byCategory, budgetMap]);
  const isCurrentMonth = month === nowMonth();
  const isFutureMonth = month > nowMonth();
  const openAdd = () => { setEditing(null); setForm({ amount: "", category: TRANSFERRED_CATEGORIES[0], note: "", type: "expense", goalId: null, date: todayIso() }); setSplitAsked(false); setEditorOpen(true); };
  const openEdit = (t: Transaction) => { setEditing(t); setForm({ amount: String(t.amount), category: t.category, note: t.note || "", type: t.type, goalId: t.goal_id ?? null, date: t.date }); setActionsFor(null); setEditorOpen(true); };
  const closeEditor = () => { setEditorOpen(false); setEditing(null); };
  // Only offered when the user taps "Split this with friends" — never as a side effect of leaving the amount field.
  const handleSplitTap = () => {
    const amount = Number(form.amount);
    if (!amount || amount <= 0) { Alert.alert("Add an amount", "Enter the amount first, then split it."); return; }
    if (amount > 1_000_000_000) { Alert.alert("Amount too large", "Enter an amount up to ₹100 crore (1,000,000,000)."); return; }
    setSplitPrompt({ amount, note: form.note.trim() || form.category });
  };
  const chooseType = (type: TxType) => {
    if (type === "savings") {
      const first = savingsGoals[0];
      setForm((f) => ({ ...f, type, goalId: first ? first.id : null, category: first ? first.name : (SAVINGS_CATEGORIES.includes(f.category) ? f.category : SAVINGS_CATEGORIES[0]) }));
    } else {
      const list = categoriesFor(type);
      setForm((f) => ({ ...f, type, goalId: null, category: list.includes(f.category) ? f.category : list[0] }));
    }
  };
  const submitTransaction = async () => {
    const amount = Number(form.amount);
    if (!amount || amount <= 0) return Alert.alert("Add an amount", "Enter a value greater than zero.");
    if (amount > 1_000_000_000) return Alert.alert("Amount too large", "Enter an amount up to ₹100 crore (1,000,000,000).");
    const payload = { type: form.type, amount, category: form.category, note: form.note.trim(), date: form.date || todayIso(), goal_id: form.type === "savings" ? form.goalId : null };
    try {
      if (editing) {
        const updated = await authorizedRequest<Transaction>(`/transactions/${editing.id}`, { method: "PUT", body: JSON.stringify(payload) });
        setTransactions((x) => x.map((t) => (t.id === editing.id ? updated : t)));
        setMonth(updated.date.slice(0, 7));
        closeEditor();
      } else {
        const created = await authorizedRequest<Transaction>("/transactions", { method: "POST", body: JSON.stringify(payload) });
        setTransactions((x) => [created, ...x]);
        setMonth(created.date.slice(0, 7));
        closeEditor();
      }
    } catch { Alert.alert("Couldn't save", "Please try again."); }
  };
  const confirmSplit = async () => {
    if (!splitPrompt) return;
    const amount = Number(form.amount);
    if (!amount || amount <= 0) { setSplitPrompt(null); return; }
    setSplitSaving(true);
    const payload = { type: "expense" as TxType, amount, category: form.category, note: form.note.trim(), date: form.date || todayIso(), goal_id: null };
    try {
      // Save it as the user's own transaction FIRST, so it's never lost even if they
      // abandon the split screen before finishing it. The split then links to this
      // transaction (create_transaction: false) instead of creating a duplicate one.
      const created = await authorizedRequest<Transaction>("/transactions", { method: "POST", body: JSON.stringify(payload) });
      setTransactions((x) => [created, ...x]);
      setMonth(created.date.slice(0, 7));
      setSplitPrompt(null);
      closeEditor();
      router.push({ pathname: "/split/new", params: { transactionId: created.id, amount: String(created.amount), note: created.note } });
    } catch {
      Alert.alert("Couldn't save", "Please try again.");
    } finally {
      setSplitSaving(false);
    }
  };
  const deleteTransaction = async (t: Transaction) => {
    try {
      await authorizedRequest(`/transactions/${t.id}`, { method: "DELETE" });
      setTransactions((x) => x.filter((r) => r.id !== t.id));
      setActionsFor(null);
      setConfirmDelete(null);
    } catch { Alert.alert("Couldn't delete", "Please try again."); }
  };
  const askDelete = (t: Transaction) => {
    setActionsFor(null);
    setConfirmDelete(t);
  };
  const saveBudget = async (category: string, limit: number) => {
    try {
      const saved = await authorizedRequest<Budget>("/budgets", { method: "PUT", body: JSON.stringify({ category, monthly_limit: limit }) });
      setBudgets((prev) => [...prev.filter((b) => b.category !== category), saved]);
      setBudgetSheet(null);
    } catch { Alert.alert("Couldn't save budget", "Please try again."); }
  };
  const removeBudget = async (category: string) => {
    try {
      await authorizedRequest(`/budgets/${encodeURIComponent(category)}`, { method: "DELETE" });
      setBudgets((prev) => prev.filter((b) => b.category !== category));
      setBudgetSheet(null);
    } catch { Alert.alert("Couldn't remove", "Please try again."); }
  };
  const saveGoal = async (data: { name: string; target: number; target_date: string | null }) => {
    try {
      if (editingGoal) {
        const updated = await authorizedRequest<SavingsGoal>(`/savings-goals/${editingGoal.id}`, { method: "PUT", body: JSON.stringify(data) });
        setSavingsGoals((prev) => prev.map((g) => (g.id === updated.id ? updated : g)));
      } else {
        const created = await authorizedRequest<SavingsGoal>("/savings-goals", { method: "POST", body: JSON.stringify(data) });
        setSavingsGoals((prev) => [...prev, created]);
      }
      setGoalSheetOpen(false);
      setEditingGoal(null);
    } catch { Alert.alert("Couldn't save goal", "Please try again."); }
  };
  const removeGoal = async () => {
    if (!editingGoal) return;
    try {
      await authorizedRequest(`/savings-goals/${editingGoal.id}`, { method: "DELETE" });
      setSavingsGoals((prev) => prev.filter((g) => g.id !== editingGoal.id));
      setTransactions((prev) => prev.map((t) => (t.goal_id === editingGoal.id ? { ...t, goal_id: null } : t)));
      setGoalSheetOpen(false);
      setEditingGoal(null);
    } catch { Alert.alert("Couldn't remove goal", "Please try again."); }
  };
  const openNewGoal = () => { setEditingGoal(null); setGoalSheetOpen(true); };
  const openEditGoal = (g: SavingsGoal) => { setEditingGoal(g); setGoalSheetOpen(true); };
  const markCelebrated = useCallback(async (id: string) => {
    setSavingsGoals((prev) => prev.map((g) => (g.id === id ? { ...g, celebrated: true } : g)));
    try { await authorizedRequest(`/savings-goals/${id}`, { method: "PUT", body: JSON.stringify({ celebrated: true }) }); } catch { /* best effort */ }
  }, []);
  useEffect(() => {
    if (celebrateGoal) return;
    const hit = savingsGoals.find((g) => !g.celebrated && (savedByGoal[g.id] || 0) >= g.target);
    if (hit) { setCelebrateGoal(hit); markCelebrated(hit.id); }
  }, [savingsGoals, savedByGoal, celebrateGoal, markCelebrated]);

  return <SafeAreaView style={styles.safe}><ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
    <View style={styles.top}><Pressable testID="open-side-menu" onPress={() => setMenuOpen(true)} hitSlop={8} style={menuStyles.burger}><Feather name="menu" size={22} color={COLORS.ink} /></Pressable><View style={{ flex: 1 }}><Text style={styles.eyebrow}>PERSONAL FINANCE</Text><Text style={styles.title}>Hi {user.username}</Text><View style={styles.profileMetaRow}><Text style={styles.sectionSub} numberOfLines={1}>{recoveryEmail || user.phone || ""}</Text></View></View><View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}><Pressable testID="open-settings" onPress={() => setSettingsOpen(true)} style={styles.avatar}><Text style={styles.avatarText}>{user.username.slice(0, 2).toUpperCase()}</Text></Pressable></View></View>
    <View style={styles.hero}><View style={styles.heroTop}><Text style={styles.heroLabel}>TOTAL BALANCE</Text><Feather name="more-horizontal" size={20} color="#B5C8BE" /></View><Text testID="total-balance" style={[styles.balance, balance < 0 && styles.balanceNeg]}>{balance < 0 ? "-" : ""}{money(balance)}</Text><View style={styles.delta}><Feather name="trending-up" size={13} color="#D7E8DE" /><Text style={styles.deltaText}>{balance < 0 ? "Spending is ahead of income" : "Available after savings"}</Text></View><View style={styles.heroBottom}><Text style={styles.heroSmall}>All time</Text><Text style={styles.heroSmall}>{transactions.length} transactions</Text></View></View>
    {overBudget.length > 0 && <View testID="budget-alert-banner" style={styles.alertBanner}><Feather name="alert-triangle" size={16} color={COLORS.red} /><Text style={styles.alertText}>Over budget on {overBudget.map((x) => x.category).join(", ")}</Text></View>}
    {balance < 0 && <View testID="low-balance-alert" style={styles.lowBalanceCard}><View style={styles.lowBalanceIcon}><Feather name="trending-down" size={18} color={COLORS.red} /></View><View style={{ flex: 1 }}><Text style={styles.lowBalanceTitle}>Balance is in the red</Text><Text style={styles.lowBalanceSub}>You've transferred or saved {money(balance)} more than you've received. Ease up or add income to get back on track.</Text></View></View>}
    {loading ? <ActivityIndicator color={COLORS.green} style={styles.loader} /> : tab === "Daily Spends" ? <DailySpendAnalysisTab transactions={transactions} month={month} onMonthChange={setMonth} /> : tab === "Calculator" ? <CalculatorTab /> : tab === "Planning" ? <PlanningTab balance={balance} transactions={transactions} /> : tab === "Checklist" ? <ChecklistTab /> : tab === "Calendar" ? <CalendarView transactions={transactions} onOpenTx={setActionsFor} onAdd={openAdd} /> : tab === "Categories" ? <CategoriesView data={byCategory} max={max} budgetMap={budgetMap} onEditBudget={setBudgetSheet} transactions={transactions} month={month} onMonthChange={setMonth} /> : tab === "Analytics" ? <Analytics spent={spent} income={income} data={byCategory} max={max} transactions={transactions} month={month} onMonthChange={setMonth} /> : <>
      <View style={styles.monthPicker}>
        <Pressable testID="prev-month" onPress={() => setMonth((m) => shiftMonth(m, -1))} style={styles.monthNav}><Feather name="chevron-left" size={18} color={COLORS.ink} /></Pressable>
        <Text testID="month-label" style={styles.monthText}>{monthLabel(month)}</Text>
        <Pressable testID="next-month" onPress={() => setMonth((m) => shiftMonth(m, 1))} style={styles.monthNav}><Feather name="chevron-right" size={18} color={COLORS.ink} /></Pressable>
      </View>
      <View style={styles.sectionHeader}><View><Text style={styles.sectionTitle}>Monthly summary</Text><Text style={styles.sectionSub}>{isCurrentMonth ? "Live overview" : isFutureMonth ? "Future month view" : "Past month view"}</Text></View><Pressable testID="add-transaction-small" onPress={openAdd} style={styles.addSmall}><Feather name="plus" size={18} color="#FFF" /></Pressable></View>
      <View style={styles.summaryGrid}><Metric label="Transferred" value={spent} tone={COLORS.red} icon="arrow-up-right" /><Metric label="Received" value={income} tone={COLORS.green} icon="arrow-down-left" /><Metric label="Savings" value={savings} tone={COLORS.gold} icon="pie-chart" /></View>
      <View style={styles.sectionHeader}><View><Text style={styles.sectionTitle}>Savings goals</Text><Text style={styles.sectionSub}>Track your targets & progress</Text></View><Pressable testID="add-goal-btn" onPress={openNewGoal} style={styles.addSmall}><Feather name="plus" size={18} color="#FFF" /></Pressable></View>
      {savingsGoals.length === 0
        ? <Pressable testID="set-savings-goal" onPress={openNewGoal} style={styles.goalEmptyCard}><View style={styles.goalEmptyIcon}><Feather name="target" size={20} color={COLORS.gold} /></View><View style={{ flex: 1 }}><Text style={styles.cardTitleTight}>Create your first goal</Text><Text style={styles.goalEmptySub}>Name a target and watch your set-aside money fill the ring.</Text></View><Feather name="plus-circle" size={20} color={COLORS.gold} /></Pressable>
        : savingsGoals.map((g) => <GoalCard key={g.id} goal={g} saved={savedByGoal[g.id] || 0} onEdit={() => openEditGoal(g)} />)}
      <View style={styles.card}><Text style={styles.cardTitle}>Spending by category</Text>{byCategory.length === 0 ? <Empty onAdd={openAdd} /> : byCategory.slice(0, 5).map((x) => <Bar key={x.category} category={x.category} amount={x.amount} max={max} limit={budgetMap[x.category]} />)}</View>
      <View style={styles.sectionHeader}><View><Text style={styles.sectionTitle}>Recent activity</Text><Text style={styles.sectionSub}>Long-press to edit or delete</Text></View></View>
      <View style={styles.card}><RecentActivityGrouped transactions={recentSorted} onLongPress={setActionsFor} maxGroups={3} /></View>
    </>}
  </ScrollView>
    <Pressable testID="add-transaction-fab" style={menuStyles.fab} onPress={openAdd}><Feather name="plus" size={26} color="#FFF" /></Pressable>
    <Modal visible={menuOpen} transparent animationType="fade" onRequestClose={() => setMenuOpen(false)}>
      <View style={menuStyles.drawerWrap}>
        <View style={menuStyles.drawer}>
          <View style={menuStyles.drawerHead}>
            <View style={{ flex: 1 }}>
              <Text style={menuStyles.drawerBrand}>SpendPulse</Text>
              <Text style={menuStyles.drawerUser} numberOfLines={1}>{user.username}</Text>
            </View>
            <Pressable testID="close-side-menu" onPress={() => setMenuOpen(false)} hitSlop={10}><Feather name="x" size={22} color={COLORS.muted} /></Pressable>
          </View>
          {([
            ["home", "Overview", () => setTab("Overview")],
            ["bar-chart-2", "Analytics", () => setTab("Analytics")],
            ["pie-chart", "Categories", () => setTab("Categories")],
            ["calendar", "Calendar", () => setTab("Calendar")],
            ["flag", "Planning", () => setTab("Planning")],
            ["trending-down", "Daily Spends", () => setTab("Daily Spends")],
            ["divide", "Calculator", () => setTab("Calculator")],
            ["check-square", "Checklist", () => setTab("Checklist")],
            ["users", "Splits", () => router.push("/splits")],
          ] as [keyof typeof Feather.glyphMap, string, () => void][]).map(([icon, label, action]) => (
            <Pressable key={label} testID={`menu-${label.toLowerCase().replace(/\s+/g, "-")}`} onPress={() => pickMenu(action)} style={({ pressed }) => [menuStyles.item, tab === label && { backgroundColor: COLORS.pale }, pressed && { backgroundColor: COLORS.pale }]}>
              <Feather name={icon} size={20} color={tab === label ? COLORS.green : COLORS.ink} />
              <Text style={[menuStyles.itemText, tab === label && { color: COLORS.green }]}>{label}</Text>
            </Pressable>
          ))}
        </View>
        <Pressable testID="side-menu-backdrop" style={menuStyles.backdrop} onPress={() => setMenuOpen(false)} />
      </View>
    </Modal>
    <Modal visible={editorOpen} transparent animationType="slide" onRequestClose={closeEditor}><KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={styles.modalShade}><View style={[styles.modal, { maxHeight: "92%" }]}><ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: 12, paddingBottom: 8 }}><View style={styles.modalHead}><Text style={styles.modalTitle}>{editing ? "Edit transaction" : "Add transaction"}</Text><Pressable testID="close-add-transaction" onPress={closeEditor}><Feather name="x" size={22} color={COLORS.muted} /></Pressable></View><View style={styles.typeRow}><Pressable testID="type-expense" onPress={() => chooseType("expense")} style={[styles.type, form.type === "expense" && styles.typeExpense]}><Text style={[styles.typeText, form.type === "expense" && { color: COLORS.red }]} numberOfLines={1}>Transferred</Text></Pressable><Pressable testID="type-income" onPress={() => chooseType("income")} style={[styles.type, form.type === "income" && styles.typeIncome]}><Text style={[styles.typeText, form.type === "income" && { color: COLORS.green }]} numberOfLines={1}>Received</Text></Pressable><Pressable testID="type-savings" onPress={() => chooseType("savings")} style={[styles.type, form.type === "savings" && styles.typeSavings]}><Text style={[styles.typeText, form.type === "savings" && { color: COLORS.gold }]} numberOfLines={1}>Savings</Text></Pressable></View><Text style={styles.inputLabel}>AMOUNT</Text><View style={styles.amountRow}><TextInput testID="transaction-amount" maxLength={13} value={form.amount} onChangeText={(amount) => setForm({ ...form, amount })} keyboardType="decimal-pad" placeholder="₹ 0" placeholderTextColor="#A9AAA5" style={[styles.input, { flex: 1 }]} /><Pressable testID="open-calculator" onPress={() => setCalcOpen(true)} style={styles.calcBtn}><MaterialCommunityIcons name="calculator-variant-outline" size={22} color={COLORS.green} /></Pressable></View><Text style={styles.inputLabel}>DATE</Text><Pressable testID="open-date-picker" onPress={() => setDatePickerOpen(true)} style={styles.dateField}><Feather name="calendar" size={18} color={COLORS.green} /><Text style={styles.dateFieldText}>{prettyDate(form.date)}</Text><Feather name="chevron-down" size={18} color={COLORS.muted} /></Pressable>{form.type === "savings" && savingsGoals.length > 0 ? <><Text style={styles.inputLabel}>ADD TO GOAL</Text><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>{savingsGoals.map((g) => <Pressable testID={`goal-chip-${g.id}`} key={g.id} onPress={() => setForm({ ...form, goalId: g.id, category: g.name })} style={[styles.chip, form.goalId === g.id && styles.chipActive]}><Text style={[styles.chipText, form.goalId === g.id && styles.chipTextActive]}>{g.name}</Text></Pressable>)}<Pressable testID="goal-chip-general" onPress={() => setForm({ ...form, goalId: null, category: "General" })} style={[styles.chip, form.goalId === null && styles.chipActive]}><Text style={[styles.chipText, form.goalId === null && styles.chipTextActive]}>General</Text></Pressable></ScrollView></> : <><Text style={styles.inputLabel}>CATEGORY</Text><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>{categoriesFor(form.type).map((c) => <Pressable testID={`category-${c.toLowerCase().replace(/\s+/g, "-")}`} key={c} onPress={() => setForm({ ...form, category: c })} style={[styles.chip, form.category === c && styles.chipActive]}><Text style={[styles.chipText, form.category === c && styles.chipTextActive]}>{c}</Text></Pressable>)}</ScrollView></>}<Text style={styles.inputLabel}>NOTE</Text><TextInput value={form.note} onChangeText={(note) => setForm({ ...form, note })} placeholder="Optional note" placeholderTextColor="#A9AAA5" maxLength={120} style={styles.input} /><Pressable testID="save-transaction" onPress={submitTransaction} style={styles.save}><Text style={styles.saveText}>{editing ? "Save changes" : "Save transaction"}</Text></Pressable>{!editing && form.type === "expense" ? <Pressable testID="split-from-form" onPress={handleSplitTap} style={styles.remove}><Text style={authStyles.linkText}>Split this with friends</Text></Pressable> : null}</ScrollView></View>
    <Modal visible={!!splitPrompt} transparent animationType="fade" onRequestClose={() => setSplitPrompt(null)}>
      <Pressable style={styles.modalShade} onPress={() => setSplitPrompt(null)}>
        <Pressable style={styles.modal} onPress={(e) => e.stopPropagation()}>
          <View style={styles.modalHead}>
            <Text style={styles.modalTitle}>Split this amount?</Text>
            <Pressable testID="close-split-prompt" onPress={() => setSplitPrompt(null)}><Feather name="x" size={22} color={COLORS.muted} /></Pressable>
          </View>
          <Text style={styles.emptyText}>{splitPrompt ? `Divide ${money(splitPrompt.amount)} between friends and track who owes what.` : ""}</Text>
          <Pressable
            testID="split-prompt-confirm"
            onPress={confirmSplit}
            disabled={splitSaving}
            style={[styles.save, splitSaving && { opacity: 0.6 }]}
          >
            {splitSaving ? <ActivityIndicator color="#FFF" /> : <Text style={styles.saveText}>Split it</Text>}
          </Pressable>
          <Pressable testID="split-prompt-dismiss" onPress={() => setSplitPrompt(null)} disabled={splitSaving} style={styles.remove}>
            <Text style={authStyles.linkText}>Not now</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
    <Calculator visible={calcOpen} initial={form.amount} onClose={() => setCalcOpen(false)} onApply={(_v, display) => { setForm((f) => ({ ...f, amount: display })); setCalcOpen(false); }} />
    {datePickerOpen ? (
      <View style={styles.pickerOverlay} testID="date-picker-overlay">
        <Pressable style={StyleSheet.absoluteFill} onPress={() => setDatePickerOpen(false)} />
        <View style={styles.pickerSheet}>
          <View style={styles.modalHead}><Text style={styles.modalTitle}>Pick a date</Text><Pressable testID="close-date-picker" onPress={() => setDatePickerOpen(false)}><Feather name="x" size={22} color={COLORS.muted} /></Pressable></View>
          <Calendar selected={form.date} allowFuture onSelect={(iso) => { setForm((f) => ({ ...f, date: iso })); setDatePickerOpen(false); }} />
        </View>
      </View>
    ) : null}
    </KeyboardAvoidingView></Modal>
    <TransactionActionsSheet t={actionsFor} onClose={() => setActionsFor(null)} onEdit={openEdit} onDelete={askDelete} />
    <ConfirmDeleteSheet t={confirmDelete} onCancel={() => setConfirmDelete(null)} onConfirm={deleteTransaction} />
    <BudgetSheet category={budgetSheet} currentLimit={budgetSheet ? budgetMap[budgetSheet] : undefined} onClose={() => setBudgetSheet(null)} onSave={saveBudget} onRemove={removeBudget} />
    <SavingsGoalSheet visible={goalSheetOpen} goal={editingGoal} saved={editingGoal ? (savedByGoal[editingGoal.id] || 0) : 0} onClose={() => { setGoalSheetOpen(false); setEditingGoal(null); }} onSave={saveGoal} onRemove={removeGoal} />
    <CelebrationOverlay goal={celebrateGoal} onClose={() => setCelebrateGoal(null)} />
    <SettingsSheet visible={settingsOpen} month={month} monthTransactions={current} isAdmin={user.role === "admin"} email={recoveryEmail} onClose={() => setSettingsOpen(false)} onChangePassword={() => { setSettingsOpen(false); setChangePwOpen(true); }} onOpenRecoveryEmail={() => { setSettingsOpen(false); setRecoveryOpen(true); }} onOpenDeleteAccount={() => { setSettingsOpen(false); setDeleteAcctOpen(true); }} onOpenAdmin={() => { setSettingsOpen(false); setAdminOpen(true); }} onSignedOut={() => { setSettingsOpen(false); signOut().then(onSignedOut); }} />
    <ChangePasswordSheet visible={changePwOpen} onClose={() => setChangePwOpen(false)} />
    <DeleteAccountSheet visible={deleteAcctOpen} onClose={() => setDeleteAcctOpen(false)} onDeleted={() => { setDeleteAcctOpen(false); onSignedOut(); }} />
    <RecoveryEmailSheet visible={recoveryOpen} currentEmail={recoveryEmail} onClose={() => setRecoveryOpen(false)} onSaved={setRecoveryEmailState} />
    <AdminSheet visible={adminOpen} onClose={() => setAdminOpen(false)} />
  </SafeAreaView>;
}

const menuStyles = StyleSheet.create({
  fab: { position: "absolute", right: 20, bottom: 28, width: 58, height: 58, borderRadius: 29, backgroundColor: COLORS.green, alignItems: "center", justifyContent: "center", shadowColor: "#000", shadowOpacity: 0.2, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 6 },
  burger: { width: 42, height: 42, borderRadius: 13, backgroundColor: COLORS.card, borderWidth: 1, borderColor: COLORS.line, alignItems: "center", justifyContent: "center", marginRight: 12 },
  drawerWrap: { flex: 1, flexDirection: "row" },
  drawer: { width: 290, maxWidth: "82%", backgroundColor: COLORS.bg, paddingTop: 56, paddingHorizontal: 14, gap: 4, shadowColor: "#000", shadowOpacity: 0.2, shadowRadius: 16, shadowOffset: { width: 4, height: 0 }, elevation: 12 },
  backdrop: { flex: 1, backgroundColor: "rgba(28,28,30,0.45)" },
  drawerHead: { flexDirection: "row", alignItems: "center", paddingHorizontal: 8, paddingBottom: 18 },
  drawerBrand: { fontSize: 20, fontWeight: "800", color: COLORS.ink },
  drawerUser: { fontSize: 13, color: COLORS.muted, marginTop: 2 },
  item: { flexDirection: "row", alignItems: "center", gap: 14, paddingHorizontal: 12, minHeight: 50, borderRadius: 14 },
  itemText: { fontSize: 15, fontWeight: "600", color: COLORS.ink },
});
