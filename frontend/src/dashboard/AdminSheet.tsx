import { useCallback, useEffect, useState } from "react";
import { Feather } from "@expo/vector-icons";
import { ActivityIndicator, Alert, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { authorizedRequest } from "@/src/auth";
import type { AdminUser, Transaction } from "./types";
import { COLORS, money } from "./constants";
import { styles, authStyles } from "./styles";
import { TransactionRow } from "./primitives";

export function AdminSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<AdminUser | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmUser, setConfirmUser] = useState<AdminUser | null>(null);
  const [deleteError, setDeleteError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const list = await authorizedRequest<AdminUser[]>("/admin/users");
      setUsers(list);
    } catch { Alert.alert("Couldn't load users", "Please try again."); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { if (visible) { setSelected(null); load(); } }, [visible, load]);

  const toggleDisabled = async (u: AdminUser) => {
    setBusyId(u.id);
    try {
      await authorizedRequest(`/admin/users/${u.id}/disable`, { method: "PUT", body: JSON.stringify({ disabled: !u.disabled }) });
      setUsers((prev) => prev.map((x) => (x.id === u.id ? { ...x, disabled: !u.disabled } : x)));
    } catch (e) { Alert.alert("Couldn't update", e instanceof Error ? e.message : "Please try again."); }
    finally { setBusyId(null); }
  };
  const deleteUser = (u: AdminUser) => { setDeleteError(""); setConfirmUser(u); };
  const performDeleteUser = async () => {
    if (!confirmUser) return;
    setBusyId(confirmUser.id); setDeleteError("");
    try {
      await authorizedRequest(`/admin/users/${confirmUser.id}`, { method: "DELETE" });
      setUsers((prev) => prev.filter((x) => x.id !== confirmUser.id));
      setConfirmUser(null);
    } catch (e) { setDeleteError(e instanceof Error ? e.message : "Please try again."); }
    finally { setBusyId(null); }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={selected ? () => setSelected(null) : onClose}>
      <View style={styles.modalShade}>
        <View style={[styles.modal, { maxHeight: "88%" }]}>
          <View style={styles.modalHead}>
            <Text style={styles.modalTitle}>{selected ? selected.username : "Admin panel"}</Text>
            <Pressable testID="close-admin" onPress={selected ? () => setSelected(null) : onClose}>
              <Feather name={selected ? "arrow-left" : "x"} size={22} color={COLORS.muted} />
            </Pressable>
          </View>
          {selected
            ? <AdminUserDetail user={selected} onBack={() => setSelected(null)} />
            : loading
              ? <ActivityIndicator color={COLORS.green} style={styles.loader} />
              : (
                <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingBottom: 8 }}>
                  <Text style={styles.emptyText}>{users.length} registered {users.length === 1 ? "user" : "users"}.</Text>
                  {users.map((u) => (
                    <View key={u.id} testID={`admin-user-${u.username}`} style={styles.card}>
                      <View style={styles.rowBetween}>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.cardTitleTight}>{u.username}{u.role === "admin" ? "  ·  admin" : ""}</Text>
                          <Text style={styles.transactionSub}>{u.phone}</Text>
                        </View>
                        {u.disabled && <View style={styles.goalBadge}><Text style={[styles.goalBadgeText, { color: COLORS.red }]}>Disabled</Text></View>}
                      </View>
                      <View style={styles.rowBetween}>
                        <Text style={styles.transactionSub}>Balance: <Text style={{ color: u.balance < 0 ? COLORS.red : COLORS.green, fontWeight: "700" }}>{u.balance < 0 ? "-" : ""}{money(u.balance)}</Text></Text>
                        <Text style={styles.transactionSub}>{u.transaction_count} transaction{u.transaction_count === 1 ? "" : "s"}</Text>
                      </View>
                      <Pressable testID={`admin-view-${u.username}`} onPress={() => setSelected(u)} style={styles.actionBtn}>
                        <Feather name="eye" size={16} color={COLORS.ink} />
                        <Text style={styles.actionText}>View transactions</Text>
                      </Pressable>
                      <Pressable testID={`admin-toggle-${u.username}`} disabled={busyId === u.id} onPress={() => toggleDisabled(u)} style={styles.actionBtn}>
                        <Feather name={u.disabled ? "unlock" : "lock"} size={16} color={COLORS.ink} />
                        <Text style={styles.actionText}>{u.disabled ? "Enable account" : "Disable account"}</Text>
                      </Pressable>
                      {u.role !== "admin" && (
                        <Pressable testID={`admin-delete-${u.username}`} disabled={busyId === u.id} onPress={() => deleteUser(u)} style={[styles.actionBtn, styles.actionBtnDanger]}>
                          <Feather name="trash-2" size={16} color={COLORS.red} />
                          <Text style={[styles.actionText, { color: COLORS.red }]}>Delete user</Text>
                        </Pressable>
                      )}
                    </View>
                  ))}
                </ScrollView>
              )}
        </View>
          <Modal visible={!!confirmUser} transparent animationType="fade" onRequestClose={() => setConfirmUser(null)}>
            <Pressable style={styles.modalShade} onPress={() => setConfirmUser(null)}>
              <Pressable style={styles.modal} onPress={(e) => e.stopPropagation()}>
                <View style={styles.modalHead}>
                  <Text style={styles.modalTitle}>Delete user?</Text>
                  <Pressable testID="close-confirm-user" onPress={() => setConfirmUser(null)}><Feather name="x" size={22} color={COLORS.muted} /></Pressable>
                </View>
                <Text style={styles.emptyText}>This permanently deletes {confirmUser?.username} ({confirmUser?.phone}) and all of their transactions, budgets, goals and splits. This can’t be undone.</Text>
                {deleteError ? <Text style={authStyles.authError}>{deleteError}</Text> : null}
                <Pressable testID="confirm-delete-user" disabled={busyId === confirmUser?.id} onPress={performDeleteUser} style={[styles.save, { backgroundColor: COLORS.red }, busyId === confirmUser?.id && authStyles.disabled]}>
                  {busyId === confirmUser?.id ? <ActivityIndicator color="#FFF" /> : <Text style={styles.saveText}>Delete user</Text>}
                </Pressable>
                <Pressable testID="cancel-delete-user" onPress={() => setConfirmUser(null)} style={styles.remove}><Text style={authStyles.linkText}>Cancel</Text></Pressable>
              </Pressable>
            </Pressable>
          </Modal>
      </View>
    </Modal>
  );
}

