import React from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";

// Placeholder Privacy Policy. The wording below is intentionally generic
// and MUST be reviewed by counsel before App Store / Play Store submission
// (publication-readiness audit item #12). Apple requires a Privacy Policy
// URL in the App Store listing AND from inside the app — this screen
// satisfies the in-app requirement so the build can be submitted; the
// External listing URL still needs a public mirror of this text.

export default function PrivacyScreen() {
  const colors = useColors();

  return (
    <SafeAreaView style={[s.root, { backgroundColor: colors.background }]} edges={["bottom"]}>
      <ScrollView contentContainerStyle={s.content}>
        <View style={[s.banner, { backgroundColor: colors.warning + "22", borderColor: colors.warning }]}>
          <Text style={[s.bannerText, { color: colors.warning }]}>
            ⚠ PLACEHOLDER — replace with legally-reviewed text before publication.
          </Text>
        </View>

        <Text style={[s.h1, { color: colors.foreground }]}>StockClarify Privacy Policy</Text>
        <Text style={[s.muted, { color: colors.mutedForeground }]}>Last updated: 2 May 2026</Text>

        <Section title="What we collect" colors={colors}>
          {`• Account info: email and display name (via Clerk authentication).
• Watchlist and portfolio data you add inside the app.
• Usage events: which screens you visit, which AI summaries you request,
  in-app errors. Used to improve the product and diagnose crashes.
• Device info: a device push token (only if you opt in to notifications)
  and basic device/OS metadata for crash reports.
• Subscription status: tier, renewal state, and platform (App Store /
  Play Store / Stripe) — needed to gate paid features.`}
        </Section>

        <Section title="What we do NOT collect" colors={colors}>
          {`• Your contacts, photos, location, microphone, or camera content.
• Brokerage credentials. StockClarify never asks for and never stores
  brokerage logins or trading credentials.`}
        </Section>

        <Section title="Third-party services we use" colors={colors}>
          {`• Clerk — authentication and account management.
• RevenueCat — subscription receipt validation (mobile).
• Stripe — subscription billing (web).
• Yahoo Finance — market data and news.
• OpenAI — AI summarisation of public news articles.
• Better Stack — server-side error logs.
• SendGrid — transactional emails (e.g. account notifications).
Each processes data under its own terms and privacy policy.`}
        </Section>

        <Section title="Account deletion" colors={colors}>
          You can delete your account from Settings → Account → Delete Account. Deletion
          removes your watchlist, portfolio, usage history, and account record from our
          systems. Subscription receipts retained by Apple, Google, or Stripe are governed
          by those platforms.
        </Section>

        <Section title="Children" colors={colors}>
          StockClarify is not directed to children under 18 and we do not knowingly collect
          information from them.
        </Section>

        <Section title="Changes" colors={colors}>
          Material changes to this policy will be communicated in-app.
        </Section>

        <Section title="Contact" colors={colors}>
          Privacy questions: privacy@stockclarify.app
        </Section>
      </ScrollView>
    </SafeAreaView>
  );
}

function Section({
  title,
  children,
  colors,
}: {
  title: string;
  children: React.ReactNode;
  colors: ReturnType<typeof useColors>;
}) {
  return (
    <View style={s.section}>
      <Text style={[s.h2, { color: colors.foreground }]}>{title}</Text>
      <Text style={[s.body, { color: colors.foreground }]}>{children}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1 },
  content: { padding: 20, paddingBottom: 40, gap: 12 },
  banner: { padding: 12, borderRadius: 10, borderWidth: 1, marginBottom: 8 },
  bannerText: { fontSize: 12, fontFamily: "Inter_700Bold", textAlign: "center" },
  h1: { fontSize: 22, fontFamily: "Inter_700Bold" },
  h2: { fontSize: 15, fontFamily: "Inter_700Bold", marginBottom: 6 },
  body: { fontSize: 14, fontFamily: "Inter_400Regular", lineHeight: 21 },
  muted: { fontSize: 12, fontFamily: "Inter_400Regular", marginBottom: 12 },
  section: { marginTop: 8 },
});
