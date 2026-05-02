import { Feather } from "@expo/vector-icons";
import { useAuth } from "@clerk/expo";
import * as Haptics from "expo-haptics";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Linking,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useColors } from "@/hooks/useColors";
import { useSubscription } from "@/context/SubscriptionContext";
import { PaywallSheet } from "@/components/PaywallSheet";
import {
  deleteReportSubscription,
  getReportFilingsResult,
  getReportSubscription,
  getReportSummary,
  PremiumRequiredError,
  setReportSubscription,
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
  return d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

function yearOf(filing: Filing): number {
  const src = filing.reportDate || filing.filedAt;
  const y = src ? Number(src.slice(0, 4)) : NaN;
  return Number.isFinite(y) ? y : 0;
}

// Compact one-row launcher rendered inline in the stock page. Tapping it opens
// the full reports modal (filings list, year selector, premium-gated AI
// summary, side-by-side compare, subscribe-to-new-filings toggle).
export default function ReportSummary({ ticker }: Props) {
  const colors = useColors();
  const { tier } = useSubscription();
  const isPremium = tier === "premium";
  const { userId } = useAuth();

  const [open, setOpen] = useState(false);
  const [filings, setFilings] = useState<Filing[]>([]);
  const [filingsLoading, setFilingsLoading] = useState(false);
  const [filingsError, setFilingsError] = useState<string | null>(null);
  const [unsupported, setUnsupported] = useState<string | null>(null);
  const [latestType, setLatestType] = useState<string | null>(null);
  const [latestDate, setLatestDate] = useState<string | null>(null);
  const [subscribed, setSubscribed] = useState(false);
  const [subscribing, setSubscribing] = useState(false);
  const [paywallOpen, setPaywallOpen] = useState(false);

  // Reset per-ticker derived state when the route ticker changes.
  useEffect(() => {
    setFilings([]);
    setLatestType(null);
    setLatestDate(null);
    setUnsupported(null);
    setFilingsError(null);
  }, [ticker]);

  // Pre-load only the latest-filing summary line for the inline row.
  useEffect(() => {
    let cancelled = false;
    setFilingsError(null);
    getReportFilingsResult(ticker)
      .then((result) => {
        if (cancelled) return;
        if (result.unsupported) {
          setUnsupported(result.message ?? "Reports not available for this exchange");
          return;
        }
        setUnsupported(null);
        if (result.filings.length) {
          setLatestType(result.filings[0].type);
          setLatestDate(result.filings[0].reportDate || result.filings[0].filedAt);
        }
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setFilingsError(err instanceof Error ? err.message : "Failed to load filings");
      });
    return () => {
      cancelled = true;
    };
  }, [ticker]);

  // When the modal opens, ensure full filings list is loaded and refresh
  // the user's subscription state for this ticker.
  const ensureLoaded = useCallback(async () => {
    if (unsupported) return; // nothing to fetch
    if (!filings.length && !filingsLoading) {
      setFilingsLoading(true);
      setFilingsError(null);
      try {
        const result = await getReportFilingsResult(ticker);
        if (result.unsupported) {
          setUnsupported(result.message ?? "Reports not available for this exchange");
        } else {
          setFilings(result.filings);
        }
      } catch (err) {
        setFilingsError(err instanceof Error ? err.message : "Failed to load filings");
      } finally {
        setFilingsLoading(false);
      }
    }
    if (userId) {
      try {
        const sub = await getReportSubscription(userId, ticker);
        setSubscribed(!!sub);
      } catch {
        // non-fatal
      }
    }
  }, [ticker, filings.length, filingsLoading, userId, unsupported]);

  const handleOpen = useCallback(() => {
    Haptics.selectionAsync();
    if (!isPremium && !unsupported) {
      setPaywallOpen(true);
      return;
    }
    setOpen(true);
    ensureLoaded();
  }, [ensureLoaded, isPremium, unsupported]);

  const toggleSubscription = useCallback(async () => {
    if (!userId || subscribing) return;
    setSubscribing(true);
    try {
      if (subscribed) {
        await deleteReportSubscription(userId, ticker);
        setSubscribed(false);
      } else {
        await setReportSubscription(userId, ticker, "push");
        setSubscribed(true);
      }
    } catch (e) {
      // swallow — small UI affordance, retry on next tap
    } finally {
      setSubscribing(false);
    }
  }, [userId, subscribed, subscribing, ticker]);

  return (
    <>
      <View style={[styles.section, { paddingHorizontal: 16 }]}>
        <TouchableOpacity
          activeOpacity={0.8}
          onPress={handleOpen}
          style={[styles.launcher, { backgroundColor: colors.card, borderColor: colors.border }]}
          accessibilityLabel="Open SEC filings & reports"
        >
          <View style={[styles.iconCircle, { backgroundColor: `${colors.primary}1F` }]}>
            <Feather name="file-text" size={16} color={colors.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.launcherTitle, { color: colors.foreground }]}>SEC Reports</Text>
            <Text
              style={[styles.launcherSub, { color: colors.mutedForeground }]}
              numberOfLines={2}
            >
              {unsupported
                ? "US-listed companies only"
                : filingsError
                  ? filingsError
                  : latestType && latestDate
                    ? `Latest ${latestType} · ${formatDate(latestDate)}`
                    : "10-K & 10-Q filings with AI summaries"}
            </Text>
          </View>
          {!isPremium && !unsupported && (
            <View style={[styles.premiumPill, { borderColor: `${colors.primary}66`, backgroundColor: `${colors.primary}14` }]}>
              <Feather name="zap" size={10} color={colors.primary} />
              <Text style={[styles.premiumPillText, { color: colors.primary }]}>Premium</Text>
            </View>
          )}
          <Feather name="chevron-right" size={18} color={colors.mutedForeground} />
        </TouchableOpacity>
      </View>

      <ReportsModal
        visible={open}
        onClose={() => setOpen(false)}
        ticker={ticker}
        filings={filings}
        filingsLoading={filingsLoading}
        filingsError={filingsError}
        unsupported={unsupported}
        isPremium={isPremium}
        userId={userId ?? null}
        subscribed={subscribed}
        subscribing={subscribing}
        onToggleSubscription={toggleSubscription}
        onNeedPremium={() => setPaywallOpen(true)}
      />

      <PaywallSheet
        visible={paywallOpen}
        onClose={() => setPaywallOpen(false)}
        triggerReason="general"
        currentTier={tier}
      />
    </>
  );
}

