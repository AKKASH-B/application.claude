import { Feather } from "@expo/vector-icons";
import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

const COLORS = { ink: "#1C1C1E", muted: "#777773", green: "#4A6B5D", pale: "#E5EBE8", card: "#FFFFFF", line: "#E5E4E0", gold: "#C28E38", red: "#B23B3B", bg: "#F9F8F6" };

type Props = {
  visible: boolean;
  initial?: string;
  onClose: () => void;
  onApply: (value: number, display: string) => void;
};

type Op = "+" | "-" | "×" | "÷";
const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const applyOp = (a: number, b: number, o: Op) => (o === "+" ? a + b : o === "-" ? a - b : o === "×" ? a * b : b === 0 ? a : a / b);

export default function Calculator({ visible, initial, onClose, onApply }: Props) {
  const [current, setCurrent] = useState("0");
  const [prev, setPrev] = useState<number | null>(null);
  const [op, setOp] = useState<Op | null>(null);
  const [overwrite, setOverwrite] = useState(true);

  useEffect(() => {
    if (visible) {
      setCurrent(initial && Number(initial) > 0 ? String(Number(initial)) : "0");
      setPrev(null);
      setOp(null);
      setOverwrite(true);
    }
  }, [visible, initial]);

  if (!visible) return null;

  const inputDigit = (d: string) => {
    if (overwrite) {
      setOverwrite(false);
      setCurrent(d === "." ? "0." : d);
      return;
    }
    if (d === "." && current.includes(".")) return;
    if (current.replace(".", "").length >= 12) return;
    setCurrent(current === "0" && d !== "." ? d : current + d);
  };

  const chooseOp = (o: Op) => {
    const cur = Number(current);
    if (prev !== null && op && !overwrite) {
      const result = round2(applyOp(prev, cur, op));
      setPrev(result);
      setCurrent(String(result));
    } else {
      setPrev(cur);
    }
    setOp(o);
    setOverwrite(true);
  };

  const equals = () => {
    if (prev === null || !op) return;
    const result = round2(applyOp(prev, Number(current), op));
    setCurrent(String(result));
    setPrev(null);
    setOp(null);
    setOverwrite(true);
  };

  const clearAll = () => { setCurrent("0"); setPrev(null); setOp(null); setOverwrite(true); };
  const backspace = () => {
    if (overwrite) return;
    setCurrent(current.length <= 1 ? "0" : current.slice(0, -1));
  };

  const done = () => {
    let value = Number(current);
    if (prev !== null && op) value = applyOp(prev, Number(current), op);
    value = round2(value);
    if (!isFinite(value) || value < 0) value = 0;
    onApply(value, String(value));
  };

  const press = (k: string) => {
    if (k === "C") return clearAll();
    if (k === "⌫") return backspace();
    if (k === "=") return equals();
    if (k === "+" || k === "-" || k === "×" || k === "÷") return chooseOp(k as Op);
    return inputDigit(k);
  };

  const keys: string[][] = [
    ["C", "÷", "×", "⌫"],
    ["7", "8", "9", "-"],
    ["4", "5", "6", "+"],
    ["1", "2", "3", "="],
    ["0", "."],
  ];
  const expression = prev !== null && op ? `${prev} ${op}` : "";

  return (
    <View style={styles.overlay} testID="calculator-overlay">
      <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
      <View style={styles.sheet}>
        <View style={styles.head}>
          <Text style={styles.title}>Calculator</Text>
          <Pressable testID="close-calculator" onPress={onClose} hitSlop={10}><Feather name="x" size={22} color={COLORS.muted} /></Pressable>
        </View>
        <View style={styles.display}>
          <Text style={styles.expr}>{expression}</Text>
          <Text testID="calc-display" style={styles.value} numberOfLines={1} adjustsFontSizeToFit>₹{current}</Text>
        </View>
        <View style={styles.pad}>
          {keys.map((row, ri) => (
            <View key={ri} style={styles.row}>
              {row.map((k) => {
                const isOp = ["÷", "×", "-", "+"].includes(k);
                const isEq = k === "=";
                const isFn = k === "C" || k === "⌫";
                const wide = k === "0";
                return (
                  <Pressable key={k} testID={`calc-key-${k}`} onPress={() => press(k)} style={[styles.key, wide && styles.keyWide, isOp && styles.keyOp, isEq && styles.keyEq, isFn && styles.keyFn]}>
                    <Text style={[styles.keyText, isOp && styles.keyTextLight, isEq && { color: "#FFF" }, isFn && { color: COLORS.red }]}>{k}</Text>
                  </Pressable>
                );
              })}
            </View>
          ))}
        </View>
        <Pressable testID="calc-apply" onPress={done} style={styles.apply}>
          <Text style={styles.applyText}>Use this amount</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(28,28,30,0.55)", justifyContent: "flex-end", zIndex: 50 },
  sheet: { backgroundColor: COLORS.bg, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 20, paddingBottom: 28 },
  head: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 },
  title: { fontSize: 18, fontWeight: "800", color: COLORS.ink },
  display: { backgroundColor: COLORS.card, borderRadius: 18, padding: 18, borderWidth: 1, borderColor: COLORS.line, marginBottom: 14, minHeight: 84, justifyContent: "center" },
  expr: { fontSize: 14, color: COLORS.muted, textAlign: "right", minHeight: 18 },
  value: { fontSize: 40, fontWeight: "800", color: COLORS.ink, textAlign: "right" },
  pad: { gap: 10 },
  row: { flexDirection: "row", gap: 10 },
  key: { flex: 1, height: 58, borderRadius: 16, backgroundColor: COLORS.card, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: COLORS.line },
  keyWide: { flex: 2 },
  keyOp: { backgroundColor: COLORS.pale, borderColor: COLORS.pale },
  keyEq: { backgroundColor: COLORS.green, borderColor: COLORS.green },
  keyFn: { backgroundColor: "#FBEDEA", borderColor: "#FBEDEA" },
  keyText: { fontSize: 22, fontWeight: "700", color: COLORS.ink },
  keyTextLight: { color: COLORS.green },
  apply: { marginTop: 16, backgroundColor: COLORS.ink, borderRadius: 16, paddingVertical: 16, alignItems: "center" },
  applyText: { color: "#FFF", fontSize: 16, fontWeight: "800" },
});
