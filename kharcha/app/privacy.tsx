import React from "react";
import { Screen, T } from "../src/components/ui";
import { SUPPORT_EMAIL } from "../src/config";

const SECTIONS: [string, string][] = [
  ["What we collect", "Your name, email address and password (stored only as a salted hash), plus the financial entries you add: transactions, budgets, savings goals, recurring items and split bills. We do not read your bank, SMS or contacts, and we do not use advertising or analytics trackers."],
  ["How we use it", "Only to run the app for you: to sign you in, show your data on all your devices, and calculate your summaries and insights. We never sell your data and never share it with advertisers."],
  ["Where it is stored", "Your data is stored in a MongoDB Atlas database and served through Vercel. Traffic between the app and the server is encrypted with HTTPS. Your sign-in session is kept in your device's secure storage."],
  ["Recovery key", "When you sign up we show you a recovery key once. It lets you reset a forgotten password. Only a hash of the key is stored, so we cannot show it again."],
  ["Your control", "You can export all of your data as CSV from More → Export, and permanently delete your account and all data at any time from More → Account → Delete account. Deletion is immediate and cannot be undone."],
  ["Children", "Kharcha is not directed at children under 13."],
  ["Changes", "If this policy changes, the updated version will be posted here with a new date."],
  ["Contact", `Questions or requests: ${SUPPORT_EMAIL}`],
];

export default function Privacy() {
  return (
    <Screen>
      <T size={22} weight="800">Privacy policy</T>
      <T size={13} muted>Last updated: October 2026</T>
      {SECTIONS.map(([h, b]) => (
        <React.Fragment key={h}>
          <T size={16} weight="700" style={{ marginTop: 6 }}>{h}</T>
          <T muted style={{ lineHeight: 21 }}>{b}</T>
        </React.Fragment>
      ))}
    </Screen>
  );
}