export function AdminUserDetail({ user }: { user: AdminUser; onBack: () => void }) {
  const [txs, setTxs] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Transaction | null>(null);
  const [confirmTx, setConfirmTx] = useState<Transaction | null>(null);
  const [txError, setTxError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const list = await authorizedRequest<Transaction[]>(`/admin/users/${user.id}/transactions`);
      setTxs(list);
    } catch { Alert.alert("Couldn't load transactions", "Please try again."); }
    finally { setLoading(false); }
  }, [user.id]);
  useEffect(() => { load(); }, [load]);

  const performDeleteTx = async () => {
    if (!confirmTx) return;
    try {
      await authorizedRequest(`/admin/transactions/${confirmTx.id}`, { method: "DELETE" });
      setTxs((prev) => prev.filter((x) => x.id !== confirmTx.id));
      setConfirmTx(null);
    } catch (e) { setTxError(e instanceof Error ? e.message : "Please try again."); }
  };

  return (
    <>
      {loading ? <ActivityIndicator color={COLORS.green} style={styles.loader} /> : (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: 4, paddingBottom: 8 }}>
          {txs.length === 0 && <Text style={styles.emptyText}>No transactions for this user yet.</Text>}
          {txs.map((t) => <TransactionRow key={t.id} t={t} onLongPress={() => setEditing(t)} />)}
        </ScrollView>
      )}
      <AdminEditTransactionSheet t={editing} onClose={() => setEditing(null)} onSaved={(updated) => { setTxs((prev) => prev.map((x) => (x.id === updated.id ? updated : x))); setEditing(null); }} onDeleted={() => { const t = editing; setEditing(null); if (t) { setTxError(""); setConfirmTx(t); } }} />
      <Modal visible={!!confirmTx} transparent animationType="fade" onRequestClose={() => setConfirmTx(null)}>
        <Pressable style={styles.modalShade} onPress={() => setConfirmTx(null)}>
          <Pressable style={styles.modal} onPress={(e) => e.stopPropagation()}>
            <View style={styles.modalHead}>
              <Text style={styles.modalTitle}>Delete transaction?</Text>
              <Pressable testID="close-confirm-admin-tx" onPress={() => setConfirmTx(null)}><Feather name="x" size={22} color={COLORS.muted} /></Pressable>
            </View>
            <Text style={styles.emptyText}>{confirmTx ? `${confirmTx.category} · ${money(confirmTx.amount)} · ${confirmTx.date}` : ""}</Text>
            <Text style={styles.emptyText}>This can’t be undone.</Text>
            {txError ? <Text style={authStyles.authError}>{txError}</Text> : null}
            <Pressable testID="confirm-delete-admin-tx" onPress={performDeleteTx} style={[styles.save, { backgroundColor: COLORS.red }]}><Text style={styles.saveText}>Delete transaction</Text></Pressable>
            <Pressable testID="cancel-delete-admin-tx" onPress={() => setConfirmTx(null)} style={styles.remove}><Text style={authStyles.linkText}>Cancel</Text></Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

