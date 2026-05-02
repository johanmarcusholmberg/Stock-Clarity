import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Linking,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useColors } from "@/hooks/useColors";
import {
  getReportFilings,
  getReportSummary,
  type Filing,
  type SummaryResponse,
} from "@/services/stockApi";

interface Props {
  ticker: string;
}

function formatDate(iso: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export default function ReportSummary({ ticker }: Props) {
  const colors = useColors();
  const [filings, setFilings] = useState<Filing[]>([]);
  const [filingsLoading, setFilingsLoading] = useState(true);
  const [filingsError, setFilingsError] = useState<string | null>(null);
  const [activeAccession, setActiveAccession] = useState<string | null>(null);
  const [summary, setSummary] = useState<SummaryResponse | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summaryError, setSummaryError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setFilingsLoading(true);
    setFilingsError(null);
    setSummary(null);
    setActiveAccession(null);

    getReportFilings(ticker)
      .then((rows) => {
        if (cancelled) return;
        setFilings(rows);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : "Failed to load filings";
        setFilingsError(message);
        setFilings([]);
      })
      .finally(() => {
        if (!cancelled) setFilingsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [ticker]);

  const handleSummarize = useCallback(
    async (filing: Filing) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      setActiveAccession(filing.accessionNumber);
      setSummary(null);
      setSummaryError(null);
      setSummaryLoading(true);
      try {
        const data = await getReportSummary(ticker, filing.accessionNumber);
        setSummary(data);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Failed to summarize report";
        setSummaryError(message);
      } finally {
        setSummaryLoading(false);
      }
    },
    [ticker],
  );

  const sentimentStyle = useMemo(() => {
    if (!summary) return null;
    const s = summary.summary.sentiment;
    if (s === "positive") {
      return {
        bg: `${colors.positive}22`,
        border: `${colors.positive}44`,
        fg: colors.positive,
        label: "Positive",
        icon: "trending-up" as const,
      };
    }
    if (s === "negative") {
      return {
        bg: `${colors.negative}22`,
        border: `${colors.negative}44`,
        fg: colors.negative,
        label: "Negative",
        icon: "trending-down" as const,
      };
    }
    return {
      bg: `${colors.warning}22`,
      border: `${colors.warning}44`,
      fg: colors.warning,
      label: "Neutral",
      icon: "minus" as const,
    };
  }, [summary, colors.positive, colors.negative, colors.warning]);

  return (
    <View style={[styles.section, { paddingHorizontal: 16 }]}>
      <View style={styles.headerRow}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Reports</Text>
          <Text style={[styles.sectionSubtitle, { color: colors.mutedForeground }]}>
            SEC 10-K & 10-Q filings with AI-generated executive summaries.
          </Text>
        </View>
      </View>

      {filingsLoading ? (
        <View style={styles.loadingRow}>
          <ActivityIndicator color={colors.primary} />
          <Text style={[styles.loadingText, { color: colors.mutedForeground }]}>
            Loading filings…
          </Text>
        </View>
      ) : filingsError ? (
        <View style={[styles.emptyBox, { borderColor: colors.border }]}>
          <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
            {filingsError}
          </Text>
        </View>
      ) : filings.length === 0 ? (
        <View style={[styles.emptyBox, { borderColor: colors.border }]}>
          <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
            No 10-K or 10-Q filings found for {ticker}.
          </Text>
        </View>
      ) : (
        <View style={{ gap: 8 }}>
          {filings.map((f) => {
            const isActive = activeAccession === f.accessionNumber;
            const isAnnual = f.type === "10-K";
            const badgeBg = isAnnual ? `${colors.primary}1F` : `${colors.positive}1F`;
            const badgeBorder = isAnnual ? `${colors.primary}55` : `${colors.positive}55`;
            const badgeFg = isAnnual ? colors.primary : colors.positive;
            return (
              <View
                key={f.accessionNumber}
                style={[
                  styles.filingRow,
                  {
                    backgroundColor: colors.card,
                    borderColor: isActive ? `${colors.primary}66` : colors.border,
                  },
                ]}
              >
                <View
                  style={[
                    styles.typeBadge,
                    { backgroundColor: badgeBg, borderColor: badgeBorder },
                  ]}
                >
                  <Text style={[styles.typeBadgeText, { color: badgeFg }]}>{f.type}</Text>
                </View>
                <View style={styles.filingInfo}>
                  <Text style={[styles.filingPeriod, { color: colors.foreground }]}>
                    Period {formatDate(f.reportDate)}
                  </Text>
                  <Text style={[styles.filingFiled, { color: colors.mutedForeground }]}>
                    Filed {formatDate(f.filedAt)}
                  </Text>
                </View>
                <View style={styles.filingActions}>
                  <TouchableOpacity
                    onPress={() => Linking.openURL(f.edgarUrl)}
                    style={[styles.linkBtn, { borderColor: colors.border }]}
                    accessibilityLabel={`Open ${f.type} on SEC EDGAR`}
                  >
                    <Text style={[styles.linkBtnText, { color: colors.mutedForeground }]}>
                      Full report
                    </Text>
                    <Feather name="external-link" size={11} color={colors.mutedForeground} />
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => handleSummarize(f)}
                    disabled={summaryLoading && isActive}
                    style={[
                      styles.summarizeBtn,
                      {
                        backgroundColor:
                          summaryLoading && isActive ? colors.secondary : colors.primary,
                      },
                    ]}
                  >
                    {summaryLoading && isActive ? (
                      <ActivityIndicator size="small" color={colors.mutedForeground} />
                    ) : (
                      <>
                        <Feather name="zap" size={11} color={colors.primaryForeground} />
                        <Text
                          style={[styles.summarizeBtnText, { color: colors.primaryForeground }]}
                        >
                          Summarize
                        </Text>
                      </>
                    )}
                  </TouchableOpacity>
                </View>
              </View>
            );
          })}
        </View>
      )}

      {summaryLoading && activeAccession && (
        <View
          style={[
            styles.summaryCard,
            { backgroundColor: colors.card, borderColor: colors.border },
          ]}
        >
          <View style={styles.skeletonHeadline}>
            <ActivityIndicator color={colors.primary} />
            <Text style={[styles.loadingText, { color: colors.mutedForeground }]}>
              Reading filing & generating summary…
            </Text>
          </View>
        </View>
      )}

      {summaryError && (
        <View
          style={[
            styles.summaryCard,
            {
              backgroundColor: `${colors.negative}10`,
              borderColor: `${colors.negative}40`,
            },
          ]}
        >
          <Text style={[styles.errorText, { color: colors.negative }]}>{summaryError}</Text>
        </View>
      )}

      {summary && sentimentStyle && (
        <View
          style={[
            styles.summaryCard,
            { backgroundColor: colors.card, borderColor: colors.border },
          ]}
        >
          <View style={styles.summaryHeader}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.periodLabel, { color: colors.mutedForeground }]}>
                {summary.summary.period} · {summary.type}
              </Text>
              <Text style={[styles.headline, { color: colors.foreground }]}>
                {summary.summary.headline}
              </Text>
            </View>
            <View
              style={[
                styles.sentimentBadge,
                {
                  backgroundColor: sentimentStyle.bg,
                  borderColor: sentimentStyle.border,
                },
              ]}
            >
              <Feather name={sentimentStyle.icon} size={11} color={sentimentStyle.fg} />
              <Text style={[styles.sentimentBadgeText, { color: sentimentStyle.fg }]}>
                {sentimentStyle.label}
              </Text>
            </View>
          </View>

          <View style={styles.metricsGrid}>
            {(
              [
                { label: "Revenue", value: summary.summary.keyMetrics.revenue },
                { label: "Net Income", value: summary.summary.keyMetrics.netIncome },
                { label: "EPS", value: summary.summary.keyMetrics.eps },
                {
                  label: "Operating Cash Flow",
                  value: summary.summary.keyMetrics.operatingCashFlow,
                },
              ] as const
            ).map((m) => (
              <View
                key={m.label}
                style={[
                  styles.metricItem,
                  { backgroundColor: colors.secondary, borderColor: colors.border },
                ]}
              >
                <Text style={[styles.metricLabel, { color: colors.mutedForeground }]}>
                  {m.label}
                </Text>
                <Text
                  style={[styles.metricValue, { color: colors.foreground }]}
                  numberOfLines={2}
                >
                  {m.value && m.value !== "null" ? m.value : "—"}
                </Text>
              </View>
            ))}
          </View>

          {summary.summary.highlights.length > 0 && (
            <View style={styles.highlightsBlock}>
              <Text style={[styles.subhead, { color: colors.foreground }]}>Highlights</Text>
              {summary.summary.highlights.map((h, i) => (
                <View key={i} style={styles.bulletRow}>
                  <View style={[styles.bullet, { backgroundColor: colors.primary }]} />
                  <Text style={[styles.bulletText, { color: colors.foreground }]}>{h}</Text>
                </View>
              ))}
            </View>
          )}

          {summary.summary.analystNote && (
            <View
              style={[
                styles.analystBox,
                {
                  backgroundColor: `${colors.primary}0F`,
                  borderColor: `${colors.primary}33`,
                },
              ]}
            >
              <Text style={[styles.analystLabel, { color: colors.primary }]}>
                Analyst note
              </Text>
              <Text style={[styles.analystText, { color: colors.foreground }]}>
                {summary.summary.analystNote}
              </Text>
            </View>
          )}

          <TouchableOpacity
            onPress={() => Linking.openURL(summary.filing.edgarUrl)}
            style={[styles.fullReportBtn, { borderColor: colors.border }]}
          >
            <Text style={[styles.fullReportText, { color: colors.primary }]}>
              Read full {summary.type} on SEC EDGAR
            </Text>
            <Feather name="external-link" size={12} color={colors.primary} />
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { paddingBottom: 16 },
  headerRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  sectionTitle: { fontSize: 20, fontFamily: "Inter_700Bold", marginBottom: 2 },
  sectionSubtitle: { fontSize: 12, fontFamily: "Inter_400Regular", lineHeight: 17 },

  loadingRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 18 },
  loadingText: { fontSize: 13, fontFamily: "Inter_400Regular" },

  emptyBox: {
    padding: 20,
    borderRadius: 12,
    borderWidth: 1,
    borderStyle: "dashed",
    alignItems: "center",
  },
  emptyText: { fontSize: 13, fontFamily: "Inter_400Regular", textAlign: "center" },

  filingRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    gap: 10,
  },
  typeBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    minWidth: 50,
    alignItems: "center",
  },
  typeBadgeText: { fontSize: 11, fontFamily: "Inter_700Bold", letterSpacing: 0.4 },
  filingInfo: { flex: 1, gap: 2 },
  filingPeriod: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  filingFiled: { fontSize: 11, fontFamily: "Inter_400Regular" },
  filingActions: { flexDirection: "row", gap: 6, alignItems: "center" },
  linkBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
  },
  linkBtnText: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  summarizeBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 8,
    minWidth: 92,
    justifyContent: "center",
  },
  summarizeBtnText: { fontSize: 11, fontFamily: "Inter_700Bold" },

  summaryCard: {
    marginTop: 14,
    padding: 16,
    borderRadius: 14,
    borderWidth: 1,
    gap: 14,
  },
  skeletonHeadline: { flexDirection: "row", alignItems: "center", gap: 10 },
  errorText: { fontSize: 13, fontFamily: "Inter_400Regular" },

  summaryHeader: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  periodLabel: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  headline: { fontSize: 17, fontFamily: "Inter_700Bold", lineHeight: 23 },
  sentimentBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 16,
    borderWidth: 1,
  },
  sentimentBadgeText: { fontSize: 11, fontFamily: "Inter_700Bold" },

  metricsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  metricItem: {
    width: "48%",
    flexGrow: 1,
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    gap: 4,
  },
  metricLabel: { fontSize: 11, fontFamily: "Inter_400Regular" },
  metricValue: { fontSize: 14, fontFamily: "Inter_700Bold" },

  highlightsBlock: { gap: 8 },
  subhead: { fontSize: 13, fontFamily: "Inter_700Bold" },
  bulletRow: { flexDirection: "row", alignItems: "flex-start", gap: 8, paddingRight: 4 },
  bullet: { width: 6, height: 6, borderRadius: 3, marginTop: 7 },
  bulletText: { flex: 1, fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 19 },

  analystBox: {
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    gap: 4,
  },
  analystLabel: {
    fontSize: 10,
    fontFamily: "Inter_700Bold",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  analystText: { fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 19, fontStyle: "italic" },

  fullReportBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
  },
  fullReportText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
});
