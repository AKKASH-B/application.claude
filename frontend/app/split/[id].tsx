import { Feather } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Alert, KeyboardAvoidingView, Modal, Platform, Pressable, SafeAreaView, ScrollView, Text, TextInput, View } from "react-native";
import AddMemberSheet from "@/src/split/AddMemberSheet";
import { splitApi } from "@/src/split/api";
import { promptAndNotify } from "@/src/split/notify";
import { COLORS, splitStyles as s } from "@/src/split/styles";
import type { DraftMember, SplitMode, SplitSession } from "@/src/split/types";
import { avatarColor, initialsOf, money2, newLocalId, summariseSplit } from "@/src/split/utils";

const MODES: { key: SplitMode; label: string }[] = [
  { key: "equal", label: "Equal" },
  { key: "unequal", label: "Custom" },
  { key: "shares", label: "Shares" },
];

export default function SplitEditor() {
  const { id, amount: presetAmount, note: presetNote } = useLocalSearchParams<{ id: string; amount?: string; note?: string }>();
  const isNew = id === "new";

  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [existing, setExisting] = useState<SplitSession | null>(null);
  const [total, setTotal] = useState<string>(presetAmount ? String(presetAmount) : "");
  const [note, setNote] = useState<string>(presetNote ? String(presetNote) : "");
  const [mode, setMode] = useState<SplitMode>("equal");
  const [members, setMembers] = useState<DraftMember[]>(() => {
    if (isNew) {
      return [
        { id: newLocalId(), name: "You", phone: null, share_value: 1, custom_amount: "", is_payer: true, settled: false },
      ];
    }
    return [];
  });
  const [addSheetOpen, setAddSheetOpen] = useState(false);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  const load = useCallback(async () => {
    if (isNew || !id) return;
    setLoading(true);
    try {
      const doc = await splitApi.get(String(id));
      setExisting(doc);
      setTotal(String(doc.total_amount));
      setNote(doc.note || "");
      setMode(doc.mode);
      setMembers(doc.members.map((m) => ({
        id: m.id,
        name: m.name,
        phone: m.phone,
        share_value: m.share_value || 1,
        custom_amount: m.owed_amount.toFixed(2),
        is_payer: m.is_payer,
        settled: m.settled,
      })));
    } catch (e) {
      Alert.alert("Couldn't load split", e instanceof Error ? e.message : "Please try again.");
      router.back();
    } finally {
      setLoading(false);
    }
  }, [id, isNew]);

  useEffect(() => { load(); }, [load]);

  const totalNum = useMemo(() => Number(total) || 0, [total]);
  const { owedMap, sum, valid, reason } = useMemo(
    () => summariseSplit(totalNum, mode, members),
    [totalNum, mode, members],
  );

  // Auto-recalc unequal custom_amount when switching mode / adding members / changing total for equal & shares
  useEffect(() => {
    if (mode === "unequal") return;
    setMembers((prev) => prev.map((m) => ({ ...m, custom_amount: (owedMap[m.id] ?? 0).toFixed(2) })));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, totalNum, members.length]);

  const finalized = existing?.finalized ?? false;

  const setMode2 = (m: SplitMode) => {
    if (finalized) return;
    if (m === "unequal") {
      // Prefill unequal with equal split values so the user has a starting point.
      setMembers((prev) => prev.map((mem) => ({ ...mem, custom_amount: (owedMap[mem.id] ?? 0).toFixed(2) })));
    }
    setMode(m);
  };

  const addMember = (name: string, phone?: string) => {
    if (members.length >= 10) {
      Alert.alert("Limit reached", "A split can have up to 10 members.");
      return;
    }
    setMembers((prev) => [
      ...prev,
      { id: newLocalId(), name, phone: phone ?? null, share_value: 1, custom_amount: "", is_payer: false, settled: false },
    ]);
    setAddSheetOpen(false);
  };

  const removeMember = (mid: string) => {
    if (finalized) return;
    const target = members.find((m) => m.id === mid);
    if (!target) return;
    if (target.is_payer && members.length > 1) {
      Alert.alert("Can't remove payer", "Assign another member as payer first.");
      return;
    }
    setMembers((prev) => prev.filter((m) => m.id !== mid));
  };

  const setPayer = (mid: string) => {
    if (finalized) return;
    setMembers((prev) => prev.map((m) => ({ ...m, is_payer: m.id === mid })));
  };

  const bumpShare = (mid: string, delta: number) => {
    setMembers((prev) => prev.map((m) => (m.id === mid ? { ...m, share_value: Math.max(0, Math.round((m.share_value + delta) * 10) / 10) } : m)));
  };

  const setCustomAmount = (mid: string, value: string) => {
    setMembers((prev) => prev.map((m) => (m.id === mid ? { ...m, custom_amount: value } : m)));
  };

  const save = async () => {
    if (!valid) {
      Alert.alert("Fix before saving", reason || "Amounts don't add up.");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        total_amount: totalNum,
        note: note.trim(),
        mode,
        members: members.map((m) => ({
          id: m.id.startsWith("m_") ? undefined : m.id,
          name: m.name.trim(),
          phone: m.phone || null,
          share_value: m.share_value,
          owed_amount: owedMap[m.id] ?? 0,
          settled: m.settled,
          is_payer: m.is_payer,
        })),
      };
      if (isNew) {
        const created = await splitApi.create({ ...payload, create_transaction: true });
        // Navigate first so the user always lands on the detail screen even if the notify prompt fails.
        router.replace(`/split/${created.id}` as `/split/${string}`);
        // Fire-and-forget: prompt to send SMS reminders.
        promptAndNotify(created).catch(() => { /* silent */ });
      } else if (existing) {
        const updated = await splitApi.update(existing.id, payload);
        router.back();
        promptAndNotify(updated).catch(() => { /* silent */ });
      }
    } catch (e) {
      Alert.alert("Couldn't save split", e instanceof Error ? e.message : "Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const toggleSettled = async (mid: string) => {
    if (!existing) return;
    const target = members.find((m) => m.id === mid);
    if (!target || target.is_payer) return;
    try {
      const updated = await splitApi.settleMember(existing.id, mid, !target.settled);
      setExisting(updated);
      setMembers((prev) => prev.map((m) => (m.id === mid ? { ...m, settled: !m.settled } : m)));
    } catch (e) {
      Alert.alert("Couldn't update", e instanceof Error ? e.message : "Please try again.");
    }
  };

  const deleteSplit = () => {
    if (!existing) return;
    setDeleteError("");
    setConfirmDeleteOpen(true);
  };
  const performDelete = async () => {
    if (!existing) return;
    setDeleteBusy(true); setDeleteError("");
    try {
      await splitApi.remove(existing.id);
      setConfirmDeleteOpen(false);
      if (router.canGoBack()) router.back(); else router.replace("/splits");
    } catch (e) {
      setDeleteError(e instanceof Error ? e.message : "Please try again.");
    } finally {
      setDeleteBusy(false);
    }
  };

  const payer = members.find((m) => m.is_payer);

  if (loading) {
    return (
      <SafeAreaView style={s.safe}>
        <ActivityIndicator color={COLORS.green} style={{ marginTop: 60 }} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.header}>
        <Pressable testID="split-back" onPress={() => router.back()} style={s.backBtn}>
          <Feather name="arrow-left" size={20} color={COLORS.ink} />
        </Pressable>
        <Text style={s.headerTitle}>{isNew ? "New split" : "Split details"}</Text>
        {!isNew ? (
          <Pressable testID="split-delete" onPress={deleteSplit} style={s.backBtn}>
            <Feather name="trash-2" size={18} color={COLORS.red} />
          </Pressable>
        ) : null}
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }} keyboardVerticalOffset={20}>
        <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          <View style={s.card}>
            <Text style={s.eyebrow}>TOTAL AMOUNT</Text>
            <TextInput
              testID="split-total"
              value={total}
              onChangeText={setTotal}
              keyboardType="decimal-pad"
              placeholder="₹ 0"
              placeholderTextColor="#A9AAA5"
              style={s.amountInput}
              editable={!finalized}
            />
            <TextInput
              testID="split-note"
              value={note}
              onChangeText={setNote}
              placeholder="What was this for? (optional)"
              placeholderTextColor="#A9AAA5"
              style={s.noteInput}
              editable={!finalized}
            />
          </View>

          <View style={s.card}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <View>
                <Text style={s.sectionTitle}>Members</Text>
                <Text style={s.sectionSub}>{members.length}/10 · Tap avatar to mark payer</Text>
              </View>
              {!finalized && (
                <Pressable
                  testID="add-member-btn"
                  onPress={() => setAddSheetOpen(true)}
                  disabled={members.length >= 10}
                  style={[s.iconBtn, members.length >= 10 && { opacity: 0.4 }]}
                >
                  <Feather name="user-plus" size={18} color="#FFF" />
                </Pressable>
              )}
            </View>

            <View style={s.modeRow}>
              {MODES.map((m) => (
                <Pressable
                  key={m.key}
                  testID={`mode-${m.key}`}
                  onPress={() => setMode2(m.key)}
                  disabled={finalized}
                  style={[s.modePill, mode === m.key && s.modePillActive]}
                >
                  <Text style={[s.modePillText, mode === m.key && s.modePillTextActive]}>{m.label}</Text>
                </Pressable>
              ))}
            </View>

            {members.map((m) => (
              <View key={m.id} testID={`member-row-${m.id}`}>
                <View style={s.memberRow}>
                  <Pressable
                    testID={`mark-payer-${m.id}`}
                    onPress={() => setPayer(m.id)}
                    disabled={finalized}
                  >
                    <View style={[s.avatar, { backgroundColor: avatarColor(m.name || m.id), borderWidth: m.is_payer ? 2 : 0, borderColor: COLORS.gold }]}>
                      <Text style={s.avatarText}>{initialsOf(m.name)}</Text>
                    </View>
                  </Pressable>
                  <View style={{ flex: 1 }}>
                    <Text style={s.memberName} numberOfLines={1}>{m.name}</Text>
                    {m.is_payer ? (
                      <View style={s.payerBadge}><Text style={s.payerBadgeText}>PAID THE BILL</Text></View>
                    ) : m.phone ? (
                      <Text style={s.memberSub}>{m.phone}</Text>
                    ) : null}
                  </View>

                  {mode === "unequal" ? (
                    <TextInput
                      testID={`amount-input-${m.id}`}
                      value={m.custom_amount}
                      onChangeText={(v) => setCustomAmount(m.id, v)}
                      keyboardType="decimal-pad"
                      placeholder="₹ 0"
                      placeholderTextColor="#A9AAA5"
                      style={s.smallInput}
                      editable={!finalized}
                    />
                  ) : mode === "shares" ? (
                    <View style={s.shareControls}>
                      <Pressable testID={`share-minus-${m.id}`} onPress={() => bumpShare(m.id, -0.5)} disabled={finalized} style={s.shareBtn}>
                        <Feather name="minus" size={14} color={COLORS.ink} />
                      </Pressable>
                      <Text testID={`share-value-${m.id}`} style={s.shareVal}>{m.share_value}x</Text>
                      <Pressable testID={`share-plus-${m.id}`} onPress={() => bumpShare(m.id, 0.5)} disabled={finalized} style={s.shareBtn}>
                        <Feather name="plus" size={14} color={COLORS.ink} />
                      </Pressable>
                    </View>
                  ) : (
                    <Text testID={`owed-${m.id}`} style={s.memberOwed}>{money2(owedMap[m.id] ?? 0)}</Text>
                  )}

                  {!finalized && members.length > 1 && !m.is_payer && (
                    <Pressable testID={`remove-member-${m.id}`} onPress={() => removeMember(m.id)} style={s.removeBtn}>
                      <Feather name="x" size={14} color={COLORS.red} />
                    </Pressable>
                  )}
                </View>
                {mode !== "equal" && (
                  <Text style={[s.memberOwedMuted, { textAlign: "right", paddingRight: 6, marginTop: -4, marginBottom: 4 }]}>
                    Owes {money2(owedMap[m.id] ?? 0)}
                  </Text>
                )}
              </View>
            ))}
          </View>

          {members.length >= 2 && payer && (
            <View style={s.card}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                <View>
                  <Text style={s.sectionTitle}>Settlement</Text>
                  <Text style={s.sectionSub}>Owed to {payer.name}</Text>
                </View>
                {existing && members.some((m) => !m.is_payer && !m.settled) ? (
                  <Pressable
                    testID="send-reminders"
                    onPress={() => promptAndNotify(existing)}
                    style={[s.chip, { backgroundColor: COLORS.pale }]}
                  >
                    <Feather name="send" size={13} color={COLORS.green} />
                    <Text style={[s.chipText, { color: COLORS.green }]}>Send reminders</Text>
                  </Pressable>
                ) : null}
              </View>
              {members.filter((m) => !m.is_payer).map((m) => (
                <View key={`settle-${m.id}`} style={s.settlementRow} testID={`settle-row-${m.id}`}>
                  <View style={[s.avatar, { backgroundColor: avatarColor(m.name || m.id), width: 32, height: 32, borderRadius: 16 }]}>
                    <Text style={[s.avatarText, { fontSize: 11 }]}>{initialsOf(m.name)}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.memberName} numberOfLines={1}>
                      <Text style={{ color: COLORS.muted, fontWeight: "500" }}>{m.name} owes </Text>
                      {money2(owedMap[m.id] ?? 0)}
                      <Text style={{ color: COLORS.muted, fontWeight: "500" }}> to {payer.name}</Text>
                    </Text>
                  </View>
                  {existing ? (
                    <Pressable
                      testID={`toggle-settled-${m.id}`}
                      onPress={() => toggleSettled(m.id)}
                      style={[s.settleToggle, m.settled && s.settleToggleDone]}
                    >
                      <Text style={[s.settleToggleText, m.settled && s.settleToggleTextDone]}>
                        {m.settled ? "Paid ✓" : "Mark paid"}
                      </Text>
                    </Pressable>
                  ) : null}
                </View>
              ))}
              {existing?.finalized && (
                <View style={[s.chip, { alignSelf: "flex-start", backgroundColor: "#E9F1EC" }]}>
                  <Feather name="check-circle" size={13} color={COLORS.green} />
                  <Text style={[s.chipText, { color: COLORS.green }]}>All settled</Text>
                </View>
              )}
            </View>
          )}

          {!valid && reason ? (
            <Text testID="split-error" style={[s.ctaHint, { color: COLORS.red }]}>{reason}</Text>
          ) : (
            <Text style={s.ctaHint}>
              Total owed {money2(sum)} of {money2(totalNum)}
              {mode === "equal" && members.length > 0 ? ` · ${members.length} members` : ""}
            </Text>
          )}
        </ScrollView>
      </KeyboardAvoidingView>

      {!finalized && (
        <View style={s.ctaWrap}>
          <Pressable
            testID="save-split"
            onPress={save}
            disabled={!valid || saving}
            style={[s.cta, (!valid || saving) && s.ctaDisabled]}
          >
            {saving ? <ActivityIndicator color="#FFF" /> : <Text style={s.ctaText}>{isNew ? "Create split" : "Save changes"}</Text>}
          </Pressable>
        </View>
      )}

      <AddMemberSheet
        visible={addSheetOpen}
        existingNames={members.map((m) => m.name)}
        onClose={() => setAddSheetOpen(false)}
        onAdd={addMember}
      />

      <Modal visible={confirmDeleteOpen} transparent animationType="fade" onRequestClose={() => setConfirmDeleteOpen(false)}>
        <Pressable style={s.modalShade} onPress={() => setConfirmDeleteOpen(false)}>
          <Pressable style={s.sheet} onPress={(e) => e.stopPropagation()}>
            <View style={s.sheetHead}>
              <Text style={s.sheetTitle}>Delete split?</Text>
              <Pressable testID="close-confirm-delete-split" onPress={() => setConfirmDeleteOpen(false)} hitSlop={10}>
                <Feather name="x" size={22} color={COLORS.muted} />
              </Pressable>
            </View>
            <Text style={s.emptyText}>This also removes the linked expense transaction. This can&rsquo;t be undone.</Text>
            {deleteError ? <Text style={s.errorText}>{deleteError}</Text> : null}
            <Pressable testID="confirm-delete-split" onPress={performDelete} disabled={deleteBusy} style={[s.cta, { backgroundColor: COLORS.red }, deleteBusy && s.ctaDisabled]}>
              {deleteBusy ? <ActivityIndicator color="#FFF" /> : <Text style={s.ctaText}>Delete split</Text>}
            </Pressable>
            <Pressable testID="cancel-delete-split" onPress={() => setConfirmDeleteOpen(false)} style={{ alignItems: "center", paddingVertical: 10 }}>
              <Text style={[s.chipText, { color: COLORS.green }]}>Cancel</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}
