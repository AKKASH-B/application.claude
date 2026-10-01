import { Feather } from "@expo/vector-icons";
import * as Contacts from "expo-contacts";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Linking, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { friendApi } from "@/src/split/api";
import { COLORS, splitStyles as s } from "@/src/split/styles";
import type { Friend } from "@/src/split/types";
import { avatarColor, initialsOf } from "@/src/split/utils";

type Props = {
  visible: boolean;
  existingNames: string[];
  onClose: () => void;
  onAdd: (name: string, phone?: string) => void;
};

type Contact = { id: string; name: string; phone?: string };
type PermState = "undetermined" | "granted" | "denied" | "blocked";

export default function AddMemberSheet({ visible, existingNames, onClose, onAdd }: Props) {
  const [tab, setTab] = useState<"contacts" | "manual" | "friends">("contacts");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [friends, setFriends] = useState<Friend[]>([]);
  const [loadingFriends, setLoadingFriends] = useState(false);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [perm, setPerm] = useState<PermState>("undetermined");
  const [contactsBusy, setContactsBusy] = useState(false);

  const existingLower = useMemo(() => new Set(existingNames.map((n) => n.trim().toLowerCase())), [existingNames]);
  const isWeb = Platform.OS === "web";

  const loadFriends = useCallback(async () => {
    setLoadingFriends(true);
    try { setFriends(await friendApi.list()); } catch { /* silent */ }
    finally { setLoadingFriends(false); }
  }, []);

  const fetchContacts = useCallback(async () => {
    setContactsBusy(true);
    try {
      const { data } = await Contacts.getContactsAsync({ fields: [Contacts.Fields.PhoneNumbers], pageSize: 1000 });
      const flat: Contact[] = data
        .filter((c) => c.name)
        .map((c, i) => ({ id: c.id ?? `c_${i}`, name: c.name as string, phone: c.phoneNumbers?.[0]?.number }))
        .sort((a, b) => a.name.localeCompare(b.name));
      setContacts(flat);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't read contacts.");
    } finally { setContactsBusy(false); }
  }, []);

  const checkPermission = useCallback(async () => {
    if (isWeb) { setPerm("blocked"); return; }
    try {
      const res = await Contacts.getPermissionsAsync();
      if (res.status === "granted") { setPerm("granted"); fetchContacts(); }
      else if (res.status === "denied") { setPerm(res.canAskAgain ? "denied" : "blocked"); }
      else { setPerm("undetermined"); }
    } catch { setPerm("blocked"); }
  }, [isWeb, fetchContacts]);

  const requestPermission = useCallback(async () => {
    if (isWeb) return;
    try {
      const res = await Contacts.requestPermissionsAsync();
      if (res.status === "granted") { setPerm("granted"); fetchContacts(); }
      else { setPerm(res.canAskAgain ? "denied" : "blocked"); }
    } catch { setPerm("blocked"); }
  }, [isWeb, fetchContacts]);

  useEffect(() => {
    if (visible) {
      setName(""); setPhone(""); setError(""); setSearch("");
      setTab(perm === "granted" ? "contacts" : "contacts"); // Always try contacts first
      loadFriends();
      checkPermission();
    }
  }, [visible, loadFriends, checkPermission]);

  const guardExisting = (n: string) => {
    if (existingLower.has(n.trim().toLowerCase())) { setError(`${n} is already in this split.`); return false; }
    setError(""); return true;
  };

  const submitManual = () => {
    const clean = name.trim();
    if (!clean) { setError("Enter a name to add this member."); return; }
    if (!guardExisting(clean)) return;
    onAdd(clean, phone.trim() || undefined);
  };
  const addFromFriend = (f: Friend) => { if (guardExisting(f.name)) onAdd(f.name, f.phone || undefined); };
  const addFromContact = (c: Contact) => { if (guardExisting(c.name)) onAdd(c.name, c.phone || undefined); };

  const filteredFriends = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? friends.filter((f) => f.name.toLowerCase().includes(q)) : friends;
  }, [friends, search]);
  const filteredContacts = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (q ? contacts.filter((c) => c.name.toLowerCase().includes(q)) : contacts).slice(0, 80);
  }, [contacts, search]);

  const renderContactsTab = () => {
    if (perm === "granted") {
      return (
        <View style={{ gap: 10 }}>
          <View style={s.searchRow}>
            <Feather name="search" size={16} color={COLORS.muted} />
            <TextInput testID="contact-search" value={search} onChangeText={setSearch} placeholder="Search your contacts…" placeholderTextColor="#A9AAA5" style={s.searchInput} autoCorrect={false} returnKeyType="search" />
          </View>
          {error ? <Text testID="add-member-error" style={s.errorText}>{error}</Text> : null}
          {contactsBusy ? <ActivityIndicator color={COLORS.green} style={{ marginVertical: 20 }} /> : (
            <ScrollView style={{ maxHeight: 320 }} keyboardShouldPersistTaps="handled">
              {filteredContacts.length === 0 ? (
                <View style={s.emptyBox}><Feather name="user-x" size={22} color={COLORS.muted} /><Text style={s.emptyText}>{contacts.length === 0 ? "No contacts found on this device." : `No contacts match “${search}”.`}</Text></View>
              ) : filteredContacts.map((c) => (
                <Pressable key={c.id} testID={`contact-row-${c.id}`} onPress={() => addFromContact(c)} style={s.memberRow}>
                  <View style={[s.avatar, { backgroundColor: avatarColor(c.name) }]}><Text style={s.avatarText}>{initialsOf(c.name)}</Text></View>
                  <View style={{ flex: 1 }}><Text style={s.memberName}>{c.name}</Text>{c.phone ? <Text style={s.memberSub}>{c.phone}</Text> : null}</View>
                  <Feather name="plus-circle" size={20} color={COLORS.green} />
                </Pressable>
              ))}
            </ScrollView>
          )}
        </View>
      );
    }
    return (
      <View style={s.emptyBox}>
        <Feather name="users" size={26} color={COLORS.green} />
        {isWeb ? (
          <Text style={s.emptyText}>Contact import works in the mobile app (Expo Go / installed build). On web, use “New” to add a member manually.</Text>
        ) : perm === "blocked" ? (
          <>
            <Text style={s.emptyText}>📱 Contacts access is off. Turn it on in Settings to pick people from your phonebook.</Text>
            <Pressable testID="open-settings-contacts" onPress={() => Linking.openSettings()} style={[s.cta, { paddingHorizontal: 20, paddingVertical: 12 }]}>
              <Feather name="settings" size={16} color="#FFF" /><Text style={s.ctaText}>Open Settings</Text>
            </Pressable>
          </>
        ) : (
          <>
            <Text style={s.emptyText}>🤝 Pick friends straight from your phone contacts — no need to type names!</Text>
            <Pressable testID="allow-contacts" onPress={requestPermission} style={[s.cta, { paddingHorizontal: 20, paddingVertical: 12 }]}>
              <Feather name="user-plus" size={16} color="#FFF" /><Text style={s.ctaText}>Allow Contact Access</Text>
            </Pressable>
          </>
        )}
      </View>
    );
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={s.modalShade}>
        <Pressable style={{ flex: 1 }} onPress={onClose} />
        <View style={s.sheet}>
          <View style={s.sheetHead}>
            <Text style={s.sheetTitle}>Add member</Text>
            <Pressable testID="close-add-member" onPress={onClose} hitSlop={10}><Feather name="x" size={22} color={COLORS.muted} /></Pressable>
          </View>

          <View style={s.modeRow}>
            {(["contacts", "manual", "friends"] as const).map((t) => (
              <Pressable key={t} testID={`add-member-tab-${t}`} onPress={() => { setTab(t); setError(""); setSearch(""); }} style={[s.modePill, tab === t && s.modePillActive]}>
                <Text style={[s.modePillText, tab === t && s.modePillTextActive]}>
                  {t === "contacts" ? "📱 Contacts" : t === "manual" ? "✏️ New" : "👥 Friends"}
                </Text>
              </Pressable>
            ))}
          </View>

          {tab === "contacts" ? renderContactsTab() : tab === "manual" ? (
            <View style={{ gap: 10 }}>
              <Text style={s.eyebrow}>NAME</Text>
              <TextInput testID="new-member-name" value={name} onChangeText={(v) => { setName(v); if (error) setError(""); }} placeholder="e.g. Priya" placeholderTextColor="#A9AAA5" style={s.inputPill} returnKeyType="done" onSubmitEditing={submitManual} />
              <Text style={s.eyebrow}>PHONE (OPTIONAL)</Text>
              <TextInput testID="new-member-phone" value={phone} onChangeText={setPhone} placeholder="e.g. +91 98765 43210" placeholderTextColor="#A9AAA5" keyboardType="phone-pad" style={s.inputPill} />
              {error ? <Text testID="add-member-error" style={s.errorText}>{error}</Text> : null}
              <Pressable testID="submit-add-member" onPress={submitManual} style={s.cta}><Feather name="user-plus" size={16} color="#FFF" /><Text style={s.ctaText}>Add member</Text></Pressable>
            </View>
          ) : (
            <View style={{ gap: 10 }}>
              <View style={s.searchRow}>
                <Feather name="search" size={16} color={COLORS.muted} />
                <TextInput testID="friend-search" value={search} onChangeText={setSearch} placeholder="Search saved friends…" placeholderTextColor="#A9AAA5" style={s.searchInput} autoCorrect={false} returnKeyType="search" />
              </View>
              {error ? <Text testID="add-member-error" style={s.errorText}>{error}</Text> : null}
              <ScrollView style={{ maxHeight: 320 }} keyboardShouldPersistTaps="handled">
                {loadingFriends ? <ActivityIndicator color={COLORS.green} style={{ marginVertical: 20 }} /> : filteredFriends.length === 0 ? (
                  <View style={s.emptyBox}><Feather name="users" size={22} color={COLORS.muted} /><Text style={s.emptyText}>{friends.length === 0 ? "No saved friends yet. Members you add are saved for next time." : `No friends match “${search}”.`}</Text></View>
                ) : filteredFriends.map((f) => (
                  <Pressable key={f.id} testID={`friend-row-${f.id}`} onPress={() => addFromFriend(f)} style={s.memberRow}>
                    <View style={[s.avatar, { backgroundColor: avatarColor(f.name) }]}><Text style={s.avatarText}>{initialsOf(f.name)}</Text></View>
                    <View style={{ flex: 1 }}><Text style={s.memberName}>{f.name}</Text>{f.phone ? <Text style={s.memberSub}>{f.phone}</Text> : null}</View>
                    <Feather name="plus-circle" size={20} color={COLORS.green} />
                  </Pressable>
                ))}
              </ScrollView>
            </View>
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
