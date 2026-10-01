import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import { Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from "react-native";

// TODO before launch: replace CONTACT_EMAIL with an inbox you actually monitor, and have the text reviewed.
const CONTACT_EMAIL = "REPLACE-WITH-YOUR-SUPPORT-EMAIL";
const UPDATED = "1 October 2026";

const SECTIONS: { title: string; body: string[] }[] = [
  {
    title: "What SpendPulse is",
    body: ["SpendPulse is a personal finance tracker. It lets you record what you spend, receive and save, set budgets and savings goals, and split bills with friends. It does not connect to your bank and never moves money."],
  },
  {
    title: "Information we collect",
    body: [
      "Account details: your username, your email address (used only to recover your PIN), and your PIN, which we store only in scrambled (hashed) form — we cannot see it.",
      "Your records: the transactions, categories, notes, budgets, savings goals and bill splits you enter, including the names (and phone numbers, if you add them) of people you split with.",
      "Contacts: if you choose to import friends for a split, the app asks for permission to read your contacts. Contacts are read on your device; only the people you pick are saved to your account.",
      "Technical data: your IP address is used briefly to limit repeated login and code requests and protect accounts from abuse.",
    ],
  },
  {
    title: "How we use it",
    body: [
      "To run the app: show your data back to you, calculate your totals and charts, and keep you signed in.",
      "To protect your account: send you a one-time code by email when you ask to reset a forgotten PIN, and block repeated guessing.",
      "We do not show ads, we do not sell your information, and we do not share it with advertisers or data brokers.",
    ],
  },
  {
    title: "Who can see your data",
    body: [
      "Only you can see your records. An administrator of the service can view account details and records when needed to run the service or help a user who is locked out.",
      "Your data is stored with the cloud hosting and database providers that run the service, and your recovery codes are delivered by an email provider. They process data only to provide those services.",
    ],
  },
  {
    title: "Keeping your data",
    body: ["We keep your data for as long as your account exists. You can delete your account at any time from Settings → Delete account. This permanently erases your account, transactions, budgets, goals, splits and saved friends from our servers."],
  },
  {
    title: "Your choices",
    body: [
      "You can export a month of transactions as CSV from Settings, edit or delete any record, change your PIN or recovery email, and delete your account.",
      "You can turn off contacts access at any time in your phone's settings; the app keeps working, you just type names in manually.",
    ],
  },
  {
    title: "Security",
    body: ["Connections to our servers are encrypted, PINs are hashed, sign-in sessions end when you log out or change your PIN, and repeated wrong guesses are temporarily blocked. No system is perfectly secure, so please choose a PIN that is hard to guess."],
  },
  {
    title: "Children",
    body: ["SpendPulse is not directed at children under 13, and we do not knowingly collect their information."],
  },
  {
    title: "Changes and contact",
    body: [`We may update this policy and will change the date above when we do. Questions or requests: ${CONTACT_EMAIL}`],
  },
];

export default function PrivacyPolicy() {
  return (
    <SafeAreaView style={s.safe}>
      <View style={s.header}>
        <Pressable testID="privacy-back" onPress={() => (router.canGoBack() ? router.back() : router.replace("/"))} style={s.back}>
          <Feather name="arrow-left" size={20} color="#1C1C1E" />
        </Pressable>
        <Text style={s.headerTitle}>Privacy Policy</Text>
        <View style={s.back} />
      </View>
      <ScrollView contentContainerStyle={s.content}>
        <Text style={s.updated}>Last updated {UPDATED}</Text>
        {SECTIONS.map((sec) => (
          <View key={sec.title} style={s.section}>
            <Text style={s.h}>{sec.title}</Text>
            {sec.body.map((p, i) => <Text key={i} style={s.p}>{p}</Text>)}
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#F9F8F6" },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 12 },
  back: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  headerTitle: { fontSize: 18, fontWeight: "700", color: "#1C1C1E" },
  content: { padding: 20, paddingBottom: 60, maxWidth: 720, width: "100%", alignSelf: "center" },
  updated: { fontSize: 12, color: "#777773", marginBottom: 16 },
  section: { marginBottom: 20 },
  h: { fontSize: 16, fontWeight: "700", color: "#1C1C1E", marginBottom: 6 },
  p: { fontSize: 14, lineHeight: 21, color: "#3A3A38", marginBottom: 8 },
});
