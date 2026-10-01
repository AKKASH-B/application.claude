import React from "react";
import { Pressable } from "react-native";
import { useRouter } from "expo-router";
import { Icon } from "./ui";
import { useTheme } from "../theme";

export function Fab({ date }: { date?: string }) {
  const t = useTheme();
  const router = useRouter();
  return (
    <Pressable
      testID="fab-add"
      accessibilityLabel="Add transaction"
      onPress={() => router.push({ pathname: "/tx", params: date ? { date } : {} })}
      style={({ pressed }) => ({
        position: "absolute", right: 20, bottom: 20, width: 58, height: 58, borderRadius: 29, backgroundColor: t.primary,
        alignItems: "center", justifyContent: "center", opacity: pressed ? 0.85 : 1,
        shadowColor: "#000", shadowOpacity: 0.25, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, elevation: 6,
      })}
    >
      <Icon name="plus" size={28} color={t.onPrimary} />
    </Pressable>
  );
}
