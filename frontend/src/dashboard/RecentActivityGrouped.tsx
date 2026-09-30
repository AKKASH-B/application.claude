import React, { useMemo } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import type { Transaction } from './types';
import { COLORS, money } from './constants';

interface RecentActivityGroupedProps {
  transactions: Transaction[];
  onLongPress: (transaction: Transaction) => void;
  maxItems?: number;
}

interface GroupedTx {
  date: string;
  dateLabel: string;
  transactions: Transaction[];
}

// Local (device timezone) YYYY-MM-DD, matching todayIso() in src/components/Calendar.tsx.
// Using UTC here would make "Today"/"Yesterday" lag behind the real local date for several hours each day.
const localIso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const formatDate = (dateStr: string): string => {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(y, (m || 1) - 1, d || 1);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);

  const todayStr = localIso(today);
  const yesterdayStr = localIso(yesterday);

  if (dateStr === todayStr) return 'Today';
  if (dateStr === yesterdayStr) return 'Yesterday';

  return date.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: date.getFullYear() !== today.getFullYear() ? 'numeric' : undefined,
  });
};

export const RecentActivityGrouped: React.FC<RecentActivityGroupedProps> = ({
  transactions,
  onLongPress,
  maxItems,
}) => {
  const grouped = useMemo(() => {
    const map: Record<string, Transaction[]> = {};

    // Sort transactions by date (newest first)
    const sorted = [...transactions].sort((a, b) => {
      const dateA = a.date + 'T' + a.created_at.split('T')[1];
      const dateB = b.date + 'T' + b.created_at.split('T')[1];
      return new Date(dateB).getTime() - new Date(dateA).getTime();
    });

    // Group by date
    sorted.forEach((tx) => {
      if (!map[tx.date]) {
        map[tx.date] = [];
      }
      map[tx.date].push(tx);
    });

    // Convert to array and sort by date
    const result: GroupedTx[] = Object.entries(map)
      .map(([date, txs]) => ({
        date,
        dateLabel: formatDate(date),
        transactions: txs,
      }))
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    return result;
  }, [transactions]);

  if (transactions.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyText}>No transactions recorded yet.</Text>
      </View>
    );
  }

  const displayGroups = maxItems ? grouped.slice(0, maxItems) : grouped;

  return (
    <View style={styles.container}>
      {displayGroups.map((group) => (
        <View key={group.date} style={styles.dayGroup}>
          <View style={styles.dateHeader}>
            <Text style={styles.dateLabel}>{group.dateLabel}</Text>
            <View style={styles.dateDivider} />
          </View>

          {group.transactions.map((tx) => (
            <Pressable
              key={tx.id}
              onLongPress={() => onLongPress(tx)}
              style={({ pressed }) => [styles.txRow, pressed && styles.txRowPressed]}
              delayLongPress={200}
            >
              <View style={styles.txLeft}>
                <View style={[
                  styles.txIcon,
                  {
                    backgroundColor:
                      tx.type === 'expense' ? '#fee2e2' :
                      tx.type === 'income' ? '#dcfce7' :
                      '#fef3c7',
                  },
                ]}>
                  <Feather
                    name={tx.type === 'expense' ? 'arrow-up-right' : tx.type === 'income' ? 'arrow-down-left' : 'save'}
                    size={14}
                    color={
                      tx.type === 'expense' ? COLORS.red :
                      tx.type === 'income' ? COLORS.green :
                      COLORS.gold
                    }
                  />
                </View>
                <View style={styles.txInfo}>
                  <Text style={styles.txNote} numberOfLines={1}>
                    {tx.note || tx.category}
                  </Text>
                  <Text style={styles.txCategory}>{tx.category}</Text>
                </View>
              </View>
              <Text
                style={[
                  styles.txAmount,
                  {
                    color:
                      tx.type === 'expense' ? COLORS.red :
                      tx.type === 'income' ? COLORS.green :
                      COLORS.gold,
                  },
                ]}
              >
                {tx.type === 'expense' ? '-' : '+'}
                {money(tx.amount)}
              </Text>
            </Pressable>
          ))}
        </View>
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginTop: 12,
  },
  emptyContainer: {
    paddingVertical: 40,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 14,
    color: COLORS.gray,
  },
  dayGroup: {
    marginBottom: 20,
  },
  dateHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    paddingHorizontal: 4,
  },
  dateLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.dark,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginRight: 12,
  },
  dateDivider: {
    flex: 1,
    height: 1,
    backgroundColor: '#e5e7eb',
  },
  txRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 12,
    marginHorizontal: -4,
    borderRadius: 10,
  },
  txRowPressed: {
    backgroundColor: '#f3f4f6',
  },
  txLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  txIcon: {
    width: 36,
    height: 36,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  txInfo: {
    flex: 1,
  },
  txNote: {
    fontSize: 14,
    fontWeight: '500',
    color: COLORS.dark,
  },
  txCategory: {
    fontSize: 12,
    color: COLORS.gray,
    marginTop: 2,
  },
  txAmount: {
    fontSize: 14,
    fontWeight: '700',
    marginLeft: 12,
  },
});
