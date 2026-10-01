import { useEffect, useState } from "react";
import { Feather } from "@expo/vector-icons";
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, SafeAreaView, ScrollView, Text, TextInput, View } from "react-native";
import { router } from "expo-router";
import { signIn, signUp, resetPin, requestOtp, User } from "@/src/auth";
import { styles } from "./styles";
import { authStyles } from "./styles";

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/;
const RESEND_SECONDS = 60;

export function AuthScreen({ onAuthenticated }: { onAuthenticated: (user: User) => void }) {
  const [mode, setMode] = useState<"login" | "signup" | "reset">("login");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [pin, setPin] = useState("");
  const [otp, setOtp] = useState("");
  const [newPin, setNewPin] = useState("");
  const [codeSent, setCodeSent] = useState(false);
  const [resetDone, setResetDone] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const switchMode = (newMode: "login" | "signup" | "reset") => {
    setMode(newMode);
    setError("");
    setMessage("");
    setPin("");
    setNewPin("");
    setOtp("");
    setCodeSent(false);
    setResetDone(false);
    setCooldown(0);
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
    const em = email.trim().toLowerCase();
    if (u.length < 3 || !/^[a-z0-9_.]+$/.test(u)) { setError("Username must be 3+ chars: letters, numbers, dot or underscore."); return; }
    if (!EMAIL_RE.test(em)) { setError("Enter a valid email address."); return; }
    if (!/^\d{6}$/.test(pin)) { setError("PIN must be exactly 6 digits."); return; }
    setBusy(true); setError("");
    try {
      const result = await signUp({ username: u, email: em, pin });
      onAuthenticated(result.user);
    } catch (e) { setError(e instanceof Error ? e.message : "Sign up failed"); }
    finally { setBusy(false); }
  };

  const sendCode = async () => {
    const em = email.trim().toLowerCase();
    if (!EMAIL_RE.test(em)) { setError("Enter the email address on your account."); return; }
    setBusy(true); setError(""); setMessage("");
    try {
      await requestOtp(em);
      setCodeSent(true);
      setCooldown(RESEND_SECONDS);
      setMessage(`If ${em} is registered, a 6-digit code is on its way. It's valid for 10 minutes — check spam too.`);
    } catch (e) { setError(e instanceof Error ? e.message : "Couldn't send the code"); }
    finally { setBusy(false); }
  };

  const doResetPin = async () => {
    const em = email.trim().toLowerCase();
    if (!/^\d{6}$/.test(otp)) { setError("Enter the 6-digit code from your email."); return; }
    if (!/^\d{6}$/.test(newPin)) { setError("New PIN must be exactly 6 digits."); return; }
    setBusy(true); setError(""); setMessage("");
    try {
      await resetPin(em, otp, newPin);
      setResetDone(true);
      setMessage("✅ PIN reset! You can now log in with your new PIN.");
      setTimeout(() => switchMode("login"), 2500);
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
          <Text style={authStyles.authSub}>{mode === "reset" ? "We'll email you a 6-digit code. Paste it here to set a new PIN." : "A calm, private view of your spending and monthly progress."}</Text>
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
            <Text style={styles.inputLabel}>EMAIL</Text>
            <TextInput testID="reset-email" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" autoCorrect={false} autoComplete="email" placeholder="you@example.com" placeholderTextColor="#A9AAA5" style={[styles.input, codeSent && { color: "#999" }]} editable={!codeSent && !resetDone} />
            {!codeSent ? <>
              {error ? <Text style={authStyles.authError}>{error}</Text> : null}
              <Pressable testID="reset-send-code" onPress={sendCode} disabled={busy} style={[styles.save, busy && authStyles.disabled]}>
                {busy ? <ActivityIndicator color="#FFF" /> : <Text style={styles.saveText}>Email me a code</Text>}
              </Pressable>
              <Text style={[styles.emptyText, { marginTop: 10 }]}>Accounts created before email was added can't use this yet — ask the admin to reset your PIN.</Text>
            </> : <>
              {message ? <Text style={{ color: "#2E7D32", marginVertical: 8, fontSize: 13 }}>{message}</Text> : null}
              {!resetDone ? <>
                <Text style={styles.inputLabel}>6-DIGIT CODE</Text>
                <TextInput testID="reset-otp" value={otp} onChangeText={(v) => setOtp(v.replace(/[^0-9]/g, "").slice(0, 6))} keyboardType="number-pad" autoComplete="one-time-code" textContentType="oneTimeCode" placeholder="Paste the code here" placeholderTextColor="#A9AAA5" style={[styles.input, { letterSpacing: 6 }]} maxLength={6} />
                <Text style={styles.inputLabel}>NEW PIN</Text>
                <TextInput testID="reset-pin" value={newPin} onChangeText={(v) => setNewPin(v.replace(/[^0-9]/g, "").slice(0, 6))} keyboardType="number-pad" secureTextEntry placeholder="6-digit PIN" placeholderTextColor="#A9AAA5" style={[styles.input, { letterSpacing: 6 }]} maxLength={6} />
                {error ? <Text style={authStyles.authError}>{error}</Text> : null}
                <Pressable testID="reset-submit" onPress={doResetPin} disabled={busy} style={[styles.save, busy && authStyles.disabled]}>
                  {busy ? <ActivityIndicator color="#FFF" /> : <Text style={styles.saveText}>Reset PIN</Text>}
                </Pressable>
                <Pressable testID="reset-resend" onPress={sendCode} disabled={busy || cooldown > 0} style={{ marginTop: 12, alignItems: "center" }}>
                  <Text style={{ color: cooldown > 0 ? "#999" : "#FF9800", fontSize: 12, fontWeight: "600" }}>{cooldown > 0 ? `Resend code in ${cooldown}s` : "Resend code"}</Text>
                </Pressable>
                <Pressable onPress={() => { setCodeSent(false); setOtp(""); setNewPin(""); setError(""); setMessage(""); }} style={{ marginTop: 8, alignItems: "center" }}>
                  <Text style={{ color: "#777773", fontSize: 12, fontWeight: "600" }}>← Use a different email</Text>
                </Pressable>
              </> : null}
            </>}
          </> : <>
            <Text style={styles.inputLabel}>USERNAME</Text>
            <TextInput testID="auth-username" value={username} onChangeText={setUsername} autoCapitalize="none" autoCorrect={false} placeholder="e.g. akkash_saba" placeholderTextColor="#A9AAA5" style={styles.input} />
            <Text style={styles.inputLabel}>EMAIL</Text>
            <TextInput testID="auth-email" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" autoCorrect={false} autoComplete="email" placeholder="you@example.com" placeholderTextColor="#A9AAA5" style={styles.input} />
            <Text style={styles.emptyText}>Used only to recover your PIN if you forget it.</Text>
            <Text style={styles.inputLabel}>CREATE A 6-DIGIT PIN</Text>
            <TextInput testID="auth-password" value={pin} onChangeText={(v) => setPin(v.replace(/[^0-9]/g, "").slice(0, 6))} keyboardType="number-pad" secureTextEntry placeholder="6-digit PIN" placeholderTextColor="#A9AAA5" style={[styles.input, { letterSpacing: 6 }]} maxLength={6} />
            {error ? <Text style={authStyles.authError}>{error}</Text> : null}
            <Pressable testID="auth-submit" onPress={doSignup} disabled={busy} style={[styles.save, busy && authStyles.disabled]}>
              {busy ? <ActivityIndicator color="#FFF" /> : <Text style={styles.saveText}>Create account</Text>}
            </Pressable>
          </>}
        </View>
        <Pressable testID="auth-toggle" onPress={() => switchMode(mode === "login" ? "signup" : "login")}>
          <Text style={authStyles.authToggle}>{mode === "login" ? "New to SpendPulse? Create an account" : "Already have an account? Log in"}</Text>
        </Pressable>
        <Pressable testID="auth-privacy" onPress={() => router.push("/privacy")}>
          <Text style={[authStyles.authToggle, { color: "#777773", marginTop: 16, fontSize: 12 }]}>Privacy policy</Text>
        </Pressable>
        {mode === "login" && <Pressable testID="auth-forgot" onPress={() => switchMode("reset")}>
          <Text style={[authStyles.authToggle, { color: "#FF9800", marginTop: 8 }]}>Forgot your PIN?</Text>
        </Pressable>}
      </ScrollView>
    </KeyboardAvoidingView>
  </SafeAreaView>;
}
