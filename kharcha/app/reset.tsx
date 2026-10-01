import React, { useState } from "react";
import { useRouter } from "expo-router";
import { useAuth } from "../src/auth";
import { Button, ErrorBox, Field, Screen, T } from "../src/components/ui";
import { RecoveryCard } from "../src/components/Recovery";

export default function Reset() {
  const router = useRouter();
  const { resetPassword } = useAuth();
  const [email, setEmail] = useState("");
  const [recoveryKey, setRecoveryKey] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newKey, setNewKey] = useState<string | null>(null);

  if (newKey) return <Screen><T muted>Password changed. Your old recovery key no longer works — here is a new one.</T><RecoveryCard recoveryKey={newKey} onDone={() => router.replace("/(tabs)")} /></Screen>;

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      setNewKey(await resetPassword(email.trim(), recoveryKey.trim(), password));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not reset the password");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <T muted>Enter the recovery key you saved when you created your account.</T>
      {error ? <ErrorBox message={error} /> : null}
      <Field label="Email" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" />
      <Field label="Recovery key" value={recoveryKey} onChangeText={setRecoveryKey} autoCapitalize="characters" placeholder="XXXX-XXXX-XXXX-XXXX" />
      <Field label="New password (8+ characters)" value={password} onChangeText={setPassword} secureTextEntry autoComplete="new-password" />
      <Button title="Reset password" onPress={submit} loading={busy} />
    </Screen>
  );
}
