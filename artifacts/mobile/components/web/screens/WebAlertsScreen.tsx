// Web Alerts screen — split into a left list and a right detail/empty panel.
// Touch-only sheets are replaced by an inline form panel on the right side.

import React, { useMemo, useState } from "react";
import { Text, TextInput, View, useWindowDimensions, Pressable } from "react-native";
import Svg, { Line, Polyline } from "react-native-svg";
import { useColors } from "@/hooks/useColors";
import { useAlerts } from "@/context/AlertsContext";
import { useWatchlist } from "@/context/WatchlistContext";
import { WebTokens } from "@/components/web/WebTokens";
import { WebHoverable } from "@/components/web/WebHoverable";
import { AddIcon, DeleteIcon } from "@/components/icons/StockIcons";
import { formatTimeAgoWeb } from "@/components/web/webFormat";
import type { AlertType, UserAlert } from "@/services/alertsApi";

function alertTypeLabel(t: AlertType): string {
  if (t === "price_above") return "Above";
  if (t === "price_below") return "Below";
  return "% Day";
}

function EmptyAlertArt({ color }: { color: string }) {
  // A price line crossing a horizontal threshold bar — the literal concept.
  return (
    <Svg width={200} height={140} viewBox="0 0 200 140">
      <Line x1={20} y1={80} x2={180} y2={80} stroke={color} strokeWidth={1.5} strokeDasharray="3 3" strokeLinecap="round" />
      <Polyline
        points="20,100 50,90 80,72 110,84 140,52 170,64"
        fill="none"
        stroke={color}
        strokeWidth={2.2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

interface AlertRowProps {
  alert: UserAlert;
  onSelect: () => void;
  onDelete: () => void;
  selected: boolean;
}

function AlertRow({ alert, onSelect, onDelete, selected }: AlertRowProps) {
  const colors = useColors();
  const directional = alert.type !== "pct_change_day";
  const directionColor =
    alert.type === "price_above" ? colors.positive : alert.type === "price_below" ? colors.negative : colors.text;

  return (
    <WebHoverable onPress={onSelect}>
      {({ hovered }) => (
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 10,
            paddingVertical: 12,
            paddingHorizontal: 14,
            borderRadius: 10,
            backgroundColor: selected ? `${colors.primary}10` : hovered ? colors.muted : "transparent",
            borderWidth: 1,
            borderColor: selected ? colors.primary : "transparent",
            // @ts-ignore
            transition: WebTokens.transition.fast,
          }}
        >
          <View
            style={{
              paddingHorizontal: 8,
              paddingVertical: 3,
              borderRadius: 6,
              backgroundColor: colors.muted,
            }}
          >
            <Text
              style={{
                color: colors.text,
                fontFamily: WebTokens.fontData,
                fontSize: 12,
                fontWeight: "700",
              }}
            >
              {alert.symbol}
            </Text>
          </View>
          <Text
            style={{
              color: directional ? directionColor : colors.text,
              fontFamily: WebTokens.fontBody,
              fontSize: 13,
              fontWeight: "500",
              flex: 1,
            }}
          >
            {alertTypeLabel(alert.type)}
          </Text>
          <Text
            style={{
              color: colors.text,
              fontFamily: WebTokens.fontData,
              fontSize: 13,
              fontWeight: "700",
            }}
          >
            {alert.threshold.toFixed(2)}
          </Text>
          {hovered ? (
            <Pressable onPress={onDelete} hitSlop={6} accessibilityLabel="Delete alert">
              <DeleteIcon size={14} color={colors.mutedForeground} />
            </Pressable>
          ) : (
            <View style={{ width: 14 }} />
          )}
        </View>
      )}
    </WebHoverable>
  );
}

interface AlertSetupProps {
  defaultSymbol?: string;
  onSubmit: () => void;
}

function AlertSetupForm({ defaultSymbol, onSubmit }: AlertSetupProps) {
  const colors = useColors();
  const { createAlert } = useAlerts();
  const { stocks } = useWatchlist();
  const [symbol, setSymbol] = useState(defaultSymbol ?? "");
  const [direction, setDirection] = useState<"above" | "below">("above");
  const [threshold, setThreshold] = useState("");
  const stock = stocks[symbol.toUpperCase()];

  const handleSave = async () => {
    const value = Number(threshold);
    if (!Number.isFinite(value) || value <= 0 || !symbol) return;
    await createAlert({
      symbol: symbol.toUpperCase(),
      type: direction === "above" ? "price_above" : "price_below",
      threshold: value,
    });
    onSubmit();
  };

  return (
    <View style={{ gap: 16 }}>
      <Text
        style={{
          color: colors.mutedForeground,
          fontFamily: WebTokens.fontBody,
          fontSize: 11,
          textTransform: "uppercase",
          letterSpacing: 1.3,
        }}
      >
        New Alert
      </Text>
      <View>
        <Text
          style={{
            color: colors.mutedForeground,
            fontFamily: WebTokens.fontBody,
            fontSize: 11,
            marginBottom: 6,
          }}
        >
          Ticker
        </Text>
        <TextInput
          value={symbol}
          onChangeText={setSymbol}
          placeholder="AAPL"
          placeholderTextColor={colors.mutedForeground}
          autoCapitalize="characters"
          style={
            {
              color: colors.text,
              fontFamily: WebTokens.fontData,
              fontSize: 16,
              paddingVertical: 11,
              paddingHorizontal: 14,
              borderRadius: 10,
              borderWidth: 1,
              borderColor: colors.border,
              backgroundColor: colors.muted,
              outlineStyle: "none",
            } as any
          }
        />
        {stock ? (
          <Text
            style={{
              color: colors.mutedForeground,
              fontFamily: WebTokens.fontBody,
              fontSize: 11,
              marginTop: 4,
            }}
          >
            {stock.name} · {stock.price.toFixed(2)} {stock.currency}
          </Text>
        ) : null}
      </View>
      <View style={{ flexDirection: "row", gap: 8 }}>
        <Pressable
          onPress={() => setDirection("above")}
          style={{
            flex: 1,
            paddingVertical: 9,
            borderRadius: 10,
            borderWidth: 1,
            alignItems: "center",
            borderColor: direction === "above" ? colors.positive : colors.border,
            backgroundColor: direction === "above" ? `${colors.positive}1A` : "transparent",
          }}
        >
          <Text
            style={{
              color: direction === "above" ? colors.positive : colors.mutedForeground,
              fontFamily: WebTokens.fontBody,
              fontSize: 13,
              fontWeight: "600",
            }}
          >
            Above
          </Text>
        </Pressable>
        <Pressable
          onPress={() => setDirection("below")}
          style={{
            flex: 1,
            paddingVertical: 9,
            borderRadius: 10,
            borderWidth: 1,
            alignItems: "center",
            borderColor: direction === "below" ? colors.negative : colors.border,
            backgroundColor: direction === "below" ? `${colors.negative}1A` : "transparent",
          }}
        >
          <Text
            style={{
              color: direction === "below" ? colors.negative : colors.mutedForeground,
              fontFamily: WebTokens.fontBody,
              fontSize: 13,
              fontWeight: "600",
            }}
          >
            Below
          </Text>
        </Pressable>
      </View>
      <View>
        <Text
          style={{
            color: colors.mutedForeground,
            fontFamily: WebTokens.fontBody,
            fontSize: 11,
            marginBottom: 6,
          }}
        >
          Threshold
        </Text>
        <TextInput
          value={threshold}
          onChangeText={setThreshold}
          placeholder="0.00"
          placeholderTextColor={colors.mutedForeground}
          keyboardType="decimal-pad"
          style={
            {
              color: colors.text,
              fontFamily: WebTokens.fontData,
              fontSize: 18,
              paddingVertical: 11,
              paddingHorizontal: 14,
              borderRadius: 10,
              borderWidth: 1,
              borderColor: colors.border,
              backgroundColor: colors.muted,
              outlineStyle: "none",
            } as any
          }
        />
      </View>
      <Pressable
        onPress={handleSave}
        style={{
          paddingVertical: 11,
          borderRadius: 10,
          alignItems: "center",
          backgroundColor: colors.primary,
        }}
      >
        <Text
          style={{
            color: colors.primaryForeground,
            fontFamily: WebTokens.fontBody,
            fontSize: 14,
            fontWeight: "600",
          }}
        >
          Create Alert
        </Text>
      </Pressable>
    </View>
  );
}

function NotificationsList() {
  const colors = useColors();
  const { events } = useAlerts();
  if (!events.length) return null;
  const recent = events.slice(0, 4);
  return (
    <View>
      <Text
        style={{
          color: colors.mutedForeground,
          fontFamily: WebTokens.fontBody,
          fontSize: 11,
          textTransform: "uppercase",
          letterSpacing: 1.3,
          marginTop: 24,
          marginBottom: 8,
        }}
      >
        Recent Notifications
      </Text>
      {recent.map((e) => (
        <View
          key={e.id}
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            paddingVertical: 8,
            borderBottomWidth: 1,
            borderBottomColor: colors.border,
          }}
        >
          <Text
            style={{
              color: colors.text,
              fontFamily: WebTokens.fontData,
              fontSize: 12,
              fontWeight: "700",
            }}
          >
            {e.symbol}
          </Text>
          <Text style={{ color: colors.mutedForeground, fontFamily: WebTokens.fontBody, fontSize: 12 }}>
            {alertTypeLabel(e.type)} {e.threshold.toFixed(2)}
          </Text>
          <Text style={{ color: colors.mutedForeground, fontFamily: WebTokens.fontBody, fontSize: 11 }}>
            {formatTimeAgoWeb(e.firedAt)}
          </Text>
        </View>
      ))}
    </View>
  );
}

