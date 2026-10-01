import React from "react";
import { Tabs } from "expo-router";
import { Icon } from "../../src/components/ui";
import { useTheme } from "../../src/theme";

export default function TabsLayout() {
  const t = useTheme();
  const tab = (title: string, icon: string) => ({
    title,
    tabBarIcon: ({ color }: { color: string }) => <Icon name={icon} size={22} color={color} />,
  });
  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: t.card },
        headerTintColor: t.text,
        headerTitleStyle: { fontWeight: "700" },
        headerShadowVisible: false,
        tabBarActiveTintColor: t.primary,
        tabBarInactiveTintColor: t.muted,
        tabBarStyle: { backgroundColor: t.card, borderTopColor: t.border },
        sceneStyle: { backgroundColor: t.bg },
      }}
    >
      <Tabs.Screen name="index" options={{ ...tab("Home", "home"), headerShown: false }} />
      <Tabs.Screen name="activity" options={tab("Activity", "list")} />
      <Tabs.Screen name="insights" options={tab("Insights", "pie-chart")} />
      <Tabs.Screen name="plan" options={tab("Plan", "target")} />
      <Tabs.Screen name="more" options={tab("More", "menu")} />
    </Tabs>
  );
}
