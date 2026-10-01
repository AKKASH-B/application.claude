import React, { useState } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { COLORS, money } from './constants';
import { CALC_KEYS, CALC_OPS, round2, useCalculator } from '../utils/calculator';

type Entry = { expression: string; result: number };

export const CalculatorTab: React.FC = () => {
  const calc = useCalculator();
  const [history, setHistory] = useState<Entry[]>([]);
  const clearHistory = () => setHistory([]);

  const press = (k: string) => {
    const entry = calc.press(k);
    if (entry) setHistory((h) => [entry, ...h].slice(0, 20));
  };

  const historyTotal = round2(history.reduce((s, e) => s + e.result, 0));

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      <View style={styles.header}>
        <Text style={styles.title}>Calculator</Text>
        <Text style={styles.subtitle}>Work out amounts and spending on the fly</Text>
      </View>

      <View style={styles.display}>
        <Text style={styles.expr}>{calc.expression}</Text>
        <Text testID="calc-tab-display" style={styles.value} numberOfLines={1} adjustsFontSizeToFit>{calc.current}</Text>
      </View>

      <View style={styles.pad}>
        {CALC_KEYS.map((row, ri) => (
          <View key={ri} style={styles.row}>
            {row.map((k) => {
              const isOp = CALC_OPS.includes(k);
              const isEq = k === '=';
              const isFn = k === 'C' || k === '⌫';
              const wide = k === '0';
              return (
                <Pressable key={k} testID={`calc-tab-key-${k}`} onPress={() => press(k)} style={[styles.key, wide && styles.keyWide, isOp && styles.keyOp, isEq && styles.keyEq, isFn && styles.keyFn]}>
                  <Text style={[styles.keyText, isOp && styles.keyTextLight, isEq && { color: '#FFF' }, isFn && { color: COLORS.red }]}>{k}</Text>
                </Pressable>
              );
            })}
          </View>
        ))}
      </View>

      {history.length > 0 && (
        <View style={styles.historySection}>
          <View style={styles.historyHeader}>
            <Text style={styles.historyTitle}>History</Text>
            <Pressable testID="clear-calc-history" onPress={clearHistory} hitSlop={8}>
              <Text style={styles.clearText}>Clear</Text>
            </Pressable>
          </View>
          <View style={styles.historyTotalRow}>
            <Text style={styles.historyTotalLabel}>Sum of results</Text>
            <Text style={styles.historyTotalValue}>{money(historyTotal)}</Text>
          </View>
          {history.map((e, i) => (
            <View key={i} style={styles.historyRow}>
              <Text style={styles.historyExpr} numberOfLines={1}>{e.expression}</Text>
              <Text style={styles.historyResult}>{e.result}</Text>
            </View>
          ))}
        </View>
      )}

      <View style={styles.spacing} />
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  header: {
    paddingHorizontal: 16,
    paddingTop: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: COLORS.ink,
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 13,
    color: COLORS.muted,
  },
  display: {
    backgroundColor: '#f9fafb',
    borderRadius: 18,
    padding: 18,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    marginHorizontal: 16,
    marginTop: 16,
    marginBottom: 16,
    minHeight: 84,
    justifyContent: 'center',
  },
  expr: {
    fontSize: 14,
    color: COLORS.muted,
    textAlign: 'right',
    minHeight: 18,
  },
  value: {
    fontSize: 38,
    fontWeight: '800',
    color: COLORS.ink,
    textAlign: 'right',
  },
  pad: {
    gap: 10,
    marginHorizontal: 16,
  },
  row: {
    flexDirection: 'row',
    gap: 10,
  },
  key: {
    flex: 1,
    height: 56,
    borderRadius: 16,
    backgroundColor: '#f9fafb',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  keyWide: { flex: 2 },
  keyOp: { backgroundColor: COLORS.pale, borderColor: COLORS.pale },
  keyEq: { backgroundColor: COLORS.green, borderColor: COLORS.green },
  keyFn: { backgroundColor: '#FBEDEA', borderColor: '#FBEDEA' },
  keyText: { fontSize: 22, fontWeight: '700', color: COLORS.ink },
  keyTextLight: { color: COLORS.green },
  historySection: {
    marginHorizontal: 16,
    marginTop: 8,
    padding: 14,
    backgroundColor: '#f9fafb',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  historyHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  historyTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.ink,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  clearText: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.red,
  },
  historyTotalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginBottom: 10,
  },
  historyTotalLabel: {
    fontSize: 12,
    color: COLORS.muted,
    fontWeight: '500',
  },
  historyTotalValue: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.green,
  },
  historyRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  historyExpr: {
    fontSize: 13,
    color: COLORS.muted,
    flex: 1,
    marginRight: 12,
  },
  historyResult: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.ink,
  },
  spacing: {
    height: 40,
  },
});
