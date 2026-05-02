import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import { useAuth } from "@clerk/expo";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { useHoldings } from "@/context/HoldingsContext";
import { useSubscription } from "@/context/SubscriptionContext";
import { getQuotes, type QuoteResult } from "@/services/stockApi";
import {
  getDividends,
  getPnl,
  holdingsCsvExportUrl,
  type DividendEvent,
  type Holding,
  type PnlResponse,
} from "@/services/holdingsApi";
import { PremiumGate } from "@/components/PremiumGate";
import { computeExposure } from "@/lib/geoMath";
import { confirmAsync } from "@/utils/confirm";

type Colors = ReturnType<typeof useColors>;

const FREE_HOLDINGS_LIMIT = 5;

interface HoldingMetrics {
  totalQty: number;
  totalCost: number;
  avgCost: number;
  currentPrice: number | null;
  currentValue: number | null;
  returnPct: number | null;
}

function metricsFor(holding: Holding, quote: QuoteResult | undefined): HoldingMetrics {
  let totalQty = 0;
  let totalCost = 0;
  for (const lot of holding.lots) {
    const qty = Number(lot.qty);
    const cost = Number(lot.cost_per_share);
    if (Number.isFinite(qty) && Number.isFinite(cost)) {
      totalQty += qty;
      totalCost += qty * cost;
    }
  }
  const avgCost = totalQty > 0 ? totalCost / totalQty : 0;
  const currentPrice = quote?.regularMarketPrice ?? null;
  const currentValue = currentPrice != null ? totalQty * currentPrice : null;
  const returnPct =
    currentValue != null && totalCost > 0
      ? ((currentValue - totalCost) / totalCost) * 100
      : null;
  return { totalQty, totalCost, avgCost, currentPrice, currentValue, returnPct };
}

function formatMoney(n: number | null, currency = "USD"): string {
  if (n == null || !Number.isFinite(n)) return "—";
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(n);
  } catch {
    return `${currency} ${n.toFixed(2)}`;
  }
}

function formatPct(n: number | null): string {
  if (n == null || !Number.isFinite(n)) return "—";
  const sign = n >= 0 ? "+" : "";
  return `${sign}${n.toFixed(2)}%`;
}

