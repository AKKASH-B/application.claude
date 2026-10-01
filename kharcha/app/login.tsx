import React, { useState } from "react";
import { View } from "react-native";
import { useRouter } from "expo-router";
import { useAuth } from "../src/auth";
import { Button, ErrorBox, Field, Screen, T } from "../src/components/ui";
import { useTheme } from "../src/theme";

export default function Login() {
  const t = useTheme();
  const router = useRouter();
  const { signIn } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!email.trim() || !password) return setError("Enter your email and password");
    setBusy(true);
    setError(null);
    try {
      await signIn(email.trim(), password);
      router.replace("/(tabs)");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not sign in");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen style={{ paddingTop: 72 }}>
      <View style={{ alignItems: "center", gap: 6, marginBottom: 12 }}>
        <View style={{ width: 64, height: 64, borderRadius: 20, backgroundColor: t.primary, alignItems: "center", justifyContent: "center" }}>
          <T size={30} weight="800" color={t.onPrimary}>₹</T>
        </View>
        <T size={28} weight="800">Kharcha</T>
        <T muted>Know where every rupee goes</T>
      </View>
      {error ? <ErrorBox message={error} /> : null}
      <Field label="Email" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" autoComplete="email" textContentType="emailAddress" placeholder="you@example.com" testID="login-email" />
      <Field label="Password" value={password} onChangeText={setPassword} secureTextEntry autoComplete="password" textContentType="password" placeholder="Your password" onSubmitEditing={submit} testID="login-password" />
      <Button title="Sign in" onPress={submit} loading={busy} testID="login-submit" />
      <Button title="Create a new account" variant="ghost" onPress={() => router.push("/signup")} />
      <Button title="Forgot password?" variant="ghost" style={{ borderWidth: 0 }} onPress={() => router.push("/reset")} />
      <T size={12} muted style={{ textAlign: "center" }} onPress={() => router.push("/privacy")}>Privacy policy</T>
    </Screen>
  );
}
