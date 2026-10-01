import React, { useState } from "react";
import { Pressable, TextInput, View } from "react-native";
import { Icon, T } from "./ui";
import { addDaysISO, prettyDate, todayISO } from "../format";
import { radius, useTheme } from "../theme";

export function DateField({ label = "Date", value, onChange }: { label?: string; value: string; onChange: (v: string) => void }) {
  const t = useTheme();
  const [text, setText] = useState(value);
  const valid = /^\d{4}-\d{2}-\d{2}$/.test(value) && !isNaN(Date.parse(value + "T00:00:00Z"));
  const set = (v: string) => { setText(v); onChange(v); };
  const step = (n: number) => set(addDaysISO(valid ? value : todayISO(), n));
  return (
    <View style={{ gap: 6 }}>
      <T size={13} weight="600" muted>{label}</T>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <Pressable onPress={() => step(-1)} hitSlop={8} accessibilityLabel="Previous day" style={{ padding: 12, backgroundColor: t.input, borderRadius: radius.md, borderWidth: 1, borderColor: t.border }}><Icon name="chevron-left" size={18} /></Pressable>
        <View style={{ flex: 1 }}>
          <TextInput
            value={text}
            onChangeText={(v) => { setText(v); onChange(v); }}
            placeholder="YYYY-MM-DD"
            placeholderTextColor={t.muted}
            autoCapitalize="none"
            style={{ backgroundColor: t.input, color: t.text, borderRadius: radius.md, borderWidth: 1, borderColor: valid ? t.border : t.danger, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16, textAlign: "center" }}
          />
        </View>
        <Pressable onPress={() => step(1)} hitSlop={8} accessibilityLabel="Next day" style={{ padding: 12, backgroundColor: t.input, borderRadius: radius.md, borderWidth: 1, borderColor: t.border }}><Icon name="chevron-right" size={18} /></Pressable>
      </View>
      <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
        <T size={13} muted>{valid ? prettyDate(value) : "Use the format YYYY-MM-DD"}</T>
        <Pressable onPress={() => set(todayISO())}><T size={13} weight="600" color={t.primary}>Today</T></Pressable>
      </View>
    </View>
  );
}
