import { Feather } from "@expo/vector-icons";
import { useAuth } from "@clerk/clerk-expo";
import * as Haptics from "expo-haptics";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Linking,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useColors } from "@/hooks/useColors";
import { useSubscription } from "@/context/SubscriptionContext";
import {
  getReportFilings,
  getReportSummary,
  getReportSubscription,
  setReportSubscription,
  deleteReportSubscription,
  PremiumRequiredError,
  type Filing,
  type SummaryResponse,
} from "@/services/stockApi";

interface Props {
  ticker: string;
  onUpgradeRequired?: () => void;
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

function yearOf(iso: string): number | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.getUTCFullYear();
}

interface FilingsByYear {
  years: number[];
  groups: Map<number, Filing[]>;
  latestYear: number | null;
}

function groupFilingsByYear(filings: Filing[]): FilingsByYear {
  const groups = new Map<number, Filing[]>();
  for (const f of filings) {
    const y = yearOf(f.reportDate) ?? yearOf(f.filedAt);
    if (y == null) continue;
    if (!groups.has(y)) groups.set(y, []);
    groups.get(y)!.push(f);
  }
  for (const list of groups.values()) {
    list.sort((a, b) => {
      // Annual first, then by report date desc
      if (a.type !== b.type) return a.type === "10-K" ? -1 : 1;
      return (b.reportDate || b.filedAt).localeCompare(a.reportDate || a.filedAt);
    });
  }
  const years = Array.from(groups.keys()).sort((a, b) => b - a);
  return { years, groups, latestYear: years[0] ?? null };
}