export default function PortfolioScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { tier } = useSubscription();
  const { userId } = useAuth();
  const {
    enabled,
    hydrated,
    holdings,
    loading,
    refresh,
    add,
    remove,
  } = useHoldings();

  const [quotes, setQuotes] = useState<Map<string, QuoteResult>>(new Map());
  const [quotesLoading, setQuotesLoading] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [dividends, setDividends] = useState<DividendEvent[]>([]);
  const [pnl, setPnl] = useState<PnlResponse | null>(null);

  const isProOrBetter = tier === "pro" || tier === "premium";
  const atFreeCap = !isProOrBetter && holdings.length >= FREE_HOLDINGS_LIMIT;

  const loadQuotes = useCallback(async () => {
    if (!holdings.length) {
      setQuotes(new Map());
      return;
    }
    setQuotesLoading(true);
    try {
      const tickers = holdings.map((h) => h.ticker.toUpperCase());
      const results = await getQuotes(tickers);
      const map = new Map<string, QuoteResult>();
      for (const q of results) map.set(q.symbol.toUpperCase(), q);
      setQuotes(map);
    } catch {
      // Quotes are best-effort; the list still renders without them.
    } finally {
      setQuotesLoading(false);
    }
  }, [holdings]);

  const loadDividends = useCallback(async () => {
    if (!userId || !holdings.length) {
      setDividends([]);
      return;
    }
    const res = await getDividends(userId);
    setDividends(res.dividends);
  }, [userId, holdings.length]);

  const loadPnl = useCallback(async () => {
    if (!userId || !holdings.length) {
      setPnl(null);
      return;
    }
    const res = await getPnl(userId);
    setPnl(res);
  }, [userId, holdings.length]);

  useEffect(() => {
    loadQuotes();
  }, [loadQuotes]);

  useEffect(() => {
    loadDividends();
  }, [loadDividends]);

  useEffect(() => {
    loadPnl();
  }, [loadPnl]);

  const exposure = useMemo(
    () => computeExposure(holdings, quotes),
    [holdings, quotes],
  );

  const handleExportCsv = useCallback(() => {
    if (!userId) return;
    const url = holdingsCsvExportUrl(userId);
    Linking.openURL(url).catch(() => {
      Alert.alert("Could not open CSV", "Open the link in your browser instead.");
    });
  }, [userId]);

  const totals = useMemo(() => {
    let value = 0;
    let cost = 0;
    let valueKnown = false;
    for (const h of holdings) {
      const m = metricsFor(h, quotes.get(h.ticker.toUpperCase()));
      cost += m.totalCost;
      if (m.currentValue != null) {
        value += m.currentValue;
        valueKnown = true;
      }
    }
    const returnPct = valueKnown && cost > 0 ? ((value - cost) / cost) * 100 : null;
    return { value: valueKnown ? value : null, cost, returnPct };
  }, [holdings, quotes]);

  const handleRefresh = useCallback(async () => {
    await refresh();
    await Promise.all([loadQuotes(), loadDividends(), loadPnl()]);
  }, [refresh, loadQuotes, loadDividends, loadPnl]);

  const handleDelete = useCallback(
    async (h: Holding) => {
      const ok = await confirmAsync(
        `Delete ${h.ticker}?`,
        "This removes the holding and all of its lots. This cannot be undone.",
        { confirmText: "Delete", destructive: true },
      );
      if (!ok) return;
      const res = await remove(h.id);
      if (res !== true) Alert.alert("Could not delete", res.error);
    },
    [remove],
  );

  if (!hydrated) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (!enabled) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background, paddingTop: insets.top }]}>
        <Feather name="lock" size={32} color={colors.mutedForeground} />
        <Text style={[styles.emptyTitle, { color: colors.foreground, marginTop: 12 }]}>
          Portfolio coming soon
        </Text>
        <Text style={[styles.emptyDesc, { color: colors.mutedForeground }]}>
          This feature isn't available yet on your account.
        </Text>
      </View>
    );
  }

  return (
    <View style={[styles.root, { backgroundColor: colors.background, paddingTop: insets.top }]}>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.headerTitle, { color: colors.foreground }]}>Portfolio</Text>
          <Text style={[styles.headerSubtitle, { color: colors.mutedForeground }]}>
            {holdings.length} {holdings.length === 1 ? "holding" : "holdings"}
            {!isProOrBetter ? ` of ${FREE_HOLDINGS_LIMIT}` : ""}
          </Text>
        </View>
        <TouchableOpacity
          style={[
            styles.addBtn,
            {
              backgroundColor: atFreeCap ? colors.muted : colors.primary,
              opacity: atFreeCap ? 0.6 : 1,
            },
          ]}
          onPress={async () => {
            if (atFreeCap) {
              const ok = await confirmAsync(
                "Free plan limit reached",
                `You can track up to ${FREE_HOLDINGS_LIMIT} holdings on the Free plan. Upgrade to Pro for unlimited holdings.`,
                { confirmText: "Upgrade", cancelText: "Maybe later" },
              );
              if (ok) router.push("/(tabs)/account");
              return;
            }
            setAddOpen(true);
          }}
          activeOpacity={0.7}
        >
          <Feather name="plus" size={16} color={colors.primaryForeground} />
          <Text style={[styles.addBtnText, { color: colors.primaryForeground }]}>Add</Text>
        </TouchableOpacity>
      </View>

      <View style={[styles.summaryCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <View style={styles.summaryRow}>
          <Text style={[styles.summaryLabel, { color: colors.mutedForeground }]}>Total value</Text>
          <Text style={[styles.summaryValue, { color: colors.foreground }]}>
            {formatMoney(totals.value)}
          </Text>
        </View>
        <View style={styles.summaryRow}>
          <Text style={[styles.summaryLabel, { color: colors.mutedForeground }]}>Cost basis</Text>
          <Text style={[styles.summaryValue, { color: colors.foreground }]}>
            {formatMoney(totals.cost)}
          </Text>
        </View>
        <View style={styles.summaryRow}>
          <Text style={[styles.summaryLabel, { color: colors.mutedForeground }]}>Return</Text>
          <Text
            style={[
              styles.summaryValue,
              {
                color:
                  totals.returnPct == null
                    ? colors.foreground
                    : totals.returnPct >= 0
                    ? colors.positive
                    : colors.negative,
              },
            ]}
          >
            {formatPct(totals.returnPct)}
          </Text>
        </View>
      </View>

      {!holdings.length && !loading ? (
        <View style={styles.empty}>
          <Feather name="briefcase" size={36} color={colors.mutedForeground} />
          <Text style={[styles.emptyTitle, { color: colors.foreground, marginTop: 12 }]}>
            No holdings yet
          </Text>
          <Text style={[styles.emptyDesc, { color: colors.mutedForeground }]}>
            Track stocks you own and see their performance over time.
          </Text>
        </View>
      ) : (
        <FlatList
          data={holdings}
          keyExtractor={(h) => h.id}
          contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
          refreshControl={
            <RefreshControl
              refreshing={loading || quotesLoading}
              onRefresh={handleRefresh}
              tintColor={colors.primary}
            />
          }
          renderItem={({ item }) => {
            const m = metricsFor(item, quotes.get(item.ticker.toUpperCase()));
            const returnColor =
              m.returnPct == null
                ? colors.mutedForeground
                : m.returnPct >= 0
                ? colors.positive
                : colors.negative;
            return (
              <TouchableOpacity
                style={[styles.row, { backgroundColor: colors.card, borderColor: colors.border }]}
                onLongPress={() => handleDelete(item)}
                activeOpacity={0.7}
              >
                <View style={{ flex: 1 }}>
                  <Text style={[styles.rowTicker, { color: colors.foreground }]}>{item.ticker}</Text>
                  <Text style={[styles.rowMeta, { color: colors.mutedForeground }]}>
                    {m.totalQty.toLocaleString()} sh · avg {formatMoney(m.avgCost, item.currency)}
                  </Text>
                </View>
                <View style={{ alignItems: "flex-end" }}>
                  <Text style={[styles.rowValue, { color: colors.foreground }]}>
                    {formatMoney(m.currentValue, item.currency)}
                  </Text>
                  <Text style={[styles.rowReturn, { color: returnColor }]}>
                    {formatPct(m.returnPct)}
                  </Text>
                </View>
              </TouchableOpacity>
            );
          }}
          ListFooterComponent={
            <View style={styles.footerStack}>
              <PremiumGate
                feature="realized_pnl"
                title="Performance"
                pitch="Realized + unrealized P&L across your holdings, FIFO cost basis."
                surface="insights"
                style={styles.footerCard}
              >
                <PerformanceCard pnl={pnl} colors={colors} />
              </PremiumGate>

              <PremiumGate
                feature="dividend_calendar"
                title="Dividend Calendar"
                pitch="See upcoming ex-dates and payouts for the stocks you own."
                surface="insights"
                style={styles.footerCard}
              >
                <DividendCard
                  dividends={dividends}
                  holdings={holdings}
                  colors={colors}
                />
              </PremiumGate>

              <PremiumGate
                feature="geo_currency_exposure"
                title="Exposure"
                pitch="Country and currency mix across your portfolio."
                surface="insights"
                style={styles.footerCard}
              >
                <ExposureCard breakdown={exposure} colors={colors} />
              </PremiumGate>

              <PremiumGate
                feature="csv_export_basic"
                title="Export CSV"
                pitch="Download holdings + lots for your accountant or spreadsheet."
                surface="insights"
                style={styles.footerCard}
              >
                <TouchableOpacity
                  style={[
                    styles.exportBtn,
                    { backgroundColor: colors.card, borderColor: colors.border },
                  ]}
                  onPress={handleExportCsv}
                  activeOpacity={0.7}
                >
                  <Feather name="download" size={16} color={colors.foreground} />
                  <Text style={[styles.exportBtnText, { color: colors.foreground }]}>
                    Export CSV
                  </Text>
                </TouchableOpacity>
              </PremiumGate>
            </View>
          }
        />
      )}

      <AddHoldingModal
        visible={addOpen}
        onClose={() => setAddOpen(false)}
        onSubmit={async (input) => {
          const res = await add(input);
          if ("error" in res) {
            const msg =
              res.error === "holdings_limit_reached"
                ? `Free plan tracks up to ${res.limit ?? FREE_HOLDINGS_LIMIT} holdings. Upgrade to Pro for unlimited.`
                : res.error;
            return msg;
          }
          await loadQuotes();
          return null;
        }}
        colors={colors}
      />
    </View>
  );
}

