import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Alert, KeyboardAvoidingView, Modal, Platform, Pressable, SafeAreaView, ScrollView, Share, StyleSheet, Text, TextInput, View } from "react-native";
import Svg, { Circle } from "react-native-svg";
import ConfettiCannon from "react-native-confetti-cannon";
import ImportSheet from "@/src/import/ImportSheet";
import Calendar, { prettyDate, todayIso } from "@/src/components/Calendar";
import Calculator from "@/src/components/Calculator";
import { storage } from "@/src/utils/storage";
import { authorizedRequest, changePin, restoreSession, signIn, signOut, signUp, User } from "@/src/auth";

type TxType = "expense" | "income" | "savings";
type Transaction = { id: string; type: TxType; amount: number; category: string; note?: string; date: string; created_at: string; goal_id?: string | null };
type Budget = { id: string; category: string; monthly_limit: number; updated_at: string };
type AdminUser = { id: string; username: string; phone: string; role: string; disabled: boolean; created_at?: string | null; transaction_count: number; balance: number };
type SavingsGoal = { id: string; name: string; target: number; target_date?: string | null; celebrated: boolean; created_at: string; updated_at: string };
const COLORS = { bg: "#F9F8F6", ink: "#1C1C1E", muted: "#777773", green: "#4A6B5D", pale: "#E5EBE8", card: "#FFFFFF", line: "#E5E4E0", red: "#B23B3B", gold: "#C28E38", negBalance: "#FF8A8A" };
const TRANSFERRED_CATEGORIES = ["Food", "Transport", "Bills", "Rent", "Shopping", "Health", "Travel", "Other"];
const RECEIVED_CATEGORIES = ["Salary", "Interest", "Trading", "Other"];
const SAVINGS_CATEGORIES = ["Emergency Fund", "Goal", "Investment", "Retirement", "Other"];
const categoriesFor = (type: TxType) => (type === "expense" ? TRANSFERRED_CATEGORIES : type === "income" ? RECEIVED_CATEGORIES : SAVINGS_CATEGORIES);
const money = (n: number) => `₹${Math.abs(n).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
const monthLabel = (ym: string) => { const [y, m] = ym.split("-").map(Number); return new Date(y, m - 1, 1).toLocaleDateString("en-IN", { month: "long", year: "numeric" }); };
const nowMonth = () => new Date().toISOString().slice(0, 7);
const shiftMonth = (ym: string, delta: number) => { const [y, m] = ym.split("-").map(Number); const d = new Date(y, m - 1 + delta, 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`; };
const addMonthsIso = (n: number) => { const d = new Date(); d.setMonth(d.getMonth() + n); return d.toISOString().slice(0, 10); };
const dateLabel = (iso: string) => new Date(iso + "T00:00:00").toLocaleDateString("en-IN", { month: "short", year: "numeric" });
const monthsUntil = (iso: string) => { const now = new Date(); const t = new Date(iso + "T00:00:00"); return (t.getFullYear() - now.getFullYear()) * 12 + (t.getMonth() - now.getMonth()); };
const GOAL_PRESETS: { label: string; months: number | null }[] = [{ label: "No date", months: null }, { label: "3 mo", months: 3 }, { label: "6 mo", months: 6 }, { label: "1 yr", months: 12 }, { label: "2 yr", months: 24 }];

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
  const [importOpen, setImportOpen] = useState(false);
  const [changePwOpen, setChangePwOpen] = useState(false);
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
      Alert.alert("Couldn’t load data", "Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { load(); }, [load]);
  const current = useMemo(() => transactions.filter((t) => t.date.startsWith(month)), [transactions, month]);
  const spent = current.filter((t) => t.type === "expense").reduce((s, t) => s + t.amount, 0);
  const income = current.filter((t) => t.type === "income").reduce((s, t) => s + t.amount, 0);
  const savings = current.filter((t) => t.type === "savings").reduce((s, t) => s + t.amount, 0);
  const savedByGoal = useMemo(() => {
    const map: Record<string, number> = {};
    for (const t of transactions) if (t.type === "savings" && t.goal_id) map[t.goal_id] = (map[t.goal_id] || 0) + t.amount;
    return map;
  }, [transactions]);
  const rawBalance = transactions.reduce((s, t) => s + (t.type === "income" ? t.amount : t.type === "expense" ? -t.amount : 0), 0);
  const balance = Math.abs(rawBalance) < 0.5 ? 0 : Math.round(rawBalance * 100) / 100;
  const byCategory = TRANSFERRED_CATEGORIES.map((category) => ({ category, amount: current.filter((t) => t.type === "expense" && t.category === category).reduce((s, t) => s + t.amount, 0) })).filter((x) => x.amount > 0).sort((a, b) => b.amount - a.amount);
  const max = byCategory[0]?.amount || 1;
  const budgetMap = useMemo(() => Object.fromEntries(budgets.map((b) => [b.category, b.monthly_limit])) as Record<string, number>, [budgets]);
  const overBudget = useMemo(() => byCategory.filter((x) => budgetMap[x.category] && x.amount > budgetMap[x.category]), [byCategory, budgetMap]);
  const isCurrentMonth = month === nowMonth();
  const openAdd = () => { setEditing(null); setForm({ amount: "", category: TRANSFERRED_CATEGORIES[0], note: "", type: "expense", goalId: null, date: todayIso() }); setEditorOpen(true); };
  const openEdit = (t: Transaction) => { setEditing(t); setForm({ amount: String(t.amount), category: t.category, note: t.note || "", type: t.type, goalId: t.goal_id ?? null, date: t.date }); setActionsFor(null); setEditorOpen(true); };
  const closeEditor = () => { setEditorOpen(false); setEditing(null); };
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
        if (created.type === "expense") {
          setTimeout(() => {
            Alert.alert(
              "Split this amount?",
              `Divide ${money(created.amount)} between friends and track who owes what.`,
              [
                { text: "Not now", style: "cancel" },
                {
                  text: "Split it",
                  onPress: () => router.push({ pathname: "/split/new", params: { amount: String(created.amount), note: created.note || created.category } }),
                },
              ],
            );
          }, 250);
        }
      }
    } catch { Alert.alert("Couldn’t save", "Please try again."); }
  };
  const deleteTransaction = async (t: Transaction) => {
    try {
      await authorizedRequest(`/transactions/${t.id}`, { method: "DELETE" });
      setTransactions((x) => x.filter((r) => r.id !== t.id));
      setActionsFor(null);
      setConfirmDelete(null);
    } catch { Alert.alert("Couldn’t delete", "Please try again."); }
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
    } catch { Alert.alert("Couldn’t save budget", "Please try again."); }
  };
  const removeBudget = async (category: string) => {
    try {
      await authorizedRequest(`/budgets/${encodeURIComponent(category)}`, { method: "DELETE" });
      setBudgets((prev) => prev.filter((b) => b.category !== category));
      setBudgetSheet(null);
    } catch { Alert.alert("Couldn’t remove", "Please try again."); }
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
    } catch { Alert.alert("Couldn’t save goal", "Please try again."); }
  };
  const removeGoal = async () => {
    if (!editingGoal) return;
    try {
      await authorizedRequest(`/savings-goals/${editingGoal.id}`, { method: "DELETE" });
      setSavingsGoals((prev) => prev.filter((g) => g.id !== editingGoal.id));
      setTransactions((prev) => prev.map((t) => (t.goal_id === editingGoal.id ? { ...t, goal_id: null } : t)));
      setGoalSheetOpen(false);
      setEditingGoal(null);
    } catch { Alert.alert("Couldn’t remove goal", "Please try again."); }
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
    <View style={styles.top}><View style={{ flex: 1 }}><Text style={styles.eyebrow}>PERSONAL FINANCE</Text><Text style={styles.title}>Hi {user.username}</Text><View style={styles.profileMetaRow}><Text style={styles.sectionSub} numberOfLines={1}>{user.phone}</Text></View></View><View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}><Pressable testID="open-import" onPress={() => setImportOpen(true)} style={styles.importBtn}><Feather name="message-square" size={16} color={COLORS.green} /><Text style={styles.importBtnText}>SMS</Text></Pressable><Pressable testID="open-settings" onPress={() => setSettingsOpen(true)} style={styles.avatar}><Text style={styles.avatarText}>{user.username.slice(0, 2).toUpperCase()}</Text></Pressable></View></View>
    <View style={styles.hero}><View style={styles.heroTop}><Text style={styles.heroLabel}>TOTAL BALANCE</Text><Feather name="more-horizontal" size={20} color="#B5C8BE" /></View><Text testID="total-balance" style={[styles.balance, balance < 0 && styles.balanceNeg]}>{balance < 0 ? "-" : ""}{money(balance)}</Text><View style={styles.delta}><Feather name="trending-up" size={13} color="#D7E8DE" /><Text style={styles.deltaText}>On track this month</Text></View><View style={styles.heroBottom}><Text style={styles.heroSmall}>Updated just now</Text><Text style={styles.heroSmall}>{transactions.length} transactions</Text></View></View>
    {overBudget.length > 0 && <View testID="budget-alert-banner" style={styles.alertBanner}><Feather name="alert-triangle" size={16} color={COLORS.red} /><Text style={styles.alertText}>Over budget on {overBudget.map((x) => x.category).join(", ")}</Text></View>}
    {balance < 0 && <View testID="low-balance-alert" style={styles.lowBalanceCard}><View style={styles.lowBalanceIcon}><Feather name="trending-down" size={18} color={COLORS.red} /></View><View style={{ flex: 1 }}><Text style={styles.lowBalanceTitle}>Balance is in the red</Text><Text style={styles.lowBalanceSub}>You’ve transferred {money(balance)} more than you’ve received. Ease up or add income to get back on track.</Text></View></View>}
    <View style={styles.tabs}>{["Overview", "Analytics", "Categories", "Calendar"].map((x) => <Pressable testID={`tab-${x.toLowerCase()}`} key={x} onPress={() => setTab(x)} style={[styles.tab, tab === x && styles.tabActive]}><Text style={[styles.tabText, tab === x && styles.tabTextActive]} numberOfLines={1}>{x}</Text></Pressable>)}</View>
    {loading ? <ActivityIndicator color={COLORS.green} style={styles.loader} /> : tab === "Calendar" ? <CalendarView transactions={transactions} onOpenTx={setActionsFor} onAdd={openAdd} /> : tab === "Categories" ? <CategoriesView data={byCategory} max={max} budgetMap={budgetMap} onEditBudget={setBudgetSheet} /> : tab === "Analytics" ? <Analytics spent={spent} income={income} data={byCategory} max={max} transactions={transactions} month={month} /> : <>
      <View style={styles.monthPicker}>
        <Pressable testID="prev-month" onPress={() => setMonth((m) => shiftMonth(m, -1))} style={styles.monthNav}><Feather name="chevron-left" size={18} color={COLORS.ink} /></Pressable>
        <Text testID="month-label" style={styles.monthText}>{monthLabel(month)}</Text>
        <Pressable testID="next-month" disabled={isCurrentMonth} onPress={() => setMonth((m) => shiftMonth(m, 1))} style={[styles.monthNav, isCurrentMonth && { opacity: 0.3 }]}><Feather name="chevron-right" size={18} color={COLORS.ink} /></Pressable>
      </View>
      <View style={styles.sectionHeader}><View><Text style={styles.sectionTitle}>Monthly summary</Text><Text style={styles.sectionSub}>{isCurrentMonth ? "Live overview" : "Past month view"}</Text></View><Pressable testID="add-transaction-small" onPress={openAdd} style={styles.addSmall}><Feather name="plus" size={18} color="#FFF" /></Pressable></View>
      <View style={styles.summaryGrid}><Metric label="Transferred" value={spent} tone={COLORS.red} icon="arrow-up-right" /><Metric label="Received" value={income} tone={COLORS.green} icon="arrow-down-left" /><Metric label="Savings" value={savings} tone={COLORS.gold} icon="pie-chart" /></View>
      <View style={styles.sectionHeader}><View><Text style={styles.sectionTitle}>Savings goals</Text><Text style={styles.sectionSub}>Track your targets & progress</Text></View><Pressable testID="add-goal-btn" onPress={openNewGoal} style={styles.addSmall}><Feather name="plus" size={18} color="#FFF" /></Pressable></View>
      {savingsGoals.length === 0
        ? <Pressable testID="set-savings-goal" onPress={openNewGoal} style={styles.goalEmptyCard}><View style={styles.goalEmptyIcon}><Feather name="target" size={20} color={COLORS.gold} /></View><View style={{ flex: 1 }}><Text style={styles.cardTitleTight}>Create your first goal</Text><Text style={styles.goalEmptySub}>Name a target and watch your set-aside money fill the ring.</Text></View><Feather name="plus-circle" size={20} color={COLORS.gold} /></Pressable>
        : savingsGoals.map((g) => <GoalCard key={g.id} goal={g} saved={savedByGoal[g.id] || 0} onEdit={() => openEditGoal(g)} />)}
      <View style={styles.card}><Text style={styles.cardTitle}>Spending by category</Text>{byCategory.length === 0 ? <Empty onAdd={openAdd} /> : byCategory.slice(0, 5).map((x) => <Bar key={x.category} category={x.category} amount={x.amount} max={max} limit={budgetMap[x.category]} />)}</View>
      <View style={styles.sectionHeader}><View><Text style={styles.sectionTitle}>Recent activity</Text><Text style={styles.sectionSub}>Long-press to edit or delete</Text></View><Text style={styles.seeAll}>See all</Text></View>
      <View style={styles.card}>{current.slice(0, 5).map((t) => <TransactionRow key={t.id} t={t} onLongPress={() => setActionsFor(t)} />)}{current.length === 0 && <Text style={styles.emptyText}>No transactions recorded for {monthLabel(month)}.</Text>}</View>
    </>}
  </ScrollView><View style={styles.bottom}><Nav icon="grid" label="Overview" active={tab === "Overview"} onPress={() => setTab("Overview")} /><Nav icon="bar-chart-2" label="Analytics" active={tab === "Analytics"} onPress={() => setTab("Analytics")} /><Pressable testID="add-transaction-fab" style={styles.fab} onPress={openAdd}><Feather name="plus" size={24} color="#FFF" /></Pressable><Nav icon="users" label="Splits" active={false} onPress={() => router.push("/splits")} /><Nav icon="settings" label="Settings" active={false} onPress={() => setSettingsOpen(true)} /></View>
    <Modal visible={editorOpen} transparent animationType="slide" onRequestClose={closeEditor}><KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={styles.modalShade}><View style={[styles.modal, { maxHeight: "92%" }]}><ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: 12, paddingBottom: 8 }}><View style={styles.modalHead}><Text style={styles.modalTitle}>{editing ? "Edit transaction" : "Add transaction"}</Text><Pressable testID="close-add-transaction" onPress={closeEditor}><Feather name="x" size={22} color={COLORS.muted} /></Pressable></View><View style={styles.typeRow}><Pressable testID="type-expense" onPress={() => chooseType("expense")} style={[styles.type, form.type === "expense" && styles.typeExpense]}><Text style={[styles.typeText, form.type === "expense" && { color: COLORS.red }]} numberOfLines={1}>Transferred</Text></Pressable><Pressable testID="type-income" onPress={() => chooseType("income")} style={[styles.type, form.type === "income" && styles.typeIncome]}><Text style={[styles.typeText, form.type === "income" && { color: COLORS.green }]} numberOfLines={1}>Received</Text></Pressable><Pressable testID="type-savings" onPress={() => chooseType("savings")} style={[styles.type, form.type === "savings" && styles.typeSavings]}><Text style={[styles.typeText, form.type === "savings" && { color: COLORS.gold }]} numberOfLines={1}>Savings</Text></Pressable></View><Text style={styles.inputLabel}>AMOUNT</Text><View style={styles.amountRow}><TextInput testID="transaction-amount" value={form.amount} onChangeText={(amount) => setForm({ ...form, amount })} keyboardType="decimal-pad" placeholder="₹ 0" placeholderTextColor="#A9AAA5" style={[styles.input, { flex: 1 }]} /><Pressable testID="open-calculator" onPress={() => setCalcOpen(true)} style={styles.calcBtn}><MaterialCommunityIcons name="calculator-variant-outline" size={22} color={COLORS.green} /></Pressable></View><Text style={styles.inputLabel}>DATE</Text><Pressable testID="open-date-picker" onPress={() => setDatePickerOpen(true)} style={styles.dateField}><Feather name="calendar" size={18} color={COLORS.green} /><Text style={styles.dateFieldText}>{prettyDate(form.date)}</Text><Feather name="chevron-down" size={18} color={COLORS.muted} /></Pressable>{form.type === "savings" && savingsGoals.length > 0 ? <><Text style={styles.inputLabel}>ADD TO GOAL</Text><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>{savingsGoals.map((g) => <Pressable testID={`goal-chip-${g.id}`} key={g.id} onPress={() => setForm({ ...form, goalId: g.id, category: g.name })} style={[styles.chip, form.goalId === g.id && styles.chipActive]}><Text style={[styles.chipText, form.goalId === g.id && styles.chipTextActive]}>{g.name}</Text></Pressable>)}<Pressable testID="goal-chip-general" onPress={() => setForm({ ...form, goalId: null, category: "General" })} style={[styles.chip, form.goalId === null && styles.chipActive]}><Text style={[styles.chipText, form.goalId === null && styles.chipTextActive]}>General</Text></Pressable></ScrollView></> : <><Text style={styles.inputLabel}>CATEGORY</Text><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>{categoriesFor(form.type).map((c) => <Pressable testID={`category-${c.toLowerCase().replace(/\s+/g, "-")}`} key={c} onPress={() => setForm({ ...form, category: c })} style={[styles.chip, form.category === c && styles.chipActive]}><Text style={[styles.chipText, form.category === c && styles.chipTextActive]}>{c}</Text></Pressable>)}</ScrollView></>}<Text style={styles.inputLabel}>NOTE</Text><TextInput value={form.note} onChangeText={(note) => setForm({ ...form, note })} placeholder="Optional note" placeholderTextColor="#A9AAA5" style={styles.input} /><Pressable testID="save-transaction" onPress={submitTransaction} style={styles.save}><Text style={styles.saveText}>{editing ? "Save changes" : "Save transaction"}</Text></Pressable></ScrollView></View>
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
    <SettingsSheet visible={settingsOpen} month={month} monthTransactions={current} isAdmin={user.role === "admin"} onClose={() => setSettingsOpen(false)} onChangePassword={() => { setSettingsOpen(false); setChangePwOpen(true); }} onOpenAdmin={() => { setSettingsOpen(false); setAdminOpen(true); }} onSignedOut={() => { setSettingsOpen(false); signOut().then(onSignedOut); }} />
    <ChangePasswordSheet visible={changePwOpen} onClose={() => setChangePwOpen(false)} />
    <AdminSheet visible={adminOpen} onClose={() => setAdminOpen(false)} />
    <ImportSheet
      visible={importOpen}
      onClose={() => setImportOpen(false)}
      onSaved={(createdList) => { setTransactions((x) => [...createdList, ...x]); }}
      onEditPrefilled={(draft) => {
        setEditing(null);
        setForm({ amount: String(draft.amount), category: draft.category, note: draft.note, type: draft.type, goalId: null, date: todayIso() });
        setEditorOpen(true);
      }}
    />
  </SafeAreaView>;
}

