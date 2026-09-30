import React, { useMemo, useState } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import type { Transaction } from './types';
import { COLORS, money, monthLabel } from './constants';
import { getDailySpends, getWeeklySpends } from './DailySpendAnalysis';
import { DailySpendDetailModal, type DailySpend, type WeeklySpend } from './DailySpendAnalysis';

interface DailySpendTabProps {
  transactions: Transaction[];
}

const WEEKDAY_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export const DailySpendAnalysisTab: React.FC<DailySpendTabProps> = ({ transactions }) => {
  const [selectedDailySpend, setSelectedDailySpend] = useState<DailySpend | null>(null);
  const [mode, setMode] = useState<'daily' | 'weekly'>('daily');
  const dailySpends = useMemo(() => getDailySpends(transactions), [transactions]);
  const weeklySpends = useMemo(() => getWeeklySpends(transactions), [transactions]);

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
        <Text style={styles.title}>{mode === 'daily' ? 'Daily Spending Analysis' : 'Weekly Spending Analysis'}</Text>
        <Text style={styles.subtitle}>{mode === 'daily' ? 'View your spending by day' : 'Monday to Sunday breakdown'}</Text>
      </View>

      <View style={styles.modeToggle}>
        <Pressable onPress={() => setMode('daily')} style={[styles.modeBtn, mode === 'daily' && styles.modeBtnActive]}>
          <Text style={[styles.modeBtnText, mode === 'daily' && styles.modeBtnTextActive]}>Daily</Text>
        </Pressable>
        <Pressable onPress={() => setMode('weekly')} style={[styles.modeBtn, mode === 'weekly' && styles.modeBtnActive]}>
          <Text style={[styles.modeBtnText, mode === 'weekly' && styles.modeBtnTextActive]}>Weekly</Text>
        </Pressable>
      </View>

      {mode === 'weekly' ? (
        weeklySpends.map((week) => (
          <View key={week.weekStart} style={styles.weekCard}>
            <View style={styles.weekCardHeader}>
              <View style={styles.dayLabelSection}>
                <Text style={styles.dayLabel}>{week.label}</Text>
                <Text style={styles.dayDate}>{week.weekStart} - {week.weekEnd}</Text>
              </View>
              <View style={styles.dayAmountSection}>
                <Text style={styles.dayAmount}>{money(week.totalSpent)}</Text>
                <Text style={styles.dayAmountLabel}>spent</Text>
              </View>
            </View>

            {week.totalIncome > 0 && (
              <View style={styles.incomeRow}>
                <Feather name="arrow-down-left" size={14} color={COLORS.green} />
                <Text style={styles.incomeText}>{money(week.totalIncome)} received</Text>
              </View>
            )}

            <View style={styles.weekDaysRow}>
              {Array.from({ length: 7 }).map((_, i) => {
                const dayData = week.days.find((d) => {
                  const dow = new Date(d.date + 'T12:00:00').getDay();
                  const mondayIndex = dow === 0 ? 6 : dow - 1;
                  return mondayIndex === i;
                });
                const hasData = !!dayData;
                return (
                  <Pressable
                    key={i}
                    disabled={!hasData}
                    onPress={() => dayData && setSelectedDailySpend(dayData)}
                    style={styles.weekDayCol}
                  >
                    <Text style={styles.weekDayLabel}>{WEEKDAY_SHORT[i]}</Text>
                    <View style={[styles.weekDayDot, hasData && styles.weekDayDotActive]} />
                    <Text style={[styles.weekDayAmount, !hasData && styles.weekDayAmountEmpty]} numberOfLines={1}>
                      {hasData ? money(dayData.totalSpent) : '-'}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            {week.categories.length > 0 && (
              <View style={styles.categoriesSection}>
                <Text style={styles.categoriesTitle}>Top Spending</Text>
                {week.categories.slice(0, 4).map((cat) => (
                  <View key={cat.category} style={styles.categoryBar}>
                    <View style={styles.categoryInfo}>
                      <Text style={styles.categoryName}>{cat.category}</Text>
                      <Text style={styles.categoryTx}>{cat.count} transaction{cat.count !== 1 ? 's' : ''}</Text>
                    </View>
                    <Text style={styles.categoryAmount}>{money(cat.amount)}</Text>
                  </View>
                ))}
              </View>
            )}
          </View>
        ))
      ) : dailySpends.map((dailySpend) => (
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

          {dailySpend.totalIncome > 0 && (
            <View style={styles.incomeRow}>
              <Feather name="arrow-down-left" size={14} color={COLORS.green} />
              <Text style={styles.incomeText}>{money(dailySpend.totalIncome)} received</Text>
            </View>
          )}

          <View style={styles.statsRow}>
            <View style={styles.statItem}>
              <Text style={styles.statLabel}>Categories</Text>
              <Text style={styles.statValue}>{dailySpend.categories.length}</Text>
            </View>
            <View style={styles.statItem}>
              <Text style={styles.statLabel}>Transactions</Text>
              <Text style={styles.statValue}>{dailySpend.transactions.length}</Text>
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
  modeToggle: {
    flexDirection: 'row',
    backgroundColor: '#f3f4f6',
    borderRadius: 12,
    padding: 4,
    marginHorizontal: 16,
    marginTop: 14,
  },
  modeBtn: {
    flex: 1,
    paddingVertical: 9,
    borderRadius: 9,
    alignItems: 'center',
  },
  modeBtnActive: {
    backgroundColor: '#fff',
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  modeBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.gray,
  },
  modeBtnTextActive: {
    color: COLORS.green,
  },
  weekCard: {
    marginHorizontal: 12,
    marginVertical: 10,
    paddingHorizontal: 16,
    paddingVertical: 16,
    backgroundColor: '#f9fafb',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  weekCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  weekDaysRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: '#fff',
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 4,
    marginBottom: 12,
  },
  weekDayCol: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
  },
  weekDayLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: COLORS.gray,
  },
  weekDayDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#e5e7eb',
  },
  weekDayDotActive: {
    backgroundColor: COLORS.green,
  },
  weekDayAmount: {
    fontSize: 10,
    fontWeight: '600',
    color: COLORS.dark,
  },
  weekDayAmountEmpty: {
    color: '#d1d5db',
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
  incomeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ecfdf5',
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 8,
    marginBottom: 10,
    borderLeftWidth: 3,
    borderLeftColor: COLORS.green,
  },
  incomeText: {
    fontSize: 12,
    fontWeight: '500',
    color: COLORS.green,
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
