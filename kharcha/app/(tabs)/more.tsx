import React, { useState } from "react";
import { Platform, Pressable, Share, View } from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { apiText } from "../../src/api";
import { useAuth } from "../../src/auth";
import { thisMonth } from "../../src/format";
import { useTheme } from "../../src/theme";
import { Card, ErrorBox, Icon, Screen, T } from "../../src/components/ui";

async function exportCsv(month?: string) {
  const csv = await apiText(`/transactions/export${month ? `?month=${month}` : ""}`);
  const name = `kharcha-${month ?? "all"}.csv`;
  if (Platform.OS === "web") {
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url; a.download = name; a.click();
    URL.revokeObjectURL(url);
  } else {
    await Share.share({ title: name, message: csv });
  }
}

export default function More() {
  const t = useTheme();
  const router = useRouter();
  const { user, signOut } = useAuth();
  const [error, setError] = useState<string | null>(null);

  const run = (fn: () => Promise<void>) => async () => {
    setError(null);
    try { await fn(); } catch (e) { setError(e instanceof Error ? e.message : "Something went wrong"); }
  };

  const rows: { icon: string; title: string; hint?: string; onPress: () => void; danger?: boolean }[] = [
    { icon: "user", title: "Account", hint: "Name, currency, password", onPress: () => router.push("/account") },
    { icon: "repeat", title: "Recurring transactions", onPress: () => router.push("/recurring") },
    { icon: "users", title: "Split bills", onPress: () => router.push("/splits") },
    { icon: "download", title: "Export this month (CSV)", onPress: run(() => exportCsv(thisMonth())) },
    { icon: "download-cloud", title: "Export everything (CSV)", onPress: run(() => exportCsv()) },
    { icon: "shield", title: "Privacy policy", onPress: () => router.push("/privacy") },
    { icon: "log-out", title: "Sign out", onPress: run(async () => { await signOut(); router.replace("/login"); }), danger: true },
  ];

  return (
    <SafeAreaView edges={[]} style={{ flex: 1, backgroundColor: t.bg }}>
      <Screen>
        <Card style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
          <View style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: t.primary, alignItems: "center", justifyContent: "center" }}>
            <T size={22} weight="800" color={t.onPrimary}>{(user?.name || "?").slice(0, 1).toUpperCase()}</T>
          </View>
          <View style={{ flex: 1 }}>
            <T size={18} weight="700">{user?.name}</T>
            <T size={13} muted>{user?.email}</T>
          </View>
        </Card>
        {error ? <ErrorBox message={error} /> : null}
        <Card style={{ paddingVertical: 4 }}>
          {rows.map((r, i) => (
            <Pressable key={r.title} onPress={r.onPress} style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 14, borderTopWidth: i ? 1 : 0, borderTopColor: t.border }}>
              <Icon name={r.icon} color={r.danger ? t.danger : t.primary} />
              <View style={{ flex: 1 }}>
                <T weight="600" color={r.danger ? t.danger : undefined}>{r.title}</T>
                {r.hint ? <T size={12} muted>{r.hint}</T> : null}
              </View>
              <Icon name="chevron-right" size={18} color={t.muted} />
            </Pressable>
          ))}
        </Card>
        <T size={12} muted style={{ textAlign: "center" }}>Kharcha 1.0.0</T>
      </Screen>
    </SafeAreaView>
  );
}
