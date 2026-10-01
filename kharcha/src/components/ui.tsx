import React from "react";
import {
  ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleProp, StyleSheet, Text, TextInput, TextInputProps, TextStyle, View, ViewStyle, RefreshControl,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { radius, useTheme } from "../theme";

type IconName = React.ComponentProps<typeof Feather>["name"];
export const Icon = ({ name, size = 20, color }: { name: string; size?: number; color?: string }) => {
  const t = useTheme();
  return <Feather name={name as IconName} size={size} color={color ?? t.text} />;
};

export function T({ children, style, size = 15, weight = "400", color, muted, numberOfLines, onPress }: {
  children: React.ReactNode; style?: StyleProp<TextStyle>; size?: number; weight?: TextStyle["fontWeight"]; color?: string; muted?: boolean; numberOfLines?: number; onPress?: () => void;
}) {
  const t = useTheme();
  return (
    <Text onPress={onPress} numberOfLines={numberOfLines} style={[{ fontSize: size, fontWeight: weight, color: color ?? (muted ? t.muted : t.text) }, style]}>
      {children}
    </Text>
  );
}

/** Scrollable screen with safe-area padding, pull-to-refresh and keyboard handling. */
export function Screen({ children, onRefresh, refreshing, scroll = true, padBottom = 24, style }: {
  children: React.ReactNode; onRefresh?: () => void; refreshing?: boolean; scroll?: boolean; padBottom?: number; style?: StyleProp<ViewStyle>;
}) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const content = [{ padding: 16, paddingBottom: padBottom + insets.bottom, gap: 14, width: "100%", maxWidth: 640, alignSelf: "center" as const }, style];
  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: t.bg }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      {scroll ? (
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={content}
          refreshControl={onRefresh ? <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} tintColor={t.primary} /> : undefined}
        >
          {children}
        </ScrollView>
      ) : (
        <View style={[{ flex: 1 }, content]}>{children}</View>
      )}
    </KeyboardAvoidingView>
  );
}

export function Card({ children, style, onPress }: { children: React.ReactNode; style?: StyleProp<ViewStyle>; onPress?: () => void }) {
  const t = useTheme();
  const base: ViewStyle = { backgroundColor: t.card, borderRadius: radius.lg, padding: 16, borderWidth: StyleSheet.hairlineWidth, borderColor: t.border };
  if (onPress) return <Pressable onPress={onPress} style={({ pressed }) => [base, pressed && { opacity: 0.85 }, style]}>{children}</Pressable>;
  return <View style={[base, style]}>{children}</View>;
}

export function Button({ title, onPress, variant = "primary", loading, disabled, icon, style, testID }: {
  title: string; onPress: () => void; variant?: "primary" | "ghost" | "danger" | "soft"; loading?: boolean; disabled?: boolean; icon?: string; style?: StyleProp<ViewStyle>; testID?: string;
}) {
  const t = useTheme();
  const bg = variant === "primary" ? t.primary : variant === "danger" ? t.danger : variant === "soft" ? t.primarySoft : "transparent";
  const fg = variant === "primary" ? t.onPrimary : variant === "danger" ? "#fff" : variant === "soft" ? t.primary : t.primary;
  const off = disabled || loading;
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      onPress={off ? undefined : onPress}
      style={({ pressed }) => [
        { backgroundColor: bg, borderRadius: radius.md, paddingVertical: 14, paddingHorizontal: 18, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 8, opacity: off ? 0.55 : pressed ? 0.85 : 1, minHeight: 48 },
        variant === "ghost" && { borderWidth: 1, borderColor: t.border },
        style,
      ]}
    >
      {loading ? <ActivityIndicator color={fg} /> : <>{icon ? <Icon name={icon} size={18} color={fg} /> : null}<Text style={{ color: fg, fontSize: 16, fontWeight: "600" }}>{title}</Text></>}
    </Pressable>
  );
}

export function Field({ label, error, style, ...props }: TextInputProps & { label?: string; error?: string | null }) {
  const t = useTheme();
  return (
    <View style={{ gap: 6 }}>
      {label ? <T size={13} weight="600" muted>{label}</T> : null}
      <TextInput
        placeholderTextColor={t.muted}
        {...props}
        style={[{ backgroundColor: t.input, color: t.text, borderRadius: radius.md, borderWidth: 1, borderColor: error ? t.danger : t.border, paddingHorizontal: 14, paddingVertical: 13, fontSize: 16 }, style]}
      />
      {error ? <T size={12} color={t.danger}>{error}</T> : null}
    </View>
  );
}

