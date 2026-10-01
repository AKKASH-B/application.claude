import React from "react";
import { Pressable, View } from "react-native";
import { CATEGORY_ICON, money } from "../format";
import { useTheme } from "../theme";
import type { Tx } from "../types";
import { Icon, T } from "./ui";

export function TxRow({ tx, currency, onPress }: { tx: Tx; currency: string; onPress?: () => void }) {
  const t = useTheme();
  const color = tx.type === "expense" ? t.expense : tx.type === "income" ? t.income : t.savings;
  const sign = tx.type === "income" ? "+" : tx.type === "expense" ? "-" : "";
  return (
    <Pressable onPress={onPress} style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10, opacity: pressed ? 0.7 : 1 })} testID={`tx-${tx.id}`}>
      <View style={{ width: 42, height: 42, borderRadius: 14, backgroundColor: t.primarySoft, alignItems: "center", justifyContent: "center" }}>
        <Icon name={CATEGORY_ICON[tx.category] ?? "circle"} size={19} color={color} />
      </View>
      <View style={{ flex: 1 }}>
        <T weight="600" numberOfLines={1}>{tx.category}</T>
        {tx.note ? <T size={13} muted numberOfLines={1}>{tx.note}</T> : null}
      </View>
      <T weight="700" color={color}>{sign}{money(tx.amount, currency)}</T>
    </Pressable>
  );
}