function SettingsSheet({ visible, month, monthTransactions, isAdmin, onClose, onChangePassword, onOpenAdmin, onSignedOut }: { visible: boolean; month: string; monthTransactions: Transaction[]; isAdmin: boolean; onClose: () => void; onChangePassword: () => void; onOpenAdmin: () => void; onSignedOut: () => void }) {
  const [busy, setBusy] = useState(false);
  const shareCsv = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const token = await storage.secureGet("spendpulse-auth-token", null);
      const res = await fetch(`${process.env.EXPO_PUBLIC_BACKEND_URL}/api/transactions/export?month=${month}`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error("Export failed");
      const csv = await res.text();
      await Share.share({ title: `SpendPulse ${monthLabel(month)}.csv`, message: csv });
    } catch { Alert.alert("Couldn’t export", "Please try again."); }
    finally { setBusy(false); }
  };
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.modalShade} onPress={onClose}>
        <Pressable style={styles.modal} onPress={(e) => e.stopPropagation()}>
          <View style={styles.modalHead}>
            <Text style={styles.modalTitle}>Settings</Text>
            <Pressable testID="close-settings" onPress={onClose}><Feather name="x" size={22} color={COLORS.muted} /></Pressable>
          </View>
          <Text style={styles.emptyText}>{monthTransactions.length} transactions recorded in {monthLabel(month)}.</Text>
          <Pressable testID="export-csv" onPress={shareCsv} disabled={busy || monthTransactions.length === 0} style={[styles.actionBtn, (busy || monthTransactions.length === 0) && { opacity: 0.55 }]}>
            <Feather name="download" size={18} color={COLORS.ink} />
            <Text style={styles.actionText}>{busy ? "Preparing…" : `Export ${monthLabel(month)} as CSV`}</Text>
          </Pressable>
          <Pressable testID="change-password" onPress={onChangePassword} style={styles.actionBtn}>
            <Feather name="lock" size={18} color={COLORS.ink} />
            <Text style={styles.actionText}>Change PIN</Text>
          </Pressable>
          {isAdmin && (
            <Pressable testID="open-admin-panel" onPress={onOpenAdmin} style={styles.actionBtn}>
              <Feather name="shield" size={18} color={COLORS.ink} />
              <Text style={styles.actionText}>Admin panel</Text>
            </Pressable>
          )}
          <Pressable testID="settings-logout" onPress={onSignedOut} style={[styles.actionBtn, styles.actionBtnDanger]}>
            <Feather name="log-out" size={18} color={COLORS.red} />
            <Text style={[styles.actionText, { color: COLORS.red }]}>Log out</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function ChangePasswordSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [ok, setOk] = useState(false);
  useEffect(() => { if (!visible) { setCurrent(""); setNext(""); setError(""); setOk(false); } }, [visible]);
  const submit = async () => {
    if (!/^\d{6}$/.test(current) || !/^\d{6}$/.test(next)) { setError("Enter your current 6-digit PIN and a new 6-digit PIN."); return; }
    setBusy(true); setError("");
    try {
      await changePin(current, next);
      setOk(true);
      setTimeout(onClose, 900);
    } catch (e) { setError(e instanceof Error ? e.message : "Please try again."); }
    finally { setBusy(false); }
  };
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={styles.modalShade}>
        <View style={styles.modal}>
          <View style={styles.modalHead}>
            <Text style={styles.modalTitle}>Change PIN</Text>
            <Pressable testID="close-change-password" onPress={onClose}><Feather name="x" size={22} color={COLORS.muted} /></Pressable>
          </View>
          <Text style={styles.inputLabel}>CURRENT PIN</Text>
          <TextInput testID="current-password" value={current} onChangeText={(v) => setCurrent(v.replace(/[^0-9]/g, "").slice(0, 6))} keyboardType="number-pad" secureTextEntry placeholder="6-digit PIN" placeholderTextColor="#A9AAA5" style={styles.input} maxLength={6} />
          <Text style={styles.inputLabel}>NEW PIN</Text>
          <TextInput testID="new-password" value={next} onChangeText={(v) => setNext(v.replace(/[^0-9]/g, "").slice(0, 6))} keyboardType="number-pad" secureTextEntry placeholder="6-digit PIN" placeholderTextColor="#A9AAA5" style={styles.input} maxLength={6} />
          {error ? <Text style={authStyles.authError}>{error}</Text> : null}
          {ok ? <Text style={authStyles.authInfo}>PIN updated.</Text> : null}
          <Pressable testID="submit-change-password" onPress={submit} disabled={busy || ok} style={[styles.save, (busy || ok) && authStyles.disabled]}>
            {busy ? <ActivityIndicator color="#FFF" /> : <Text style={styles.saveText}>Update PIN</Text>}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function AdminSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<AdminUser | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmUser, setConfirmUser] = useState<AdminUser | null>(null);
  const [deleteError, setDeleteError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const list = await authorizedRequest<AdminUser[]>("/admin/users");
      setUsers(list);
    } catch { Alert.alert("Couldn't load users", "Please try again."); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { if (visible) { setSelected(null); load(); } }, [visible, load]);

  const toggleDisabled = async (u: AdminUser) => {
    setBusyId(u.id);
    try {
      await authorizedRequest(`/admin/users/${u.id}/disable`, { method: "PUT", body: JSON.stringify({ disabled: !u.disabled }) });
      setUsers((prev) => prev.map((x) => (x.id === u.id ? { ...x, disabled: !u.disabled } : x)));
    } catch (e) { Alert.alert("Couldn't update", e instanceof Error ? e.message : "Please try again."); }
    finally { setBusyId(null); }
  };
  const deleteUser = (u: AdminUser) => { setDeleteError(""); setConfirmUser(u); };
  const performDeleteUser = async () => {
    if (!confirmUser) return;
    setBusyId(confirmUser.id); setDeleteError("");
    try {
      await authorizedRequest(`/admin/users/${confirmUser.id}`, { method: "DELETE" });
      setUsers((prev) => prev.filter((x) => x.id !== confirmUser.id));
      setConfirmUser(null);
    } catch (e) { setDeleteError(e instanceof Error ? e.message : "Please try again."); }
    finally { setBusyId(null); }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={selected ? () => setSelected(null) : onClose}>
      <View style={styles.modalShade}>
        <View style={[styles.modal, { maxHeight: "88%" }]}>
          <View style={styles.modalHead}>
            <Text style={styles.modalTitle}>{selected ? selected.username : "Admin panel"}</Text>
            <Pressable testID="close-admin" onPress={selected ? () => setSelected(null) : onClose}>
              <Feather name={selected ? "arrow-left" : "x"} size={22} color={COLORS.muted} />
            </Pressable>
          </View>
          {selected
            ? <AdminUserDetail user={selected} onBack={() => setSelected(null)} />
            : loading
              ? <ActivityIndicator color={COLORS.green} style={styles.loader} />
              : (
                <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingBottom: 8 }}>
                  <Text style={styles.emptyText}>{users.length} registered {users.length === 1 ? "user" : "users"}.</Text>
                  {users.map((u) => (
                    <View key={u.id} testID={`admin-user-${u.username}`} style={styles.card}>
                      <View style={styles.rowBetween}>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.cardTitleTight}>{u.username}{u.role === "admin" ? "  ·  admin" : ""}</Text>
                          <Text style={styles.transactionSub}>{u.phone}</Text>
                        </View>
                        {u.disabled && <View style={styles.goalBadge}><Text style={[styles.goalBadgeText, { color: COLORS.red }]}>Disabled</Text></View>}
                      </View>
                      <View style={styles.rowBetween}>
                        <Text style={styles.transactionSub}>Balance: <Text style={{ color: u.balance < 0 ? COLORS.red : COLORS.green, fontWeight: "700" }}>{u.balance < 0 ? "-" : ""}{money(u.balance)}</Text></Text>
                        <Text style={styles.transactionSub}>{u.transaction_count} transaction{u.transaction_count === 1 ? "" : "s"}</Text>
                      </View>
                      <Pressable testID={`admin-view-${u.username}`} onPress={() => setSelected(u)} style={styles.actionBtn}>
                        <Feather name="eye" size={16} color={COLORS.ink} />
                        <Text style={styles.actionText}>View transactions</Text>
                      </Pressable>
                      <Pressable testID={`admin-toggle-${u.username}`} disabled={busyId === u.id} onPress={() => toggleDisabled(u)} style={styles.actionBtn}>
                        <Feather name={u.disabled ? "unlock" : "lock"} size={16} color={COLORS.ink} />
                        <Text style={styles.actionText}>{u.disabled ? "Enable account" : "Disable account"}</Text>
                      </Pressable>
                      {u.role !== "admin" && (
                        <Pressable testID={`admin-delete-${u.username}`} disabled={busyId === u.id} onPress={() => deleteUser(u)} style={[styles.actionBtn, styles.actionBtnDanger]}>
                          <Feather name="trash-2" size={16} color={COLORS.red} />
                          <Text style={[styles.actionText, { color: COLORS.red }]}>Delete user</Text>
                        </Pressable>
                      )}
                    </View>
                  ))}
                </ScrollView>
              )}
        </View>
          <Modal visible={!!confirmUser} transparent animationType="fade" onRequestClose={() => setConfirmUser(null)}>
            <Pressable style={styles.modalShade} onPress={() => setConfirmUser(null)}>
              <Pressable style={styles.modal} onPress={(e) => e.stopPropagation()}>
                <View style={styles.modalHead}>
                  <Text style={styles.modalTitle}>Delete user?</Text>
                  <Pressable testID="close-confirm-user" onPress={() => setConfirmUser(null)}><Feather name="x" size={22} color={COLORS.muted} /></Pressable>
                </View>
                <Text style={styles.emptyText}>This permanently deletes {confirmUser?.username} ({confirmUser?.phone}) and all of their transactions, budgets, goals and splits. This can’t be undone.</Text>
                {deleteError ? <Text style={authStyles.authError}>{deleteError}</Text> : null}
                <Pressable testID="confirm-delete-user" disabled={busyId === confirmUser?.id} onPress={performDeleteUser} style={[styles.save, { backgroundColor: COLORS.red }, busyId === confirmUser?.id && authStyles.disabled]}>
                  {busyId === confirmUser?.id ? <ActivityIndicator color="#FFF" /> : <Text style={styles.saveText}>Delete user</Text>}
                </Pressable>
                <Pressable testID="cancel-delete-user" onPress={() => setConfirmUser(null)} style={styles.remove}><Text style={authStyles.linkText}>Cancel</Text></Pressable>
              </Pressable>
            </Pressable>
          </Modal>
      </View>
    </Modal>
  );
}

