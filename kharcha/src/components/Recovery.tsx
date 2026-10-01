import React from "react";
import { Share, View } from "react-native";
import { Button, Card, Icon, T } from "./ui";
import { useTheme } from "../theme";

export function RecoveryCard({ recoveryKey, onDone }: { recoveryKey: string; onDone: () => void }) {
  const t = useTheme();
  return (
    <Card style={{ gap: 14 }}>
      <View style={{ flexDirection: "row", gap: 10, alignItems: "center" }}>
        <Icon name="key" color={t.savings} />
        <T size={18} weight="700">Save your recovery key</T>
      </View>
      <T muted>
        If you forget your password, this key is the only way to get back into your account. We can't email it to you later, so save it somewhere safe now.
      </T>
      <View style={{ backgroundColor: t.input, borderRadius: 12, padding: 16, alignItems: "center", borderWidth: 1, borderColor: t.border }}>
        <T size={22} weight="700" style={{ letterSpacing: 1.5 }}>{recoveryKey}</T>
      </View>
      <Button title="Save or share the key" variant="soft" icon="share" onPress={() => void Share.share({ message: `My Kharcha recovery key: ${recoveryKey}` })} />
      <Button title="I've saved it, continue" onPress={onDone} testID="recovery-continue" />
    </Card>
  );
}