export default function WebAlertsScreen() {
  const colors = useColors();
  const { width } = useWindowDimensions();
  const { alerts, deleteAlert } = useAlerts();
  const [selected, setSelected] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const stacked = width < 900;

  const sorted = useMemo(() => alerts.slice().sort((a, b) => a.symbol.localeCompare(b.symbol)), [alerts]);

  return (
    <View style={{ flex: 1 }}>
      <View
        style={{
          flexDirection: stacked ? "column" : "row",
          gap: 24,
          alignItems: "stretch",
        }}
      >
        {/* Left panel */}
        <View
          style={{
            // @ts-ignore — flex basis on web
            flexBasis: stacked ? "auto" : "38%",
            flexShrink: 0,
            gap: 14,
          }}
        >
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <Text
              style={{
                color: colors.text,
                fontFamily: WebTokens.fontDisplay,
                fontSize: 20,
              }}
            >
              Price Alerts
            </Text>
            <WebHoverable
              onPress={() => {
                setShowAddForm(true);
                setSelected(null);
              }}
            >
              {({ hovered }) => (
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 6,
                    paddingHorizontal: 10,
                    paddingVertical: 5,
                    borderRadius: 8,
                  }}
                >
                  <AddIcon size={14} color={hovered ? colors.primary : colors.text} />
                  <Text
                    style={{
                      color: hovered ? colors.primary : colors.text,
                      fontFamily: WebTokens.fontBody,
                      fontSize: 12,
                      fontWeight: "500",
                    }}
                  >
                    Add Alert
                  </Text>
                </View>
              )}
            </WebHoverable>
          </View>

          {sorted.length === 0 ? (
            <Text
              style={{
                color: colors.mutedForeground,
                fontFamily: WebTokens.fontBody,
                fontSize: 13,
                paddingVertical: 16,
              }}
            >
              No alerts yet.
            </Text>
          ) : (
            <View>
              {sorted.map((a) => (
                <AlertRow
                  key={a.id}
                  alert={a}
                  selected={selected === a.id}
                  onSelect={() => setSelected(a.id)}
                  onDelete={() => deleteAlert(a.id)}
                />
              ))}
            </View>
          )}

          <View style={{ height: 1, backgroundColor: colors.border, marginVertical: 4 }} />
          <NotificationsList />
        </View>

        {/* Right panel */}
        <View
          style={{
            // @ts-ignore
            flexBasis: stacked ? "auto" : "62%",
            flex: 1,
            backgroundColor: colors.card,
            borderWidth: 1,
            borderColor: colors.border,
            borderRadius: 14,
            padding: 24,
            minHeight: 360,
            justifyContent: showAddForm ? "flex-start" : "center",
            alignItems: showAddForm ? "stretch" : "center",
            gap: 12,
          }}
        >
          {showAddForm ? (
            <AlertSetupForm onSubmit={() => setShowAddForm(false)} />
          ) : (
            <>
              <EmptyAlertArt color={colors.mutedForeground} />
              <Text
                style={{
                  color: colors.text,
                  fontFamily: WebTokens.fontDisplay,
                  fontSize: 20,
                  marginTop: 8,
                }}
              >
                Set a price alert
              </Text>
              <Text
                style={{
                  color: colors.mutedForeground,
                  fontFamily: WebTokens.fontBody,
                  fontSize: 13,
                  textAlign: "center",
                  maxWidth: 360,
                  lineHeight: 19,
                }}
              >
                Select a stock and threshold — we'll notify you when the price crosses it.
              </Text>
            </>
          )}
        </View>
      </View>
    </View>
  );
}
