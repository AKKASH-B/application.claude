import React, { useMemo } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import type { Transaction } from './types';
import { COLORS, money, TRANSFERRED_CATEGORIES } from './constants';

interface DailySpend {
  date: string;
  displayDate: string;
  dayLabel: string;
  totalSpent: number;
  totalIncome: number;
  categories: Array<{ category: string; amount: number; count: number }>;
  transactions: Transaction[];
}

interface DailySpendAnalysisProps {
  transactions: Transaction[];
  onDateSelect?: (date: string) => void;
  onOpenModal?: (dailySpend: DailySpend) => void;
}

// Local (device timezone) YYYY-MM-DD, matching todayIso() in src/components/Calendar.tsx.
// Using UTC here would make "Today" lag behind the real local date for several hours each day.
const localIso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

// Parse a YYYY-MM-DD string as a local date (not UTC), so weekday/month labels never shift a day.
const parseLocalDate = (dateStr: string): Date => {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
};

export const getDailySpends = (transactions: Transaction[]): DailySpend[] => {
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);

  const todayStr = localIso(today);
  const yesterdayStr = localIso(yesterday);

  const getDayLabel = (dateStr: string): string => {
    if (dateStr === todayStr) return 'Today';
    if (dateStr === yesterdayStr) return 'Yesterday';
    return parseLocalDate(dateStr).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  };

  const getDisplayDate = (dateStr: string): string => {
    return parseLocalDate(dateStr).toLocaleDateString('en-US', { year: '2-digit', month: '2-digit', day: '2-digit' });
  };

  const processDay = (dateStr: string, dayLabel: string): DailySpend | null => {
    const dayTransactions = transactions.filter((t) => t.date.startsWith(dateStr));
    if (dayTransactions.length === 0) {
      return null;
    }

    const totalSpent = dayTransactions
      .filter((t) => t.type === 'expense')
      .reduce((sum, t) => sum + t.amount, 0);

    const totalIncome = dayTransactions
      .filter((t) => t.type === 'income')
      .reduce((sum, t) => sum + t.amount, 0);

    const categoryMap: Record<string, { amount: number; count: number }> = {};
    dayTransactions
      .filter((t) => t.type === 'expense')
      .forEach((t) => {
        if (!categoryMap[t.category]) {
          categoryMap[t.category] = { amount: 0, count: 0 };
        }
        categoryMap[t.category].amount += t.amount;
        categoryMap[t.category].count += 1;
      });

    const categories = Object.entries(categoryMap)
      .map(([category, { amount, count }]) => ({ category, amount, count }))
      .sort((a, b) => b.amount - a.amount);

    return {
      date: dateStr,
      displayDate: getDisplayDate(dateStr),
      dayLabel,
      totalSpent,
      totalIncome,
      categories,
      transactions: dayTransactions,
    };
  };

  // Collect every distinct date that has at least one transaction, newest first
  const uniqueDates = Array.from(new Set(transactions.map((t) => t.date.slice(0, 10)))).sort(
    (a, b) => (a < b ? 1 : a > b ? -1 : 0)
  );

  const dailySpends: DailySpend[] = [];
  for (const dateStr of uniqueDates) {
    const label = getDayLabel(dateStr);
    const spend = processDay(dateStr, label);
    if (spend) dailySpends.push(spend);
  }

  return dailySpends;
};

export interface WeeklySpend {
  weekStart: string; // Monday, YYYY-MM-DD
  weekEnd: string; // Sunday, YYYY-MM-DD
  label: string; // "This Week" | "Last Week" | "Mar 3 - Mar 9"
  totalSpent: number;
  totalIncome: number;
  categories: Array<{ category: string; amount: number; count: number }>;
  days: DailySpend[]; // Monday..Sunday, only days that exist are included but ordered Mon-Sun
}

// Monday of the week containing the given local date
const mondayOf = (d: Date): Date => {
  const day = d.getDay(); // 0 = Sunday, 1 = Monday, ... 6 = Saturday
  const diffToMonday = day === 0 ? -6 : 1 - day;
  const monday = new Date(d);
  monday.setDate(d.getDate() + diffToMonday);
  monday.setHours(0, 0, 0, 0);
  return monday;
};

