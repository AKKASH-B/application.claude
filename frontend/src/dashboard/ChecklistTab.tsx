import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { authorizedRequest } from '@/src/auth';
import { COLORS, money } from './constants';
import type { ChecklistItem } from './types';

const MAX_ITEMS = 100;
const MAX_AMOUNT = 1_000_000_000;
const newId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const amt = (i: ChecklistItem) => i.amount || 0;
const paidOf = (i: ChecklistItem) => i.paid || 0;

export function ChecklistTab() {
  const [items, setItems] = useState<ChecklistItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [text, setText] = useState('');
  const [amount, setAmount] = useState('');
  const [payingId, setPayingId] = useState<string | null>(null);
  const [payAmount, setPayAmount] = useState('');
  const version = useRef(0); // lets a failed save skip reverting when a newer change has happened

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    try {
      const res = await authorizedRequest<{ items: ChecklistItem[] }>('/checklist');
      setItems(res.items || []);
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const persist = async (next: ChecklistItem[]) => {
    const previous = items;
    const mine = ++version.current;
    setItems(next);
    try {
      await authorizedRequest('/checklist', { method: 'PUT', body: JSON.stringify({ items: next }) });
    } catch (e) {
      if (version.current === mine) setItems(previous);
      Alert.alert("Couldn't save checklist", e instanceof Error ? e.message : 'Please try again.');
    }
  };
  const update = (id: string, fn: (i: ChecklistItem) => ChecklistItem) => persist(items.map((i) => (i.id === id ? fn(i) : i)));

  const add = () => {
    const value = text.trim();
    if (!value) return Alert.alert('Name it', 'Write what you need to pay, e.g. Rent.');
    const n = amount.trim() === '' ? 0 : Number(amount);
    if (Number.isNaN(n) || n < 0) return Alert.alert('Check the amount', 'Enter a valid amount, or leave it empty for a plain to-do.');
    if (n > MAX_AMOUNT) return Alert.alert('Amount too large', 'Enter an amount up to ₹100 crore (1,000,000,000).');
    if (items.length >= MAX_ITEMS) return Alert.alert('Checklist is full', `A checklist can hold up to ${MAX_ITEMS} items. Clear some completed ones first.`);
    persist([...items, { id: newId(), text: value, done: false, amount: r2(n), paid: 0 }]);
    setText('');
    setAmount('');
  };

  // Tick/untick: an item with an amount becomes fully paid (or back to unpaid); a plain item just flips.
  const toggle = (i: ChecklistItem) =>
    update(i.id, (x) => (amt(x) > 0 ? (x.done ? { ...x, paid: 0, done: false } : { ...x, paid: amt(x), done: true }) : { ...x, done: !x.done }));

  const recordPayment = (i: ChecklistItem) => {
    const n = Number(payAmount);
    const left = r2(amt(i) - paidOf(i));
    if (!n || n <= 0) return Alert.alert('Enter an amount', 'How much did you pay?');
    if (n > left) return Alert.alert('More than remaining', `Only ${money(left)} is left to pay on this item.`);
    const paid = r2(paidOf(i) + n);
    update(i.id, (x) => ({ ...x, paid, done: paid >= amt(x) }));
    setPayingId(null);
    setPayAmount('');
  };
  const payInFull = (i: ChecklistItem) => { update(i.id, (x) => ({ ...x, paid: amt(x), done: true })); setPayingId(null); setPayAmount(''); };
  const remove = (id: string) => persist(items.filter((i) => i.id !== id));
  const clearDone = () => persist(items.filter((i) => !i.done));

  if (loading) return <ActivityIndicator color={COLORS.green} style={{ marginTop: 40 }} />;
  if (loadError) {
    return (
      <View style={s.errorCard}>
        <Text style={s.errorText}>Couldn't load your checklist. Check your connection and try again.</Text>
        <Pressable testID="checklist-retry" onPress={load} style={s.retry}><Text style={s.retryText}>Retry</Text></Pressable>
      </View>
    );
  }

  const pending = items.filter((i) => !i.done);
  const done = items.filter((i) => i.done);
  const totalDue = r2(items.reduce((t, i) => t + amt(i), 0));
  const totalPaid = r2(items.reduce((t, i) => t + (i.done ? amt(i) : Math.min(paidOf(i), amt(i))), 0));
  const remaining = r2(Math.max(totalDue - totalPaid, 0));
  const pct = totalDue > 0 ? Math.min(100, Math.round((totalPaid / totalDue) * 100)) : items.length ? Math.round((done.length / items.length) * 100) : 0;

  const row = (i: ChecklistItem) => {
    const hasMoney = amt(i) > 0;
    const left = r2(amt(i) - paidOf(i));
    const itemPct = hasMoney ? Math.min(100, Math.round((paidOf(i) / amt(i)) * 100)) : 0;
    return (
      <View key={i.id} style={s.rowWrap}>
        <View style={s.row}>
          <Pressable testID={`checklist-toggle-${i.id}`} onPress={() => toggle(i)} hitSlop={8} style={[s.box, i.done && s.boxDone]}>
            {i.done ? <Feather name="check" size={14} color="#FFF" /> : null}
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={[s.itemText, i.done && s.itemDone]}>{i.text}</Text>
            {hasMoney ? (
              <Text style={s.itemMoney}>
                {i.done ? `Paid ${money(amt(i))}` : `Paid ${money(paidOf(i))} of ${money(amt(i))} · ${money(left)} left`}
              </Text>
            ) : null}
          </View>
          {hasMoney && !i.done ? (
            <Pressable testID={`checklist-pay-${i.id}`} onPress={() => { setPayingId(payingId === i.id ? null : i.id); setPayAmount(''); }} style={s.payBtn}><Text style={s.payBtnText}>Pay</Text></Pressable>
          ) : null}
          <Pressable testID={`checklist-remove-${i.id}`} onPress={() => remove(i.id)} hitSlop={10}><Feather name="x" size={18} color={COLORS.muted} /></Pressable>
        </View>
        {hasMoney && !i.done && paidOf(i) > 0 ? <View style={s.itemTrack}><View style={[s.fill, { width: `${itemPct}%` }]} /></View> : null}
        {payingId === i.id && !i.done ? (
          <View style={s.payRow}>
            <TextInput testID={`checklist-pay-input-${i.id}`} value={payAmount} onChangeText={setPayAmount} maxLength={13} keyboardType="decimal-pad" placeholder={`Amount paid (max ${money(left)})`} placeholderTextColor="#A9AAA5" style={[s.input, { flex: 1, height: 42 }]} />
            <Pressable testID={`checklist-pay-save-${i.id}`} onPress={() => recordPayment(i)} style={s.saveBtn}><Text style={s.saveText}>Add</Text></Pressable>
            <Pressable testID={`checklist-pay-full-${i.id}`} onPress={() => payInFull(i)} style={s.fullBtn}><Text style={s.fullText}>Paid in full</Text></Pressable>
          </View>
        ) : null}
      </View>
    );
  };

  return (
    <View style={{ gap: 16 }}>
      {totalDue > 0 ? (
        <View style={s.summary}>
          <Text style={s.sumLabel}>STILL TO PAY</Text>
          <Text testID="checklist-remaining" style={s.sumValue}>{money(remaining)}</Text>
          <View style={s.sumTrack}><View style={[s.sumFill, { width: `${pct}%` }]} /></View>
          <View style={s.sumRow}>
            <Text style={s.sumSmall}>Total {money(totalDue)}</Text>
            <Text style={s.sumSmall}>Paid {money(totalPaid)}</Text>
          </View>
        </View>
      ) : null}

      <View style={s.card}>
        <Text style={s.title}>Checklist</Text>
        <Text style={s.sub}>{items.length === 0 ? 'Add things you need to pay with the amount, then record what you have paid.' : `${done.length} of ${items.length} done`}</Text>
        {items.length > 0 && totalDue === 0 ? <View style={s.track}><View style={[s.fill, { width: `${pct}%` }]} /></View> : null}
        <TextInput testID="checklist-input" value={text} onChangeText={setText} maxLength={80} placeholder="What to pay, e.g. Rent, Groceries, Petrol" placeholderTextColor="#A9AAA5" style={s.input} />
        <View style={s.addRow}>
          <TextInput testID="checklist-amount" value={amount} onChangeText={setAmount} onSubmitEditing={add} maxLength={13} keyboardType="decimal-pad" placeholder="₹ Amount to pay (optional)" placeholderTextColor="#A9AAA5" style={[s.input, { flex: 1 }]} />
          <Pressable testID="checklist-add" onPress={add} style={s.addBtn}><Feather name="plus" size={20} color="#FFF" /></Pressable>
        </View>
      </View>

      {pending.length > 0 ? <View style={s.card}>{pending.map(row)}</View> : null}

      {done.length > 0 ? (
        <View style={s.card}>
          <View style={s.doneHead}>
            <Text style={s.doneTitle}>Completed ({done.length})</Text>
            <Pressable testID="checklist-clear-done" onPress={clearDone}><Text style={s.link}>Clear completed</Text></Pressable>
          </View>
          {done.map(row)}
        </View>
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  summary: { backgroundColor: COLORS.green, borderRadius: 24, padding: 20, gap: 6 },
  sumLabel: { color: '#B5C8BE', fontSize: 11, fontWeight: '800', letterSpacing: 0.8 },
  sumValue: { color: '#FFFFFF', fontSize: 34, fontWeight: '800' },
  sumTrack: { height: 8, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.25)', overflow: 'hidden', marginTop: 4 },
  sumFill: { height: '100%', backgroundColor: '#FFFFFF', borderRadius: 4 },
  sumRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 },
  sumSmall: { color: '#D7E8DE', fontSize: 13, fontWeight: '600' },
  card: { backgroundColor: COLORS.card, borderRadius: 22, padding: 16, borderWidth: 1, borderColor: COLORS.line, gap: 10 },
  title: { fontSize: 18, fontWeight: '800', color: COLORS.ink },
  sub: { fontSize: 13, color: COLORS.muted },
  track: { height: 8, borderRadius: 4, backgroundColor: COLORS.pale, overflow: 'hidden' },
  itemTrack: { height: 5, borderRadius: 3, backgroundColor: COLORS.pale, overflow: 'hidden', marginLeft: 36 },
  fill: { height: '100%', backgroundColor: COLORS.green, borderRadius: 4 },
  addRow: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  input: { height: 48, borderRadius: 14, borderWidth: 1, borderColor: COLORS.line, backgroundColor: COLORS.bg, paddingHorizontal: 14, fontSize: 15, color: COLORS.ink },
  addBtn: { width: 48, height: 48, borderRadius: 14, backgroundColor: COLORS.ink, alignItems: 'center', justifyContent: 'center' },
  rowWrap: { borderTopWidth: 1, borderTopColor: COLORS.line, paddingTop: 10, gap: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingBottom: 2 },
  box: { width: 24, height: 24, borderRadius: 8, borderWidth: 2, borderColor: COLORS.green, alignItems: 'center', justifyContent: 'center' },
  boxDone: { backgroundColor: COLORS.green },
  itemText: { fontSize: 15, color: COLORS.ink, fontWeight: '600' },
  itemDone: { color: COLORS.muted, textDecorationLine: 'line-through', fontWeight: '500' },
  itemMoney: { fontSize: 12, color: COLORS.muted, marginTop: 3 },
  payBtn: { backgroundColor: COLORS.pale, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 7 },
  payBtnText: { color: COLORS.green, fontWeight: '800', fontSize: 12 },
  payRow: { flexDirection: 'row', gap: 8, alignItems: 'center', marginLeft: 36, flexWrap: 'wrap' },
  saveBtn: { backgroundColor: COLORS.ink, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 11 },
  saveText: { color: '#FFF', fontWeight: '800', fontSize: 12 },
  fullBtn: { backgroundColor: COLORS.green, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 11 },
  fullText: { color: '#FFF', fontWeight: '800', fontSize: 12 },
  doneHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  doneTitle: { fontSize: 13, fontWeight: '800', color: COLORS.muted },
  link: { color: COLORS.green, fontWeight: '700', fontSize: 12 },
  errorCard: { backgroundColor: COLORS.card, borderRadius: 20, padding: 20, borderWidth: 1, borderColor: COLORS.line, gap: 12, alignItems: 'center' },
  errorText: { color: COLORS.muted, textAlign: 'center' },
  retry: { backgroundColor: COLORS.ink, borderRadius: 12, paddingHorizontal: 20, paddingVertical: 10 },
  retryText: { color: '#FFF', fontWeight: '800' },
});