interface AddHoldingModalProps {
  visible: boolean;
  onClose: () => void;
  onSubmit: (input: {
    ticker: string;
    qty: number;
    cost_per_share: number;
    purchased_at: string;
    currency: string;
  }) => Promise<string | null>;
  colors: Colors;
}

function AddHoldingModal({ visible, onClose, onSubmit, colors }: AddHoldingModalProps) {
  const [ticker, setTicker] = useState("");
  const [qty, setQty] = useState("");
  const [cost, setCost] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [currency, setCurrency] = useState("USD");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = useCallback(() => {
    setTicker("");
    setQty("");
    setCost("");
    setDate(new Date().toISOString().slice(0, 10));
    setCurrency("USD");
    setError(null);
  }, []);

  const handleClose = useCallback(() => {
    if (submitting) return;
    reset();
    onClose();
  }, [submitting, reset, onClose]);

  const handleSave = useCallback(async () => {
    setError(null);
    const tickerNorm = ticker.trim().toUpperCase();
    const qtyN = Number(qty);
    const costN = Number(cost);
    if (!tickerNorm) return setError("Ticker is required");
    if (!Number.isFinite(qtyN) || qtyN <= 0) return setError("Quantity must be a positive number");
    if (!Number.isFinite(costN) || costN <= 0) return setError("Cost per share must be a positive number");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return setError("Date must be YYYY-MM-DD");
    setSubmitting(true);
    try {
      const err = await onSubmit({
        ticker: tickerNorm,
        qty: qtyN,
        cost_per_share: costN,
        purchased_at: date,
        currency: currency.trim().toUpperCase() || "USD",
      });
      if (err) {
        setError(err);
        return;
      }
      reset();
      onClose();
    } finally {
      setSubmitting(false);
    }
  }, [ticker, qty, cost, date, currency, onSubmit, reset, onClose]);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={handleClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={modalStyles.overlay}
      >
        <View style={[modalStyles.sheet, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={modalStyles.header}>
            <Text style={[modalStyles.title, { color: colors.foreground }]}>Add holding</Text>
            <TouchableOpacity onPress={handleClose} disabled={submitting}>
              <Feather name="x" size={20} color={colors.mutedForeground} />
            </TouchableOpacity>
          </View>

          <ScrollView keyboardShouldPersistTaps="handled">
            <Field label="Ticker" colors={colors}>
              <TextInput
                value={ticker}
                onChangeText={setTicker}
                placeholder="AAPL"
                placeholderTextColor={colors.mutedForeground}
                autoCapitalize="characters"
                autoCorrect={false}
                style={[modalStyles.input, { color: colors.foreground, borderColor: colors.border }]}
              />
            </Field>
            <Field label="Quantity" colors={colors}>
              <TextInput
                value={qty}
                onChangeText={setQty}
                placeholder="10"
                placeholderTextColor={colors.mutedForeground}
                keyboardType="decimal-pad"
                style={[modalStyles.input, { color: colors.foreground, borderColor: colors.border }]}
              />
            </Field>
            <Field label="Cost per share" colors={colors}>
              <TextInput
                value={cost}
                onChangeText={setCost}
                placeholder="150.25"
                placeholderTextColor={colors.mutedForeground}
                keyboardType="decimal-pad"
                style={[modalStyles.input, { color: colors.foreground, borderColor: colors.border }]}
              />
            </Field>
            <Field label="Purchase date (YYYY-MM-DD)" colors={colors}>
              <TextInput
                value={date}
                onChangeText={setDate}
                placeholder="2024-01-15"
                placeholderTextColor={colors.mutedForeground}
                autoCorrect={false}
                style={[modalStyles.input, { color: colors.foreground, borderColor: colors.border }]}
              />
            </Field>
            <Field label="Currency" colors={colors}>
              <TextInput
                value={currency}
                onChangeText={setCurrency}
                placeholder="USD"
                placeholderTextColor={colors.mutedForeground}
                autoCapitalize="characters"
                autoCorrect={false}
                maxLength={3}
                style={[modalStyles.input, { color: colors.foreground, borderColor: colors.border }]}
              />
            </Field>

            {error && (
              <Text style={[modalStyles.error, { color: colors.negative }]}>{error}</Text>
            )}

            <TouchableOpacity
              style={[
                modalStyles.saveBtn,
                { backgroundColor: colors.primary, opacity: submitting ? 0.6 : 1 },
              ]}
              onPress={handleSave}
              disabled={submitting}
              activeOpacity={0.7}
            >
              {submitting ? (
                <ActivityIndicator color={colors.primaryForeground} />
              ) : (
                <Text style={[modalStyles.saveBtnText, { color: colors.primaryForeground }]}>
                  Save
                </Text>
              )}
            </TouchableOpacity>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function Field({
  label,
  children,
  colors,
}: {
  label: string;
  children: React.ReactNode;
  colors: Colors;
}) {
  return (
    <View style={modalStyles.field}>
      <Text style={[modalStyles.fieldLabel, { color: colors.mutedForeground }]}>{label}</Text>
      {children}
    </View>
  );
}

// ── Dividend calendar card ────────────────────────────────────────────────
// Sums each upcoming ex-date's amount × user-held qty. The amount is per-
// share (Yahoo summaryDetail.lastDividendValue), so multiplying by qty gives
// an estimated total payout for the user. Empty list shows a friendly note
// instead of an empty card.
function DividendCard({
  dividends,
  holdings,
  colors,
}: {
  dividends: DividendEvent[];
  holdings: Holding[];
  colors: Colors;
}) {
  const qtyByTicker = useMemo(() => {
    const m = new Map<string, number>();
    for (const h of holdings) {
      let q = 0;
      for (const lot of h.lots) {
        const n = Number(lot.qty);
        if (Number.isFinite(n)) q += n;
      }
      m.set(h.ticker.toUpperCase(), q);
    }
    return m;
  }, [holdings]);

  return (
    <View style={[styles.cardSurface, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <Text style={[styles.cardTitle, { color: colors.foreground }]}>Dividend Calendar</Text>
      {dividends.length === 0 ? (
        <Text style={[styles.cardEmpty, { color: colors.mutedForeground }]}>
          No upcoming ex-dates for your tickers yet.
        </Text>
      ) : (
        dividends.slice(0, 8).map((d, i) => {
          const qty = qtyByTicker.get(d.ticker.toUpperCase()) ?? 0;
          const amt = d.amount != null ? Number(d.amount) : null;
          const total = amt != null && qty > 0 ? amt * qty : null;
          return (
            <View key={`${d.ticker}-${d.ex_date}-${i}`} style={styles.divRow}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.divTicker, { color: colors.foreground }]}>{d.ticker}</Text>
                <Text style={[styles.divMeta, { color: colors.mutedForeground }]}>
                  Ex {d.ex_date}
                  {d.pay_date ? ` · Pays ${d.pay_date}` : ""}
                </Text>
              </View>
              <View style={{ alignItems: "flex-end" }}>
                <Text style={[styles.divAmount, { color: colors.foreground }]}>
                  {amt != null
                    ? formatMoney(amt, d.currency || "USD")
                    : "—"}
                </Text>
                <Text style={[styles.divMeta, { color: colors.mutedForeground }]}>
                  {total != null
                    ? `~${formatMoney(total, d.currency || "USD")}`
                    : `${qty.toLocaleString()} sh`}
                </Text>
              </View>
            </View>
          );
        })
      )}
    </View>
  );
}

// ── Exposure card ─────────────────────────────────────────────────────────
// Two stacked bar lists: country and currency. Bar width tracks the % of
// portfolio value. Sorted descending so the dominant exposures land on top.
function ExposureCard({
  breakdown,
  colors,
}: {
  breakdown: { byCountry: Record<string, number>; byCurrency: Record<string, number> };
  colors: Colors;
}) {
  const countries = Object.entries(breakdown.byCountry).sort((a, b) => b[1] - a[1]);
  const currencies = Object.entries(breakdown.byCurrency).sort((a, b) => b[1] - a[1]);
  const isEmpty = countries.length === 0 && currencies.length === 0;

  return (
    <View style={[styles.cardSurface, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <Text style={[styles.cardTitle, { color: colors.foreground }]}>Exposure</Text>
      {isEmpty ? (
        <Text style={[styles.cardEmpty, { color: colors.mutedForeground }]}>
          Live quotes are loading — check back in a moment.
        </Text>
      ) : (
        <>
          <Text style={[styles.exposureSubhead, { color: colors.mutedForeground }]}>
            By country
          </Text>
          {countries.map(([name, pct]) => (
            <ExposureRow key={`c-${name}`} label={name} pct={pct} colors={colors} />
          ))}
          <Text
            style={[
              styles.exposureSubhead,
              { color: colors.mutedForeground, marginTop: 12 },
            ]}
          >
            By currency
          </Text>
          {currencies.map(([name, pct]) => (
            <ExposureRow key={`x-${name}`} label={name} pct={pct} colors={colors} />
          ))}
        </>
      )}
    </View>
  );
}

function ExposureRow({
  label,
  pct,
  colors,
}: {
  label: string;
  pct: number;
  colors: Colors;
}) {
  const width = `${Math.max(0, Math.min(100, pct))}%` as const;
  return (
    <View style={styles.exposureRow}>
      <View style={{ flex: 1 }}>
        <View style={styles.exposureRowHead}>
          <Text style={[styles.exposureLabel, { color: colors.foreground }]}>{label}</Text>
          <Text style={[styles.exposurePct, { color: colors.mutedForeground }]}>
            {pct.toFixed(1)}%
          </Text>
        </View>
        <View style={[styles.exposureBarBg, { backgroundColor: colors.muted }]}>
          <View style={[styles.exposureBarFill, { backgroundColor: colors.primary, width }]} />
        </View>
      </View>
    </View>
  );
}

// ── Performance card (Realized + unrealized P&L) ─────────────────────────
// Server returns USD-normalised totals via the FIFO cost-basis engine. Sale
// recording UI is out of scope for this PR — until that lands, ytdRealized
// and lifetimeRealized stay at 0 and only the unrealized + cost-basis rows
// show movement.
function PerformanceCard({
  pnl,
  colors,
}: {
  pnl: PnlResponse | null;
  colors: Colors;
}) {
  const currency = pnl?.currency ?? "USD";
  return (
    <View style={[styles.cardSurface, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <Text style={[styles.cardTitle, { color: colors.foreground }]}>Performance</Text>
      {pnl == null ? (
        <Text style={[styles.cardEmpty, { color: colors.mutedForeground }]}>
          Live quotes are loading — check back in a moment.
        </Text>
      ) : (
        <>
          <PnlRow label="YTD Realized" value={pnl.ytdRealized} currency={currency} colors={colors} />
          <PnlRow label="Lifetime Realized" value={pnl.lifetimeRealized} currency={currency} colors={colors} />
          <PnlRow label="Unrealized" value={pnl.unrealized} currency={currency} colors={colors} />
          <PnlRow label="Cost Basis" value={pnl.totalCostBasis} currency={currency} colors={colors} neutral />
        </>
      )}
    </View>
  );
}

function PnlRow({
  label,
  value,
  currency,
  colors,
  neutral = false,
}: {
  label: string;
  value: number;
  currency: string;
  colors: Colors;
  neutral?: boolean;
}) {
  const valueColor = neutral
    ? colors.foreground
    : value > 0
    ? colors.positive
    : value < 0
    ? colors.negative
    : colors.foreground;
  return (
    <View style={styles.pnlRow}>
      <Text style={[styles.pnlLabel, { color: colors.mutedForeground }]}>{label}</Text>
      <Text style={[styles.pnlValue, { color: valueColor }]}>
        {formatMoney(value, currency)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  center: { flex: 1, justifyContent: "center", alignItems: "center", padding: 24 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 12,
  },
  headerTitle: { fontSize: 24, fontFamily: "Inter_700Bold" },
  headerSubtitle: { fontSize: 13, fontFamily: "Inter_400Regular", marginTop: 2 },
  addBtn: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    gap: 6,
  },
  addBtnText: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  summaryCard: {
    marginHorizontal: 16,
    marginBottom: 16,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
  },
  summaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 6,
  },
  summaryLabel: { fontSize: 13, fontFamily: "Inter_400Regular" },
  summaryValue: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  empty: { flex: 1, justifyContent: "center", alignItems: "center", padding: 32 },
  emptyTitle: { fontSize: 18, fontFamily: "Inter_600SemiBold" },
  emptyDesc: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    marginTop: 6,
    textAlign: "center",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: 16,
    marginBottom: 8,
    padding: 14,
    borderRadius: 10,
    borderWidth: 1,
  },
  rowTicker: { fontSize: 16, fontFamily: "Inter_700Bold" },
  rowMeta: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
  rowValue: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  rowReturn: { fontSize: 12, fontFamily: "Inter_500Medium", marginTop: 2 },
  footerStack: {
    marginTop: 8,
    paddingHorizontal: 16,
    gap: 12,
  },
  footerCard: {
    borderRadius: 12,
  },
  cardSurface: {
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
  },
  cardTitle: { fontSize: 15, fontFamily: "Inter_700Bold", marginBottom: 10 },
  cardEmpty: { fontSize: 13, fontFamily: "Inter_400Regular" },
  divRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 6,
  },
  divTicker: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  divMeta: { fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 2 },
  divAmount: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  pnlRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 6,
  },
  pnlLabel: { fontSize: 13, fontFamily: "Inter_400Regular" },
  pnlValue: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  exposureSubhead: {
    fontSize: 11,
    fontFamily: "Inter_500Medium",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  exposureRow: { paddingVertical: 4 },
  exposureRowHead: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  exposureLabel: { fontSize: 13, fontFamily: "Inter_500Medium" },
  exposurePct: { fontSize: 12, fontFamily: "Inter_500Medium" },
  exposureBarBg: {
    height: 6,
    borderRadius: 3,
    overflow: "hidden",
  },
  exposureBarFill: {
    height: "100%",
    borderRadius: 3,
  },
  exportBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 10,
    borderWidth: 1,
    gap: 8,
  },
  exportBtnText: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
});

const modalStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0,0,0,0.5)",
  },
  sheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderTopWidth: 1,
    padding: 20,
    maxHeight: "85%",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 16,
  },
  title: { fontSize: 18, fontFamily: "Inter_700Bold" },
  field: { marginBottom: 12 },
  fieldLabel: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
    marginBottom: 6,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  input: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    fontFamily: "Inter_400Regular",
  },
  error: { fontSize: 13, fontFamily: "Inter_500Medium", marginTop: 4, marginBottom: 4 },
  saveBtn: {
    marginTop: 16,
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: "center",
  },
  saveBtnText: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
});
