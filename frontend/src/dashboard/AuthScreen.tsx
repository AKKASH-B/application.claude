import { useState } from "react";
import { Feather } from "@expo/vector-icons";
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, SafeAreaView, ScrollView, Text, TextInput, View, Clipboard } from "react-native";
import { signIn, signUp, resetPin, User } from "@/src/auth";
import { styles } from "./styles";
import { authStyles } from "./styles";

export function AuthScreen({ onAuthenticated }: { onAuthenticated: (user: User) => void }) {
  const [mode, setMode] = useState<"login" | "signup" | "reset">("login");
  const [username, setUsername] = useState("");
  const [phone, setPhone] = useState("");
  const [pin, setPin] = useState("");
  const [backupCode, setBackupCode] = useState("");
  const [newPin, setNewPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [copiedBackupCode, setCopiedBackupCode] = useState(false);

  const switchMode = (newMode: "login" | "signup" | "reset") => {
    setMode(newMode);
    setError("");
    setMessage("");
    setPin("");
    setNewPin("");
    setBackupCode("");
    setCopiedBackupCode(false);
  };

  const doLogin = async () => {
    const u = username.trim().toLowerCase();
    if (u.length < 3) { setError("Enter your username."); return; }
    if (!/^\d{6}$/.test(pin)) { setError("Enter your 6-digit PIN."); return; }
    setBusy(true); setError("");
    try { const user = await signIn(u, pin); onAuthenticated(user); }
    catch (e) { setError(e instanceof Error ? e.message : "Login failed"); }
    finally { setBusy(false); }
  };

  const doSignup = async () => {
    const u = username.trim().toLowerCase();
    if (u.length < 3 || !/^[a-z0-9_.]+$/.test(u)) { setError("Username must be 3+ chars: letters, numbers, dot or underscore."); return; }
    if (phone.trim().length < 8) { setError("Enter a valid phone number."); return; }
    if (!/^\d{6}$/.test(pin)) { setError("PIN must be exactly 6 digits."); return; }
    setBusy(true); setError(""); setMessage("");
    try {
      const result = await signUp({ username: u, phone: phone.trim(), pin });
      setBackupCode(result.backupCode);
      setMessage(`✅ Account created! Your backup code is:\n\n${result.backupCode}\n\nSave this code somewhere safe — you'll need it if you forget your PIN.`);
      setTimeout(() => onAuthenticated(result.user), 3000);
    } catch (e) { setError(e instanceof Error ? e.message : "Sign up failed"); }
    finally { setBusy(false); }
  };

  const doResetPin = async () => {
    const u = username.trim().toLowerCase();
    if (u.length < 3) { setError("Enter your username."); return; }
    if (backupCode.trim().length !== 16) { setError("Backup code must be 16 characters."); return; }
    if (!/^\d{6}$/.test(newPin)) { setError("New PIN must be exactly 6 digits."); return; }
    setBusy(true); setError(""); setMessage("");
    try {
      await resetPin(u, backupCode.trim(), newPin);
      setMessage("✅ PIN reset successfully! You can now log in with your new PIN.");
      setTimeout(() => switchMode("login"), 2000);
    } catch (e) { setError(e instanceof Error ? e.message : "PIN reset failed"); }
    finally { setBusy(false); }
  };

  return <SafeAreaView style={styles.safe}>
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={authStyles.authScreen}>
      <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={authStyles.authContent}>
        <View style={authStyles.authBrand}><View style={authStyles.authMark}><Feather name="activity" size={22} color="#FFF" /></View><Text style={authStyles.authBrandText}>SpendPulse</Text></View>
        <View>
          <Text style={authStyles.authEyebrow}>{mode === "login" ? "WELCOME BACK" : mode === "reset" ? "FORGOT PIN?" : "START FRESH"}</Text>
          <Text style={authStyles.authTitle}>{mode === "login" ? "Your money, in focus." : mode === "reset" ? "Recover your account" : "Build a clearer money habit."}</Text>
          <Text style={authStyles.authSub}>{mode === "login" ? "A calm, private view of your spending and monthly progress." : mode === "reset" ? "Use your backup code to set a new PIN." : "A calm, private view of your spending and monthly progress."}</Text>
        </View>
        <View style={authStyles.authForm}>
          {mode === "login" ? <>
            <Text style={styles.inputLabel}>USERNAME</Text>
            <TextInput testID="auth-username" value={username} onChangeText={setUsername} autoCapitalize="none" autoCorrect={false} placeholder="e.g. akkash_saba" placeholderTextColor="#A9AAA5" style={styles.input} />
            <Text style={styles.inputLabel}>PIN</Text>
            <TextInput testID="auth-password" value={pin} onChangeText={(v) => setPin(v.replace(/[^0-9]/g, "").slice(0, 6))} keyboardType="number-pad" secureTextEntry placeholder="6-digit PIN" placeholderTextColor="#A9AAA5" style={[styles.input, { letterSpacing: 6 }]} maxLength={6} />
            {error ? <Text style={authStyles.authError}>{error}</Text> : null}
            <Pressable testID="auth-submit" onPress={doLogin} disabled={busy} style={[styles.save, busy && authStyles.disabled]}>
              {busy ? <ActivityIndicator color="#FFF" /> : <Text style={styles.saveText}>Log in</Text>}
            </Pressable>
          </> : mode === "reset" ? <>
            <Text style={styles.inputLabel}>USERNAME</Text>
            <TextInput testID="reset-username" value={username} onChangeText={setUsername} autoCapitalize="none" autoCorrect={false} placeholder="e.g. akkash_saba" placeholderTextColor="#A9AAA5" style={styles.input} />
            <Text style={styles.inputLabel}>BACKUP CODE</Text>
            <TextInput testID="reset-backup-code" value={backupCode} onChangeText={setBackupCode} autoCapitalize="characters" autoCorrect={false} placeholder="16-character code" placeholderTextColor="#A9AAA5" style={styles.input} />
            <Text style={styles.inputLabel}>NEW PIN</Text>
            <TextInput testID="reset-pin" value={newPin} onChangeText={(v) => setNewPin(v.replace(/[^0-9]/g, "").slice(0, 6))} keyboardType="number-pad" secureTextEntry placeholder="6-digit PIN" placeholderTextColor="#A9AAA5" style={[styles.input, { letterSpacing: 6 }]} maxLength={6} />
            {error ? <Text style={authStyles.authError}>{error}</Text> : null}
            {message ? <Text style={{ color: "#2E7D32", marginVertical: 8, fontSize: 13 }}>{message}</Text> : null}
            <Pressable testID="reset-submit" onPress={doResetPin} disabled={busy} style={[styles.save, busy && authStyles.disabled]}>
              {busy ? <ActivityIndicator color="#FFF" /> : <Text style={styles.saveText}>Reset PIN</Text>}
            </Pressable>
          </> : <>
            <Text style={styles.inputLabel}>USERNAME</Text>
            <TextInput testID="auth-username" value={username} onChangeText={setUsername} autoCapitalize="none" autoCorrect={false} placeholder="e.g. akkash_saba" placeholderTextColor="#A9AAA5" style={styles.input} />
            <Text style={styles.inputLabel}>PHONE NUMBER</Text>
            <TextInput testID="auth-phone" value={phone} onChangeText={setPhone} keyboardType="phone-pad" placeholder="e.g. 9876543210" placeholderTextColor="#A9AAA5" style={styles.input} />
            <Text style={styles.inputLabel}>CREATE A 6-DIGIT PIN</Text>
            <TextInput testID="auth-password" value={pin} onChangeText={(v) => setPin(v.replace(/[^0-9]/g, "").slice(0, 6))} keyboardType="number-pad" secureTextEntry placeholder="6-digit PIN" placeholderTextColor="#A9AAA5" style={[styles.input, { letterSpacing: 6 }]} maxLength={6} />
            {error ? <Text style={authStyles.authError}>{error}</Text> : null}
            {message ? <View style={{ backgroundColor: "#E8F5E9", borderRadius: 8, padding: 12, marginVertical: 12, borderWidth: 1, borderColor: "#2E7D32" }}>
              <Text style={{ color: "#1B5E20", fontSize: 12, fontWeight: "600", marginBottom: 8 }}>📋 SAVE YOUR BACKUP CODE</Text>
              <Text style={{ backgroundColor: "#FFF", padding: 8, borderRadius: 4, fontFamily: "monospace", fontSize: 11, color: "#000", marginBottom: 8, letterSpacing: 1 }}>{backupCode}</Text>
              <Pressable onPress={() => { Clipboard.setString(backupCode); setCopiedBackupCode(true); setTimeout(() => setCopiedBackupCode(false), 2000); }} style={{ flexDirection: "row", alignItems: "center" }}>
                <Feather name={copiedBackupCode ? "check" : "copy"} size={14} color="#2E7D32" style={{ marginRight: 6 }} />
                <Text style={{ color: "#2E7D32", fontSize: 12, fontWeight: "600" }}>{copiedBackupCode ? "Copied!" : "Copy to clipboard"}</Text>
              </Pressable>
            </View> : null}
            <Pressable testID="auth-submit" onPress={doSignup} disabled={busy || !!message} style={[styles.save, (busy || !!message) && authStyles.disabled]}>
              {busy ? <ActivityIndicator color="#FFF" /> : <Text style={styles.saveText}>Create account</Text>}
            </Pressable>
          </>}
        </View>
        <Pressable testID="auth-toggle" onPress={() => switchMode(mode === "login" ? "signup" : "login")}>
          <Text style={authStyles.authToggle}>{mode === "login" ? "New to SpendPulse? Create an account" : "Already have an account? Log in"}</Text>
        </Pressable>
        {mode === "login" && <Pressable testID="auth-forgot" onPress={() => switchMode("reset")}>
          <Text style={[authStyles.authToggle, { color: "#FF9800", marginTop: 8 }]}>Forgot your PIN?</Text>
        </Pressable>}
      </ScrollView>
    </KeyboardAvoidingView>
  </SafeAreaView>;
}
