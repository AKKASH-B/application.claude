import React, { useEffect } from "react";
import { Stack, useRouter, useSegments } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { AuthProvider, useAuth } from "../src/auth";
import { useTheme } from "../src/theme";

const PUBLIC = new Set(["login", "signup", "reset", "privacy"]);

function Gate() {
  const t = useTheme();
  const { user, loading } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    const first = String(segments[0] ?? "");
    if (!user && !PUBLIC.has(first)) router.replace("/login");
  }, [user, loading, segments, router]);

  return (
    <>
      <StatusBar style={t.bg === "#0D1512" ? "light" : "dark"} />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: t.card },
          headerTintColor: t.text,
          headerTitleStyle: { fontWeight: "700" },
          headerShadowVisible: false,
          contentStyle: { backgroundColor: t.bg },
          headerBackTitle: "Back",
        }}
      >
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="login" options={{ headerShown: false }} />
        <Stack.Screen name="signup" options={{ title: "Create account" }} />
        <Stack.Screen name="reset" options={{ title: "Reset password" }} />
        <Stack.Screen name="tx" options={{ title: "Transaction", presentation: "modal" }} />
        <Stack.Screen name="goal" options={{ title: "Savings goal" }} />
        <Stack.Screen name="budget" options={{ title: "Budget", presentation: "modal" }} />
        <Stack.Screen name="recurring" options={{ title: "Recurring" }} />
        <Stack.Screen name="splits" options={{ title: "Split bills" }} />
        <Stack.Screen name="split-new" options={{ title: "New split", presentation: "modal" }} />
        <Stack.Screen name="split" options={{ title: "Split details" }} />
        <Stack.Screen name="account" options={{ title: "Account" }} />
        <Stack.Screen name="privacy" options={{ title: "Privacy policy" }} />
      </Stack>
    </>
  );
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <AuthProvider>
          <Gate />
        </AuthProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
