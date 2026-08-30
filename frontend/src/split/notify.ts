import * as Linking from "expo-linking";
import { Alert, Platform, Share } from "react-native";
import type { SplitSession } from "./types";
import { money2 } from "./utils";

/**
 * Send an SMS/Share message to each non-payer member with the amount they owe.
 * Uses expo-sms when available (native SMS composer); falls back to sms: deep link
 * or Share sheet for members without a phone number or on web.
 */
export async function notifyMembers(split: SplitSession): Promise<{ sent: number; skipped: number }> {
  const payer = split.members.find((m) => m.is_payer);
  const debtors = split.members.filter((m) => !m.is_payer && !m.settled);
  if (debtors.length === 0 || !payer) return { sent: 0, skipped: 0 };

  let sent = 0;
  let skipped = 0;

  // Try to use expo-sms if available
  let SMS: typeof import("expo-sms") | null = null;
  try {
    SMS = await import("expo-sms");
  } catch {
    SMS = null;
  }
  const smsAvailable = SMS && Platform.OS !== "web" ? await SMS.isAvailableAsync().catch(() => false) : false;

  for (const m of debtors) {
    const noteBit = split.note?.trim() ? ` for ${split.note.trim()}` : "";
    const message = `Hi ${m.name}! You owe ${money2(m.owed_amount)} to ${payer.name}${noteBit}. — sent via SpendPulse 💸`;

    // Case 1: phone present and SMS available → open pre-filled SMS composer
    if (m.phone && smsAvailable && SMS) {
      try {
        await SMS.sendSMSAsync([m.phone], message);
        sent++;
        continue;
      } catch {
        // fall through to sms: URI
      }
    }

    // Case 2: phone present, no SMS module → try sms: deep link
    if (m.phone) {
      const separator = Platform.OS === "ios" ? "&" : "?";
      const url = `sms:${m.phone}${separator}body=${encodeURIComponent(message)}`;
      const ok = await Linking.canOpenURL(url).catch(() => false);
      if (ok) {
        await Linking.openURL(url).catch(() => {});
        sent++;
        continue;
      }
    }

    // Case 3: no phone or nothing works → use Share sheet
    try {
      await Share.share({ message });
      sent++;
    } catch {
      skipped++;
    }
  }

  return { sent, skipped };
}

/**
 * Prompt the user to send reminder messages, then run notifyMembers.
 * Returns a promise that resolves when the user makes a choice (irrespective of outcome).
 */
export function promptAndNotify(split: SplitSession): Promise<void> {
  return new Promise((resolve) => {
    const debtorCount = split.members.filter((m) => !m.is_payer && !m.settled).length;
    if (debtorCount === 0) {
      resolve();
      return;
    }
    const message = `Notify ${debtorCount} ${debtorCount === 1 ? "member" : "members"} with the amount they owe?`;

    // React Native's Alert.alert callbacks are unreliable on react-native-web,
    // so use the browser's native confirm on web.
    if (Platform.OS === "web") {
      const ok = typeof window !== "undefined" && typeof window.confirm === "function"
        ? window.confirm(`Send split reminders?\n\n${message}`)
        : false;
      if (!ok) {
        resolve();
        return;
      }
      notifyMembers(split)
        .then(({ sent, skipped }) => {
          if (skipped > 0 && typeof window !== "undefined") {
            window.alert(`Opened ${sent} composer${sent === 1 ? "" : "s"} · ${skipped} could not be sent.`);
          }
        })
        .catch(() => { /* silent */ })
        .finally(() => resolve());
      return;
    }

    Alert.alert(
      "Send split reminders?",
      message + " You can review each message before sending.",
      [
        { text: "Skip", style: "cancel", onPress: () => resolve() },
        {
          text: "Send",
          onPress: async () => {
            const { sent, skipped } = await notifyMembers(split);
            if (skipped > 0) {
              Alert.alert("Messages", `Opened ${sent} composer${sent === 1 ? "" : "s"} · ${skipped} could not be sent.`);
            }
            resolve();
          },
        },
      ],
      { cancelable: true, onDismiss: () => resolve() },
    );
  });
}
