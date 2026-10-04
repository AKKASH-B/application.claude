import React from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { COLORS } from './constants';
import type { StreakInfo } from './streak';

type Props = { visible: boolean; username: string; email?: string; streak: StreakInfo; onClose: () => void; onOpenSettings: () => void };

export function ProfileSheet({ visible, username, email, streak, onClose, onOpenSettings }: Props) {
  const message =
    streak.current === 0 ? 'Add a transaction today to start your streak.'
    : streak.atRisk ? 'Add a transaction today to keep your streak going.'
    : streak.current === 1 ? 'Streak started. Come back tomorrow!'
    : "You're on a roll. Keep it up!";
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable testID="profile-backdrop" style={StyleSheet.absoluteFill} onPress={onClose} />
      <View style={s.card} pointerEvents="box-none">
        <View style={s.head}>
          <View style={s.avatar}><Text style={s.avatarText}>{username.slice(0, 2).toUpperCase()}</Text></View>
          <View style={{ flex: 1 }}>
            <Text style={s.name} numberOfLines={1}>{username}</Text>
            {email ? <Text style={s.email} numberOfLines={1}>{email}</Text> : null}
          </View>
        </View>

        <View style={s.streakBox}>
          <View style={s.streakTop}>
            <Feather name="zap" size={22} color={streak.current > 0 ? COLORS.gold : COLORS.muted} />
            <Text testID="streak-current" style={s.streakNum}>{streak.current}</Text>
            <Text style={s.streakUnit}>{streak.current === 1 ? 'day streak' : 'day streak'}</Text>
          </View>
          <Text style={s.streakMsg}>{message}</Text>
          <View style={s.week}>
            {streak.last7.map((d) => (
              <View key={d.day} style={s.dayCol}>
                <View style={[s.dot, d.active && s.dotOn, d.isToday && !d.active && s.dotToday]}>
                  {d.active ? <Feather name="check" size={12} color="#FFF" /> : null}
                </View>
                <Text style={[s.dayLabel, d.isToday && { color: COLORS.green, fontWeight: '800' }]}>{d.label}</Text>
              </View>
            ))}
          </View>
        </View>

        <View style={s.stats}>
          <View style={s.stat}><Text testID="streak-longest" style={s.statNum}>{streak.longest}</Text><Text style={s.statLabel}>Longest streak</Text></View>
          <View style={s.statDivider} />
          <View style={s.stat}><Text testID="streak-active-days" style={s.statNum}>{streak.activeDays}</Text><Text style={s.statLabel}>Days active</Text></View>
        </View>

        <Pressable testID="profile-open-settings" onPress={onOpenSettings} style={({ pressed }) => [s.settingsRow, pressed && { backgroundColor: COLORS.pale }]}>
          <Feather name="settings" size={18} color={COLORS.ink} />
          <Text style={s.settingsText}>Settings</Text>
          <Feather name="chevron-right" size={18} color={COLORS.muted} />
        </Pressable>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  card: { position: 'absolute', top: 84, right: 16, left: 16, maxWidth: 360, alignSelf: 'flex-end', backgroundColor: COLORS.card, borderRadius: 22, borderWidth: 1, borderColor: COLORS.line, padding: 16, gap: 14, shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 16, shadowOffset: { width: 0, height: 6 }, elevation: 10 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar: { width: 46, height: 46, borderRadius: 23, backgroundColor: COLORS.pale, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: COLORS.green, fontWeight: '800', fontSize: 16 },
  name: { fontSize: 17, fontWeight: '800', color: COLORS.ink },
  email: { fontSize: 12, color: COLORS.muted, marginTop: 2 },
  streakBox: { backgroundColor: '#FBF6EC', borderRadius: 18, borderWidth: 1, borderColor: '#EAD9B6', padding: 14, gap: 8 },
  streakTop: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  streakNum: { fontSize: 36, fontWeight: '800', color: COLORS.ink, marginLeft: 2 },
  streakUnit: { fontSize: 14, fontWeight: '700', color: COLORS.muted },
  streakMsg: { fontSize: 12, color: '#8A7A52', lineHeight: 17 },
  week: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 },
  dayCol: { alignItems: 'center', gap: 5 },
  dot: { width: 28, height: 28, borderRadius: 14, backgroundColor: '#F3EBD7', alignItems: 'center', justifyContent: 'center' },
  dotOn: { backgroundColor: COLORS.gold },
  dotToday: { borderWidth: 2, borderColor: COLORS.green, backgroundColor: COLORS.card },
  dayLabel: { fontSize: 11, color: COLORS.muted, fontWeight: '600' },
  stats: { flexDirection: 'row', alignItems: 'center' },
  stat: { flex: 1, alignItems: 'center', gap: 2 },
  statNum: { fontSize: 22, fontWeight: '800', color: COLORS.ink },
  statLabel: { fontSize: 12, color: COLORS.muted },
  statDivider: { width: 1, height: 34, backgroundColor: COLORS.line },
  settingsRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 48, borderRadius: 14, borderWidth: 1, borderColor: COLORS.line, paddingHorizontal: 14 },
  settingsText: { flex: 1, fontSize: 15, fontWeight: '600', color: COLORS.ink },
});
