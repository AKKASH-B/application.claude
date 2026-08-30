import { Feather } from "@expo/vector-icons";
import { router, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { ActivityIndicator, Pressable, RefreshControl, SafeAreaView, ScrollView, Text, View } from "react-native";
import { splitApi } from "@/src/split/api";
import { COLORS, splitStyles as s } from "@/src/split/styles";
import type { SplitSession } from "@/src/split/types";
import { avatarColor, initialsOf, money2 } from "@/src/split/utils";

export default function SplitsList() {
  const [items, setItems] = useState<SplitSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    try {
      const list = await splitApi.list();
      setItems(list);
    } catch { /* silent */ }
    finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const openNew = () => router.push("/split/new");
  const openOne = (id: string) => router.push(`/split/${id}` as `/split/${string}`);

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.header}>
        <Pressable testID="splits-back" onPress={() => router.back()} style={s.backBtn}>
          <Feather name="arrow-left" size={20} color={COLORS.ink} />
        </Pressable>
        <Text style={s.headerTitle}>Splits</Text>
        <Pressable testID="new-split-btn" onPress={openNew} style={s.headerAction}>
          <Text style={s.headerActionText}>+ New</Text>
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: 20, paddingBottom: 60 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={COLORS.green} />}
      >
        {loading ? (
          <ActivityIndicator color={COLORS.green} style={{ marginTop: 40 }} />
        ) : items.length === 0 ? (
          <View style={s.emptyBox}>
            <Feather name="users" size={32} color={COLORS.muted} />
            <Text style={s.emptyText}>No splits yet. Start one to divide a bill between friends.</Text>
            <Pressable testID="empty-new-split" onPress={openNew} style={[s.cta, { paddingHorizontal: 22, paddingVertical: 12 }]}>
              <Text style={s.ctaText}>Create your first split</Text>
            </Pressable>
          </View>
        ) : (
          items.map((sp) => {
            const payer = sp.members.find((m) => m.is_payer);
            const others = sp.members.filter((m) => !m.is_payer);
            const settledCount = others.filter((m) => m.settled).length;
            const isDone = sp.finalized;
            return (
              <Pressable key={sp.id} testID={`split-card-${sp.id}`} onPress={() => openOne(sp.id)} style={s.listCard}>
                <View style={s.listRow}>
                  <Text style={s.listAmount}>{money2(sp.total_amount)}</Text>
                  <Text
                    style={[
                      s.listPill,
                      { backgroundColor: isDone ? "#E9F1EC" : COLORS.pale, color: isDone ? COLORS.green : COLORS.gold },
                    ]}
                  >
                    {isDone ? "SETTLED" : `${settledCount}/${others.length} paid`}
                  </Text>
                </View>
                <Text style={s.sectionSub} numberOfLines={1}>
                  {sp.note?.trim() || "Untitled split"} · {sp.mode} · paid by {payer?.name || "—"}
                </Text>
                <View style={{ flexDirection: "row", alignItems: "center", marginTop: 6 }}>
                  {sp.members.slice(0, 5).map((m, i) => (
                    <View
                      key={m.id}
                      style={[
                        s.avatar,
                        {
                          width: 26,
                          height: 26,
                          borderRadius: 13,
                          backgroundColor: avatarColor(m.name || m.id),
                          marginLeft: i === 0 ? 0 : -8,
                          borderWidth: 2,
                          borderColor: COLORS.card,
                        },
                      ]}
                    >
                      <Text style={[s.avatarText, { fontSize: 9 }]}>{initialsOf(m.name)}</Text>
                    </View>
                  ))}
                  {sp.members.length > 5 && (
                    <View style={[s.avatar, { width: 26, height: 26, borderRadius: 13, backgroundColor: COLORS.chipBg, marginLeft: -8, borderWidth: 2, borderColor: COLORS.card }]}>
                      <Text style={[s.avatarText, { fontSize: 9, color: COLORS.ink }]}>+{sp.members.length - 5}</Text>
                    </View>
                  )}
                  <Text style={[s.sectionSub, { marginLeft: 10 }]}>
                    {new Date(sp.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                  </Text>
                </View>
              </Pressable>
            );
          })
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
