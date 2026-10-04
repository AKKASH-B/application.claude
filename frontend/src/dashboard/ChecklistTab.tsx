import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { authorizedRequest } from '@/src/auth';
import { COLORS } from './constants';
import type { ChecklistItem } from './types';

const MAX_ITEMS = 100;
const newId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

export function ChecklistTab() {
  const [items, setItems] = useState<ChecklistItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [text, setText] = useState('');
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

  const add = () => {
    const value = text.trim();
    if (!value) return;
    if (items.length >= MAX_ITEMS) return Alert.alert('Checklist is full', `A checklist can hold up to ${MAX_ITEMS} items. Clear some completed ones first.`);
    persist([...items, { id: newId(), text: value, done: false }]);
    setText('');
  };
  const toggle = (id: string) => persist(items.map((i) => (i.id === id ? { ...i, done: !i.done } : i)));
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
  const pct = items.length ? Math.round((done.length / items.length) * 100) : 0;

  const row = (i: ChecklistItem) => (
    <View key={i.id} style={s.row}>
      <Pressable testID={`checklist-toggle-${i.id}`} onPress={() => toggle(i.id)} hitSlop={8} style={[s.box, i.done && s.boxDone]}>
        {i.done ? <Feather name="check" size={14} color="#FFF" /> : null}
      </Pressable>
      <Pressable style={{ flex: 1 }} onPress={() => toggle(i.id)}>
        <Text style={[s.itemText, i.done && s.itemDone]}>{i.text}</Text>
      </Pressable>
      <Pressable testID={`checklist-remove-${i.id}`} onPress={() => remove(i.id)} hitSlop={10}><Feather name="x" size={18} color={COLORS.muted} /></Pressable>
    </View>
  );

  return (
    <View style={{ gap: 16 }}>
      <View style={s.card}>
        <Text style={s.title}>Checklist</Text>
        <Text style={s.sub}>{items.length === 0 ? 'Write down anything you need to pay or buy, then tick it off.' : `${done.length} of ${items.length} done`}</Text>
        {items.length > 0 ? <View style={s.track}><View style={[s.fill, { width: `${pct}%` }]} /></View> : null}
        <View style={s.addRow}>
          <TextInput testID="checklist-input" value={text} onChangeText={setText} onSubmitEditing={add} returnKeyType="done" maxLength={80} placeholder="e.g. Rent, Groceries, Petrol" placeholderTextColor="#A9AAA5" style={s.input} />
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
  card: { backgroundColor: COLORS.card, borderRadius: 22, padding: 16, borderWidth: 1, borderColor: COLORS.line, gap: 10 },
  title: { fontSize: 18, fontWeight: '800', color: COLORS.ink },
  sub: { fontSize: 13, color: COLORS.muted },
  track: { height: 8, borderRadius: 4, backgroundColor: COLORS.pale, overflow: 'hidden' },
  fill: { height: '100%', backgroundColor: COLORS.green, borderRadius: 4 },
  addRow: { flexDirection: 'row', gap: 10, alignItems: 'center', marginTop: 4 },
  input: { flex: 1, height: 48, borderRadius: 14, borderWidth: 1, borderColor: COLORS.line, backgroundColor: COLORS.bg, paddingHorizontal: 14, fontSize: 15, color: COLORS.ink },
  addBtn: { width: 48, height: 48, borderRadius: 14, backgroundColor: COLORS.ink, alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, borderTopWidth: 1, borderTopColor: COLORS.line },
  box: { width: 24, height: 24, borderRadius: 8, borderWidth: 2, borderColor: COLORS.green, alignItems: 'center', justifyContent: 'center' },
  boxDone: { backgroundColor: COLORS.green },
  itemText: { fontSize: 15, color: COLORS.ink, fontWeight: '600' },
  itemDone: { color: COLORS.muted, textDecorationLine: 'line-through', fontWeight: '500' },
  doneHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  doneTitle: { fontSize: 13, fontWeight: '800', color: COLORS.muted },
  link: { color: COLORS.green, fontWeight: '700', fontSize: 12 },
  errorCard: { backgroundColor: COLORS.card, borderRadius: 20, padding: 20, borderWidth: 1, borderColor: COLORS.line, gap: 12, alignItems: 'center' },
  errorText: { color: COLORS.muted, textAlign: 'center' },
  retry: { backgroundColor: COLORS.ink, borderRadius: 12, paddingHorizontal: 20, paddingVertical: 10 },
  retryText: { color: '#FFF', fontWeight: '800' },
});
