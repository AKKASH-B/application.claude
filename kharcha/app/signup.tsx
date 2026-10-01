import React, { useState } from "react";
import { useRouter } from "expo-router";
import { useAuth } from "../src/auth";
import { Button, Chips, ErrorBox, Field, Screen, T } from "../src/components/ui";
import { RecoveryCard } from "../src/components/Recovery";
import { CURRENCY_LIST } from "../src/format";

export default function Signup() {
  const router = useRouter();
  const { signUp } = useAuth();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [currency, setCurrency] = useState("INR");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [key, setKey] = useState<string | null>(null);

  if (key) return <Screen><RecoveryCard recoveryKey={key} onDone={() => router.replace("/(tabs)")} /></Screen>;

  const submit = async () => {
    if (!name.trim()) return setError("Enter your name");
    if (password.length < 8) return setError("Password must be at least 8 characters");
    setBusy(true);
    setError(null);
    try {
      setKey(await signUp(name.trim(), email.trim(), password, currency));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create the account");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      {error ? <ErrorBox message={error} /> : null}
      <Field label="Your name" value={name} onChangeText={setName} placeholder="Akkash" autoComplete="name" testID="signup-name" />
      <Field label="Email" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" placeholder="you@example.com" autoComplete="email" testID="signup-email" />
      <Field label="Password (8+ characters)" value={password} onChangeText={setPassword} secureTextEntry autoComplete="new-password" testID="signup-password" />
      <T size={13} weight="600" muted>Currency</T>
      <Chips options={CURRENCY_LIST} value={currency} onChange={setCurrency} />
      <Button title="Create account" onPress={submit} loading={busy} testID="signup-submit" />
      <T size={12} muted style={{ textAlign: "center" }}>
        By continuing you agree to our <T size={12} weight="600" onPress={() => router.push("/privacy")}>privacy policy</T>.
      </T>
    </Screen>
  );
}
