import { Feather } from "@expo/vector-icons";
import { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

const COLORS = { ink: "#1C1C1E", muted: "#777773", green: "#4A6B5D", pale: "#E5EBE8", card: "#FFFFFF", line: "#E5E4E0", gold: "#C28E38", red: "#B23B3B" };
const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"];
const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

export const isoToParts = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return { y, m, d };
};

export const prettyDate = (iso: string) => {
  const { y, m, d } = isoToParts(iso);
  return new Date(y, m - 1, d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
};

type Props = {
  selected: string; // YYYY-MM-DD
  onSelect: (iso: string) => void;
  markedDates?: Record<string, number>; // iso -> count/intensity marker
  allowFuture?: boolean;
};

export default function Calendar({ selected, onSelect, markedDates = {}, allowFuture = true }: Props) {
  const sel = isoToParts(selected || todayIso());
  const [view, setView] = useState({ y: sel.y, m: sel.m }); // m is 1-indexed
  const today = isoToParts(todayIso());

  const grid = useMemo(() => {
    const firstDay = new Date(view.y, view.m - 1, 1).getDay(); // 0=Sun
    const daysInMonth = new Date(view.y, view.m, 0).getDate();
    const cells: (number | null)[] = [];
    for (let i = 0; i < firstDay; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) cells.push(d);
    while (cells.length % 7 !== 0) cells.push(null);
    return cells;
  }, [view]);

  const shift = (delta: number) => {
    const d = new Date(view.y, view.m - 1 + delta, 1);
    setView({ y: d.getFullYear(), m: d.getMonth() + 1 });
  };

  const isFuture = (d: number) => {
    if (view.y > today.y) return true;
    if (view.y === today.y && view.m > today.m) return true;
    if (view.y === today.y && view.m === today.m && d > today.d) return true;
    return false;
  };
  const canGoNext = allowFuture || view.y < today.y || (view.y === today.y && view.m < today.m);

  return (
    <View style={styles.wrap} testID="calendar-widget">
      <View style={styles.head}>
        <Pressable testID="cal-prev" onPress={() => shift(-1)} style={styles.navBtn} hitSlop={8}>
          <Feather name="chevron-left" size={18} color={COLORS.ink} />
        </Pressable>
        <Text testID="cal-month-label" style={styles.monthText}>{MONTH_NAMES[view.m - 1]} {view.y}</Text>
        <Pressable testID="cal-next" onPress={() => canGoNext && shift(1)} disabled={!canGoNext} style={[styles.navBtn, !canGoNext && { opacity: 0.3 }]} hitSlop={8}>
          <Feather name="chevron-right" size={18} color={COLORS.ink} />
        </Pressable>
      </View>
      <View style={styles.weekRow}>
        {WEEKDAYS.map((w, i) => <Text key={i} style={styles.weekday}>{w}</Text>)}
      </View>
      <View style={styles.gridWrap}>
        {grid.map((d, i) => {
          if (d === null) return <View key={i} style={styles.cell} />;
          const iso = `${view.y}-${String(view.m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
          const isSelected = iso === selected;
          const isToday = view.y === today.y && view.m === today.m && d === today.d;
          const disabled = !allowFuture && isFuture(d);
          const marked = (markedDates[iso] || 0) > 0;
          return (
            <Pressable
              key={i}
              testID={`cal-day-${iso}`}
              disabled={disabled}
              onPress={() => onSelect(iso)}
              style={styles.cell}
            >
              <View style={[styles.dayInner, isSelected && styles.daySelected, !isSelected && isToday && styles.dayToday, disabled && { opacity: 0.28 }]}>
                <Text style={[styles.dayText, isSelected && styles.dayTextSelected]}>{d}</Text>
              </View>
              {marked && !isSelected ? <View style={styles.dot} /> : null}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { backgroundColor: COLORS.card, borderRadius: 18, padding: 12, borderWidth: 1, borderColor: COLORS.line },
  head: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8, paddingHorizontal: 4 },
  navBtn: { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center", backgroundColor: COLORS.pale },
  monthText: { fontSize: 15, fontWeight: "700", color: COLORS.ink },
  weekRow: { flexDirection: "row", marginBottom: 4 },
  weekday: { flex: 1, textAlign: "center", fontSize: 11, fontWeight: "700", color: COLORS.muted },
  gridWrap: { flexDirection: "row", flexWrap: "wrap" },
  cell: { width: `${100 / 7}%`, aspectRatio: 1, alignItems: "center", justifyContent: "center" },
  dayInner: { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center" },
  daySelected: { backgroundColor: COLORS.green },
  dayToday: { borderWidth: 1.5, borderColor: COLORS.gold },
  dayText: { fontSize: 14, color: COLORS.ink, fontWeight: "600" },
  dayTextSelected: { color: "#FFF", fontWeight: "800" },
  dot: { width: 5, height: 5, borderRadius: 3, backgroundColor: COLORS.gold, position: "absolute", bottom: 6 },
});
