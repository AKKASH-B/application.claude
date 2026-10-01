import { useEffect, useState } from "react";
import { Feather } from "@expo/vector-icons";
import { ActivityIndicator, Alert, KeyboardAvoidingView, Modal, Platform, Pressable, Share, Text, TextInput, View } from "react-native";
import { storage } from "@/src/utils/storage";
import { router } from "expo-router";
import { changePin, deleteAccount, setRecoveryEmail, verifyRecoveryEmail } from "@/src/auth";
import type { Transaction } from "./types";
import { COLORS, monthLabel } from "./constants";
import { styles, authStyles } from "./styles";

export function SettingsSheet({ visible, month, monthTransactions, isAdmin, email, onClose, onChangePassword, onOpenRecoveryEmail, onOpenDeleteAccount, onOpenAdmin, onSignedOut }: { visible: boolean; month: string; monthTransactions: Transaction[]; isAdmin: boolean; email?: string; onClose: () => void; onChangePassword: () => void; onOpenRecoveryEmail: () => void; onOpenDeleteAccount: () => void; onOpenAdmin: () => void; onSignedOut: () => void }) {
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
          <Pressable testID="open-recovery-email" onPress={onOpenRecoveryEmail} style={styles.actionBtn}>
            <Feather name="mail" size={18} color={COLORS.ink} />
            <Text style={styles.actionText} numberOfLines={1}>{email ? `Recovery email · ${email}` : "Add recovery email (needed to reset a forgotten PIN)"}</Text>
          </Pressable>
          {isAdmin && (
            <Pressable testID="open-admin-panel" onPress={onOpenAdmin} style={styles.actionBtn}>
              <Feather name="shield" size={18} color={COLORS.ink} />
              <Text style={styles.actionText}>Admin panel</Text>
            </Pressable>
          )}
          <Pressable testID="open-privacy" onPress={() => { onClose(); router.push("/privacy"); }} style={styles.actionBtn}>
            <Feather name="file-text" size={18} color={COLORS.ink} />
            <Text style={styles.actionText}>Privacy policy</Text>
          </Pressable>
          <Pressable testID="settings-logout" onPress={onSignedOut} style={[styles.actionBtn, styles.actionBtnDanger]}>
            <Feather name="log-out" size={18} color={COLORS.red} />
            <Text style={[styles.actionText, { color: COLORS.red }]}>Log out</Text>
          </Pressable>
          {!isAdmin && (
            <Pressable testID="open-delete-account" onPress={onOpenDeleteAccount} style={[styles.actionBtn, styles.actionBtnDanger]}>
              <Feather name="trash-2" size={18} color={COLORS.red} />
              <Text style={[styles.actionText, { color: COLORS.red }]}>Delete account</Text>
            </Pressable>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

export function RecoveryEmailSheet({ visible, currentEmail, onClose, onSaved }: { visible: boolean; currentEmail?: string; onClose: () => void; onSaved: (email: string) => void }) {
  const [email, setEmail] = useState("");
  const [pin, setPin] = useState("");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  useEffect(() => { if (!visible) { setEmail(""); setPin(""); setCode(""); setSent(false); setError(""); setDone(false); } }, [visible]);
  const sendCode = async () => {
    const em = email.trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(em)) { setError("Enter a valid email address."); return; }
    if (!/^\d{6}$/.test(pin)) { setError("Enter your current 6-digit PIN to confirm."); return; }
    setBusy(true); setError("");
    try { await setRecoveryEmail(em, pin); setSent(true); }
    catch (e) { setError(e instanceof Error ? e.message : "Please try again."); }
    finally { setBusy(false); }
  };
  const confirm = async () => {
    const em = email.trim().toLowerCase();
    if (!/^\d{6}$/.test(code)) { setError("Enter the 6-digit code from the email."); return; }
    setBusy(true); setError("");
    try { await verifyRecoveryEmail(em, code); setDone(true); onSaved(em); setTimeout(onClose, 1200); }
    catch (e) { setError(e instanceof Error ? e.message : "Please try again."); }
    finally { setBusy(false); }
  };
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={styles.modalShade}>
        <View style={styles.modal}>
          <View style={styles.modalHead}>
            <Text style={styles.modalTitle}>Recovery email</Text>
            <Pressable testID="close-recovery-email" onPress={onClose}><Feather name="x" size={22} color={COLORS.muted} /></Pressable>
          </View>
          <Text style={styles.emptyText}>{currentEmail ? `Current: ${currentEmail}. ` : ""}If you forget your PIN, we'll email a 6-digit code to this address.</Text>
          <Text style={styles.inputLabel}>EMAIL</Text>
          <TextInput testID="recovery-email-input" value={email} onChangeText={setEmail} editable={!sent} keyboardType="email-address" autoCapitalize="none" autoCorrect={false} placeholder="you@example.com" placeholderTextColor="#A9AAA5" style={styles.input} />
          {!sent ? <>
            <Text style={styles.inputLabel}>CURRENT PIN</Text>
            <TextInput testID="recovery-email-pin" value={pin} onChangeText={(v) => setPin(v.replace(/[^0-9]/g, "").slice(0, 6))} keyboardType="number-pad" secureTextEntry placeholder="6-digit PIN" placeholderTextColor="#A9AAA5" style={styles.input} maxLength={6} />
          </> : <>
            <Text style={styles.inputLabel}>6-DIGIT CODE</Text>
            <TextInput testID="recovery-email-code" value={code} onChangeText={(v) => setCode(v.replace(/[^0-9]/g, "").slice(0, 6))} keyboardType="number-pad" placeholder="Paste the code from the email" placeholderTextColor="#A9AAA5" style={styles.input} maxLength={6} />
          </>}
          {error ? <Text style={authStyles.authError}>{error}</Text> : null}
          {done ? <Text style={authStyles.authInfo}>Recovery email saved.</Text> : null}
          <Pressable testID="recovery-email-submit" onPress={sent ? confirm : sendCode} disabled={busy || done} style={[styles.save, (busy || done) && authStyles.disabled]}>
            {busy ? <ActivityIndicator color="#FFF" /> : <Text style={styles.saveText}>{sent ? "Verify & save" : "Email me a code"}</Text>}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

export function DeleteAccountSheet({ visible, onClose, onDeleted }: { visible: boolean; onClose: () => void; onDeleted: () => void }) {
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => { if (!visible) { setPin(""); setError(""); } }, [visible]);
  const submit = async () => {
    if (!/^\d{6}$/.test(pin)) { setError("Enter your 6-digit PIN to confirm."); return; }
    setBusy(true); setError("");
    try { await deleteAccount(pin); onDeleted(); }
    catch (e) { setError(e instanceof Error ? e.message : "Please try again."); }
    finally { setBusy(false); }
  };
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={styles.modalShade}>
        <View style={styles.modal}>
          <View style={styles.modalHead}>
            <Text style={styles.modalTitle}>Delete account?</Text>
            <Pressable testID="close-delete-account" onPress={onClose}><Feather name="x" size={22} color={COLORS.muted} /></Pressable>
          </View>
          <Text style={styles.emptyText}>This permanently deletes your account and every transaction, budget, goal, split and saved friend. It can’t be undone.</Text>
          <Text style={styles.inputLabel}>ENTER YOUR PIN TO CONFIRM</Text>
          <TextInput testID="delete-account-pin" value={pin} onChangeText={(v) => setPin(v.replace(/[^0-9]/g, "").slice(0, 6))} keyboardType="number-pad" secureTextEntry placeholder="6-digit PIN" placeholderTextColor="#A9AAA5" style={styles.input} maxLength={6} />
          {error ? <Text style={authStyles.authError}>{error}</Text> : null}
          <Pressable testID="confirm-delete-account" onPress={submit} disabled={busy} style={[styles.save, { backgroundColor: COLORS.red }, busy && authStyles.disabled]}>
            {busy ? <ActivityIndicator color="#FFF" /> : <Text style={styles.saveText}>Delete my account</Text>}
          </Pressable>
          <Pressable testID="cancel-delete-account" onPress={onClose} style={styles.remove}><Text style={authStyles.linkText}>Cancel</Text></Pressable>
        </View>
      </KeyboardAvoidingView>
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
