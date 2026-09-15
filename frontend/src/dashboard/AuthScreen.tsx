import { useState } from "react";
import { Feather } from "@expo/vector-icons";
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, SafeAreaView, ScrollView, Text, TextInput, View } from "react-native";
import { signIn, signUp, User } from "@/src/auth";
import { styles } from "./styles";
import { authStyles } from "./styles";

export function AuthScreen({ onAuthenticated }: { onAuthenticated: (user: User) => void }) {
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [username, setUsername] = useState("");
  const [phone, setPhone] = useState("");
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const switchMode = () => {
    setMode(mode === "login" ? "signup" : "login");
    setError(""); setPin("");
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
    setBusy(true); setError("");
    try {
      const user = await signUp({ username: u, phone: phone.trim(), pin });
      onAuthenticated(user);
    } catch (e) { setError(e instanceof Error ? e.message : "Sign up failed"); }
    finally { setBusy(false); }
  };

  return <SafeAreaView style={styles.safe}>
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={authStyles.authScreen}>
      <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={authStyles.authContent}>
        <View style={authStyles.authBrand}><View style={authStyles.authMark}><Feather name="activity" size={22} color="#FFF" /></View><Text style={authStyles.authBrandText}>SpendPulse</Text></View>
        <View>
          <Text style={authStyles.authEyebrow}>{mode === "login" ? "WELCOME BACK" : "START FRESH"}</Text>
          <Text style={authStyles.authTitle}>{mode === "login" ? "Your money, in focus." : "Build a clearer money habit."}</Text>
          <Text style={authStyles.authSub}>A calm, private view of your spending and monthly progress.</Text>
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
          </> : <>
            <Text style={styles.inputLabel}>USERNAME</Text>
            <TextInput testID="auth-username" value={username} onChangeText={setUsername} autoCapitalize="none" autoCorrect={false} placeholder="e.g. akkash_saba" placeholderTextColor="#A9AAA5" style={styles.input} />
            <Text style={styles.inputLabel}>PHONE NUMBER</Text>
            <TextInput testID="auth-phone" value={phone} onChangeText={setPhone} keyboardType="phone-pad" placeholder="e.g. 9876543210" placeholderTextColor="#A9AAA5" style={styles.input} />
            <Text style={styles.inputLabel}>CREATE A 6-DIGIT PIN</Text>
            <TextInput testID="auth-password" value={pin} onChangeText={(v) => setPin(v.replace(/[^0-9]/g, "").slice(0, 6))} keyboardType="number-pad" secureTextEntry placeholder="6-digit PIN" placeholderTextColor="#A9AAA5" style={[styles.input, { letterSpacing: 6 }]} maxLength={6} />
            {error ? <Text style={authStyles.authError}>{error}</Text> : null}
            <Pressable testID="auth-submit" onPress={doSignup} disabled={busy} style={[styles.save, busy && authStyles.disabled]}>
              {busy ? <ActivityIndicator color="#FFF" /> : <Text style={styles.saveText}>Create account</Text>}
            </Pressable>
          </>}
        </View>
        <Pressable testID="auth-toggle" onPress={switchMode}>
          <Text style={authStyles.authToggle}>{mode === "login" ? "New to SpendPulse? Create an account" : "Already have an account? Log in"}</Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  </SafeAreaView>;
}