export default function ReportSummary({ ticker, onUpgradeRequired }: Props) {
  const colors = useColors();
  const { tier } = useSubscription();
  const { userId } = useAuth();
  const isPremium = tier === "premium";

  const [open, setOpen] = useState(false);
  const [filings, setFilings] = useState<Filing[]>([]);
  const [filingsLoading, setFilingsLoading] = useState(false);
  const [filingsError, setFilingsError] = useState<string | null>(null);
  const [selectedYear, setSelectedYear] = useState<number | null>(null);

  // Per-accession summary cache so flipping between filings is instant
  // after first generation.
  const [summaries, setSummaries] = useState<Record<string, SummaryResponse>>({});
  const [activeAccession, setActiveAccession] = useState<string | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summaryError, setSummaryError] = useState<string | null>(null);

  // Compare mode: pick exactly two filings to view side-by-side.
  const [compareMode, setCompareMode] = useState(false);
  const [compareSelection, setCompareSelection] = useState<string[]>([]);
  const [compareLoading, setCompareLoading] = useState(false);

  // Notification subscription state for this ticker.
  const [subscribed, setSubscribed] = useState(false);
  const [subToggling, setSubToggling] = useState(false);

  // Lazy-load filings + subscription on first open.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setFilingsLoading(true);
    setFilingsError(null);
    getReportFilings(ticker)
      .then((rows) => {
        if (cancelled) return;
        setFilings(rows);
        const g = groupFilingsByYear(rows);
        setSelectedYear(g.latestYear);
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
  }, [open, ticker]);

  useEffect(() => {
    if (!open || !userId) return;
    let cancelled = false;
    getReportSubscription(userId, ticker)
      .then((sub) => {
        if (!cancelled) setSubscribed(!!sub);
      })
      .catch(() => {
        /* non-fatal */
      });
    return () => {
      cancelled = true;
    };
  }, [open, ticker, userId]);

  const grouped = useMemo(() => groupFilingsByYear(filings), [filings]);

  const handleClose = useCallback(() => {
    setOpen(false);
    setCompareMode(false);
    setCompareSelection([]);
    setSummaryError(null);
  }, []);

  const handleSummarize = useCallback(
    async (filing: Filing) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      const cached = summaries[filing.accessionNumber];
      if (cached) {
        setActiveAccession(filing.accessionNumber);
        setSummaryError(null);
        return;
      }
      if (!isPremium) {
        onUpgradeRequired?.();
        setSummaryError("AI report summaries are a Premium feature.");
        return;
      }
      setActiveAccession(filing.accessionNumber);
      setSummaryError(null);
      setSummaryLoading(true);
      try {
        const data = await getReportSummary(ticker, filing.accessionNumber, userId ?? undefined);
        setSummaries((prev) => ({ ...prev, [filing.accessionNumber]: data }));
      } catch (err: unknown) {
        if (err instanceof PremiumRequiredError) {
          onUpgradeRequired?.();
          setSummaryError("AI report summaries are a Premium feature.");
        } else {
          const message = err instanceof Error ? err.message : "Failed to summarize report";
          const isApiKeyMissing = message.includes("ANTHROPIC_API_KEY") || message === "HTTP 503";
          setSummaryError(
            isApiKeyMissing ? "AI summaries unavailable — contact the admin" : message,
          );
        }
      } finally {
        setSummaryLoading(false);
      }
    },
    [summaries, isPremium, ticker, userId, onUpgradeRequired],
  );

  const toggleCompareSelection = useCallback((accession: string) => {
    setCompareSelection((prev) => {
      if (prev.includes(accession)) return prev.filter((a) => a !== accession);
      if (prev.length >= 2) return [prev[1], accession];
      return [...prev, accession];
    });
  }, []);

  const handleRunCompare = useCallback(async () => {
    if (compareSelection.length !== 2) return;
    if (!isPremium) {
      onUpgradeRequired?.();
      return;
    }
    setCompareLoading(true);
    setSummaryError(null);
    try {
      for (const acc of compareSelection) {
        if (summaries[acc]) continue;
        const data = await getReportSummary(ticker, acc, userId ?? undefined);
        setSummaries((prev) => ({ ...prev, [acc]: data }));
      }
    } catch (err: unknown) {
      if (err instanceof PremiumRequiredError) {
        onUpgradeRequired?.();
        setSummaryError("AI report summaries are a Premium feature.");
      } else {
        const message = err instanceof Error ? err.message : "Compare failed";
        setSummaryError(message);
      }
    } finally {
      setCompareLoading(false);
    }
  }, [compareSelection, summaries, isPremium, ticker, userId, onUpgradeRequired]);

  const handleToggleSubscription = useCallback(async () => {
    if (!userId) return;
    setSubToggling(true);
    try {
      if (subscribed) {
        await deleteReportSubscription(userId, ticker);
        setSubscribed(false);
      } else {
        await setReportSubscription(userId, ticker, "push");
        setSubscribed(true);
      }
      Haptics.selectionAsync().catch(() => {});
    } catch {
      /* surface? swallow for now */
    } finally {
      setSubToggling(false);
    }
  }, [userId, subscribed, ticker]);

  const activeSummary = activeAccession ? summaries[activeAccession] ?? null : null;

  const yearFilings: Filing[] = selectedYear != null
    ? grouped.groups.get(selectedYear) ?? []
    : [];

  const compareFilings = useMemo(() => {
    return compareSelection
      .map((acc) => filings.find((f) => f.accessionNumber === acc))
      .filter((f): f is Filing => !!f);
  }, [compareSelection, filings]);

  return (
    <>
      {/* Collapsed row — what shows on the stock page itself. */}
      <View style={[styles.rowWrap, { paddingHorizontal: 16 }]}>
        <Pressable
          onPress={() => {
            Haptics.selectionAsync().catch(() => {});
            setOpen(true);
          }}
          style={({ pressed }) => [
            styles.row,
            {
              backgroundColor: colors.card,
              borderColor: colors.border,
              opacity: pressed ? 0.85 : 1,
            },
          ]}
        >
          <View style={[styles.rowIcon, { backgroundColor: `${colors.primary}1F` }]}>
            <Feather name="file-text" size={18} color={colors.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.rowTitle, { color: colors.foreground }]}>
              SEC Reports
            </Text>
            <Text style={[styles.rowSubtitle, { color: colors.mutedForeground }]}>
              10-K & 10-Q filings · AI summaries · {isPremium ? "included" : "Premium"}
            </Text>
          </View>
          <Feather name="chevron-right" size={20} color={colors.mutedForeground} />
        </Pressable>
      </View>

      <Modal
        visible={open}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={handleClose}
      >
        <View style={[styles.modalRoot, { backgroundColor: colors.background }]}>
          {/* Header */}
          <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
            <TouchableOpacity onPress={handleClose} style={styles.headerBtn}>
              <Feather name="x" size={22} color={colors.foreground} />
            </TouchableOpacity>
            <View style={{ flex: 1, alignItems: "center" }}>
              <Text style={[styles.modalTitle, { color: colors.foreground }]}>
                {ticker} Reports
              </Text>
              <Text style={[styles.modalSubtitle, { color: colors.mutedForeground }]}>
                10-K (annual) & 10-Q (quarterly)
              </Text>
            </View>
            <TouchableOpacity
              onPress={handleToggleSubscription}
              disabled={!userId || subToggling}
              style={styles.headerBtn}
              accessibilityLabel={subscribed ? "Unsubscribe from new filings" : "Get notified of new filings"}
            >
              {subToggling ? (
                <ActivityIndicator size="small" color={colors.primary} />
              ) : (
                <Feather
                  name={subscribed ? "bell" : "bell-off"}
                  size={20}
                  color={subscribed ? colors.primary : colors.mutedForeground}
                />
              )}
            </TouchableOpacity>
          </View>

          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
          >
            {/* Year selector */}
            {grouped.years.length > 0 && (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ gap: 8, paddingBottom: 12 }}
              >
                {grouped.years.map((y) => {
                  const active = y === selectedYear;
                  return (
                    <TouchableOpacity
                      key={y}
                      onPress={() => setSelectedYear(y)}
                      style={[
                        styles.yearChip,
                        {
                          backgroundColor: active ? colors.primary : colors.card,
                          borderColor: active ? colors.primary : colors.border,
                        },
                      ]}
                    >
                      <Text
                        style={[
                          styles.yearChipText,
                          { color: active ? colors.primaryForeground : colors.foreground },
                        ]}
                      >
                        {y}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            )}

            {/* Compare toggle */}
            {filings.length >= 2 && (
              <View style={styles.compareRow}>
                <TouchableOpacity
                  onPress={() => {
                    setCompareMode((m) => !m);
                    setCompareSelection([]);
                  }}
                  style={[
                    styles.compareToggle,
                    {
                      backgroundColor: compareMode ? `${colors.primary}22` : "transparent",
                      borderColor: compareMode ? colors.primary : colors.border,
                    },
                  ]}
                >
                  <Feather
                    name="git-compare"
                    size={13}
                    color={compareMode ? colors.primary : colors.mutedForeground}
                  />
                  <Text
                    style={[
                      styles.compareToggleText,
                      { color: compareMode ? colors.primary : colors.mutedForeground },
                    ]}
                  >
                    {compareMode ? "Cancel compare" : "Compare two filings"}
                  </Text>
                </TouchableOpacity>
                {compareMode && (
                  <TouchableOpacity
                    onPress={handleRunCompare}
                    disabled={compareSelection.length !== 2 || compareLoading}
                    style={[
                      styles.compareRunBtn,
                      {
                        backgroundColor:
                          compareSelection.length === 2 ? colors.primary : colors.secondary,
                      },
                    ]}
                  >
                    {compareLoading ? (
                      <ActivityIndicator size="small" color={colors.primaryForeground} />
                    ) : (
                      <Text
                        style={[
                          styles.compareRunBtnText,
                          {
                            color:
                              compareSelection.length === 2
                                ? colors.primaryForeground
                                : colors.mutedForeground,
                          },
                        ]}
                      >
                        Compare ({compareSelection.length}/2)
                      </Text>
                    )}
                  </TouchableOpacity>
                )}
              </View>
            )}

            {/* Filings list for selected year */}
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
            ) : yearFilings.length === 0 ? (
              <View style={[styles.emptyBox, { borderColor: colors.border }]}>
                <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
                  No 10-K or 10-Q filings found for {ticker}.
                </Text>
              </View>
            ) : (
              <View style={{ gap: 8 }}>
                {yearFilings.map((f) => {
                  const isAnnual = f.type === "10-K";
                  const badgeBg = isAnnual ? `${colors.primary}1F` : `${colors.positive}1F`;
                  const badgeBorder = isAnnual ? `${colors.primary}55` : `${colors.positive}55`;
                  const badgeFg = isAnnual ? colors.primary : colors.positive;
                  const isActive = activeAccession === f.accessionNumber;
                  const isCompareSelected = compareSelection.includes(f.accessionNumber);
                  return (
                    <Pressable
                      key={f.accessionNumber}
                      onPress={() => {
                        if (compareMode) toggleCompareSelection(f.accessionNumber);
                      }}
                      style={[
                        styles.filingRow,
                        {
                          backgroundColor: colors.card,
                          borderColor: isCompareSelected
                            ? colors.primary
                            : isActive
                              ? `${colors.primary}66`
                              : colors.border,
                          borderWidth: isCompareSelected ? 2 : 1,
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
                          {isAnnual ? "Annual" : "Quarterly"} · {formatDate(f.reportDate)}
                        </Text>
                        <Text style={[styles.filingFiled, { color: colors.mutedForeground }]}>
                          Filed {formatDate(f.filedAt)}
                        </Text>
                      </View>
                      {compareMode ? (
                        <View
                          style={[
                            styles.checkbox,
                            {
                              borderColor: isCompareSelected ? colors.primary : colors.border,
                              backgroundColor: isCompareSelected
                                ? colors.primary
                                : "transparent",
                            },
                          ]}
                        >
                          {isCompareSelected && (
                            <Feather name="check" size={14} color={colors.primaryForeground} />
                          )}
                        </View>
                      ) : (
                        <View style={styles.filingActions}>
                          <TouchableOpacity
                            onPress={() => Linking.openURL(f.edgarUrl)}
                            style={[styles.linkBtn, { borderColor: colors.border }]}
                          >
                            <Feather name="external-link" size={11} color={colors.mutedForeground} />
                          </TouchableOpacity>
                          <TouchableOpacity
                            onPress={() => handleSummarize(f)}
                            disabled={summaryLoading && isActive}
                            style={[
                              styles.summarizeBtn,
                              {
                                backgroundColor:
                                  summaryLoading && isActive
                                    ? colors.secondary
                                    : colors.primary,
                              },
                            ]}
                          >
                            {summaryLoading && isActive ? (
                              <ActivityIndicator size="small" color={colors.mutedForeground} />
                            ) : (
                              <>
                                {!isPremium && (
                                  <Feather
                                    name="lock"
                                    size={10}
                                    color={colors.primaryForeground}
                                  />
                                )}
                                <Feather
                                  name="zap"
                                  size={11}
                                  color={colors.primaryForeground}
                                />
                                <Text
                                  style={[
                                    styles.summarizeBtnText,
                                    { color: colors.primaryForeground },
                                  ]}
                                >
                                  {summaries[f.accessionNumber] ? "View" : "Summarize"}
                                </Text>
                              </>
                            )}
                          </TouchableOpacity>
                        </View>
                      )}
                    </Pressable>
                  );
                })}
              </View>
            )}

            {/* Errors / paywall hint */}
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

            {/* Compare view: two filings side-by-side */}
            {compareMode &&
              compareFilings.length === 2 &&
              compareFilings.every((f) => summaries[f.accessionNumber]) && (
                <View style={{ marginTop: 16 }}>
                  <Text style={[styles.subhead, { color: colors.foreground, marginBottom: 8 }]}>
                    Side-by-side comparison
                  </Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                    <View style={styles.compareGrid}>
                      {compareFilings.map((f) => {
                        const s = summaries[f.accessionNumber]!;
                        return (
                          <SummaryCard
                            key={f.accessionNumber}
                            data={s}
                            colors={colors}
                            compact
                          />
                        );
                      })}
                    </View>
                  </ScrollView>
                </View>
              )}

            {/* Single-summary view */}
            {!compareMode && activeSummary && (
              <SummaryCard data={activeSummary} colors={colors} />
            )}
          </ScrollView>
        </View>
      </Modal>
    </>
  );
}

// ── Summary card (shared by single + compare views) ────────────────────────
function SummaryCard({
  data,
  colors,
  compact = false,
}: {
  data: SummaryResponse;
  colors: ReturnType<typeof useColors>;
  compact?: boolean;
}) {
  const sentimentStyle = useMemo(() => {
    const s = data.summary.sentiment;
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
  }, [data, colors]);

  return (
    <View
      style={[
        styles.summaryCard,
        compact && { width: 300, marginRight: 12, marginTop: 0 },
        { backgroundColor: colors.card, borderColor: colors.border },
      ]}
    >
      <View style={styles.summaryHeader}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.periodLabel, { color: colors.mutedForeground }]}>
            {data.summary.period} · {data.type}
          </Text>
          <Text style={[styles.headline, { color: colors.foreground }]}>
            {data.summary.headline}
          </Text>
        </View>
        <View
          style={[
            styles.sentimentBadge,
            { backgroundColor: sentimentStyle.bg, borderColor: sentimentStyle.border },
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
            { label: "Revenue", value: data.summary.keyMetrics.revenue },
            { label: "Net Income", value: data.summary.keyMetrics.netIncome },
            { label: "EPS", value: data.summary.keyMetrics.eps },
            { label: "Op Cash Flow", value: data.summary.keyMetrics.operatingCashFlow },
          ] as const
        ).map((m) => (
          <View
            key={m.label}
            style={[
              styles.metricItem,
              { backgroundColor: colors.secondary, borderColor: colors.border },
            ]}
          >
            <Text style={[styles.metricLabel, { color: colors.mutedForeground }]}>{m.label}</Text>
            <Text style={[styles.metricValue, { color: colors.foreground }]} numberOfLines={2}>
              {m.value && m.value !== "null" ? m.value : "—"}
            </Text>
          </View>
        ))}
      </View>

      {data.summary.highlights.length > 0 && (
        <View style={styles.highlightsBlock}>
          <Text style={[styles.subhead, { color: colors.foreground }]}>Highlights</Text>
          {data.summary.highlights.map((h, i) => (
            <View key={i} style={styles.bulletRow}>
              <View style={[styles.bullet, { backgroundColor: colors.primary }]} />
              <Text style={[styles.bulletText, { color: colors.foreground }]}>{h}</Text>
            </View>
          ))}
        </View>
      )}

      {data.summary.analystNote && (
        <View
          style={[
            styles.analystBox,
            { backgroundColor: `${colors.primary}0F`, borderColor: `${colors.primary}33` },
          ]}
        >
          <Text style={[styles.analystLabel, { color: colors.primary }]}>Analyst note</Text>
          <Text style={[styles.analystText, { color: colors.foreground }]}>
            {data.summary.analystNote}
          </Text>
        </View>
      )}

      <TouchableOpacity
        onPress={() => Linking.openURL(data.filing.edgarUrl)}
        style={[styles.fullReportBtn, { borderColor: colors.border }]}
      >
        <Text style={[styles.fullReportText, { color: colors.primary }]}>
          Read full {data.type} on SEC EDGAR
        </Text>
        <Feather name="external-link" size={12} color={colors.primary} />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  rowWrap: { paddingBottom: 16 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderRadius: 14,
    borderWidth: 1,
  },
  rowIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  rowTitle: { fontSize: 15, fontFamily: "Inter_700Bold" },
  rowSubtitle: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },

  modalRoot: { flex: 1 },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
    gap: 8,
  },
  headerBtn: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  modalTitle: { fontSize: 16, fontFamily: "Inter_700Bold" },
  modalSubtitle: { fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 1 },

  yearChip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: 1,
  },
  yearChipText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },

  compareRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    paddingBottom: 12,
  },
  compareToggle: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: 1,
  },
  compareToggleText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  compareRunBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    minWidth: 110,
  },
  compareRunBtnText: { fontSize: 12, fontFamily: "Inter_700Bold" },

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
    paddingHorizontal: 8,
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: 1,
  },
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

  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },

  summaryCard: {
    marginTop: 16,
    padding: 16,
    borderRadius: 14,
    borderWidth: 1,
    gap: 14,
  },
  errorText: { fontSize: 13, fontFamily: "Inter_400Regular" },

  summaryHeader: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  periodLabel: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  headline: { fontSize: 16, fontFamily: "Inter_700Bold", lineHeight: 22 },
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

  compareGrid: {
    flexDirection: "row",
    paddingTop: 4,
    paddingBottom: 4,
  },
});
