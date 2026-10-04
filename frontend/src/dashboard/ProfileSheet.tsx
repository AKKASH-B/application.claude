import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { COLORS } from './constants';
import type { StreakInfo } from './streak';

type Props = { visible: boolean; username: string; email?: string; streak: StreakInfo; onClose: () => void; onOpenSettings: () => void };

const MILESTONES = [3, 7, 14, 30, 60, 100, 365];
const BADGES = [3, 7, 14, 30, 100];

// The flame gets hotter (and the title bolder) as the streak grows.
const tierOf = (n: number) =>
  n === 0 ? { title: 'Start your streak', color: '#8C8A84' }
  : n < 3 ? { title: 'First spark', color: '#FFB020' }
  : n < 7 ? { title: 'Heating up', color: '#FF8A1F' }
  : n < 14 ? { title: 'On fire', color: '#FF6A1A' }
  : n < 30 ? { title: 'Blazing', color: '#FF4D2E' }
  : n < 100 ? { title: 'Unstoppable', color: '#FF3D5A' }
  : { title: 'Legend', color: '#C084FF' };

export function ProfileSheet({ visible, username, email, streak, onClose, onOpenSettings }: Props) {
  const tier = tierOf(streak.current);
  const alive = streak.current > 0;

  const pulse = useRef(new Animated.Value(1)).current;
  const count = useRef(new Animated.Value(0)).current;
  const dots = useRef(Array.from({ length: 7 }, () => new Animated.Value(0))).current;
  const [shown, setShown] = useState(0);

  useEffect(() => {
    if (!visible) return;
    // Count the number up, pop the week dots in one by one, and keep the flame gently pulsing.
    count.setValue(0);
    setShown(0);
    const id = count.addListener(({ value }) => setShown(Math.round(value)));
    Animated.timing(count, { toValue: streak.current, duration: 800, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start();
    dots.forEach((d) => d.setValue(0));
    Animated.stagger(70, dots.map((d) => Animated.spring(d, { toValue: 1, friction: 5, tension: 120, useNativeDriver: true }))).start();
    let loop: Animated.CompositeAnimation | null = null;
    if (alive) {
      loop = Animated.loop(Animated.sequence([
        Animated.timing(pulse, { toValue: 1.14, duration: 700, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 700, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ]));
      loop.start();
    }
    return () => { count.removeListener(id); loop?.stop(); pulse.setValue(1); };
  }, [visible, streak.current, alive, count, dots, pulse]);

  const next = MILESTONES.find((m) => m > streak.current) ?? null;
  const prevMilestone = [...MILESTONES].reverse().find((m) => m <= streak.current) ?? 0;
  const pct = next ? Math.max(0.04, (streak.current - prevMilestone) / (next - prevMilestone)) : 1;
  const toGo = next ? next - streak.current : 0;

  const message =
    streak.current === 0 ? 'Add a transaction today to light your first flame.'
    : streak.atRisk ? 'Add a transaction today to keep the flame alive!'
    : streak.current === 1 ? 'Day one done. Come back tomorrow!'
    : "Today's logged. See you tomorrow!";

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
          <Pressable testID="profile-close" onPress={onClose} hitSlop={10}><Feather name="x" size={20} color={COLORS.muted} /></Pressable>
        </View>

        <View style={s.hero}>
          <Animated.View style={[s.glow, { backgroundColor: tier.color, opacity: alive ? pulse.interpolate({ inputRange: [1, 1.14], outputRange: [0.22, 0.45] }) : 0.12 }]} />
          <Animated.View style={{ transform: [{ scale: pulse }] }}>
            <MaterialCommunityIcons name={alive ? 'fire' : 'fire-off'} size={64} color={tier.color} />
          </Animated.View>
          <View style={s.countRow}>
            <Text testID="streak-current" style={s.count}>{shown}</Text>
            <Text style={s.countUnit}>day streak</Text>
          </View>
          <View style={[s.titlePill, { backgroundColor: `${tier.color}2B` }]}><Text style={[s.titleText, { color: tier.color }]}>{tier.title.toUpperCase()}</Text></View>
          <Text style={s.message}>{message}</Text>

          <View style={s.week}>
            {streak.last7.map((d, i) => (
              <View key={d.day} style={s.dayCol}>
                <Animated.View style={[s.dot, d.active && { backgroundColor: tier.color }, d.isToday && !d.active && s.dotToday, { transform: [{ scale: dots[i] }] }]}>
                  {d.active ? <Feather name="check" size={13} color="#1C1A17" /> : null}
                </Animated.View>
                <Text style={[s.dayLabel, d.isToday && { color: '#FFFFFF', fontWeight: '800' }]}>{d.label}</Text>
              </View>
            ))}
          </View>

          <View style={s.progressWrap}>
            <View style={s.progressTop}>
              <Text style={s.progressLabel}>{next ? `Next badge: ${next} days` : 'Every badge unlocked'}</Text>
              {next ? <Text style={s.progressLabel}>{toGo} to go</Text> : null}
            </View>
            <View style={s.track}><View style={[s.fill, { width: `${Math.round(pct * 100)}%`, backgroundColor: tier.color }]} /></View>
          </View>
        </View>

        <View style={s.badges}>
          {BADGES.map((m) => {
            const unlocked = streak.longest >= m;
            return (
              <View key={m} style={s.badgeCol}>
                <View style={[s.badge, unlocked && { backgroundColor: '#FFF1DC', borderColor: '#FFB020' }]}>
                  {unlocked ? <MaterialCommunityIcons name="fire" size={20} color="#FF8A1F" /> : <Feather name="lock" size={15} color="#B9B8B2" />}
                </View>
                <Text style={[s.badgeText, unlocked && { color: COLORS.ink, fontWeight: '800' }]}>{m}d</Text>
              </View>
            );
          })}
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
  card: { position: 'absolute', top: 70, right: 14, left: 14, maxWidth: 380, alignSelf: 'flex-end', backgroundColor: COLORS.card, borderRadius: 26, borderWidth: 1, borderColor: COLORS.line, padding: 16, gap: 14, shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 18, shadowOffset: { width: 0, height: 8 }, elevation: 12 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: COLORS.pale, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: COLORS.green, fontWeight: '800', fontSize: 15 },
  name: { fontSize: 17, fontWeight: '800', color: COLORS.ink },
  email: { fontSize: 12, color: COLORS.muted, marginTop: 2 },
  hero: { backgroundColor: '#1F1D1A', borderRadius: 22, paddingVertical: 18, paddingHorizontal: 16, alignItems: 'center', gap: 6, overflow: 'hidden' },
  glow: { position: 'absolute', top: -30, width: 190, height: 190, borderRadius: 95 },
  countRow: { flexDirection: 'row', alignItems: 'baseline', gap: 8, marginTop: 2 },
  count: { fontSize: 54, fontWeight: '900', color: '#FFFFFF', letterSpacing: -1, fontVariant: ['tabular-nums'] },
  countUnit: { fontSize: 15, fontWeight: '700', color: '#CFCBC3' },
  titlePill: { borderRadius: 999, paddingHorizontal: 12, paddingVertical: 5 },
  titleText: { fontSize: 11, fontWeight: '900', letterSpacing: 1.2 },
  message: { fontSize: 12, color: '#B9B5AC', textAlign: 'center', lineHeight: 17, marginTop: 2 },
  week: { flexDirection: 'row', justifyContent: 'space-between', alignSelf: 'stretch', marginTop: 12 },
  dayCol: { alignItems: 'center', gap: 6 },
  dot: { width: 30, height: 30, borderRadius: 15, backgroundColor: '#35322D', alignItems: 'center', justifyContent: 'center' },
  dotToday: { borderWidth: 2, borderColor: '#FFFFFF', backgroundColor: 'transparent' },
  dayLabel: { fontSize: 11, color: '#8C8A84', fontWeight: '600' },
  progressWrap: { alignSelf: 'stretch', marginTop: 12, gap: 6 },
  progressTop: { flexDirection: 'row', justifyContent: 'space-between' },
  progressLabel: { fontSize: 11, color: '#B9B5AC', fontWeight: '600' },
  track: { height: 8, borderRadius: 4, backgroundColor: '#35322D', overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 4 },
  badges: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 4 },
  badgeCol: { alignItems: 'center', gap: 5 },
  badge: { width: 44, height: 44, borderRadius: 22, borderWidth: 1.5, borderColor: COLORS.line, backgroundColor: COLORS.bg, alignItems: 'center', justifyContent: 'center' },
  badgeText: { fontSize: 11, color: COLORS.muted, fontWeight: '600' },
  stats: { flexDirection: 'row', alignItems: 'center' },
  stat: { flex: 1, alignItems: 'center', gap: 2 },
  statNum: { fontSize: 22, fontWeight: '800', color: COLORS.ink },
  statLabel: { fontSize: 12, color: COLORS.muted },
  statDivider: { width: 1, height: 34, backgroundColor: COLORS.line },
  settingsRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 48, borderRadius: 14, borderWidth: 1, borderColor: COLORS.line, paddingHorizontal: 14 },
  settingsText: { flex: 1, fontSize: 15, fontWeight: '600', color: COLORS.ink },
});