export const getWeeklySpends = (transactions: Transaction[]): WeeklySpend[] => {
  const dailySpends = getDailySpends(transactions);
  if (dailySpends.length === 0) return [];

  const byDate = new Map(dailySpends.map((d) => [d.date, d]));
  const thisWeekStart = localIso(mondayOf(new Date()));
  const lastWeekStart = localIso(mondayOf(new Date(new Date().setDate(new Date().getDate() - 7))));

  // Group all known dates (from transactions) by the Monday that starts their week
  const weekStarts = Array.from(new Set(dailySpends.map((d) => localIso(mondayOf(parseLocalDate(d.date))))))
    .sort((a, b) => (a < b ? 1 : a > b ? -1 : 0));

  const weeks: WeeklySpend[] = weekStarts.map((weekStart) => {
    const mondayDate = parseLocalDate(weekStart);
    const days: DailySpend[] = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(mondayDate);
      d.setDate(mondayDate.getDate() + i);
      const iso = localIso(d);
      const existing = byDate.get(iso);
      if (existing) days.push(existing);
    }

    const sundayDate = new Date(mondayDate);
    sundayDate.setDate(mondayDate.getDate() + 6);
    const weekEnd = localIso(sundayDate);

    const totalSpent = days.reduce((s, d) => s + d.totalSpent, 0);
    const totalIncome = days.reduce((s, d) => s + d.totalIncome, 0);

    const categoryMap: Record<string, { amount: number; count: number }> = {};
    days.forEach((d) => d.categories.forEach((c) => {
      if (!categoryMap[c.category]) categoryMap[c.category] = { amount: 0, count: 0 };
      categoryMap[c.category].amount += c.amount;
      categoryMap[c.category].count += c.count;
    }));
    const categories = Object.entries(categoryMap)
      .map(([category, { amount, count }]) => ({ category, amount, count }))
      .sort((a, b) => b.amount - a.amount);

    const label = weekStart === thisWeekStart ? 'This Week' : weekStart === lastWeekStart ? 'Last Week' : `${mondayDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${sundayDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;

    return { weekStart, weekEnd, label, totalSpent, totalIncome, categories, days };
  });

  return weeks;
};

export const DailySpendAnalysis: React.FC<DailySpendAnalysisProps> = ({
  transactions,
  onOpenModal,
}) => {
  const dailySpends = useMemo(() => getDailySpends(transactions), [transactions]);

  if (dailySpends.length === 0) {
    return null;
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Feather name="calendar" size={20} color={COLORS.green} />
        <Text style={styles.title}>Daily Spend Analysis</Text>
      </View>

      {dailySpends.map((dailySpend) => (
        <Pressable
          key={dailySpend.date}
          onPress={() => onOpenModal?.(dailySpend)}
          style={({ pressed }) => [styles.dayCard, pressed && styles.dayCardPressed]}
        >
          <View style={styles.dayHeader}>
            <View style={styles.dayLabelContainer}>
              <Text style={styles.dayLabel}>{dailySpend.dayLabel}</Text>
              <Text style={styles.dayDate}>{dailySpend.displayDate}</Text>
            </View>
            <View style={styles.dayTotalContainer}>
              <Text style={styles.dayTotal}>{money(dailySpend.totalSpent)}</Text>
              <Text style={styles.daySubtext}>spent</Text>
            </View>
            <Feather name="chevron-right" size={20} color={COLORS.gray} />
          </View>

          {dailySpend.totalIncome > 0 && (
            <View style={styles.incomeRow}>
              <Text style={styles.incomeLabel}>Income: {money(dailySpend.totalIncome)}</Text>
            </View>
          )}

          <View style={styles.categoriesContainer}>
            {dailySpend.categories.slice(0, 3).map((cat) => (
              <View key={cat.category} style={styles.categoryRow}>
                <Text style={styles.categoryName}>{cat.category}</Text>
                <View style={styles.categoryRightContainer}>
                  <Text style={styles.categoryAmount}>{money(cat.amount)}</Text>
                  <Text style={styles.categoryCount}>({cat.count})</Text>
                </View>
              </View>
            ))}
          </View>

          {dailySpend.categories.length > 3 && (
            <View style={styles.moreCategories}>
              <Text style={styles.moreText}>
                +{dailySpend.categories.length - 3} more categories
              </Text>
            </View>
          )}
        </Pressable>
      ))}
    </View>
  );
};

export const DailySpendDetailModal: React.FC<{
  dailySpend: DailySpend | null;
  onClose: () => void;
}> = ({ dailySpend, onClose }) => {
  if (!dailySpend) return null;

  return (
    <View style={styles.modalOverlay}>
      <Pressable style={styles.modalBackdrop} onPress={onClose} />
      <View style={styles.modalContent}>
        <View style={styles.modalHeader}>
          <Text style={styles.modalTitle}>{dailySpend.dayLabel}</Text>
          <Pressable onPress={onClose} style={styles.closeButton}>
            <Feather name="x" size={24} color={COLORS.dark} />
          </Pressable>
        </View>

        <ScrollView style={styles.modalBody} showsVerticalScrollIndicator={false}>
          {/* Summary Section */}
          <View style={styles.summarySection}>
            <View style={styles.summaryItem}>
              <Text style={styles.summaryLabel}>Total Spent</Text>
              <Text style={styles.summaryAmount}>{money(dailySpend.totalSpent)}</Text>
            </View>
            {dailySpend.totalIncome > 0 && (
              <View style={styles.summaryItem}>
                <Text style={styles.summaryLabel}>Income</Text>
                <Text style={[styles.summaryAmount, { color: COLORS.green }]}>
                  +{money(dailySpend.totalIncome)}
                </Text>
              </View>
            )}
            <View style={styles.summaryItem}>
              <Text style={styles.summaryLabel}>Transactions</Text>
              <Text style={styles.summaryAmount}>{dailySpend.transactions.length}</Text>
            </View>
          </View>

          {/* Categories Section */}
          {dailySpend.categories.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Spending by Category</Text>
              {dailySpend.categories.map((cat) => (
                <View key={cat.category} style={styles.categoryDetailRow}>
                  <View style={styles.categoryDetailLeft}>
                    <View
                      style={[
                        styles.categoryDot,
                        { backgroundColor: COLORS[cat.category as keyof typeof COLORS] || COLORS.gray },
                      ]}
                    />
                    <Text style={styles.categoryDetailName}>{cat.category}</Text>
                  </View>
                  <View style={styles.categoryDetailRight}>
                    <Text style={styles.categoryDetailAmount}>{money(cat.amount)}</Text>
                    <Text style={styles.categoryDetailCount}>({cat.count})</Text>
                  </View>
                </View>
              ))}
            </View>
          )}

          {/* Transactions Section */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Transactions</Text>
            {dailySpend.transactions
              .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
              .map((tx) => (
                <View key={tx.id} style={styles.transactionRow}>
                  <View style={styles.transactionLeft}>
                    <Text style={styles.transactionNote}>{tx.note || tx.category}</Text>
                    <Text style={styles.transactionCategory}>{tx.category}</Text>
                  </View>
                  <Text
                    style={[
                      styles.transactionAmount,
                      { color: tx.type === 'expense' ? COLORS.red : COLORS.green },
                    ]}
                  >
                    {tx.type === 'expense' ? '-' : '+'}
                    {money(tx.amount)}
                  </Text>
                </View>
              ))}
          </View>
        </ScrollView>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginVertical: 16,
    paddingHorizontal: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: COLORS.dark,
    marginLeft: 8,
  },
  dayCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#e5e5e5',
  },
  dayCardPressed: {
    opacity: 0.7,
    backgroundColor: '#f9f9f9',
  },
  dayHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  dayLabelContainer: {
    flex: 1,
  },
  dayLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.dark,
  },
  dayDate: {
    fontSize: 12,
    color: COLORS.gray,
    marginTop: 4,
  },
  dayTotalContainer: {
    alignItems: 'flex-end',
    marginRight: 12,
  },
  dayTotal: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.dark,
  },
  daySubtext: {
    fontSize: 11,
    color: COLORS.gray,
    marginTop: 2,
  },
  incomeRow: {
    backgroundColor: '#f0fdf4',
    borderLeftWidth: 3,
    borderLeftColor: COLORS.green,
    paddingLeft: 8,
    paddingVertical: 6,
    marginBottom: 8,
  },
  incomeLabel: {
    fontSize: 12,
    fontWeight: '500',
    color: COLORS.green,
  },
  categoriesContainer: {
    marginTop: 8,
  },
  categoryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  categoryName: {
    fontSize: 13,
    color: COLORS.dark,
    fontWeight: '500',
  },
  categoryRightContainer: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  categoryAmount: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.dark,
  },
  categoryCount: {
    fontSize: 11,
    color: COLORS.gray,
    marginLeft: 4,
  },
  moreCategories: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
  },
  moreText: {
    fontSize: 12,
    color: COLORS.green,
    fontWeight: '500',
  },

  // Modal styles
  modalOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 1000,
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  modalContent: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '90%',
    paddingTop: 16,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: COLORS.dark,
  },
  closeButton: {
    padding: 8,
  },
  modalBody: {
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  summarySection: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    backgroundColor: '#f9fafb',
    borderRadius: 12,
    paddingVertical: 16,
    marginBottom: 24,
  },
  summaryItem: {
    alignItems: 'center',
  },
  summaryLabel: {
    fontSize: 12,
    color: COLORS.gray,
    fontWeight: '500',
    marginBottom: 4,
  },
  summaryAmount: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.dark,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.dark,
    marginBottom: 12,
  },
  categoryDetailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  categoryDetailLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  categoryDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 8,
  },
  categoryDetailName: {
    fontSize: 14,
    fontWeight: '500',
    color: COLORS.dark,
  },
  categoryDetailRight: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  categoryDetailAmount: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.dark,
  },
  categoryDetailCount: {
    fontSize: 12,
    color: COLORS.gray,
    marginLeft: 4,
  },
  transactionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  transactionLeft: {
    flex: 1,
  },
  transactionNote: {
    fontSize: 14,
    fontWeight: '500',
    color: COLORS.dark,
  },
  transactionCategory: {
    fontSize: 12,
    color: COLORS.gray,
    marginTop: 2,
  },
  transactionAmount: {
    fontSize: 14,
    fontWeight: '600',
    marginLeft: 12,
  },
});
