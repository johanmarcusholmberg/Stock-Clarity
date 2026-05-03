import React from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";

// Placeholder Terms of Service. The wording below is intentionally generic
// and MUST be reviewed by counsel before App Store / Play Store submission
// (publication-readiness audit item #12). The placeholder banner at the
// top is a deliberate nag — reviewers and dev users should both see it.

export default function TermsScreen() {
  const colors = useColors();

  return (
    <SafeAreaView style={[s.root, { backgroundColor: colors.background }]} edges={["bottom"]}>
      <ScrollView contentContainerStyle={s.content}>
        <View style={[s.banner, { backgroundColor: colors.warning + "22", borderColor: colors.warning }]}>
          <Text style={[s.bannerText, { color: colors.warning }]}>
            ⚠ PLACEHOLDER — replace with legally-reviewed text before publication.
          </Text>
        </View>

        <Text style={[s.h1, { color: colors.foreground }]}>StockClarify Terms of Service</Text>
        <Text style={[s.muted, { color: colors.mutedForeground }]}>Last updated: 2 May 2026</Text>

        <Section title="1. Acceptance" colors={colors}>
          By creating an account or using StockClarify (the "Service"), you agree to these Terms of
          Service and our Privacy Policy. If you do not agree, do not use the Service.
        </Section>

        <Section title="2. Eligibility" colors={colors}>
          You must be at least 18 years old to use StockClarify.
        </Section>

        <Section title="3. The Service" colors={colors}>
          StockClarify is an information and analysis tool that aggregates publicly available
          financial news and market data and presents AI-generated summaries. StockClarify is
          NOT a registered investment adviser, broker-dealer, or financial planner. Nothing in
          the Service constitutes investment advice, a recommendation to buy or sell any
          security, or any other type of professional advice. You are solely responsible for
          your own investment decisions and should consult a qualified professional before
          acting on any information provided.
        </Section>

        <Section title="4. Free and Paid Tiers" colors={colors}>
          StockClarify offers a free tier with usage limits, and paid Pro and Premium
          subscriptions with expanded limits and features. Subscription billing terms are
          described in the in-app paywall and in your App Store / Play Store account.
        </Section>

        <Section title="5. AI-Generated Content" colors={colors}>
          AI-generated summaries can be incomplete, inaccurate, or out of date. Always verify
          information against the original source before acting on it.
        </Section>

        <Section title="6. Market Data" colors={colors}>
          Market data is provided by third parties (currently Yahoo Finance) and may be
          delayed by up to 15 minutes. Data is provided for informational purposes only and
          is not suitable for trading decisions.
        </Section>

        <Section title="7. Acceptable Use" colors={colors}>
          You may not scrape, resell, or redistribute the Service or its data; attempt to
          reverse-engineer or interfere with the Service; or use the Service to violate any
          law or third-party right.
        </Section>

        <Section title="8. Disclaimer of Warranties" colors={colors}>
          The Service is provided "as is" without warranty of any kind, express or implied.
        </Section>

        <Section title="9. Limitation of Liability" colors={colors}>
          To the fullest extent permitted by law, StockClarify and its operators are not
          liable for any indirect, incidental, special, consequential, or punitive damages,
          or for any loss of profits or revenues arising out of your use of the Service.
        </Section>

        <Section title="10. Changes" colors={colors}>
          We may update these Terms from time to time. Material changes will be communicated
          in-app. Continued use after a change constitutes acceptance.
        </Section>

        <Section title="11. Contact" colors={colors}>
          Questions: support@stockclarify.app
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
