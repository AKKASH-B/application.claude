import { Feather } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Alert, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { authorizedRequest } from "@/src/auth";
import { COLORS } from "@/src/split/styles";
import { parseSmsBundle, sourceLabel, type ParsedReceipt } from "./parsers";

type Transaction = { id: string; type: "expense" | "income" | "savings"; amount: number; category: string; note?: string; date: string; created_at: string; goal_id?: string | null };

type Props = {
  visible: boolean;
  onClose: () => void;
  onSaved: (created: Transaction[]) => void;
  onEditPrefilled: (draft: { type: "expense" | "income"; amount: number; category: string; note: string }) => void;
};

const SOURCE_COLOR: Record<ParsedReceipt["source"], string> = {
  gpay: "#4285F4", phonepe: "#5F259F", paytm: "#00BAF2", cred: "#0A0A0A", unknown: "#777773",
};

const SAMPLE_SMS = `HDFCBK: Rs.500.00 debited from A/c XX1234 on 12-Aug-25 to VPA zomato@ybl. UPI Ref 456789. HDFC Bank

SBIINB: Your A/c XX1234 credited Rs 5,000 by transfer from PRIYA SHARMA. Bal Rs 12,345. SBI

AXISBK: Rs 1,200 spent on your Axis Bank Card ending 5678 at SWIGGY on 12-Aug-25. Avl Bal Rs 45,000`;

type Row = ParsedReceipt & { rowId: string; selected: boolean };

