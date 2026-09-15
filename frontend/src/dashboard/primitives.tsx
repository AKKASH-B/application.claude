import { Feather } from "@expo/vector-icons";
import { Pressable, Text, View } from "react-native";
import Svg, { Circle } from "react-native-svg";
import type { Transaction } from "./types";
import { COLORS, money } from "./constants";
import { styles } from "./styles";

export function ProgressRing({ pct, size = 96, stroke = 10, color = COLORS.gold }: { pct: number; size?: number; stroke?: number; color?: string }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const clamped = Math.max(0, Math.min(100, pct));
  const offset = c - (clamped / 100) * c;
  return (
    <View style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>
      <Svg width={size} height={size}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={COLORS.pale} strokeWidth={stroke} fill="none" />
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={color} strokeWidth={stroke} fill="none" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={offset} transform={`rotate(-90 ${size / 2} ${size / 2})`} />
      </Svg>
      <View style={styles.ringCenter}><Text testID="savings-goal-percent" style={styles.ringPct}>{Math.round(clamped)}%</Text></View>
    </View>
  );
}

export function Metric({ label, value, tone, icon }: { label: string; value: number; tone: string; icon: keyof typeof Feather.glyphMap }) { return <View style={styles.metric}><View style={[styles.metricIcon, { backgroundColor: `${tone}18` }]}><Feather name={icon} size={16} color={tone} /></View><Text style={styles.metricLabel}>{label}</Text><Text style={styles.metricValue}>{money(value)}</Text></View>; }

export function Bar({ category, amount, max, limit }: { category: string; amount: number; max: number; limit?: number }) {
  const hasBudget = typeof limit === "number" && limit > 0;
  const pct = hasBudget ? Math.min(100, (amount / limit) * 100) : Math.max(8, (amount / max) * 100);
  const over = hasBudget && amount > limit;
  const near = hasBudget && !over && amount / limit >= 0.8;
  const fillColor = over ? COLORS.red : near ? COLORS.gold : COLORS.green;
  return (
    <View style={styles.barWrap}>
      <View style={styles.barLine}>
        <Text style={styles.barLabel}>{category}</Text>
        <Text style={styles.barAmount}>{money(amount)}{hasBudget ? ` / ${money(limit)}` : ""}</Text>
      </View>
      <View style={styles.track}><View style={[styles.fill, { width: `${pct}%`, backgroundColor: fillColor }]} /></View>
      {over ? <Text style={styles.overText}>Over budget by {money(amount - limit)}</Text> : null}
    </View>
  );
}

export function Empty({ onAdd }: { onAdd: () => void }) { return <View style={styles.empty}><Feather name="pie-chart" size={28} color={COLORS.green} /><Text style={styles.emptyTitle}>No spending recorded this month</Text><Pressable onPress={onAdd}><Text style={styles.emptyAction}>Add transaction</Text></Pressable></View>; }

export function TransactionRow({ t, onLongPress }: { t: Transaction; onLongPress?: () => void }) {
  const isIncome = t.type === "income";
  const isSavings = t.type === "savings";
  const iconName = isIncome ? "arrow-down-left" : isSavings ? "pie-chart" : "shopping-bag";
  const iconColor = isIncome ? COLORS.green : isSavings ? COLORS.gold : COLORS.red;
  const amountColor = isIncome ? COLORS.green : isSavings ? COLORS.gold : COLORS.ink;
  const sign = isIncome ? "+" : isSavings ? "" : "-";
  return <Pressable testID={`transaction-row-${t.id}`} onLongPress={onLongPress} delayLongPress={350} style={styles.transaction}><View style={styles.transactionIcon}><Feather name={iconName} size={16} color={iconColor} /></View><View style={styles.transactionCopy}><Text style={styles.transactionTitle}>{t.category}</Text><Text style={styles.transactionSub}>{t.note || t.date}</Text></View><Text style={[styles.transactionAmount, { color: amountColor }]}>{sign}{money(t.amount)}</Text></Pressable>;
}

export function Nav({ icon, label, active, onPress }: { icon: keyof typeof Feather.glyphMap; label: string; active: boolean; onPress: () => void }) { return <Pressable testID={`nav-${label.toLowerCase().replace(/\s+/g, "-")}`} onPress={onPress} style={styles.navItem}><Feather name={icon} size={20} color={active ? COLORS.green : COLORS.muted} /><Text style={[styles.navLabel, active && styles.navActive]}>{label}</Text></Pressable>; }
