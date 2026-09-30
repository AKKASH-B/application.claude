import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Alert, KeyboardAvoidingView, Modal, Platform, Pressable, SafeAreaView, ScrollView, Share, StyleSheet, Text, TextInput, View } from "react-native";
import { router } from "expo-router";
import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import ImportSheet from "@/src/import/ImportSheet";
import Calendar, { prettyDate, todayIso } from "@/src/components/Calendar";
import Calculator from "@/src/components/Calculator";
import { authorizedRequest, restoreSession, signOut, User } from "@/src/auth";
import type { Budget, SavingsGoal, Transaction, TxType } from "@/src/dashboard/types";
import { COLORS, SAVINGS_CATEGORIES, TRANSFERRED_CATEGORIES, categoriesFor, money, monthLabel, nowMonth, shiftMonth } from "@/src/dashboard/constants";
import { styles, authStyles } from "@/src/dashboard/styles";
import { Bar, Empty, Metric, Nav, TransactionRow } from "@/src/dashboard/primitives";
import { GoalCard } from "@/src/dashboard/GoalCard";
import { CategoriesView } from "@/src/dashboard/CategoriesView";
import { Analytics } from "@/src/dashboard/Analytics";
import { CalendarView } from "@/src/dashboard/CalendarView";
import { AuthScreen } from "@/src/dashboard/AuthScreen";
import { BudgetSheet, CelebrationOverlay, ConfirmDeleteSheet, SavingsGoalSheet, TransactionActionsSheet } from "@/src/dashboard/TransactionSheets";
import { ChangePasswordSheet, SettingsSheet } from "@/src/dashboard/SettingsSheet";
import { AdminSheet } from "@/src/dashboard/AdminSheet";
import { DailySpendAnalysisTab } from "@/src/dashboard/DailySpendAnalysisTab";
import { RecentActivityGrouped } from "@/src/dashboard/RecentActivityGrouped";
import { NotesTab } from "@/src/dashboard/NotesTab";

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
  const [tab, setTab] = useState("Daily Spends");
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
  const [splitPrompt, setSplitPrompt] = useState<{ amount: number; note: string } | null>(null);
  const [splitAsked, setSplitAsked] = useState(false);
  const [form, setForm] = useState({ amount: "", category: "Food", note: "", type: "expense" as TxType, goalId: null as string | null, date: todayIso() });
  const [calcOpen, setCalcOpen] = useState(false);
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [showAllRecent, setShowAllRecent] = useState(false);

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
  const openAdd = () => { setEditing(null); setForm({ amount: "", category: TRANSFERRED_CATEGORIES[0], note: "", type: "expense", goalId: null, date: todayIso() }); setSplitAsked(false); setEditorOpen(true); };
  const openEdit = (t: Transaction) => { setEditing(t); setForm({ amount: String(t.amount), category: t.category, note: t.note || "", type: t.type, goalId: t.goal_id ?? null, date: t.date }); setActionsFor(null); setEditorOpen(true); };
  const closeEditor = () => { setEditorOpen(false); setEditing(null); };
  const handleAmountBlur = () => {
    if (editing) return;
    if (form.type !== "expense") return;
    if (splitAsked) return;
    const amount = Number(form.amount);
    if (!amount || amount <= 0) return;
    setSplitAsked(true);
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
    <View style={styles.top}><View style={{ flex: 1 }}><Text style={styles.eyebrow}>PERSONAL FINANCE</Text><Text style={styles.title}>Hi {user.username}</Text><View style={styles.profileMetaRow}><Text style={styles.sectionSub} numberOfLines={1}>{user.phone}</Text></View></View><View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}><Pressable testID="open-import" onPress={() => setImportOpen(true)} style={styles.importBtn}><Feather name="message-square" size={16} color={COLORS.green} /><Text style={styles.importBtnText}>SMS</Text></Pressable><Pressable testID="open-settings" onPress={() => setSettingsOpen(true)} style={styles.avatar}><Text style={styles.avatarText}>{user.username.slice(0, 2).toUpperCase()}</Text></Pressable></View></View>
    <View style={styles.hero}><View style={styles.heroTop}><Text style={styles.heroLabel}>TOTAL BALANCE</Text><Feather name="more-horizontal" size={20} color="#B5C8BE" /></View><Text testID="total-balance" style={[styles.balance, balance < 0 && styles.balanceNeg]}>{balance < 0 ? "-" : ""}{money(balance)}</Text><View style={styles.delta}><Feather name="trending-up" size={13} color="#D7E8DE" /><Text style={styles.deltaText}>On track this month</Text></View><View style={styles.heroBottom}><Text style={styles.heroSmall}>Updated just now</Text><Text style={styles.heroSmall}>{transactions.length} transactions</Text></View></View>
    {overBudget.length > 0 && <View testID="budget-alert-banner" style={styles.alertBanner}><Feather name="alert-triangle" size={16} color={COLORS.red} /><Text style={styles.alertText}>Over budget on {overBudget.map((x) => x.category).join(", ")}</Text></View>}
    {balance < 0 && <View testID="low-balance-alert" style={styles.lowBalanceCard}><View style={styles.lowBalanceIcon}><Feather name="trending-down" size={18} color={COLORS.red} /></View><View style={{ flex: 1 }}><Text style={styles.lowBalanceTitle}>Balance is in the red</Text><Text style={styles.lowBalanceSub}>You've transferred {money(balance)} more than you've received. Ease up or add income to get back on track.</Text></View></View>}
    {loading ? <ActivityIndicator color={COLORS.green} style={styles.loader} /> : tab === "Daily Spends" ? <DailySpendAnalysisTab transactions={transactions} /> : tab === "Notes" ? <NotesTab /> : <>
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
      <View style={styles.sectionHeader}><View><Text style={styles.sectionTitle}>Recent activity</Text><Text style={styles.sectionSub}>Long-press to edit or delete</Text></View></View>
      <View style={styles.card}><RecentActivityGrouped transactions={showAllRecent ? current : current.slice(0, 15)} onLongPress={setActionsFor} />{current.length > 15 && <Pressable testID="see-all-transactions" onPress={() => setShowAllRecent((v) => !v)} style={styles.seeAllButton}><Text style={styles.seeAll}>{showAllRecent ? "Show less" : "See all"}</Text></Pressable>}</View>
    </>}
  </ScrollView><Pressable onPress={() => setTab("Daily Spends")} style={styles.dailySpendFooter}><View style={styles.dailySpendCard}><View style={styles.dailySpendLeft}><Text style={styles.dailySpendLabel}>Today's Spend</Text><Text style={styles.dailySpendAmount}>{money(transactions.filter((t) => t.type === "expense" && t.date === todayIso()).reduce((s, t) => s + t.amount, 0))}</Text></View><View style={styles.dailySpendDivider} /><View style={styles.dailySpendRight}><Text style={styles.dailySpendLabel}>Yesterday</Text><Text style={styles.dailySpendAmount}>{money(transactions.filter((t) => t.type === "expense" && t.date === new Date(new Date().getTime() - 86400000).toISOString().split('T')[0]).reduce((s, t) => s + t.amount, 0))}</Text></View></View></Pressable><View style={styles.bottom}><Nav icon="trending-down" label="Daily Spends" active={tab === "Daily Spends"} onPress={() => setTab("Daily Spends")} /><Nav icon="file-text" label="Notes" active={tab === "Notes"} onPress={() => setTab("Notes")} /><Pressable testID="add-transaction-fab" style={styles.fab} onPress={openAdd}><Feather name="plus" size={24} color="#FFF" /></Pressable><Nav icon="users" label="Splits" active={false} onPress={() => router.push("/splits")} /><Nav icon="settings" label="Settings" active={false} onPress={() => setSettingsOpen(true)} /></View>
    <Modal visible={editorOpen} transparent animationType="slide" onRequestClose={closeEditor}><KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={styles.modalShade}><View style={[styles.modal, { maxHeight: "92%" }]}><ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: 12, paddingBottom: 8 }}><View style={styles.modalHead}><Text style={styles.modalTitle}>{editing ? "Edit transaction" : "Add transaction"}</Text><Pressable testID="close-add-transaction" onPress={closeEditor}><Feather name="x" size={22} color={COLORS.muted} /></Pressable></View><View style={styles.typeRow}><Pressable testID="type-expense" onPress={() => chooseType("expense")} style={[styles.type, form.type === "expense" && styles.typeExpense]}><Text style={[styles.typeText, form.type === "expense" && { color: COLORS.red }]} numberOfLines={1}>Transferred</Text></Pressable><Pressable testID="type-income" onPress={() => chooseType("income")} style={[styles.type, form.type === "income" && styles.typeIncome]}><Text style={[styles.typeText, form.type === "income" && { color: COLORS.green }]} numberOfLines={1}>Received</Text></Pressable><Pressable testID="type-savings" onPress={() => chooseType("savings")} style={[styles.type, form.type === "savings" && styles.typeSavings]}><Text style={[styles.typeText, form.type === "savings" && { color: COLORS.gold }]} numberOfLines={1}>Savings</Text></Pressable></View><Text style={styles.inputLabel}>AMOUNT</Text><View style={styles.amountRow}><TextInput testID="transaction-amount" value={form.amount} onChangeText={(amount) => setForm({ ...form, amount })} onBlur={handleAmountBlur} keyboardType="decimal-pad" placeholder="₹ 0" placeholderTextColor="#A9AAA5" style={[styles.input, { flex: 1 }]} /><Pressable testID="open-calculator" onPress={() => setCalcOpen(true)} style={styles.calcBtn}><MaterialCommunityIcons name="calculator-variant-outline" size={22} color={COLORS.green} /></Pressable></View><Text style={styles.inputLabel}>DATE</Text><Pressable testID="open-date-picker" onPress={() => setDatePickerOpen(true)} style={styles.dateField}><Feather name="calendar" size={18} color={COLORS.green} /><Text style={styles.dateFieldText}>{prettyDate(form.date)}</Text><Feather name="chevron-down" size={18} color={COLORS.muted} /></Pressable>{form.type === "savings" && savingsGoals.length > 0 ? <><Text style={styles.inputLabel}>ADD TO GOAL</Text><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>{savingsGoals.map((g) => <Pressable testID={`goal-chip-${g.id}`} key={g.id} onPress={() => setForm({ ...form, goalId: g.id, category: g.name })} style={[styles.chip, form.goalId === g.id && styles.chipActive]}><Text style={[styles.chipText, form.goalId === g.id && styles.chipTextActive]}>{g.name}</Text></Pressable>)}<Pressable testID="goal-chip-general" onPress={() => setForm({ ...form, goalId: null, category: "General" })} style={[styles.chip, form.goalId === null && styles.chipActive]}><Text style={[styles.chipText, form.goalId === null && styles.chipTextActive]}>General</Text></Pressable></ScrollView></> : <><Text style={styles.inputLabel}>CATEGORY</Text><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>{categoriesFor(form.type).map((c) => <Pressable testID={`category-${c.toLowerCase().replace(/\s+/g, "-")}`} key={c} onPress={() => setForm({ ...form, category: c })} style={[styles.chip, form.category === c && styles.chipActive]}><Text style={[styles.chipText, form.category === c && styles.chipTextActive]}>{c}</Text></Pressable>)}</ScrollView></>}<Text style={styles.inputLabel}>NOTE</Text><TextInput value={form.note} onChangeText={(note) => setForm({ ...form, note })} placeholder="Optional note" placeholderTextColor="#A9AAA5" style={styles.input} /><Pressable testID="save-transaction" onPress={submitTransaction} style={styles.save}><Text style={styles.saveText}>{editing ? "Save changes" : "Save transaction"}</Text></Pressable></ScrollView></View>
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
            onPress={() => {
              if (!splitPrompt) return;
              const { amount, note } = splitPrompt;
              setSplitPrompt(null);
              closeEditor();
              router.push({ pathname: "/split/new", params: { amount: String(amount), note } });
            }}
            style={styles.save}
          >
            <Text style={styles.saveText}>Split it</Text>
          </Pressable>
          <Pressable testID="split-prompt-dismiss" onPress={() => setSplitPrompt(null)} style={styles.remove}>
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
