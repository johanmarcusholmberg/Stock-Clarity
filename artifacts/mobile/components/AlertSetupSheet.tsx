import React, { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useColors } from "@/hooks/useColors";
import { useAlerts } from "@/context/AlertsContext";
import type { AlertDeliveryChannel, AlertType, UserAlert } from "@/services/alertsApi";

interface Props {
  visible: boolean;
  onClose: () => void;
  symbol: string;
  currentPrice?: number;
}

type Draft = {
  type: AlertType;
  threshold: string;
  channel: AlertDeliveryChannel;
};

const TYPE_META: Record<AlertType, { title: string; hint: (price?: number) => string; suffix: string }> = {
  price_above: {
    title: "Price above",
    hint: (p) => (p ? `Current: ${p.toFixed(2)}` : "Set a target price"),
    suffix: "",
  },
  price_below: {
    title: "Price below",
    hint: (p) => (p ? `Current: ${p.toFixed(2)}` : "Set a target price"),
    suffix: "",
  },
  pct_change_day: {
    title: "Daily move ±%",
    hint: () => "Fires when today's move crosses ±X%",
    suffix: "%",
  },
};

function formatLastFired(iso: string | null): string {
  if (!iso) return "Never fired";
  const d = new Date(iso);
  const ms = Date.now() - d.getTime();
  const min = Math.round(ms / 60_000);
  if (min < 1) return "Fired just now";
  if (min < 60) return `Fired ${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `Fired ${hr}h ago`;
  return `Fired ${d.toLocaleDateString()}`;
}

export default function AlertSetupSheet({ visible, onClose, symbol, currentPrice }: Props) {
  const colors = useColors();
  const { enabled, evaluatorHealthy, getAlertsForSymbol, createAlert, updateAlert, deleteAlert } = useAlerts();
  const existing = getAlertsForSymbol(symbol);

  const [draft, setDraft] = useState<Draft>({
    type: "price_above",
    threshold: currentPrice ? currentPrice.toFixed(2) : "",
    channel: "push",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const grouped = useMemo(() => {
    const byType: Record<AlertType, UserAlert[]> = {
      price_above: [],
      price_below: [],
      pct_change_day: [],
    };
    for (const a of existing) byType[a.type].push(a);
    return byType;
  }, [existing]);

  const handleAdd = async () => {
    setError(null);
    const numeric = Number(draft.threshold);
    if (!Number.isFinite(numeric) || numeric <= 0) {
      setError("Enter a positive number");
      return;
    }
    setSaving(true);
    try {
      const res = await createAlert({
        symbol,
        type: draft.type,
        threshold: numeric,
        deliveryChannel: draft.channel,
      });
      if ("error" in res) {
        setError(res.error);
        return;
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setDraft((d) => ({ ...d, threshold: "" }));
    } finally {
      setSaving(false);
    }
  };

  const toggleStatus = async (a: UserAlert) => {
    const next = a.status === "active" ? "snoozed" : "active";
    Haptics.selectionAsync();
    await updateAlert(a.id, { status: next });
  };

  const handleDelete = async (a: UserAlert) => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    await deleteAlert(a.id);
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={[styles.sheet, { backgroundColor: colors.card }]}>
          <View style={[styles.handle, { backgroundColor: colors.border }]} />

          <View style={styles.header}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.title, { color: colors.foreground }]}>Alerts for {symbol}</Text>
              <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
                Add a price or % move alert. Delivered by push notification by default.
              </Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Feather name="x" size={20} color={colors.mutedForeground} />
            </TouchableOpacity>
          </View>

          {!enabled && (
            <View style={[styles.banner, { backgroundColor: colors.secondary, borderColor: colors.border }]}>
              <Feather name="info" size={16} color={colors.mutedForeground} />
              <Text style={[styles.bannerText, { color: colors.mutedForeground }]}>
                Alerts are rolling out gradually. You don't have access yet.
              </Text>
            </View>
          )}
          {enabled && !evaluatorHealthy && (
            <View style={[styles.banner, { backgroundColor: colors.warning + "22", borderColor: colors.warning + "55" }]}>
              <Feather name="alert-triangle" size={16} color={colors.warning} />
              <Text style={[styles.bannerText, { color: colors.warning }]}>
                Alert delivery may be delayed — our evaluator isn't reporting in.
              </Text>
            </View>
          )}

          <ScrollView contentContainerStyle={{ paddingBottom: 32 }} showsVerticalScrollIndicator={false}>
            {/* ── Existing alerts ─────────────────────────────────────────── */}
            {existing.length > 0 && (
              <View style={{ marginTop: 4 }}>
                <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>ACTIVE</Text>
                {(Object.keys(grouped) as AlertType[]).map((type) =>
                  grouped[type].map((a) => (
                    <View
                      key={a.id}
                      style={[styles.alertRow, { backgroundColor: colors.secondary, borderColor: colors.border }]}
                    >
                      <View style={{ flex: 1, gap: 3 }}>
                        <Text style={[styles.alertTitle, { color: colors.foreground }]}>
                          {TYPE_META[type].title}: {a.threshold}
                          {TYPE_META[type].suffix}
                        </Text>
                        <Text style={[styles.alertMeta, { color: colors.mutedForeground }]}>
                          {a.status === "active" ? "Active" : a.status === "snoozed" ? "Snoozed" : a.status}
                          {" · "}
                          {formatLastFired(a.lastFiredAt)}
                          {" · "}
                          {a.deliveryChannel === "both" ? "push + email" : a.deliveryChannel}
                        </Text>
                      </View>
                      <TouchableOpacity onPress={() => toggleStatus(a)} style={styles.rowBtn}>
                        <Feather
                          name={a.status === "active" ? "pause" : "play"}
                          size={16}
                          color={colors.mutedForeground}
                        />
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => handleDelete(a)} style={styles.rowBtn}>
                        <Feather name="trash-2" size={16} color={colors.negative} />
                      </TouchableOpacity>
                    </View>
                  )),
                )}
              </View>
            )}

            {/* ── Create form ────────────────────────────────────────────── */}
            <Text style={[styles.sectionLabel, { color: colors.mutedForeground, marginTop: 20 }]}>NEW ALERT</Text>

            <View style={{ flexDirection: "row", gap: 8, marginBottom: 12 }}>
              {(Object.keys(TYPE_META) as AlertType[]).map((t) => (
                <TouchableOpacity
                  key={t}
                  onPress={() => setDraft((d) => ({ ...d, type: t }))}
                  style={[
                    styles.typeChip,
                    {
                      backgroundColor: draft.type === t ? colors.primary : colors.secondary,
                      borderColor: draft.type === t ? colors.primary : colors.border,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.typeChipText,
                      { color: draft.type === t ? colors.primaryForeground : colors.mutedForeground },
                    ]}
                  >
                    {TYPE_META[t].title}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>
              {TYPE_META[draft.type].hint(currentPrice)}
            </Text>
            <View style={[styles.inputRow, { backgroundColor: colors.secondary, borderColor: colors.border }]}>
              <TextInput
                value={draft.threshold}
                onChangeText={(v) => setDraft((d) => ({ ...d, threshold: v }))}
                placeholder={draft.type === "pct_change_day" ? "e.g. 3" : "e.g. 340"}
                placeholderTextColor={colors.mutedForeground}
                keyboardType="decimal-pad"
                style={[styles.input, { color: colors.foreground }]}
                editable={enabled && !saving}
              />
              {TYPE_META[draft.type].suffix ? (
                <Text style={[styles.suffix, { color: colors.mutedForeground }]}>
                  {TYPE_META[draft.type].suffix}
                </Text>
              ) : null}
            </View>

            <Text style={[styles.fieldLabel, { color: colors.mutedForeground, marginTop: 14 }]}>Deliver via</Text>
            <View style={{ flexDirection: "row", gap: 8 }}>
              {(["push", "email", "both"] as AlertDeliveryChannel[]).map((c) => (
                <TouchableOpacity
                  key={c}
                  onPress={() => setDraft((d) => ({ ...d, channel: c }))}
                  style={[
                    styles.channelChip,
                    {
                      backgroundColor: draft.channel === c ? colors.primary + "22" : colors.secondary,
                      borderColor: draft.channel === c ? colors.primary : colors.border,
                    },
                  ]}
                >
                  <Feather
                    name={c === "push" ? "bell" : c === "email" ? "mail" : "layers"}
                    size={14}
                    color={draft.channel === c ? colors.primary : colors.mutedForeground}
                  />
                  <Text
                    style={[
                      styles.channelChipText,
                      { color: draft.channel === c ? colors.primary : colors.mutedForeground },
                    ]}
                  >
                    {c === "both" ? "Push + email" : c === "push" ? "Push" : "Email"}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {error && (
              <Text style={[styles.error, { color: colors.negative }]}>
                {error}
              </Text>
            )}

            <Pressable
              onPress={handleAdd}
              disabled={!enabled || saving}
              style={({ pressed }) => [
                styles.addBtn,
                {
                  backgroundColor: !enabled ? colors.secondary : colors.primary,
                  opacity: pressed ? 0.85 : 1,
                },
              ]}
            >
              {saving ? (
                <ActivityIndicator color={colors.primaryForeground} />
              ) : (
                <Text
                  style={[
                    styles.addBtnText,
                    { color: !enabled ? colors.mutedForeground : colors.primaryForeground },
                  ]}
                >
                  {enabled ? "Add alert" : "Not available yet"}
                </Text>
              )}
            </Pressable>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" },
  sheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: "90%",
    paddingHorizontal: 20,
    paddingBottom: Platform.OS === "ios" ? 34 : 20,
    paddingTop: 10,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    alignSelf: "center",
    marginBottom: 12,
  },
  header: { flexDirection: "row", alignItems: "flex-start", gap: 12, marginBottom: 10 },
  closeBtn: { padding: 4 },
  title: { fontSize: 20, fontFamily: "Inter_700Bold", marginBottom: 4 },
  subtitle: { fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 18 },
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
  sectionLabel: { fontSize: 11, fontFamily: "Inter_700Bold", letterSpacing: 1, marginBottom: 8 },
  alertRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 8,
  },
  alertTitle: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  alertMeta: { fontSize: 12, fontFamily: "Inter_400Regular" },
  rowBtn: { padding: 8 },
  typeChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    flex: 1,
    alignItems: "center",
  },
  typeChipText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  fieldLabel: { fontSize: 12, fontFamily: "Inter_500Medium", marginBottom: 6 },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 14,
  },
  input: { flex: 1, paddingVertical: 12, fontSize: 16, fontFamily: "Inter_500Medium" },
  suffix: { fontSize: 14, fontFamily: "Inter_600SemiBold", marginLeft: 8 },
  channelChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
  },
  channelChipText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  addBtn: {
    marginTop: 20,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: "center",
  },
  addBtnText: { fontSize: 15, fontFamily: "Inter_700Bold" },
  error: { fontSize: 13, fontFamily: "Inter_500Medium", marginTop: 10 },
});
