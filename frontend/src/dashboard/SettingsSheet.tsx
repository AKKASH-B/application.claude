import { useEffect, useState } from "react";
import { Feather } from "@expo/vector-icons";
import { ActivityIndicator, Alert, KeyboardAvoidingView, Modal, Platform, Pressable, Share, Text, TextInput, View } from "react-native";
import { storage } from "@/src/utils/storage";
import { changePin } from "@/src/auth";
import type { Transaction } from "./types";
import { COLORS, monthLabel } from "./constants";
import { styles, authStyles } from "./styles";

export function SettingsSheet({ visible, month, monthTransactions, isAdmin, onClose, onChangePassword, onOpenAdmin, onSignedOut }: { visible: boolean; month: string; monthTransactions: Transaction[]; isAdmin: boolean; onClose: () => void; onChangePassword: () => void; onOpenAdmin: () => void; onSignedOut: () => void }) {
  const [busy, setBusy] = useState(false);
  const shareCsv = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const token = await storage.secureGet("spendpulse-auth-token", null);
      const res = await fetch(`${process.env.EXPO_PUBLIC_BACKEND_URL}/api/transactions/export?month=${month}`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error("Export failed");
      const csv = await res.text();
      await Share.share({ title: `SpendPulse ${monthLabel(month)}.csv`, message: csv });
    } catch { Alert.alert("Couldn’t export", "Please try again."); }
    finally { setBusy(false); }
  };
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.modalShade} onPress={onClose}>
        <Pressable style={styles.modal} onPress={(e) => e.stopPropagation()}>
          <View style={styles.modalHead}>
            <Text style={styles.modalTitle}>Settings</Text>
            <Pressable testID="close-settings" onPress={onClose}><Feather name="x" size={22} color={COLORS.muted} /></Pressable>
          </View>
          <Text style={styles.emptyText}>{monthTransactions.length} transactions recorded in {monthLabel(month)}.</Text>
          <Pressable testID="export-csv" onPress={shareCsv} disabled={busy || monthTransactions.length === 0} style={[styles.actionBtn, (busy || monthTransactions.length === 0) && { opacity: 0.55 }]}>
            <Feather name="download" size={18} color={COLORS.ink} />
            <Text style={styles.actionText}>{busy ? "Preparing…" : `Export ${monthLabel(month)} as CSV`}</Text>
          </Pressable>
          <Pressable testID="change-password" onPress={onChangePassword} style={styles.actionBtn}>
            <Feather name="lock" size={18} color={COLORS.ink} />
            <Text style={styles.actionText}>Change PIN</Text>
          </Pressable>
          {isAdmin && (
            <Pressable testID="open-admin-panel" onPress={onOpenAdmin} style={styles.actionBtn}>
              <Feather name="shield" size={18} color={COLORS.ink} />
              <Text style={styles.actionText}>Admin panel</Text>
            </Pressable>
          )}
          <Pressable testID="settings-logout" onPress={onSignedOut} style={[styles.actionBtn, styles.actionBtnDanger]}>
            <Feather name="log-out" size={18} color={COLORS.red} />
            <Text style={[styles.actionText, { color: COLORS.red }]}>Log out</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

export function ChangePasswordSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [ok, setOk] = useState(false);
  useEffect(() => { if (!visible) { setCurrent(""); setNext(""); setError(""); setOk(false); } }, [visible]);
  const submit = async () => {
    if (!/^\d{6}$/.test(current) || !/^\d{6}$/.test(next)) { setError("Enter your current 6-digit PIN and a new 6-digit PIN."); return; }
    setBusy(true); setError("");
    try {
      await changePin(current, next);
      setOk(true);
      setTimeout(onClose, 900);
    } catch (e) { setError(e instanceof Error ? e.message : "Please try again."); }
    finally { setBusy(false); }
  };
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={styles.modalShade}>
        <View style={styles.modal}>
          <View style={styles.modalHead}>
            <Text style={styles.modalTitle}>Change PIN</Text>
            <Pressable testID="close-change-password" onPress={onClose}><Feather name="x" size={22} color={COLORS.muted} /></Pressable>
          </View>
          <Text style={styles.inputLabel}>CURRENT PIN</Text>
          <TextInput testID="current-password" value={current} onChangeText={(v) => setCurrent(v.replace(/[^0-9]/g, "").slice(0, 6))} keyboardType="number-pad" secureTextEntry placeholder="6-digit PIN" placeholderTextColor="#A9AAA5" style={styles.input} maxLength={6} />
          <Text style={styles.inputLabel}>NEW PIN</Text>
          <TextInput testID="new-password" value={next} onChangeText={(v) => setNext(v.replace(/[^0-9]/g, "").slice(0, 6))} keyboardType="number-pad" secureTextEntry placeholder="6-digit PIN" placeholderTextColor="#A9AAA5" style={styles.input} maxLength={6} />
          {error ? <Text style={authStyles.authError}>{error}</Text> : null}
          {ok ? <Text style={authStyles.authInfo}>PIN updated.</Text> : null}
          <Pressable testID="submit-change-password" onPress={submit} disabled={busy || ok} style={[styles.save, (busy || ok) && authStyles.disabled]}>
            {busy ? <ActivityIndicator color="#FFF" /> : <Text style={styles.saveText}>Update PIN</Text>}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
