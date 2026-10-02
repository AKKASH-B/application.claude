import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { authorizedRequest } from '@/src/auth';
import { COLORS, TRANSFERRED_CATEGORIES, money, monthLabel, nowMonth, shiftMonth } from './constants';
import type { Plan, PlanItem, PlanKind, Transaction } from './types';

const MAX_AMOUNT = 1_000_000_000;
const MAX_MONTHS_AHEAD = 11;

const KINDS: { key: PlanKind; label: string; tone: string }[] = [
  { key: 'expense', label: 'Spend', tone: COLORS.red },
  { key: 'savings', label: 'Savings', tone: COLORS.gold },
  { key: 'income', label: 'Income', tone: COLORS.green },
];
const SUGGESTIONS: Record<PlanKind, string[]> = {
  expense: ['Rent', 'Food', 'Petrol', 'Travel', 'Bills', 'Shopping', 'Health', 'Other'],
  savings: ['Savings', 'Emergency Fund', 'Investment'],
  income: ['Salary', 'Bonus', 'Other income'],
};
const toneOf = (k: PlanKind) => KINDS.find((x) => x.key === k)!.tone;
const newId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

export function PlanningTab({ balance, transactions }: { balance: number; transactions: Transaction[] }) {
  const thisMonth = nowMonth();
  const [planMonth, setPlanMonth] = useState(shiftMonth(thisMonth, 1));
  const [plans, setPlans] = useState<Record<string, PlanItem[]>>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [kind, setKind] = useState<PlanKind>('expense');
  const [label, setLabel] = useState('');
  const [amount, setAmount] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    try {
      const list = await authorizedRequest<Plan[]>('/plans');
      const map: Record<string, PlanItem[]> = {};
      for (const p of list) map[p.month] = p.items;
      setPlans(map);
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const items = plans[planMonth] || [];
  const sum = (list: PlanItem[], k: PlanKind) => list.filter((i) => i.kind === k).reduce((s, i) => s + i.amount, 0);
  const income = sum(items, 'income');
  const spends = sum(items, 'expense');
  const saved = sum(items, 'savings');

  // Starting point: today's balance, plus the net of any plans for months between now and the one being viewed.
  const start = useMemo(() => {
    let total = balance;
    let m = shiftMonth(thisMonth, 1);
    while (m < planMonth) {
      const list = plans[m] || [];
      total += sum(list, 'income') - sum(list, 'expense') - sum(list, 'savings');
      m = shiftMonth(m, 1);
    }
    return total;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [balance, plans, planMonth, thisMonth]);
  const projected = Math.round((start + income - spends - saved) * 100) / 100;
  const hasEarlier = planMonth > shiftMonth(thisMonth, 1);

  const persist = async (next: PlanItem[]) => {
    const previous = plans[planMonth] || [];
    setPlans((p) => ({ ...p, [planMonth]: next }));
    try {
      await authorizedRequest<Plan>(`/plans/${planMonth}`, { method: 'PUT', body: JSON.stringify({ items: next }) });
    } catch (e) {
      setPlans((p) => ({ ...p, [planMonth]: previous }));
      Alert.alert("Couldn't save plan", e instanceof Error ? e.message : 'Please try again.');
    }
  };

  const addItem = () => {
    const name = label.trim();
    const n = Number(amount);
    if (!name) return Alert.alert('Name it', 'Pick a name below or type your own, e.g. Rent.');
    if (!n || n <= 0) return Alert.alert('Add an amount', 'Enter a value greater than zero.');
    if (n > MAX_AMOUNT) return Alert.alert('Amount too large', 'Enter an amount up to ₹100 crore (1,000,000,000).');
    if (items.length >= 60) return Alert.alert('Plan is full', 'A month can hold up to 60 items.');
    persist([...items, { id: newId(), kind, label: name, amount: Math.round(n * 100) / 100 }]);
    setLabel('');
    setAmount('');
  };

  const removeItem = (id: string) => persist(items.filter((i) => i.id !== id));

  const copyFromActual = () => {
    // Use the real spending of the month before the one being planned.
    const source = shiftMonth(planMonth, -1);
    const totals: Record<string, number> = {};
    for (const t of transactions) {
      if (t.type === 'expense' && t.date.slice(0, 7) === source) totals[t.category] = (totals[t.category] || 0) + t.amount;
    }
    const existing = new Set(items.filter((i) => i.kind === 'expense').map((i) => i.label.toLowerCase()));
    const fresh = Object.entries(totals)
      .filter(([cat]) => !existing.has(cat.toLowerCase()))
      .map(([cat, amt]) => ({ id: newId(), kind: 'expense' as PlanKind, label: cat, amount: Math.round(amt) }))
      .filter((i) => i.amount > 0);
    if (fresh.length === 0) return Alert.alert('Nothing to copy', `No spending recorded in ${monthLabel(source)} that isn't already in this plan.`);
    persist([...items, ...fresh].slice(0, 60));
  };

  const canGoBack = planMonth > thisMonth;
  const canGoForward = planMonth < shiftMonth(thisMonth, MAX_MONTHS_AHEAD);
  const short = projected < 0;

  if (loading) return <ActivityIndicator color={COLORS.green} style={{ marginTop: 40 }} />;
  if (loadError) {
    return (
      <View style={s.errorCard}>
        <Text style={s.errorText}>Couldn't load your plans. Check your connection and try again.</Text>
        <Pressable testID="plans-retry" onPress={load} style={s.retry}><Text style={s.retryText}>Retry</Text></Pressable>
      </View>
    );
  }

  return (
    <View style={{ gap: 16 }}>
      <View style={s.monthPicker}>
        <Pressable testID="plan-prev-month" disabled={!canGoBack} onPress={() => setPlanMonth((m) => shiftMonth(m, -1))} style={[s.monthNav, !canGoBack && { opacity: 0.35 }]}><Feather name="chevron-left" size={18} color={COLORS.ink} /></Pressable>
        <Text testID="plan-month-label" style={s.monthText}>{monthLabel(planMonth)}</Text>
        <Pressable testID="plan-next-month" disabled={!canGoForward} onPress={() => setPlanMonth((m) => shiftMonth(m, 1))} style={[s.monthNav, !canGoForward && { opacity: 0.35 }]}><Feather name="chevron-right" size={18} color={COLORS.ink} /></Pressable>
      </View>

      <View style={s.projection}>
        <Text style={s.projLabel}>PROJECTED BALANCE · END OF {monthLabel(planMonth).toUpperCase()}</Text>
        <Text testID="plan-projected" style={[s.projValue, short && { color: COLORS.negBalance }]}>{money(projected)}</Text>
        <Text style={s.projNote}>{short ? `You'd be short by ${money(Math.abs(projected))}. Trim a spend or add income.` : items.length === 0 ? 'Add what you expect to earn and spend to see where you will land.' : 'Looks good — you stay in the green.'}</Text>
        <View style={s.projRows}>
          <Row label={hasEarlier ? 'Balance after earlier plans' : 'Balance today'} value={start} />
          <Row label="+ Expected income" value={income} tone="#B7E4C7" />
          <Row label="− Planned spends" value={spends} tone="#FFB4B4" />
          <Row label="− Planned savings" value={saved} tone="#F3D9A0" />
        </View>
      </View>

      <View style={s.card}>
        <Text style={s.cardTitle}>Add to your plan</Text>
        <View style={s.kindRow}>
          {KINDS.map((k) => (
            <Pressable testID={`plan-kind-${k.key}`} key={k.key} onPress={() => { setKind(k.key); setLabel(''); }} style={[s.kind, kind === k.key && { backgroundColor: `${k.tone}22`, borderColor: k.tone }]}>
              <Text style={[s.kindText, kind === k.key && { color: k.tone }]}>{k.label}</Text>
            </Pressable>
          ))}
        </View>
        <View style={s.chips}>
          {SUGGESTIONS[kind].map((c) => (
            <Pressable testID={`plan-chip-${c.toLowerCase().replace(/\s+/g, '-')}`} key={c} onPress={() => setLabel(c)} style={[s.chip, label === c && s.chipActive]}>
              <Text style={[s.chipText, label === c && s.chipTextActive]}>{c}</Text>
            </Pressable>
          ))}
        </View>
        <TextInput testID="plan-label" value={label} onChangeText={setLabel} maxLength={40} placeholder="Or type your own, e.g. Gym" placeholderTextColor="#A9AAA5" style={s.input} />
        <View style={s.amountRow}>
          <TextInput testID="plan-amount" value={amount} onChangeText={setAmount} maxLength={13} keyboardType="decimal-pad" placeholder="₹ 0" placeholderTextColor="#A9AAA5" style={[s.input, { flex: 1 }]} />
          <Pressable testID="plan-add" onPress={addItem} style={s.addBtn}><Feather name="plus" size={20} color="#FFF" /><Text style={s.addText}>Add</Text></Pressable>
        </View>
      </View>

      <View style={s.card}>
        <View style={s.listHead}>
          <Text style={s.cardTitle}>Planned for {monthLabel(planMonth)}</Text>
          <Pressable testID="plan-copy-actual" onPress={copyFromActual}><Text style={s.link}>Copy last month's spending</Text></Pressable>
        </View>
        {items.length === 0 ? (
          <Text style={s.empty}>Nothing planned yet. Start with rent and food, then add the rest.</Text>
        ) : (
          items.map((i) => (
            <View key={i.id} style={s.itemRow}>
              <View style={[s.dot, { backgroundColor: toneOf(i.kind) }]} />
              <View style={{ flex: 1 }}>
                <Text style={s.itemLabel} numberOfLines={1}>{i.label}</Text>
                <Text style={s.itemKind}>{KINDS.find((k) => k.key === i.kind)!.label}</Text>
              </View>
              <Text style={[s.itemAmount, { color: toneOf(i.kind) }]}>{i.kind === 'income' ? '+' : '−'}{money(i.amount)}</Text>
              <Pressable testID={`plan-remove-${i.id}`} onPress={() => removeItem(i.id)} hitSlop={10} style={{ marginLeft: 10 }}><Feather name="x" size={18} color={COLORS.muted} /></Pressable>
            </View>
          ))
        )}
      </View>
    </View>
  );
}

function Row({ label, value, tone }: { label: string; value: number; tone?: string }) {
  return (
    <View style={s.projRow}>
      <Text style={s.projRowLabel}>{label}</Text>
      <Text style={[s.projRowValue, tone ? { color: tone } : null]}>{money(value)}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  monthPicker: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  monthNav: { width: 38, height: 38, borderRadius: 19, backgroundColor: COLORS.card, borderWidth: 1, borderColor: COLORS.line, alignItems: 'center', justifyContent: 'center' },
  monthText: { fontSize: 16, fontWeight: '800', color: COLORS.ink },
  projection: { backgroundColor: COLORS.green, borderRadius: 24, padding: 20, gap: 6 },
  projLabel: { color: '#B5C8BE', fontSize: 11, fontWeight: '800', letterSpacing: 0.8 },
  projValue: { color: '#FFFFFF', fontSize: 36, fontWeight: '800' },
  projNote: { color: '#D7E8DE', fontSize: 13, lineHeight: 18 },
  projRows: { marginTop: 10, gap: 8, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.18)', paddingTop: 12 },
  projRow: { flexDirection: 'row', justifyContent: 'space-between' },
  projRowLabel: { color: '#D7E8DE', fontSize: 13 },
  projRowValue: { color: '#FFFFFF', fontSize: 13, fontWeight: '700' },
  card: { backgroundColor: COLORS.card, borderRadius: 22, padding: 16, borderWidth: 1, borderColor: COLORS.line, gap: 12 },
  cardTitle: { fontSize: 15, fontWeight: '800', color: COLORS.ink },
  kindRow: { flexDirection: 'row', gap: 8 },
  kind: { flex: 1, paddingVertical: 10, borderRadius: 12, borderWidth: 1, borderColor: COLORS.line, alignItems: 'center', backgroundColor: COLORS.bg },
  kindText: { fontSize: 13, fontWeight: '700', color: COLORS.muted },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, borderWidth: 1, borderColor: COLORS.line, backgroundColor: COLORS.bg },
  chipActive: { backgroundColor: COLORS.green, borderColor: COLORS.green },
  chipText: { fontSize: 13, color: COLORS.ink, fontWeight: '600' },
  chipTextActive: { color: '#FFF' },
  input: { backgroundColor: COLORS.bg, borderRadius: 14, borderWidth: 1, borderColor: COLORS.line, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: COLORS.ink },
  amountRow: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  addBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: COLORS.ink, borderRadius: 14, paddingHorizontal: 18, paddingVertical: 13 },
  addText: { color: '#FFF', fontWeight: '800', fontSize: 14 },
  listHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  link: { color: COLORS.green, fontWeight: '700', fontSize: 12 },
  empty: { color: COLORS.muted, fontSize: 13, lineHeight: 18 },
  itemRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderTopWidth: 1, borderTopColor: COLORS.line },
  dot: { width: 8, height: 8, borderRadius: 4, marginRight: 12 },
  itemLabel: { fontSize: 14, fontWeight: '700', color: COLORS.ink },
  itemKind: { fontSize: 11, color: COLORS.muted, marginTop: 2 },
  itemAmount: { fontSize: 14, fontWeight: '800' },
  errorCard: { backgroundColor: COLORS.card, borderRadius: 20, padding: 20, borderWidth: 1, borderColor: COLORS.line, gap: 12, alignItems: 'center' },
  errorText: { color: COLORS.muted, textAlign: 'center' },
  retry: { backgroundColor: COLORS.ink, borderRadius: 12, paddingHorizontal: 20, paddingVertical: 10 },
  retryText: { color: '#FFF', fontWeight: '800' },
});