function AdminUserDetail({ user }: { user: AdminUser; onBack: () => void }) {
  const [txs, setTxs] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Transaction | null>(null);
  const [confirmTx, setConfirmTx] = useState<Transaction | null>(null);
  const [txError, setTxError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const list = await authorizedRequest<Transaction[]>(`/admin/users/${user.id}/transactions`);
      setTxs(list);
    } catch { Alert.alert("Couldn't load transactions", "Please try again."); }
    finally { setLoading(false); }
  }, [user.id]);
  useEffect(() => { load(); }, [load]);

  const performDeleteTx = async () => {
    if (!confirmTx) return;
    try {
      await authorizedRequest(`/admin/transactions/${confirmTx.id}`, { method: "DELETE" });
      setTxs((prev) => prev.filter((x) => x.id !== confirmTx.id));
      setConfirmTx(null);
    } catch (e) { setTxError(e instanceof Error ? e.message : "Please try again."); }
  };

  return (
    <>
      {loading ? <ActivityIndicator color={COLORS.green} style={styles.loader} /> : (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: 4, paddingBottom: 8 }}>
          {txs.length === 0 && <Text style={styles.emptyText}>No transactions for this user yet.</Text>}
          {txs.map((t) => <TransactionRow key={t.id} t={t} onLongPress={() => setEditing(t)} />)}
        </ScrollView>
      )}
      <AdminEditTransactionSheet t={editing} onClose={() => setEditing(null)} onSaved={(updated) => { setTxs((prev) => prev.map((x) => (x.id === updated.id ? updated : x))); setEditing(null); }} onDeleted={() => { const t = editing; setEditing(null); if (t) { setTxError(""); setConfirmTx(t); } }} />
      <Modal visible={!!confirmTx} transparent animationType="fade" onRequestClose={() => setConfirmTx(null)}>
        <Pressable style={styles.modalShade} onPress={() => setConfirmTx(null)}>
          <Pressable style={styles.modal} onPress={(e) => e.stopPropagation()}>
            <View style={styles.modalHead}>
              <Text style={styles.modalTitle}>Delete transaction?</Text>
              <Pressable testID="close-confirm-admin-tx" onPress={() => setConfirmTx(null)}><Feather name="x" size={22} color={COLORS.muted} /></Pressable>
            </View>
            <Text style={styles.emptyText}>{confirmTx ? `${confirmTx.category} · ${money(confirmTx.amount)} · ${confirmTx.date}` : ""}</Text>
            <Text style={styles.emptyText}>This can’t be undone.</Text>
            {txError ? <Text style={authStyles.authError}>{txError}</Text> : null}
            <Pressable testID="confirm-delete-admin-tx" onPress={performDeleteTx} style={[styles.save, { backgroundColor: COLORS.red }]}><Text style={styles.saveText}>Delete transaction</Text></Pressable>
            <Pressable testID="cancel-delete-admin-tx" onPress={() => setConfirmTx(null)} style={styles.remove}><Text style={authStyles.linkText}>Cancel</Text></Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

