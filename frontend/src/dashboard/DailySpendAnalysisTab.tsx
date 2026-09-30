import React, { useMemo, useState } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import type { Transaction } from './types';
import { COLORS, money, monthLabel } from './constants';
import { getDailySpends } from './DailySpendAnalysis';
import { DailySpendDetailModal, type DailySpend } from './DailySpendAnalysis';

interface DailySpendTabProps {
  transactions: Transaction[];
}

export const DailySpendAnalysisTab: React.FC<DailySpendTabProps> = ({ transactions }) => {
  const [selectedDailySpend, setSelectedDailySpend] = useState<DailySpend | null>(null);
  const dailySpends = useMemo(() => getDailySpends(transactions), [transactions]);

  if (dailySpends.length === 0) {
    return (
      <View style={styles.container}>
        <View style={styles.emptyContainer}>
          <Feather name="calendar" size={48} color={COLORS.gray} />
          <Text style={styles.emptyTitle}>No Daily Data</Text>
          <Text style={styles.emptyText}>Add transactions to see your daily spending analysis</Text>
        </View>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      <View style={styles.header}>
        <Text style={styles.title}>Daily Spending Analysis</Text>
        <Text style={styles.subtitle}>View your spending by day</Text>
      </View>

      {dailySpends.map((dailySpend) => (
        <Pressable
          key={dailySpend.date}
          onPress={() => setSelectedDailySpend(dailySpend)}
          style={({ pressed }) => [styles.dayCard, pressed && styles.dayCardPressed]}
        >
          <View style={styles.dayCardHeader}>
            <View style={styles.dayLabelSection}>
              <Text style={styles.dayLabel}>{dailySpend.dayLabel}</Text>
              <Text style={styles.dayDate}>{dailySpend.displayDate}</Text>
            </View>
            <View style={styles.dayAmountSection}>
              <Text style={styles.dayAmount}>{money(dailySpend.totalSpent)}</Text>
              <Text style={styles.dayAmountLabel}>spent</Text>
            </View>
            <Feather name="chevron-right" size={24} color={COLORS.gray} />
          </View>

          <View style={styles.incomeSpendRow}>
            <View style={styles.incomeSpendItem}>
              <Feather name="arrow-down-left" size={14} color={COLORS.green} />
              <Text style={styles.incomeText}>{money(dailySpend.totalIncome)} received</Text>
            </View>
            <View style={[styles.incomeSpendItem, styles.spendItem]}>
              <Feather name="arrow-up-right" size={14} color={COLORS.red} />
              <Text style={styles.spentText}>{money(dailySpend.totalSpent)} spent</Text>
            </View>
          </View>

          <View style={styles.statsRow}>
            <View style={styles.statItem}>
              <Text style={styles.statLabel}>Categories</Text>
              <Text style={styles.statValue}>{dailySpend.categories.length}</Text>
            </View>
            <View style={styles.statItem}>
              <Text style={styles.statLabel}>Transactions</Text>
              <Text style={styles.statValue}>{dailySpend.transactions.length}</Text>
            </View>
            <View style={styles.statItem}>
              <Text style={styles.statLabel}>Avg per tx</Text>
              <Text style={styles.statValue}>
                {money(dailySpend.totalSpent / Math.max(1, dailySpend.transactions.filter(t => t.type === 'expense').length))}
              </Text>
            </View>
          </View>

          <View style={styles.categoriesSection}>
            <Text style={styles.categoriesTitle}>Top Spending</Text>
            {dailySpend.categories.slice(0, 4).map((cat) => (
              <View key={cat.category} style={styles.categoryBar}>
                <View style={styles.categoryInfo}>
                  <Text style={styles.categoryName}>{cat.category}</Text>
                  <Text style={styles.categoryTx}>{cat.count} transaction{cat.count !== 1 ? 's' : ''}</Text>
                </View>
                <Text style={styles.categoryAmount}>{money(cat.amount)}</Text>
              </View>
            ))}
          </View>
        </Pressable>
      ))}

      <View style={styles.spacing} />
      <DailySpendDetailModal dailySpend={selectedDailySpend} onClose={() => setSelectedDailySpend(null)} />
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
    color: COLORS.dark,
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 13,
    color: COLORS.gray,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 100,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: COLORS.dark,
    marginTop: 16,
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 14,
    color: COLORS.gray,
    textAlign: 'center',
    paddingHorizontal: 20,
  },
  dayCard: {
    marginHorizontal: 12,
    marginVertical: 10,
    paddingHorizontal: 16,
    paddingVertical: 16,
    backgroundColor: '#f9fafb',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  dayCardPressed: {
    backgroundColor: '#f3f4f6',
    opacity: 0.8,
  },
  dayCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  dayLabelSection: {
    flex: 1,
  },
  dayLabel: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.dark,
  },
  dayDate: {
    fontSize: 12,
    color: COLORS.gray,
    marginTop: 3,
  },
  dayAmountSection: {
    alignItems: 'flex-end',
    marginHorizontal: 12,
  },
  dayAmount: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.red,
  },
  dayAmountLabel: {
    fontSize: 10,
    color: COLORS.gray,
    marginTop: 2,
  },
  incomeSpendRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 10,
  },
  incomeSpendItem: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ecfdf5',
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 8,
    borderLeftWidth: 3,
    borderLeftColor: COLORS.green,
  },
  spendItem: {
    backgroundColor: '#fef2f2',
    borderLeftColor: COLORS.red,
  },
  incomeText: {
    fontSize: 12,
    fontWeight: '500',
    color: COLORS.green,
    marginLeft: 8,
  },
  spentText: {
    fontSize: 12,
    fontWeight: '500',
    color: COLORS.red,
    marginLeft: 8,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    backgroundColor: '#fff',
    paddingVertical: 10,
    marginBottom: 12,
    borderRadius: 10,
  },
  statItem: {
    alignItems: 'center',
  },
  statLabel: {
    fontSize: 11,
    color: COLORS.gray,
    fontWeight: '500',
    marginBottom: 3,
  },
  statValue: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.dark,
  },
  categoriesSection: {
    marginTop: 8,
  },
  categoriesTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.dark,
    marginBottom: 10,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  categoryBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  categoryInfo: {
    flex: 1,
  },
  categoryName: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.dark,
  },
  categoryTx: {
    fontSize: 11,
    color: COLORS.gray,
    marginTop: 2,
  },
  categoryAmount: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.dark,
    marginLeft: 12,
  },
  spacing: {
    height: 40,
  },
});