export function Chips<V extends string>({ options, value, onChange, labels }: { options: V[]; value: V | null; onChange: (v: V) => void; labels?: Record<string, string> }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
      {options.map((o) => {
        const on = o === value;
        return (
          <Pressable key={o} onPress={() => onChange(o)} style={{ paddingVertical: 8, paddingHorizontal: 14, borderRadius: 999, backgroundColor: on ? t.primary : t.input, borderWidth: 1, borderColor: on ? t.primary : t.border }}>
            <Text style={{ color: on ? t.onPrimary : t.text, fontSize: 14, fontWeight: on ? "600" : "400" }}>{labels?.[o] ?? o}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function Segmented<V extends string>({ options, value, onChange, labels, colors }: { options: V[]; value: V; onChange: (v: V) => void; labels: Record<V, string>; colors?: Partial<Record<V, string>> }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: "row", backgroundColor: t.input, borderRadius: radius.md, padding: 4, borderWidth: 1, borderColor: t.border }}>
      {options.map((o) => {
        const on = o === value;
        return (
          <Pressable key={o} onPress={() => onChange(o)} style={{ flex: 1, paddingVertical: 10, borderRadius: radius.sm, alignItems: "center", backgroundColor: on ? colors?.[o] ?? t.primary : "transparent" }}>
            <Text style={{ color: on ? "#fff" : t.text, fontWeight: "600", fontSize: 14 }}>{labels[o]}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function ProgressBar({ pct, color, over }: { pct: number; color?: string; over?: boolean }) {
  const t = useTheme();
  const clamped = Math.max(0, Math.min(100, pct));
  return (
    <View style={{ height: 8, borderRadius: 4, backgroundColor: t.border, overflow: "hidden" }}>
      <View style={{ width: `${clamped}%`, height: "100%", borderRadius: 4, backgroundColor: over ? t.danger : color ?? t.primary }} />
    </View>
  );
}

export function SectionTitle({ title, action, onAction }: { title: string; action?: string; onAction?: () => void }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 4 }}>
      <T size={17} weight="700">{title}</T>
      {action ? <Pressable onPress={onAction} hitSlop={10}><T size={14} weight="600" color={t.primary}>{action}</T></Pressable> : null}
    </View>
  );
}

export function Empty({ icon = "inbox", title, hint, action, onAction }: { icon?: string; title: string; hint?: string; action?: string; onAction?: () => void }) {
  return (
    <View style={{ alignItems: "center", gap: 8, paddingVertical: 28, paddingHorizontal: 16 }}>
      <Icon name={icon} size={34} color="#8FA196" />
      <T size={16} weight="600">{title}</T>
      {hint ? <T size={14} muted style={{ textAlign: "center" }}>{hint}</T> : null}
      {action ? <Button title={action} onPress={onAction ?? (() => {})} variant="soft" style={{ marginTop: 6 }} /> : null}
    </View>
  );
}

export function ErrorBox({ message, onRetry }: { message: string; onRetry?: () => void }) {
  const t = useTheme();
  return (
    <Card style={{ borderColor: t.danger, gap: 10 }}>
      <T color={t.danger} weight="600">{message}</T>
      {onRetry ? <Button title="Try again" variant="ghost" onPress={onRetry} /> : null}
    </Card>
  );
}

export const Loading = () => {
  const t = useTheme();
  return <View style={{ padding: 40 }}><ActivityIndicator color={t.primary} /></View>;
};

export function MonthSwitcher({ month, label, onPrev, onNext, nextDisabled }: { month: string; label: string; onPrev: () => void; onNext: () => void; nextDisabled?: boolean }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }} testID={`month-${month}`}>
      <Pressable onPress={onPrev} hitSlop={12} accessibilityLabel="Previous month" style={{ padding: 8 }}><Icon name="chevron-left" size={22} /></Pressable>
      <T size={17} weight="700">{label}</T>
      <Pressable onPress={nextDisabled ? undefined : onNext} hitSlop={12} accessibilityLabel="Next month" style={{ padding: 8, opacity: nextDisabled ? 0.3 : 1 }}><Icon name="chevron-right" size={22} color={t.text} /></Pressable>
    </View>
  );
}
