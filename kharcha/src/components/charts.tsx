import React from "react";
import { View } from "react-native";
import Svg, { Circle, G } from "react-native-svg";
import { CHART_COLORS, useTheme } from "../theme";
import { T } from "./ui";

export function Donut({ data, size = 150, centerTop, centerBottom }: { data: { label: string; value: number }[]; size?: number; centerTop?: string; centerBottom?: string }) {
  const t = useTheme();
  const stroke = 22;
  const r = (size - stroke) / 2;
  const C = 2 * Math.PI * r;
  const total = data.reduce((s, d) => s + d.value, 0);
  let offset = 0;
  return (
    <View style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>
      <Svg width={size} height={size}>
        <G rotation={-90} origin={`${size / 2}, ${size / 2}`}>
          <Circle cx={size / 2} cy={size / 2} r={r} stroke={t.border} strokeWidth={stroke} fill="none" />
          {total > 0 &&
            data.map((d, i) => {
              const len = (d.value / total) * C;
              const el = (
                <Circle
                  key={d.label}
                  cx={size / 2}
                  cy={size / 2}
                  r={r}
                  stroke={CHART_COLORS[i % CHART_COLORS.length]}
                  strokeWidth={stroke}
                  fill="none"
                  strokeDasharray={`${Math.max(len - 1.5, 0.5)} ${C - Math.max(len - 1.5, 0.5)}`}
                  strokeDashoffset={-offset}
                />
              );
              offset += len;
              return el;
            })}
        </G>
      </Svg>
      <View style={{ position: "absolute", alignItems: "center" }}>
        {centerTop ? <T size={12} muted>{centerTop}</T> : null}
        {centerBottom ? <T size={17} weight="700">{centerBottom}</T> : null}
      </View>
    </View>
  );
}

export function DailyBars({ daily, highlightDay }: { daily: { day: number; spent: number }[]; highlightDay?: number }) {
  const t = useTheme();
  const max = Math.max(...daily.map((d) => d.spent), 1);
  return (
    <View>
      <View style={{ flexDirection: "row", alignItems: "flex-end", height: 90, gap: 2 }}>
        {daily.map((d) => (
          <View key={d.day} style={{ flex: 1, height: "100%", justifyContent: "flex-end" }}>
            <View
              style={{
                height: d.spent > 0 ? Math.max((d.spent / max) * 90, 3) : 2,
                borderRadius: 2,
                backgroundColor: d.day === highlightDay ? t.primary : d.spent > 0 ? t.expense : t.border,
                opacity: d.spent > 0 ? 1 : 0.6,
              }}
            />
          </View>
        ))}
      </View>
      <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 4 }}>
        <T size={11} muted>1</T>
        <T size={11} muted>{Math.ceil(daily.length / 2)}</T>
        <T size={11} muted>{daily.length}</T>
      </View>
    </View>
  );
}