function AdminEditTransactionSheet({ t, onClose, onSaved, onDeleted }: { t: Transaction | null; onClose: () => void; onSaved: (t: Transaction) => void; onDeleted: () => void }) {
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (t) { setAmount(String(t.amount)); setCategory(t.category); setNote(t.note || ""); } }, [t]);
  const save = async () => {
    if (!t) return;
    const amt = Number(amount);
    if (!amt || amt <= 0) return Alert.alert("Add an amount", "Enter a value greater than zero.");
    setBusy(true);
    try {
      const updated = await authorizedRequest<Transaction>(`/admin/transactions/${t.id}`, { method: "PUT", body: JSON.stringify({ amount: amt, category: category.trim(), note: note.trim() }) });
      onSaved(updated);
    } catch (e) { Alert.alert("Couldn't save", e instanceof Error ? e.message : "Please try again."); }
    finally { setBusy(false); }
  };
  return (
    <Modal visible={!!t} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={styles.modalShade}>
        <View style={styles.modal}>
          <View style={styles.modalHead}>
            <Text style={styles.modalTitle}>Edit transaction</Text>
            <Pressable testID="close-admin-edit-tx" onPress={onClose}><Feather name="x" size={22} color={COLORS.muted} /></Pressable>
          </View>
          <Text style={styles.inputLabel}>AMOUNT</Text>
          <TextInput testID="admin-tx-amount" value={amount} onChangeText={setAmount} keyboardType="decimal-pad" style={styles.input} />
          <Text style={styles.inputLabel}>CATEGORY</Text>
          <TextInput testID="admin-tx-category" value={category} onChangeText={setCategory} style={styles.input} />
          <Text style={styles.inputLabel}>NOTE</Text>
          <TextInput testID="admin-tx-note" value={note} onChangeText={setNote} style={styles.input} />
          <Pressable testID="admin-save-tx" onPress={save} disabled={busy} style={[styles.save, busy && authStyles.disabled]}>
            {busy ? <ActivityIndicator color="#FFF" /> : <Text style={styles.saveText}>Save changes</Text>}
          </Pressable>
          <Pressable testID="admin-delete-tx" onPress={onDeleted} style={styles.remove}><Text style={styles.removeText}>Delete transaction</Text></Pressable>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function TransactionActionsSheet({ t, onClose, onEdit, onDelete }: { t: Transaction | null; onClose: () => void; onEdit: (t: Transaction) => void; onDelete: (t: Transaction) => void }) {
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

function ConfirmDeleteSheet({ t, onCancel, onConfirm }: { t: Transaction | null; onCancel: () => void; onConfirm: (t: Transaction) => void }) {
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

function BudgetSheet({ category, currentLimit, onClose, onSave, onRemove }: { category: string | null; currentLimit?: number; onClose: () => void; onSave: (c: string, l: number) => void; onRemove: (c: string) => void }) {
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

function AuthScreen({ onAuthenticated }: { onAuthenticated: (user: User) => void }) {
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [username, setUsername] = useState("");
  const [phone, setPhone] = useState("");
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const switchMode = () => {
    setMode(mode === "login" ? "signup" : "login");
    setError(""); setPin("");
  };

  const doLogin = async () => {
    const u = username.trim().toLowerCase();
    if (u.length < 3) { setError("Enter your username."); return; }
    if (!/^\d{6}$/.test(pin)) { setError("Enter your 6-digit PIN."); return; }
    setBusy(true); setError("");
    try { const user = await signIn(u, pin); onAuthenticated(user); }
    catch (e) { setError(e instanceof Error ? e.message : "Login failed"); }
    finally { setBusy(false); }
  };

  const doSignup = async () => {
    const u = username.trim().toLowerCase();
    if (u.length < 3 || !/^[a-z0-9_.]+$/.test(u)) { setError("Username must be 3+ chars: letters, numbers, dot or underscore."); return; }
    if (phone.trim().length < 8) { setError("Enter a valid phone number."); return; }
    if (!/^\d{6}$/.test(pin)) { setError("PIN must be exactly 6 digits."); return; }
    setBusy(true); setError("");
    try {
      const user = await signUp({ username: u, phone: phone.trim(), pin });
      onAuthenticated(user);
    } catch (e) { setError(e instanceof Error ? e.message : "Sign up failed"); }
    finally { setBusy(false); }
  };

  return <SafeAreaView style={styles.safe}>
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={authStyles.authScreen}>
      <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={authStyles.authContent}>
        <View style={authStyles.authBrand}><View style={authStyles.authMark}><Feather name="activity" size={22} color="#FFF" /></View><Text style={authStyles.authBrandText}>SpendPulse</Text></View>
        <View>
          <Text style={authStyles.authEyebrow}>{mode === "login" ? "WELCOME BACK" : "START FRESH"}</Text>
          <Text style={authStyles.authTitle}>{mode === "login" ? "Your money, in focus." : "Build a clearer money habit."}</Text>
          <Text style={authStyles.authSub}>A calm, private view of your spending and monthly progress.</Text>
        </View>
        <View style={authStyles.authForm}>
          {mode === "login" ? <>
            <Text style={styles.inputLabel}>USERNAME</Text>
            <TextInput testID="auth-username" value={username} onChangeText={setUsername} autoCapitalize="none" autoCorrect={false} placeholder="e.g. akkash_saba" placeholderTextColor="#A9AAA5" style={styles.input} />
            <Text style={styles.inputLabel}>PIN</Text>
            <TextInput testID="auth-password" value={pin} onChangeText={(v) => setPin(v.replace(/[^0-9]/g, "").slice(0, 6))} keyboardType="number-pad" secureTextEntry placeholder="6-digit PIN" placeholderTextColor="#A9AAA5" style={[styles.input, { letterSpacing: 6 }]} maxLength={6} />
            {error ? <Text style={authStyles.authError}>{error}</Text> : null}
            <Pressable testID="auth-submit" onPress={doLogin} disabled={busy} style={[styles.save, busy && authStyles.disabled]}>
              {busy ? <ActivityIndicator color="#FFF" /> : <Text style={styles.saveText}>Log in</Text>}
            </Pressable>
          </> : <>
            <Text style={styles.inputLabel}>USERNAME</Text>
            <TextInput testID="auth-username" value={username} onChangeText={setUsername} autoCapitalize="none" autoCorrect={false} placeholder="e.g. akkash_saba" placeholderTextColor="#A9AAA5" style={styles.input} />
            <Text style={styles.inputLabel}>PHONE NUMBER</Text>
            <TextInput testID="auth-phone" value={phone} onChangeText={setPhone} keyboardType="phone-pad" placeholder="e.g. 9876543210" placeholderTextColor="#A9AAA5" style={styles.input} />
            <Text style={styles.inputLabel}>CREATE A 6-DIGIT PIN</Text>
            <TextInput testID="auth-password" value={pin} onChangeText={(v) => setPin(v.replace(/[^0-9]/g, "").slice(0, 6))} keyboardType="number-pad" secureTextEntry placeholder="6-digit PIN" placeholderTextColor="#A9AAA5" style={[styles.input, { letterSpacing: 6 }]} maxLength={6} />
            {error ? <Text style={authStyles.authError}>{error}</Text> : null}
            <Pressable testID="auth-submit" onPress={doSignup} disabled={busy} style={[styles.save, busy && authStyles.disabled]}>
              {busy ? <ActivityIndicator color="#FFF" /> : <Text style={styles.saveText}>Create account</Text>}
            </Pressable>
          </>}
        </View>
        <Pressable testID="auth-toggle" onPress={switchMode}>
          <Text style={authStyles.authToggle}>{mode === "login" ? "New to SpendPulse? Create an account" : "Already have an account? Log in"}</Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  </SafeAreaView>;
}

function ProgressRing({ pct, size = 96, stroke = 10, color = COLORS.gold }: { pct: number; size?: number; stroke?: number; color?: string }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const clamped = Math.max(0, Math.min(100, pct));
  const offset = c - (clamped / 100) * c;
  return (
    <View style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>
      <Svg width={size} height={size}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={COLORS.pale} strokeWidth={stroke} fill="none" />
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={color} strokeWidth={stroke} fill="none" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={offset} transform={`rotate(-90 ${size / 2} ${size / 2})`} />
      </Svg>
      <View style={styles.ringCenter}><Text testID="savings-goal-percent" style={styles.ringPct}>{Math.round(clamped)}%</Text></View>
    </View>
  );
}

function GoalCard({ goal, saved, onEdit }: { goal: SavingsGoal; saved: number; onEdit: () => void }) {
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

function SavingsGoalSheet({ visible, goal, saved, onClose, onSave, onRemove }: { visible: boolean; goal: SavingsGoal | null; saved: number; onClose: () => void; onSave: (d: { name: string; target: number; target_date: string | null }) => void; onRemove: () => void }) {
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

function CelebrationOverlay({ goal, onClose }: { goal: SavingsGoal | null; onClose: () => void }) {
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

function Metric({ label, value, tone, icon }: { label: string; value: number; tone: string; icon: keyof typeof Feather.glyphMap }) { return <View style={styles.metric}><View style={[styles.metricIcon, { backgroundColor: `${tone}18` }]}><Feather name={icon} size={16} color={tone} /></View><Text style={styles.metricLabel}>{label}</Text><Text style={styles.metricValue}>{money(value)}</Text></View>; }

function Bar({ category, amount, max, limit }: { category: string; amount: number; max: number; limit?: number }) {
  const hasBudget = typeof limit === "number" && limit > 0;
  const pct = hasBudget ? Math.min(100, (amount / limit) * 100) : Math.max(8, (amount / max) * 100);
  const over = hasBudget && amount > limit;
  const near = hasBudget && !over && amount / limit >= 0.8;
  const fillColor = over ? COLORS.red : near ? COLORS.gold : COLORS.green;
  return (
    <View style={styles.barWrap}>
      <View style={styles.barLine}>
        <Text style={styles.barLabel}>{category}</Text>
        <Text style={styles.barAmount}>{money(amount)}{hasBudget ? ` / ${money(limit)}` : ""}</Text>
      </View>
      <View style={styles.track}><View style={[styles.fill, { width: `${pct}%`, backgroundColor: fillColor }]} /></View>
      {over ? <Text style={styles.overText}>Over budget by {money(amount - limit)}</Text> : null}
    </View>
  );
}

function CategoriesView({ data, max, budgetMap, onEditBudget }: { data: { category: string; amount: number }[]; max: number; budgetMap: Record<string, number>; onEditBudget: (c: string) => void }) {
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

function Analytics({ spent, income, data, max, transactions, month }: { spent: number; income: number; data: { category: string; amount: number }[]; max: number; transactions: Transaction[]; month: string }) {
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
function Empty({ onAdd }: { onAdd: () => void }) { return <View style={styles.empty}><Feather name="pie-chart" size={28} color={COLORS.green} /><Text style={styles.emptyTitle}>No spending recorded this month</Text><Pressable onPress={onAdd}><Text style={styles.emptyAction}>Add transaction</Text></Pressable></View>; }
function CalendarView({ transactions, onOpenTx, onAdd }: { transactions: Transaction[]; onOpenTx: (t: Transaction) => void; onAdd: () => void }) {
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

function TransactionRow({ t, onLongPress }: { t: Transaction; onLongPress?: () => void }) {
  const isIncome = t.type === "income";
  const isSavings = t.type === "savings";
  const iconName = isIncome ? "arrow-down-left" : isSavings ? "pie-chart" : "shopping-bag";
  const iconColor = isIncome ? COLORS.green : isSavings ? COLORS.gold : COLORS.red;
  const amountColor = isIncome ? COLORS.green : isSavings ? COLORS.gold : COLORS.ink;
  const sign = isIncome ? "+" : isSavings ? "" : "-";
  return <Pressable testID={`transaction-row-${t.id}`} onLongPress={onLongPress} delayLongPress={350} style={styles.transaction}><View style={styles.transactionIcon}><Feather name={iconName} size={16} color={iconColor} /></View><View style={styles.transactionCopy}><Text style={styles.transactionTitle}>{t.category}</Text><Text style={styles.transactionSub}>{t.note || t.date}</Text></View><Text style={[styles.transactionAmount, { color: amountColor }]}>{sign}{money(t.amount)}</Text></Pressable>;
}
function Nav({ icon, label, active, onPress }: { icon: keyof typeof Feather.glyphMap; label: string; active: boolean; onPress: () => void }) { return <Pressable testID={`nav-${label.toLowerCase().replace(/\s+/g, "-")}`} onPress={onPress} style={styles.navItem}><Feather name={icon} size={20} color={active ? COLORS.green : COLORS.muted} /><Text style={[styles.navLabel, active && styles.navActive]}>{label}</Text></Pressable>; }

const authStyles = StyleSheet.create({ authScreen: { flex: 1 }, authContent: { padding: 24, gap: 28, flexGrow: 1, justifyContent: "space-between" }, authBrand: { flexDirection: "row", alignItems: "center", gap: 10 }, authMark: { width: 42, height: 42, borderRadius: 14, backgroundColor: COLORS.green, alignItems: "center", justifyContent: "center" }, authBrandText: { color: COLORS.ink, fontSize: 20, fontWeight: "700" }, authEyebrow: { color: COLORS.green, fontSize: 11, letterSpacing: 1.2, fontWeight: "700", marginBottom: 10 }, authTitle: { color: COLORS.ink, fontSize: 32, lineHeight: 38, fontWeight: "700", maxWidth: 320 }, authSub: { color: COLORS.muted, fontSize: 15, lineHeight: 22, marginTop: 12, maxWidth: 320 }, authForm: { gap: 10 }, authError: { color: COLORS.red, fontSize: 13, lineHeight: 18 }, authInfo: { color: COLORS.green, fontSize: 13, lineHeight: 18 }, authToggle: { color: COLORS.green, fontWeight: "700", fontSize: 13, textAlign: "center" }, disabled: { opacity: 0.65 }, linkRow: { alignItems: "center", paddingVertical: 8 }, linkText: { color: COLORS.green, fontWeight: "600", fontSize: 13 }, authSub2: { color: COLORS.muted, fontSize: 13, lineHeight: 19, marginBottom: 4 }, demoBanner: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "#FBF6EC", borderRadius: 12, borderWidth: 1, borderColor: "#EAD9B6", paddingVertical: 10, paddingHorizontal: 12 }, demoText: { color: "#8A7A52", fontSize: 13 }, demoCode: { color: COLORS.gold, fontWeight: "800", fontSize: 15, letterSpacing: 1 } });

const styles = StyleSheet.create({ safe: { flex: 1, backgroundColor: COLORS.bg }, content: { padding: 24, paddingBottom: 120, gap: 20 }, top: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" }, eyebrow: { color: COLORS.green, fontSize: 11, letterSpacing: 1.3, fontWeight: "700", marginBottom: 6 }, title: { color: COLORS.ink, fontSize: 23, fontWeight: "700" }, avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: COLORS.pale, alignItems: "center", justifyContent: "center" }, avatarText: { color: COLORS.green, fontWeight: "700" }, importBtn: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 11, paddingVertical: 8, backgroundColor: COLORS.pale, borderRadius: 22, minHeight: 36 }, importBtnText: { color: COLORS.green, fontWeight: "700", fontSize: 12 }, hero: { backgroundColor: COLORS.green, borderRadius: 22, padding: 22, minHeight: 182, justifyContent: "space-between" }, heroTop: { flexDirection: "row", justifyContent: "space-between" }, heroLabel: { color: "#B5C8BE", fontSize: 11, letterSpacing: 1.2, fontWeight: "700" }, balance: { color: "#FFF", fontSize: 38, fontWeight: "700", letterSpacing: -1, fontVariant: ["tabular-nums"] }, balanceNeg: { color: COLORS.negBalance }, delta: { alignSelf: "flex-start", flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: "#5E8272", borderRadius: 999, paddingVertical: 7, paddingHorizontal: 11 }, deltaText: { color: "#D7E8DE", fontSize: 12, fontWeight: "600" }, heroBottom: { flexDirection: "row", justifyContent: "space-between" }, heroSmall: { color: "#B5C8BE", fontSize: 12 }, alertBanner: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "#F8E8E8", borderRadius: 12, padding: 12, borderWidth: 1, borderColor: "#F1CFCF" }, alertText: { color: COLORS.red, fontSize: 13, fontWeight: "600", flex: 1 }, monthPicker: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: COLORS.card, borderRadius: 14, borderWidth: 1, borderColor: COLORS.line, paddingHorizontal: 8, paddingVertical: 6 }, monthNav: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center" }, monthText: { color: COLORS.ink, fontSize: 15, fontWeight: "700" }, tabs: { flexDirection: "row", backgroundColor: COLORS.pale, borderRadius: 14, padding: 4 }, tab: { flex: 1, minHeight: 42, justifyContent: "center", alignItems: "center", borderRadius: 11 }, tabActive: { backgroundColor: COLORS.card, shadowColor: "#000", shadowOpacity: 0.06, shadowRadius: 8, elevation: 2 }, tabText: { color: COLORS.muted, fontSize: 13, fontWeight: "600" }, tabTextActive: { color: COLORS.green }, sectionHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" }, sectionTitle: { color: COLORS.ink, fontSize: 19, fontWeight: "700" }, sectionSub: { color: COLORS.muted, fontSize: 12, marginTop: 4 }, addSmall: { width: 38, height: 38, borderRadius: 12, backgroundColor: COLORS.green, alignItems: "center", justifyContent: "center" }, summaryGrid: { flexDirection: "row", gap: 10 }, metric: { flex: 1, backgroundColor: COLORS.card, borderRadius: 16, borderWidth: 1, borderColor: COLORS.line, padding: 13 }, metricIcon: { width: 28, height: 28, borderRadius: 9, alignItems: "center", justifyContent: "center", marginBottom: 9 }, metricLabel: { color: COLORS.muted, fontSize: 11, marginBottom: 5 }, metricValue: { color: COLORS.ink, fontSize: 16, fontWeight: "700", fontVariant: ["tabular-nums"] }, card: { backgroundColor: COLORS.card, borderRadius: 18, borderWidth: 1, borderColor: COLORS.line, padding: 18 }, cardTitle: { color: COLORS.ink, fontSize: 16, fontWeight: "700", marginBottom: 18 }, rowBetween: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }, budgetRow: { flexDirection: "row", alignItems: "flex-start" }, barWrap: { marginBottom: 15 }, barLine: { flexDirection: "row", justifyContent: "space-between", marginBottom: 7 }, barLabel: { color: COLORS.ink, fontSize: 13, fontWeight: "600" }, barAmount: { color: COLORS.muted, fontSize: 12, fontVariant: ["tabular-nums"] }, track: { height: 8, borderRadius: 4, backgroundColor: COLORS.pale, overflow: "hidden" }, fill: { height: "100%", borderRadius: 4, backgroundColor: COLORS.green }, overText: { color: COLORS.red, fontSize: 11, fontWeight: "600", marginTop: 5 }, empty: { alignItems: "center", gap: 10, paddingVertical: 20 }, emptyTitle: { color: COLORS.muted, fontSize: 13, textAlign: "center" }, emptyAction: { color: COLORS.green, fontWeight: "700", fontSize: 13 }, emptyText: { color: COLORS.muted, fontSize: 13, lineHeight: 20 }, transaction: { flexDirection: "row", alignItems: "center", paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: COLORS.line, gap: 11 }, transactionIcon: { width: 35, height: 35, borderRadius: 12, backgroundColor: COLORS.pale, alignItems: "center", justifyContent: "center" }, transactionCopy: { flex: 1 }, transactionTitle: { color: COLORS.ink, fontWeight: "600", fontSize: 14 }, transactionSub: { color: COLORS.muted, fontSize: 12, marginTop: 3 }, transactionAmount: { fontWeight: "700", fontSize: 14, fontVariant: ["tabular-nums"] }, loader: { marginTop: 50 }, seeAll: { color: COLORS.green, fontWeight: "600", fontSize: 12 }, bottom: { position: "absolute", bottom: 0, left: 0, right: 0, height: 82, backgroundColor: "rgba(255,255,255,0.96)", borderTopWidth: 1, borderTopColor: COLORS.line, flexDirection: "row", justifyContent: "space-around", alignItems: "center", paddingHorizontal: 10 }, navItem: { minWidth: 55, minHeight: 48, justifyContent: "center", alignItems: "center", gap: 4 }, navLabel: { color: COLORS.muted, fontSize: 10, fontWeight: "600" }, navActive: { color: COLORS.green }, fab: { width: 54, height: 54, borderRadius: 27, backgroundColor: COLORS.green, alignItems: "center", justifyContent: "center", marginTop: -26, borderWidth: 5, borderColor: COLORS.bg }, modalShade: { flex: 1, backgroundColor: "rgba(28,28,30,0.38)", justifyContent: "flex-end" }, modal: { backgroundColor: COLORS.bg, borderTopLeftRadius: 26, borderTopRightRadius: 26, padding: 24, paddingBottom: 36, gap: 12 }, modalHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }, modalTitle: { color: COLORS.ink, fontSize: 22, fontWeight: "700" }, typeRow: { flexDirection: "row", gap: 10 }, type: { flex: 1, minHeight: 42, borderRadius: 12, borderWidth: 1, borderColor: COLORS.line, alignItems: "center", justifyContent: "center" }, typeExpense: { backgroundColor: "#F8E8E8", borderColor: COLORS.red }, typeIncome: { backgroundColor: COLORS.pale, borderColor: COLORS.green }, typeSavings: { backgroundColor: "#F7EFDD", borderColor: COLORS.gold }, typeText: { color: COLORS.ink, fontWeight: "600", fontSize: 13 }, inputLabel: { color: COLORS.muted, fontSize: 11, fontWeight: "700", letterSpacing: 1, marginTop: 5 }, input: { height: 48, borderRadius: 12, borderWidth: 1, borderColor: COLORS.line, backgroundColor: COLORS.card, paddingHorizontal: 14, color: COLORS.ink, fontSize: 16 }, chips: { gap: 8, paddingVertical: 2 }, chip: { borderRadius: 999, paddingVertical: 9, paddingHorizontal: 14, backgroundColor: COLORS.pale }, chipActive: { backgroundColor: COLORS.green }, chipText: { color: COLORS.green, fontSize: 12, fontWeight: "600" }, chipTextActive: { color: "#FFF" }, save: { minHeight: 50, borderRadius: 14, backgroundColor: COLORS.green, alignItems: "center", justifyContent: "center", marginTop: 8 }, saveText: { color: "#FFF", fontSize: 15, fontWeight: "700" }, remove: { minHeight: 44, alignItems: "center", justifyContent: "center" }, removeText: { color: COLORS.red, fontSize: 13, fontWeight: "600" }, actionBtn: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: 52, borderRadius: 14, backgroundColor: COLORS.card, borderWidth: 1, borderColor: COLORS.line, paddingHorizontal: 16, marginTop: 6 }, actionBtnDanger: { borderColor: "#F1CFCF", backgroundColor: "#FFF6F6" }, actionText: { color: COLORS.ink, fontSize: 15, fontWeight: "600" }, flow: { height: 150, flexDirection: "row", alignItems: "flex-end", justifyContent: "center", gap: 30, borderBottomWidth: 1, borderBottomColor: COLORS.line }, flowBar: { width: 54, borderTopLeftRadius: 10, borderTopRightRadius: 10 }, flowLabels: { flexDirection: "row", justifyContent: "space-between", marginTop: 12 }, lowBalanceCard: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: "#FDECEC", borderRadius: 16, padding: 14, borderWidth: 1, borderColor: "#F1CFCF" }, lowBalanceIcon: { width: 38, height: 38, borderRadius: 12, backgroundColor: "#F8DADA", alignItems: "center", justifyContent: "center" }, lowBalanceTitle: { color: COLORS.red, fontSize: 14, fontWeight: "700" }, lowBalanceSub: { color: "#8A4A4A", fontSize: 12, lineHeight: 17, marginTop: 3 }, ringCenter: { position: "absolute", alignItems: "center", justifyContent: "center" }, ringPct: { color: COLORS.ink, fontSize: 20, fontWeight: "700", fontVariant: ["tabular-nums"] }, cardTitleTight: { color: COLORS.ink, fontSize: 16, fontWeight: "700" }, goalCard: { flexDirection: "row", alignItems: "center", gap: 18, backgroundColor: COLORS.card, borderRadius: 18, borderWidth: 1, borderColor: COLORS.line, padding: 18 }, goalInfo: { flex: 1, gap: 4 }, goalHeadRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" }, goalSaved: { color: COLORS.gold, fontSize: 20, fontWeight: "700", fontVariant: ["tabular-nums"] }, goalTarget: { color: COLORS.muted, fontSize: 14, fontWeight: "600" }, goalRemaining: { color: COLORS.muted, fontSize: 12, marginTop: 2 }, goalEmptyCard: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: "#FBF6EC", borderRadius: 18, borderWidth: 1, borderColor: "#EAD9B6", padding: 16 }, goalEmptyIcon: { width: 40, height: 40, borderRadius: 13, backgroundColor: "#F3E6C9", alignItems: "center", justifyContent: "center" }, goalEmptySub: { color: "#8A7A52", fontSize: 12, lineHeight: 17, marginTop: 3 }, goalBadge: { flexDirection: "row", alignItems: "center", gap: 5, alignSelf: "flex-start", backgroundColor: COLORS.pale, borderRadius: 999, paddingVertical: 4, paddingHorizontal: 10, marginTop: 4 }, goalBadgeText: { color: COLORS.green, fontSize: 12, fontWeight: "700" }, celebrateShade: { flex: 1, backgroundColor: "rgba(28,28,30,0.55)", alignItems: "center", justifyContent: "center", padding: 28 }, celebrateCard: { backgroundColor: COLORS.card, borderRadius: 24, padding: 26, alignItems: "center", gap: 8, width: "100%", maxWidth: 360 }, celebrateBadge: { width: 72, height: 72, borderRadius: 36, backgroundColor: "#F7EFDD", alignItems: "center", justifyContent: "center", marginBottom: 4 }, celebrateTitle: { color: COLORS.ink, fontSize: 22, fontWeight: "800" }, celebrateName: { color: COLORS.gold, fontSize: 17, fontWeight: "700" }, celebrateSub: { color: COLORS.muted, fontSize: 13, lineHeight: 19, textAlign: "center", marginBottom: 8 }, amountRow: { flexDirection: "row", alignItems: "center", gap: 10 }, calcBtn: { width: 48, height: 48, borderRadius: 12, borderWidth: 1, borderColor: COLORS.line, backgroundColor: COLORS.pale, alignItems: "center", justifyContent: "center" }, dateField: { flexDirection: "row", alignItems: "center", gap: 10, height: 48, borderRadius: 12, borderWidth: 1, borderColor: COLORS.line, backgroundColor: COLORS.card, paddingHorizontal: 14 }, dateFieldText: { flex: 1, color: COLORS.ink, fontSize: 16, fontWeight: "600" }, compareRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: COLORS.line }, compareLabel: { color: COLORS.ink, fontSize: 14, fontWeight: "600" }, compareSub: { color: COLORS.muted, fontSize: 12, marginTop: 2 }, compareValue: { color: COLORS.ink, fontSize: 15, fontWeight: "700", fontVariant: ["tabular-nums"] }, compareDeltaRow: { flexDirection: "row", alignItems: "center", gap: 3, marginTop: 2 }, compareDelta: { fontSize: 12, fontWeight: "700" }, compareFlat: { color: COLORS.muted, fontSize: 12, marginTop: 2 }, profileMetaRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 6 }, verifiedPill: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "#E9F1EC", borderRadius: 999, paddingVertical: 3, paddingHorizontal: 8, alignSelf: "flex-start" }, unverifiedPill: { backgroundColor: "#FBF6EC" }, verifiedPillText: { color: COLORS.green, fontSize: 11, fontWeight: "700" }, pickerOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(28,28,30,0.55)", justifyContent: "flex-end", zIndex: 50 }, pickerSheet: { backgroundColor: COLORS.bg, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 20, paddingBottom: 28, gap: 12 } });