export function AdminEditTransactionSheet({ t, onClose, onSaved, onDeleted }: { t: Transaction | null; onClose: () => void; onSaved: (t: Transaction) => void; onDeleted: () => void }) {
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (t) { setAmount(String(t.amount)); setCategory(t.category); setNote(t.note || ""); } }, [t]);
  const save = async () => {
    if (!t) return;
    const amt = Number(amount);
    if (!amt || amt <= 0) return Alert.alert("Add an amount", "Enter a value greater than zero.");
    setBusy(true);
    try {
      const updated = await authorizedRequest<Transaction>(`/admin/transactions/${t.id}`, { method: "PUT", body: JSON.stringify({ amount: amt, category: category.trim(), note: note.trim() }) });
      onSaved(updated);
    } catch (e) { Alert.alert("Couldn't save", e instanceof Error ? e.message : "Please try again."); }
    finally { setBusy(false); }
  };
  return (
    <Modal visible={!!t} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={styles.modalShade}>
        <View style={styles.modal}>
          <View style={styles.modalHead}>
            <Text style={styles.modalTitle}>Edit transaction</Text>
            <Pressable testID="close-admin-edit-tx" onPress={onClose}><Feather name="x" size={22} color={COLORS.muted} /></Pressable>
          </View>
          <Text style={styles.inputLabel}>AMOUNT</Text>
          <TextInput testID="admin-tx-amount" value={amount} onChangeText={setAmount} keyboardType="decimal-pad" style={styles.input} />
          <Text style={styles.inputLabel}>CATEGORY</Text>
          <TextInput testID="admin-tx-category" value={category} onChangeText={setCategory} style={styles.input} />
          <Text style={styles.inputLabel}>NOTE</Text>
          <TextInput testID="admin-tx-note" value={note} onChangeText={setNote} style={styles.input} />
          <Pressable testID="admin-save-tx" onPress={save} disabled={busy} style={[styles.save, busy && authStyles.disabled]}>
            {busy ? <ActivityIndicator color="#FFF" /> : <Text style={styles.saveText}>Save changes</Text>}
          </Pressable>
          <Pressable testID="admin-delete-tx" onPress={onDeleted} style={styles.remove}><Text style={styles.removeText}>Delete transaction</Text></Pressable>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