export default function ImportSheet({ visible, onClose, onSaved, onEditPrefilled }: Props) {
  const [text, setText] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [saving, setSaving] = useState(false);
  const [pasting, setPasting] = useState(false);

  useEffect(() => {
    if (visible) {
      setText("");
      setRows([]);
      // Auto-attempt clipboard read on open so it feels magical.
      pasteFromClipboard(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  useEffect(() => {
    if (!text.trim()) { setRows([]); return; }
    const parsed = parseSmsBundle(text);
    setRows(parsed.map((p, i) => ({ ...p, rowId: `r_${i}`, selected: true })));
  }, [text]);

  const pasteFromClipboard = useCallback(async (silent = false) => {
    setPasting(true);
    try {
      const has = await Clipboard.hasStringAsync();
      if (!has) {
        if (!silent) Alert.alert("Clipboard empty", "Copy a bank SMS first, then tap Paste.");
        return;
      }
      const s = await Clipboard.getStringAsync();
      if (s?.trim()) setText(s);
      else if (!silent) Alert.alert("Nothing to paste", "Clipboard is empty.");
    } catch (e) {
      if (!silent) Alert.alert("Couldn't read clipboard", e instanceof Error ? e.message : "Please try again.");
    } finally {
      setPasting(false);
    }
  }, []);

  const showAutoImportInfo = () => {
    const msg = Platform.OS === "ios"
      ? "iOS never permits apps to read SMS. To auto-import, use an Android device with the built APK."
      : "Auto-reading SMS needs the built Android APK (currently in Expo preview mode). Tap the Publish button up top → Deploy Android to get the standalone APK. Meanwhile you can paste SMS below.";
    if (Platform.OS === "web") {
      if (typeof window !== "undefined") window.alert(msg);
    } else {
      Alert.alert("Auto SMS import", msg);
    }
  };

  const toggleRow = (id: string) => setRows((prev) => prev.map((r) => (r.rowId === id ? { ...r, selected: !r.selected } : r)));
  const setAll = (v: boolean) => setRows((prev) => prev.map((r) => ({ ...r, selected: v })));

  const selectedCount = rows.filter((r) => r.selected).length;

  const doBulkSave = async () => {
    const chosen = rows.filter((r) => r.selected);
    if (chosen.length === 0) return;
    setSaving(true);
    const created: Transaction[] = [];
    const errors: string[] = [];
    try {
      for (const r of chosen) {
        try {
          const tx = await authorizedRequest<Transaction>("/transactions", {
            method: "POST",
            body: JSON.stringify({
              type: r.direction,
              amount: r.amount,
              category: r.category,
              note: `${sourceLabel[r.source]} · ${r.merchant}${r.transactionId ? ` · Ref ${r.transactionId}` : ""}`.slice(0, 120),
              date: new Date().toISOString().slice(0, 10),
              goal_id: null,
            }),
          });
          created.push(tx);
        } catch (e) {
          errors.push(`${r.merchant} · ${e instanceof Error ? e.message : "failed"}`);
        }
      }
      if (created.length > 0) onSaved(created);
      if (errors.length > 0) {
        const msg = `Saved ${created.length}, failed ${errors.length}:\n${errors.join("\n")}`;
        if (Platform.OS === "web" && typeof window !== "undefined") window.alert(msg);
        else Alert.alert("Import summary", msg);
      }
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const editSingle = (r: ParsedReceipt) => {
    onEditPrefilled({
      type: r.direction,
      amount: r.amount,
      category: r.category,
      note: `${sourceLabel[r.source]} · ${r.merchant}${r.transactionId ? ` · Ref ${r.transactionId}` : ""}`.slice(0, 120),
    });
    onClose();
  };

  const previewSummary = useMemo(() => {
    if (rows.length === 0) return "";
    const total = rows.filter((r) => r.selected).reduce((s, r) => s + (r.direction === "expense" ? r.amount : -r.amount), 0);
    return total >= 0 ? `Net outflow ₹${total.toLocaleString("en-IN")}` : `Net inflow ₹${(-total).toLocaleString("en-IN")}`;
  }, [rows]);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.shade}>
        <Pressable style={{ flex: 1 }} onPress={onClose} />
        <View style={styles.sheet}>
          <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: 14, paddingBottom: 8 }}>
            <View style={styles.head}>
              <View style={{ flex: 1 }}>
                <Text style={styles.title}>Import from SMS</Text>
                <Text style={styles.sub}>Paste one or many bank / UPI SMS. We&apos;ll parse each and let you pick which to save.</Text>
              </View>
              <Pressable testID="close-import" onPress={onClose} hitSlop={10}>
                <Feather name="x" size={22} color={COLORS.muted} />
              </Pressable>
            </View>

            <View style={styles.pasteRow}>
              <Pressable
                testID="paste-clipboard"
                onPress={() => pasteFromClipboard(false)}
                disabled={pasting}
                style={[styles.pasteBtn, pasting && { opacity: 0.5 }]}
              >
                {pasting ? <ActivityIndicator color="#FFF" size="small" /> : <Feather name="clipboard" size={16} color="#FFF" />}
                <Text style={styles.pasteBtnText}>Paste SMS</Text>
              </Pressable>
              <Pressable
                testID="auto-import-info"
                onPress={showAutoImportInfo}
                style={styles.ghostBtn}
              >
                <Feather name="zap" size={14} color={COLORS.gold} />
                <Text style={styles.ghostText}>Auto import</Text>
              </Pressable>
            </View>

            <View>
              <Text style={styles.eyebrow}>PASTE SMS TEXT</Text>
              <TextInput
                testID="receipt-textarea"
                value={text}
                onChangeText={setText}
                multiline
                numberOfLines={5}
                placeholder="Paste one or more bank SMS here — separate multiple messages with a blank line."
                placeholderTextColor="#A9AAA5"
                style={styles.textarea}
              />
              {!text.trim() ? (
                <Pressable testID="try-sample" onPress={() => setText(SAMPLE_SMS)} style={styles.sampleBtn}>
                  <Feather name="play-circle" size={13} color={COLORS.green} />
                  <Text style={styles.sampleText}>Try with sample SMS</Text>
                </Pressable>
              ) : null}
            </View>

            {rows.length > 0 ? (
              <View testID="parse-preview" style={{ gap: 8 }}>
                <View style={styles.previewHead}>
                  <Text style={styles.eyebrow}>{rows.length} PARSED · {selectedCount} SELECTED</Text>
                  <View style={{ flexDirection: "row", gap: 8 }}>
                    <Pressable testID="select-all" onPress={() => setAll(true)} hitSlop={8}>
                      <Text style={styles.linkText}>All</Text>
                    </Pressable>
                    <Text style={{ color: COLORS.line }}>·</Text>
                    <Pressable testID="select-none" onPress={() => setAll(false)} hitSlop={8}>
                      <Text style={styles.linkText}>None</Text>
                    </Pressable>
                  </View>
                </View>

                {rows.map((r) => (
                  <View key={r.rowId} testID={`parsed-row-${r.rowId}`} style={styles.rowCard}>
                    <Pressable
                      testID={`toggle-${r.rowId}`}
                      onPress={() => toggleRow(r.rowId)}
                      style={[styles.checkbox, r.selected && styles.checkboxOn]}
                    >
                      {r.selected ? <Feather name="check" size={14} color="#FFF" /> : null}
                    </Pressable>
                    <View style={{ flex: 1 }}>
                      <View style={styles.rowTop}>
                        <Text style={styles.rowMerchant} numberOfLines={1}>{r.merchant}</Text>
                        <Text style={[styles.rowAmount, { color: r.direction === "income" ? COLORS.green : COLORS.ink }]}>
                          {r.direction === "income" ? "+" : "-"}₹{r.amount.toLocaleString("en-IN", { minimumFractionDigits: r.amount % 1 ? 2 : 0 })}
                        </Text>
                      </View>
                      <View style={styles.rowMeta}>
                        <View style={[styles.chip, { backgroundColor: `${SOURCE_COLOR[r.source]}15` }]}>
                          <Text style={[styles.chipText, { color: SOURCE_COLOR[r.source] }]}>{sourceLabel[r.source]}</Text>
                        </View>
                        <Text style={styles.rowMetaText}>{r.category}</Text>
                        {r.transactionId ? <Text style={styles.rowMetaText} numberOfLines={1}>· ref {r.transactionId}</Text> : null}
                      </View>
                    </View>
                    <Pressable testID={`edit-${r.rowId}`} onPress={() => editSingle(r)} hitSlop={6} style={styles.editIcon}>
                      <Feather name="edit-3" size={14} color={COLORS.muted} />
                    </Pressable>
                  </View>
                ))}

                <Text style={styles.netHint}>{previewSummary}</Text>

                <Pressable
                  testID="import-save-selected"
                  onPress={doBulkSave}
                  disabled={selectedCount === 0 || saving}
                  style={[styles.primaryCta, (selectedCount === 0 || saving) && { opacity: 0.5 }]}
                >
                  {saving ? <ActivityIndicator color="#FFF" size="small" /> : <Feather name="download" size={14} color="#FFF" />}
                  <Text style={styles.primaryCtaText}>
                    {saving ? "Saving…" : selectedCount === 0 ? "Select rows to save" : `Save ${selectedCount} transaction${selectedCount === 1 ? "" : "s"}`}
                  </Text>
                </Pressable>
              </View>
            ) : text.trim().length > 0 ? (
              <View style={styles.noMatch} testID="parse-nomatch">
                <Feather name="alert-circle" size={16} color={COLORS.gold} />
                <Text style={styles.noMatchText}>Couldn&apos;t recognise a transaction. Make sure each SMS includes an amount like ₹500 or Rs 500 and a word like &quot;debited&quot;, &quot;credited&quot;, &quot;paid&quot;, or &quot;received&quot;.</Text>
              </View>
            ) : (
              <View style={styles.hint} testID="parse-hint">
                <Text style={styles.hintText}>
                  <Text style={{ fontWeight: "700", color: COLORS.ink }}>On Android:</Text> open Messages → long-press a bank SMS → Copy → come back and Paste here.{"\n\n"}
                  <Text style={{ fontWeight: "700", color: COLORS.ink }}>Multiple SMS at once:</Text> keep copying and pasting — separate each with a blank line.
                </Text>
              </View>
            )}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  shade: { flex: 1, backgroundColor: "rgba(0,0,0,0.35)", justifyContent: "flex-end" },
  sheet: { backgroundColor: COLORS.card, borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: 20, paddingBottom: 30, maxHeight: "88%" },
  head: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: 12 },
  title: { color: COLORS.ink, fontSize: 20, fontWeight: "700" },
  sub: { color: COLORS.muted, fontSize: 13, marginTop: 4, lineHeight: 18 },
  eyebrow: { color: COLORS.muted, fontSize: 10, letterSpacing: 1.4, fontWeight: "700", marginBottom: 8 },
  pasteRow: { flexDirection: "row", gap: 10, alignItems: "center" },
  pasteBtn: {
    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    backgroundColor: COLORS.green, paddingVertical: 13, borderRadius: 12,
  },
  pasteBtnText: { color: "#FFF", fontWeight: "700", fontSize: 14 },
  ghostBtn: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 10, backgroundColor: "#FFF6E5", borderWidth: 1, borderColor: "#F4E2C0" },
  ghostText: { color: COLORS.gold, fontSize: 12, fontWeight: "700" },
  textarea: {
    borderWidth: 1.5, borderColor: COLORS.line, borderRadius: 12, padding: 14, minHeight: 110,
    color: COLORS.ink, fontSize: 14, backgroundColor: "#FFFFFF", textAlignVertical: "top",
  },
  sampleBtn: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 8, alignSelf: "flex-start" },
  sampleText: { color: COLORS.green, fontSize: 12, fontWeight: "600" },
  previewHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  linkText: { color: COLORS.green, fontSize: 12, fontWeight: "700" },
  rowCard: {
    flexDirection: "row", alignItems: "center", gap: 12,
    borderWidth: 1, borderColor: COLORS.line, borderRadius: 12, padding: 12, backgroundColor: "#FAFAF7",
  },
  checkbox: {
    width: 22, height: 22, borderRadius: 6, borderWidth: 1.5, borderColor: COLORS.line,
    alignItems: "center", justifyContent: "center", backgroundColor: "#FFFFFF",
  },
  checkboxOn: { backgroundColor: COLORS.green, borderColor: COLORS.green },
  rowTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  rowMerchant: { flex: 1, color: COLORS.ink, fontSize: 14, fontWeight: "700", marginRight: 8 },
  rowAmount: { color: COLORS.ink, fontSize: 14, fontWeight: "700" },
  rowMeta: { flexDirection: "row", gap: 6, marginTop: 4, alignItems: "center" },
  chip: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  chipText: { fontSize: 10, fontWeight: "700" },
  rowMetaText: { color: COLORS.muted, fontSize: 11 },
  editIcon: { padding: 4 },
  netHint: { color: COLORS.muted, fontSize: 12, textAlign: "center", marginTop: 4 },
  primaryCta: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6,
    paddingVertical: 14, borderRadius: 12, backgroundColor: COLORS.green, marginTop: 4,
  },
  primaryCtaText: { color: "#FFF", fontSize: 14, fontWeight: "700" },
  noMatch: { flexDirection: "row", gap: 10, alignItems: "flex-start", padding: 12, borderRadius: 12, backgroundColor: "#FFF6E5" },
  noMatchText: { flex: 1, color: COLORS.ink, fontSize: 13, lineHeight: 18 },
  hint: { padding: 14, borderRadius: 12, backgroundColor: "#F1EFEA" },
  hintText: { color: COLORS.muted, fontSize: 12, lineHeight: 18 },
});