// ── Modal ───────────────────────────────────────────────────────────────────
interface ModalProps {
  visible: boolean;
  onClose: () => void;
  ticker: string;
  filings: Filing[];
  filingsLoading: boolean;
  filingsError: string | null;
  unsupported: string | null;
  isPremium: boolean;
  userId: string | null;
  subscribed: boolean;
  subscribing: boolean;
  onToggleSubscription: () => void;
  onNeedPremium: () => void;
}

type ViewMode = "list" | "summary" | "compare";

function ReportsModal({
  visible,
  onClose,
  ticker,
  filings,
  filingsLoading,
  filingsError,
  unsupported,
  isPremium,
  userId,
  subscribed,
  subscribing,
  onToggleSubscription,
  onNeedPremium,
}: ModalProps) {
  const colors = useColors();

  // Group filings by year, defaulting selection to the most recent year.
  // Annual (10-K) rows are surfaced first within each year.
  const byYear = useMemo(() => {
    const m = new Map<number, Filing[]>();
    for (const f of filings) {
      const y = yearOf(f);
      const arr = m.get(y) ?? [];
      arr.push(f);
      m.set(y, arr);
    }
    for (const arr of m.values()) {
      arr.sort((a, b) => {
        if (a.type !== b.type) return a.type === "10-K" ? -1 : 1;
        return (b.filedAt ?? "").localeCompare(a.filedAt ?? "");
      });
    }
    return m;
  }, [filings]);

  const years = useMemo(
    () => Array.from(byYear.keys()).sort((a, b) => b - a),
    [byYear],
  );

  const [selectedYear, setSelectedYear] = useState<number | null>(null);
  // Reset to the most recent year whenever the available year set changes
  // (new ticker or fresh filings). Without this, `selectedYear` could point
  // at a year that no longer exists in `byYear` and render an empty list.
  useEffect(() => {
    if (!years.length) {
      setSelectedYear(null);
      return;
    }
    setSelectedYear((prev) => (prev && years.includes(prev) ? prev : years[0]));
  }, [years]);

  const [mode, setMode] = useState<ViewMode>("list");
  const [activeAccession, setActiveAccession] = useState<string | null>(null);
  const [compareSelection, setCompareSelection] = useState<string[]>([]);

  // Summary state — one for "summary" mode, two for "compare".
  const [summary, setSummary] = useState<SummaryResponse | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [compareSummaries, setCompareSummaries] = useState<
    [SummaryResponse | null, SummaryResponse | null]
  >([null, null]);
  const [compareLoading, setCompareLoading] = useState(false);
  const [compareError, setCompareError] = useState<string | null>(null);

  const resetSummary = useCallback(() => {
    setSummary(null);
    setSummaryError(null);
    setActiveAccession(null);
  }, []);

  const fetchSummary = useCallback(
    async (filing: Filing) => {
      if (!isPremium) {
        onNeedPremium();
        return;
      }
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      setMode("summary");
      setActiveAccession(filing.accessionNumber);
      setSummary(null);
      setSummaryError(null);
      setSummaryLoading(true);
      try {
        const data = await getReportSummary(ticker, filing.accessionNumber, userId);
        setSummary(data);
      } catch (err: unknown) {
        if (err instanceof PremiumRequiredError) {
          onNeedPremium();
          setMode("list");
          setActiveAccession(null);
        } else {
          const message = err instanceof Error ? err.message : "Failed to summarize report";
          const apiKeyMissing =
            message.includes("ANTHROPIC_API_KEY") || message === "HTTP 503";
          setSummaryError(
            apiKeyMissing ? "AI summaries unavailable — contact the admin" : message,
          );
        }
      } finally {
        setSummaryLoading(false);
      }
    },
    [ticker, isPremium, userId, onNeedPremium],
  );

  const toggleCompareSelection = useCallback((accession: string) => {
    setCompareSelection((prev) => {
      if (prev.includes(accession)) return prev.filter((a) => a !== accession);
      if (prev.length >= 2) return [prev[1], accession];
      return [...prev, accession];
    });
  }, []);

  const runCompare = useCallback(async () => {
    if (!isPremium) {
      onNeedPremium();
      return;
    }
    if (compareSelection.length !== 2) return;
    setMode("compare");
    setCompareLoading(true);
    setCompareError(null);
    setCompareSummaries([null, null]);
    try {
      const [a, b] = await Promise.all([
        getReportSummary(ticker, compareSelection[0], userId),
        getReportSummary(ticker, compareSelection[1], userId),
      ]);
      setCompareSummaries([a, b]);
    } catch (err: unknown) {
      if (err instanceof PremiumRequiredError) {
        onNeedPremium();
        setMode("list");
      } else {
        setCompareError(err instanceof Error ? err.message : "Comparison failed");
      }
    } finally {
      setCompareLoading(false);
    }
  }, [compareSelection, ticker, isPremium, userId, onNeedPremium]);

  const visibleFilings = selectedYear ? (byYear.get(selectedYear) ?? []) : [];
  const inCompareMode = mode === "list" && compareSelection.length > 0;

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose} presentationStyle="pageSheet">
      <View style={[styles.modalRoot, { backgroundColor: colors.background }]}>
        {/* Header */}
        <View style={[styles.modalHeader, { borderColor: colors.border }]}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.modalTitle, { color: colors.foreground }]}>
              {ticker} Reports
            </Text>
            <Text style={[styles.modalSubtitle, { color: colors.mutedForeground }]}>
              SEC 10-K & 10-Q with AI executive summaries
            </Text>
          </View>
          {/* Bell is hidden for unsupported (non-US) tickers — the worker
              can't resolve them via SEC EDGAR, so a subscription would never
              fire. */}
          {userId && !unsupported && (
            <TouchableOpacity
              onPress={onToggleSubscription}
              disabled={subscribing}
              style={[
                styles.bellBtn,
                {
                  backgroundColor: subscribed ? `${colors.primary}22` : "transparent",
                  borderColor: subscribed ? `${colors.primary}66` : colors.border,
                },
              ]}
              accessibilityLabel={subscribed ? "Unsubscribe from new filing alerts" : "Subscribe to new filing alerts"}
            >
              {subscribing ? (
                <ActivityIndicator size="small" color={colors.primary} />
              ) : (
                <Feather
                  name={subscribed ? "bell" : "bell-off"}
                  size={16}
                  color={subscribed ? colors.primary : colors.mutedForeground}
                />
              )}
            </TouchableOpacity>
          )}
          <TouchableOpacity
            onPress={onClose}
            style={[styles.closeBtn, { borderColor: colors.border }]}
            accessibilityLabel="Close reports"
          >
            <Feather name="x" size={18} color={colors.foreground} />
          </TouchableOpacity>
        </View>

        {/* Year tabs */}
        {!unsupported && years.length > 0 && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.yearStripWrap}
            contentContainerStyle={styles.yearStrip}
          >
            {years.map((y) => {
              const active = y === selectedYear;
              return (
                <TouchableOpacity
                  key={y}
                  onPress={() => {
                    setSelectedYear(y);
                    if (mode !== "list") {
                      setMode("list");
                      resetSummary();
                    }
                  }}
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
                    {y || "—"}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        )}

        {/* Body */}
        <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.modalBody}>
          {unsupported ? (
            <View style={[styles.emptyBox, { borderColor: colors.border }]}>
              <Feather name="globe" size={22} color={colors.mutedForeground} style={{ marginBottom: 8 }} />
              <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
                {unsupported}
              </Text>
            </View>
          ) : filingsLoading ? (
            <View style={styles.loadingRow}>
              <ActivityIndicator color={colors.primary} />
              <Text style={[styles.loadingText, { color: colors.mutedForeground }]}>
                Loading filings…
              </Text>
            </View>
          ) : filingsError ? (
            <View style={[styles.emptyBox, { borderColor: colors.border }]}>
              <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>{filingsError}</Text>
            </View>
          ) : !filings.length ? (
            <View style={[styles.emptyBox, { borderColor: colors.border }]}>
              <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
                No 10-K or 10-Q filings found for {ticker}.
              </Text>
            </View>
          ) : mode === "list" ? (
            <>
              {visibleFilings.map((f) => {
                const isAnnual = f.type === "10-K";
                const badgeBg = isAnnual ? `${colors.primary}1F` : `${colors.positive}1F`;
                const badgeBorder = isAnnual ? `${colors.primary}55` : `${colors.positive}55`;
                const badgeFg = isAnnual ? colors.primary : colors.positive;
                const isSelected = compareSelection.includes(f.accessionNumber);
                return (
                  <View
                    key={f.accessionNumber}
                    style={[
                      styles.filingRow,
                      {
                        backgroundColor: colors.card,
                        borderColor: isSelected ? `${colors.primary}88` : colors.border,
                      },
                    ]}
                  >
                    <TouchableOpacity
                      onPress={() => toggleCompareSelection(f.accessionNumber)}
                      style={[
                        styles.checkBox,
                        {
                          borderColor: isSelected ? colors.primary : colors.border,
                          backgroundColor: isSelected ? colors.primary : "transparent",
                        },
                      ]}
                      accessibilityLabel={isSelected ? "Deselect for compare" : "Select for compare"}
                    >
                      {isSelected && (
                        <Feather name="check" size={11} color={colors.primaryForeground} />
                      )}
                    </TouchableOpacity>
                    <View style={[styles.typeBadge, { backgroundColor: badgeBg, borderColor: badgeBorder }]}>
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
                        <Feather name="external-link" size={11} color={colors.mutedForeground} />
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={() => fetchSummary(f)}
                        style={[styles.summarizeBtn, { backgroundColor: colors.primary }]}
                      >
                        <Feather name="zap" size={11} color={colors.primaryForeground} />
                        <Text style={[styles.summarizeBtnText, { color: colors.primaryForeground }]}>
                          {isPremium ? "Summarize" : "Premium"}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                );
              })}
            </>
          ) : mode === "summary" ? (
            <SummaryCard
              summary={summary}
              loading={summaryLoading}
              error={summaryError}
              activeAccession={activeAccession}
              onBack={() => {
                setMode("list");
                resetSummary();
              }}
            />
          ) : (
            <CompareView
              loading={compareLoading}
              error={compareError}
              left={compareSummaries[0]}
              right={compareSummaries[1]}
              onBack={() => {
                setMode("list");
                setCompareSummaries([null, null]);
                setCompareError(null);
              }}
            />
          )}
        </ScrollView>

        {/* Compare action bar */}
        {inCompareMode && (
          <View style={[styles.compareBar, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.compareCount, { color: colors.mutedForeground }]}>
              {compareSelection.length} of 2 selected
            </Text>
            <View style={{ flex: 1 }} />
            <TouchableOpacity
              onPress={() => setCompareSelection([])}
              style={[styles.linkBtn, { borderColor: colors.border, paddingHorizontal: 10 }]}
            >
              <Text style={[styles.linkBtnText, { color: colors.mutedForeground }]}>Clear</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={runCompare}
              disabled={compareSelection.length !== 2}
              style={[
                styles.compareGoBtn,
                {
                  backgroundColor:
                    compareSelection.length === 2 ? colors.primary : colors.secondary,
                  opacity: compareSelection.length === 2 ? 1 : 0.6,
                },
              ]}
            >
              <Feather name="columns" size={11} color={colors.primaryForeground} />
              <Text style={[styles.compareGoText, { color: colors.primaryForeground }]}>
                Compare
              </Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </Modal>
  );
}

// ── Summary card ────────────────────────────────────────────────────────────
function SummaryCard({
  summary,
  loading,
  error,
  activeAccession,
  onBack,
}: {
  summary: SummaryResponse | null;
  loading: boolean;
  error: string | null;
  activeAccession: string | null;
  onBack: () => void;
}) {
  const colors = useColors();

  const sentimentStyle = useMemo(() => {
    if (!summary) return null;
    const s = summary.summary.sentiment;
    if (s === "positive") {
      return { bg: `${colors.positive}22`, border: `${colors.positive}44`, fg: colors.positive, label: "Positive", icon: "trending-up" as const };
    }
    if (s === "negative") {
      return { bg: `${colors.negative}22`, border: `${colors.negative}44`, fg: colors.negative, label: "Negative", icon: "trending-down" as const };
    }
    return { bg: `${colors.warning}22`, border: `${colors.warning}44`, fg: colors.warning, label: "Neutral", icon: "minus" as const };
  }, [summary, colors.positive, colors.negative, colors.warning]);

  return (
    <View style={{ gap: 12 }}>
      <TouchableOpacity onPress={onBack} style={styles.backRow}>
        <Feather name="chevron-left" size={16} color={colors.primary} />
        <Text style={[styles.backText, { color: colors.primary }]}>Back to filings</Text>
      </TouchableOpacity>

      {loading && activeAccession && (
        <View style={[styles.summaryCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.skeletonHeadline}>
            <ActivityIndicator color={colors.primary} />
            <Text style={[styles.loadingText, { color: colors.mutedForeground }]}>
              Reading filing & generating summary…
            </Text>
          </View>
        </View>
      )}

      {error && (
        <View style={[styles.summaryCard, { backgroundColor: `${colors.negative}10`, borderColor: `${colors.negative}40` }]}>
          <Text style={[styles.errorText, { color: colors.negative }]}>{error}</Text>
        </View>
      )}

      {summary && sentimentStyle && (
        <View style={[styles.summaryCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.summaryHeader}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.periodLabel, { color: colors.mutedForeground }]}>
                {summary.summary.period} · {summary.type}
              </Text>
              <Text style={[styles.headline, { color: colors.foreground }]}>
                {summary.summary.headline}
              </Text>
            </View>
            <View style={[styles.sentimentBadge, { backgroundColor: sentimentStyle.bg, borderColor: sentimentStyle.border }]}>
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
                { label: "Operating Cash Flow", value: summary.summary.keyMetrics.operatingCashFlow },
              ] as const
            ).map((m) => (
              <View key={m.label} style={[styles.metricItem, { backgroundColor: colors.secondary, borderColor: colors.border }]}>
                <Text style={[styles.metricLabel, { color: colors.mutedForeground }]}>{m.label}</Text>
                <Text style={[styles.metricValue, { color: colors.foreground }]} numberOfLines={2}>
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
            <View style={[styles.analystBox, { backgroundColor: `${colors.primary}0F`, borderColor: `${colors.primary}33` }]}>
              <Text style={[styles.analystLabel, { color: colors.primary }]}>Analyst note</Text>
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

// ── Compare view ────────────────────────────────────────────────────────────
function CompareView({
  loading,
  error,
  left,
  right,
  onBack,
}: {
  loading: boolean;
  error: string | null;
  left: SummaryResponse | null;
  right: SummaryResponse | null;
  onBack: () => void;
}) {
  const colors = useColors();
  const metricKeys = [
    { key: "revenue", label: "Revenue" },
    { key: "netIncome", label: "Net Income" },
    { key: "eps", label: "EPS" },
    { key: "operatingCashFlow", label: "Op. Cash Flow" },
  ] as const;

  return (
    <View style={{ gap: 12 }}>
      <TouchableOpacity onPress={onBack} style={styles.backRow}>
        <Feather name="chevron-left" size={16} color={colors.primary} />
        <Text style={[styles.backText, { color: colors.primary }]}>Back to filings</Text>
      </TouchableOpacity>

      {loading && (
        <View style={[styles.summaryCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.skeletonHeadline}>
            <ActivityIndicator color={colors.primary} />
            <Text style={[styles.loadingText, { color: colors.mutedForeground }]}>
              Generating comparison…
            </Text>
          </View>
        </View>
      )}

      {error && (
        <View style={[styles.summaryCard, { backgroundColor: `${colors.negative}10`, borderColor: `${colors.negative}40` }]}>
          <Text style={[styles.errorText, { color: colors.negative }]}>{error}</Text>
        </View>
      )}

      {left && right && (
        <>
          <View style={styles.compareCols}>
            <CompareColumn s={left} />
            <CompareColumn s={right} />
          </View>

          <View style={[styles.summaryCard, { backgroundColor: colors.card, borderColor: colors.border, gap: 8 }]}>
            <Text style={[styles.subhead, { color: colors.foreground }]}>Side-by-side metrics</Text>
            {metricKeys.map((m) => (
              <View key={m.key} style={styles.compareMetricRow}>
                <Text style={[styles.compareMetricLabel, { color: colors.mutedForeground }]}>
                  {m.label}
                </Text>
                <Text style={[styles.compareMetricValue, { color: colors.foreground }]} numberOfLines={1}>
                  {(left.summary.keyMetrics as any)[m.key] || "—"}
                </Text>
                <Text style={[styles.compareMetricValue, { color: colors.foreground }]} numberOfLines={1}>
                  {(right.summary.keyMetrics as any)[m.key] || "—"}
                </Text>
              </View>
            ))}
          </View>
        </>
      )}
    </View>
  );
}

function CompareColumn({ s }: { s: SummaryResponse }) {
  const colors = useColors();
  return (
    <View style={[styles.compareCol, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <Text style={[styles.periodLabel, { color: colors.mutedForeground }]}>
        {s.summary.period} · {s.type}
      </Text>
      <Text style={[styles.compareHeadline, { color: colors.foreground }]} numberOfLines={4}>
        {s.summary.headline}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { paddingBottom: 12 },

  launcher: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  iconCircle: { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  launcherTitle: { fontSize: 14, fontFamily: "Inter_700Bold", marginBottom: 2 },
  launcherSub: { fontSize: 12, fontFamily: "Inter_400Regular" },
  premiumPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 12,
    borderWidth: 1,
  },
  premiumPillText: { fontSize: 10, fontFamily: "Inter_700Bold" },

  // Modal
  modalRoot: { flex: 1 },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    gap: 10,
  },
  modalTitle: { fontSize: 18, fontFamily: "Inter_700Bold" },
  modalSubtitle: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
  bellBtn: { width: 36, height: 36, borderRadius: 18, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  closeBtn: { width: 36, height: 36, borderRadius: 18, borderWidth: 1, alignItems: "center", justifyContent: "center" },

  // Constrain the horizontal year strip to its content height. Without
  // `flexGrow: 0` it stretches to fill the modal vertically and the
  // `alignItems: "center"` on the inner row visually drops the chips into
  // the middle of all that empty space.
  yearStripWrap: { flexGrow: 0, flexShrink: 0 },
  yearStrip: { paddingHorizontal: 16, paddingVertical: 8, gap: 6, alignItems: "center" },
  yearChip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
    borderWidth: 1,
    marginRight: 6,
    minWidth: 48,
    alignItems: "center",
  },
  yearChipText: { fontSize: 11, fontFamily: "Inter_700Bold", letterSpacing: 0.2 },

  modalBody: { padding: 16, gap: 8 },

  loadingRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 18 },
  loadingText: { fontSize: 13, fontFamily: "Inter_400Regular" },

  emptyBox: { padding: 20, borderRadius: 12, borderWidth: 1, borderStyle: "dashed", alignItems: "center" },
  emptyText: { fontSize: 13, fontFamily: "Inter_400Regular", textAlign: "center" },

  filingRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    gap: 10,
    marginBottom: 8,
  },
  checkBox: {
    width: 20,
    height: 20,
    borderRadius: 5,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
  },
  typeBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, borderWidth: 1, minWidth: 50, alignItems: "center" },
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
    paddingVertical: 7,
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
    minWidth: 88,
    justifyContent: "center",
  },
  summarizeBtnText: { fontSize: 11, fontFamily: "Inter_700Bold" },

  backRow: { flexDirection: "row", alignItems: "center", gap: 4, paddingVertical: 4 },
  backText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },

  summaryCard: { padding: 16, borderRadius: 14, borderWidth: 1, gap: 14 },
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
  sentimentBadge: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 16, borderWidth: 1 },
  sentimentBadgeText: { fontSize: 11, fontFamily: "Inter_700Bold" },

  metricsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  metricItem: { width: "48%", flexGrow: 1, padding: 12, borderRadius: 10, borderWidth: 1, gap: 4 },
  metricLabel: { fontSize: 11, fontFamily: "Inter_400Regular" },
  metricValue: { fontSize: 14, fontFamily: "Inter_700Bold" },

  highlightsBlock: { gap: 8 },
  subhead: { fontSize: 13, fontFamily: "Inter_700Bold" },
  bulletRow: { flexDirection: "row", alignItems: "flex-start", gap: 8, paddingRight: 4 },
  bullet: { width: 6, height: 6, borderRadius: 3, marginTop: 7 },
  bulletText: { flex: 1, fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 19 },

  analystBox: { padding: 12, borderRadius: 10, borderWidth: 1, gap: 4 },
  analystLabel: { fontSize: 10, fontFamily: "Inter_700Bold", textTransform: "uppercase", letterSpacing: 0.5 },
  analystText: { fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 19, fontStyle: "italic" },

  fullReportBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 10, borderRadius: 10, borderWidth: 1 },
  fullReportText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },

  compareCols: { flexDirection: "row", gap: 8 },
  compareCol: { flex: 1, padding: 12, borderRadius: 10, borderWidth: 1, gap: 6 },
  compareHeadline: { fontSize: 13, fontFamily: "Inter_700Bold", lineHeight: 18 },
  compareMetricRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  compareMetricLabel: { width: 110, fontSize: 11, fontFamily: "Inter_600SemiBold" },
  compareMetricValue: { flex: 1, fontSize: 12, fontFamily: "Inter_600SemiBold", textAlign: "right" },

  compareBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderTopWidth: 1,
  },
  compareCount: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  compareGoBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
  },
  compareGoText: { fontSize: 12, fontFamily: "Inter_700Bold" },
});
