import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import * as Haptics from "expo-haptics";
import React, { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { useNotify } from "@/context/NotifyContext";
import type { NotifyKind, NotifySubscription } from "@/services/notifyApi";

const IMPACT_MIN = 40;
const IMPACT_MAX = 100;
const IMPACT_DEFAULT = 60;
const IMPACT_STEP = 5;

const HOUR_OPTIONS = Array.from({ length: 24 }, (_, h) => h);

function formatHour(h: number | null | undefined): string {
  if (h === null || h === undefined) return "—";
  const ampm = h < 12 ? "AM" : "PM";
  const display = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${display} ${ampm}`;
}

export default function NotificationsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const notify = useNotify();
  const topPadding = Platform.OS === "web" ? 67 : insets.top;
  const bottomPadding = Platform.OS === "web" ? 34 + 84 : insets.bottom + 84;

  return (
    <View style={[styles.container, { backgroundColor: colors.background, paddingTop: topPadding }]}>
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <TouchableOpacity
          onPress={() => {
            Haptics.selectionAsync();
            router.back();
          }}
          style={styles.backBtn}
        >
          <Feather name="chevron-left" size={24} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>Notifications</Text>
        <View style={{ width: 32 }} />
      </View>

      <ScrollView
        contentContainerStyle={{ paddingBottom: bottomPadding, paddingHorizontal: 16, paddingTop: 12 }}
        refreshControl={
          <RefreshControl
            refreshing={notify.loading}
            onRefresh={notify.refresh}
            tintColor={colors.primary}
          />
        }
        showsVerticalScrollIndicator={false}
      >
        {!notify.enabled && (
          <View style={[styles.banner, { backgroundColor: colors.secondary, borderColor: colors.border }]}>
            <Feather name="info" size={16} color={colors.mutedForeground} />
            <Text style={[styles.bannerText, { color: colors.mutedForeground }]}>
              News and earnings notifications are still rolling out.
            </Text>
          </View>
        )}

        <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
          These defaults apply to every stock on your watchlist. Tap a stock's bell icon to override
          per stock.
        </Text>

        <KindCard kind="news" />
        <KindCard kind="earnings" />

        <DailyCapCard />
      </ScrollView>
    </View>
  );
}

function KindCard({ kind }: { kind: NotifyKind }) {
  const colors = useColors();
  const notify = useNotify();
  const sub = notify.defaults[kind];
  const [savingField, setSavingField] = useState<string | null>(null);

  const apply = async (
    field: string,
    op: () => Promise<NotifySubscription | { error: string }>,
  ) => {
    setSavingField(field);
    try {
      await op();
    } finally {
      setSavingField(null);
    }
  };

  const setStatus = (next: boolean) =>
    apply("status", () =>
      sub
        ? notify.patch(sub.id, { status: next ? "active" : "muted" })
        : notify.upsert({ kind, symbol: null, status: next ? "active" : "muted" }),
    );

  const setImpact = (value: number) =>
    apply("impact", () =>
      sub
        ? notify.patch(sub.id, { min_impact_score: value })
        : notify.upsert({ kind, symbol: null, min_impact_score: value }),
    );

  const setQuiet = (start: number | null, end: number | null) =>
    apply("quiet", () =>
      sub
        ? notify.patch(sub.id, { quiet_start_hour: start, quiet_end_hour: end })
        : notify.upsert({
            kind,
            symbol: null,
            quiet_start_hour: start,
            quiet_end_hour: end,
          }),
    );

  const on = sub?.status === "active";
  const impact = sub?.min_impact_score ?? IMPACT_DEFAULT;
  const start = sub?.quiet_start_hour ?? null;
  const end = sub?.quiet_end_hour ?? null;
  const quietSet = start !== null && end !== null;

  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={styles.cardHeader}>
        <View style={[styles.cardIcon, { backgroundColor: colors.primary + "22" }]}>
          <Feather
            name={kind === "news" ? "rss" : "calendar"}
            size={16}
            color={colors.primary}
          />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.cardTitle, { color: colors.foreground }]}>
            {kind === "news" ? "News alerts" : "Earnings alerts"}
          </Text>
          <Text style={[styles.cardSubtitle, { color: colors.mutedForeground }]}>
            {kind === "news"
              ? "High-impact news for stocks you watch."
              : "Reminders before earnings and recap after."}
          </Text>
        </View>
        {savingField === "status" ? (
          <ActivityIndicator color={colors.primary} />
        ) : (
          <Switch
            value={on}
            onValueChange={setStatus}
            trackColor={{ false: colors.border, true: colors.primary }}
            thumbColor="#fff"
          />
        )}
      </View>

      {on && (
        <>
          {kind === "news" && (
            <View style={[styles.section, { borderTopColor: colors.border }]}>
              <View style={styles.sectionRow}>
                <Text style={[styles.sectionLabel, { color: colors.foreground }]}>Min impact</Text>
                <Text style={[styles.sectionValue, { color: colors.primary }]}>
                  {impact}
                  {savingField === "impact" ? "  …" : ""}
                </Text>
              </View>
              <Text style={[styles.sectionHint, { color: colors.mutedForeground }]}>
                Only news scoring at least this much impact will fire. Lower = more pushes.
              </Text>
              <SliderRow value={impact} onChange={setImpact} />
            </View>
          )}

          <View style={[styles.section, { borderTopColor: colors.border }]}>
            <View style={styles.sectionRow}>
              <Text style={[styles.sectionLabel, { color: colors.foreground }]}>Quiet hours</Text>
              <Switch
                value={quietSet}
                onValueChange={(v) => {
                  if (v) {
                    setQuiet(22, 7);
                  } else {
                    setQuiet(null, null);
                  }
                }}
                trackColor={{ false: colors.border, true: colors.primary }}
                thumbColor="#fff"
                disabled={savingField === "quiet"}
              />
            </View>
            <Text style={[styles.sectionHint, { color: colors.mutedForeground }]}>
              We hold notifications during this window and let you see them later in the inbox.
            </Text>
            {quietSet && (
              <View style={styles.hourPickerRow}>
                <HourPicker label="From" value={start} onChange={(v) => setQuiet(v, end)} />
                <HourPicker label="To" value={end} onChange={(v) => setQuiet(start, v)} />
              </View>
            )}
          </View>
        </>
      )}
    </View>
  );
}

function SliderRow({
  value,
  onChange,
}: {
  value: number;
  onChange: (n: number) => void;
}) {
  const colors = useColors();
  const dec = () => onChange(Math.max(IMPACT_MIN, value - IMPACT_STEP));
  const inc = () => onChange(Math.min(IMPACT_MAX, value + IMPACT_STEP));
  const ratio = (value - IMPACT_MIN) / (IMPACT_MAX - IMPACT_MIN);
  return (
    <View style={styles.sliderWrap}>
      <TouchableOpacity onPress={dec} style={[styles.sliderBtn, { borderColor: colors.border }]}>
        <Feather name="minus" size={16} color={colors.foreground} />
      </TouchableOpacity>
      <View style={[styles.sliderTrack, { backgroundColor: colors.border }]}>
        <View
          style={[
            styles.sliderFill,
            { backgroundColor: colors.primary, width: `${Math.round(ratio * 100)}%` },
          ]}
        />
      </View>
      <TouchableOpacity onPress={inc} style={[styles.sliderBtn, { borderColor: colors.border }]}>
        <Feather name="plus" size={16} color={colors.foreground} />
      </TouchableOpacity>
    </View>
  );
}

function HourPicker({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number | null;
  onChange: (h: number) => void;
}) {
  const colors = useColors();
  const [expanded, setExpanded] = useState(false);
  return (
    <View style={{ flex: 1 }}>
      <Text style={[styles.hourLabel, { color: colors.mutedForeground }]}>{label}</Text>
      <TouchableOpacity
        onPress={() => setExpanded((v) => !v)}
        style={[styles.hourValue, { borderColor: colors.border, backgroundColor: colors.secondary }]}
      >
        <Text style={[styles.hourValueText, { color: colors.foreground }]}>{formatHour(value)}</Text>
        <Feather name={expanded ? "chevron-up" : "chevron-down"} size={14} color={colors.mutedForeground} />
      </TouchableOpacity>
      {expanded && (
        <View style={[styles.hourGrid, { borderColor: colors.border, backgroundColor: colors.card }]}>
          {HOUR_OPTIONS.map((h) => (
            <TouchableOpacity
              key={h}
              onPress={() => {
                onChange(h);
                setExpanded(false);
              }}
              style={[
                styles.hourCell,
                value === h && { backgroundColor: colors.primary + "22", borderColor: colors.primary },
                value !== h && { borderColor: "transparent" },
              ]}
            >
              <Text
                style={{
                  fontSize: 12,
                  fontFamily: "Inter_600SemiBold",
                  color: value === h ? colors.primary : colors.foreground,
                }}
              >
                {formatHour(h)}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
    </View>
  );
}

function DailyCapCard() {
  const colors = useColors();
  const notify = useNotify();
  const used = notify.newsDailyUsed;
  const cap = notify.newsDailyCap;
  const ratio = useMemo(() => Math.min(1, used / cap), [used, cap]);
  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={styles.cardHeader}>
        <View style={[styles.cardIcon, { backgroundColor: colors.warning + "22" }]}>
          <Feather name="bar-chart-2" size={16} color={colors.warning} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.cardTitle, { color: colors.foreground }]}>Daily cap</Text>
          <Text style={[styles.cardSubtitle, { color: colors.mutedForeground }]}>
            We send at most {cap} news pushes per stock in any 24-hour window.
          </Text>
        </View>
      </View>
      <View style={[styles.section, { borderTopColor: colors.border }]}>
        <View style={styles.sectionRow}>
          <Text style={[styles.sectionLabel, { color: colors.foreground }]}>Used in last 24h</Text>
          <Text style={[styles.sectionValue, { color: ratio >= 1 ? colors.warning : colors.primary }]}>
            {used} / {cap}
          </Text>
        </View>
        <View style={[styles.sliderTrack, { backgroundColor: colors.border, marginTop: 10 }]}>
          <View
            style={[
              styles.sliderFill,
              {
                backgroundColor: ratio >= 1 ? colors.warning : colors.primary,
                width: `${Math.round(ratio * 100)}%`,
              },
            ]}
          />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  backBtn: { padding: 4, width: 32, alignItems: "flex-start" },
  headerTitle: { flex: 1, textAlign: "center", fontSize: 16, fontFamily: "Inter_700Bold" },
  banner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 12,
  },
  bannerText: { fontSize: 12, fontFamily: "Inter_500Medium", flex: 1 },
  subtitle: { fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 19, marginBottom: 16 },
  card: {
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 12,
    overflow: "hidden",
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
  },
  cardIcon: {
    width: 32, height: 32, borderRadius: 10,
    alignItems: "center", justifyContent: "center",
  },
  cardTitle: { fontSize: 14, fontFamily: "Inter_700Bold" },
  cardSubtitle: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2, lineHeight: 17 },
  section: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderTopWidth: 1,
    gap: 6,
  },
  sectionRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  sectionLabel: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  sectionValue: { fontSize: 14, fontFamily: "Inter_700Bold" },
  sectionHint: { fontSize: 11, fontFamily: "Inter_400Regular", lineHeight: 16 },
  sliderWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 6,
  },
  sliderBtn: {
    width: 30, height: 30, borderRadius: 8, borderWidth: 1,
    alignItems: "center", justifyContent: "center",
  },
  sliderTrack: { flex: 1, height: 6, borderRadius: 3, overflow: "hidden" },
  sliderFill: { height: "100%" },
  hourPickerRow: { flexDirection: "row", gap: 12, marginTop: 4 },
  hourLabel: { fontSize: 11, fontFamily: "Inter_500Medium", marginBottom: 4 },
  hourValue: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
  },
  hourValueText: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  hourGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 4,
    padding: 8,
    marginTop: 6,
    borderRadius: 10,
    borderWidth: 1,
  },
  hourCell: {
    width: "23%",
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: "center",
  },
});
