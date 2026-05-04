// Web Portfolio screen — replaces the native FlatList with a sortable
// table built on Views (no HTML <table>, per prompt). Aggregates lots from
// the existing HoldingsContext and pulls live prices from WatchlistContext
// without changing either piece of business logic.

import React, { useMemo, useState } from "react";
import { router } from "expo-router";
import { Text, View, useWindowDimensions } from "react-native";
import { useColors } from "@/hooks/useColors";
import { useHoldings } from "@/context/HoldingsContext";
import { useWatchlist } from "@/context/WatchlistContext";
import { WebTokens } from "@/components/web/WebTokens";
import { WebHoverable } from "@/components/web/WebHoverable";
import { AddIcon, CollapseIcon, ExpandIcon, SortAscIcon, SortDescIcon } from "@/components/icons/StockIcons";
import { formatChangePctWeb } from "@/components/web/webFormat";

type SortKey = "ticker" | "qty" | "avg" | "price" | "value" | "ret";
type SortDir = "asc" | "desc";

interface AggregatedRow {
  ticker: string;
  name: string;
  qty: number;
  avgCost: number;
  price: number;
  value: number;
  cost: number;
  ret: number;
  retPct: number;
  currency: string;
}

function aggregate(holding: { ticker: string; currency: string; lots: { qty: string; cost_per_share: string }[] }) {
  let qty = 0;
  let cost = 0;
  for (const lot of holding.lots) {
    const q = Number(lot.qty);
    const c = Number(lot.cost_per_share);
    if (!Number.isFinite(q) || !Number.isFinite(c)) continue;
    qty += q;
    cost += q * c;
  }
  const avg = qty > 0 ? cost / qty : 0;
  return { qty, cost, avg };
}

interface SummaryCardProps {
  label: string;
  value: string;
  context?: string;
  direction?: "up" | "down" | "neutral";
}

function SummaryCard({ label, value, context, direction = "neutral" }: SummaryCardProps) {
  const colors = useColors();
  const accent =
    direction === "up" ? colors.positive : direction === "down" ? colors.negative : colors.border;
  const valueColor =
    direction === "up" ? colors.positive : direction === "down" ? colors.negative : colors.text;
  return (
    <View
      style={{
        flex: 1,
        flexDirection: "row",
        backgroundColor: colors.card,
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: 14,
        overflow: "hidden",
        minWidth: 200,
      }}
    >
      <View style={{ width: 3, backgroundColor: accent }} />
      <View style={{ flex: 1, padding: 16, gap: 6 }}>
        <Text
          style={{
            color: colors.mutedForeground,
            fontFamily: WebTokens.fontBody,
            fontSize: 11,
            textTransform: "uppercase",
            letterSpacing: 1.3,
          }}
        >
          {label}
        </Text>
        <Text
          style={{
            color: valueColor,
            fontFamily: WebTokens.fontData,
            fontSize: 26,
            fontWeight: "700",
          }}
        >
          {value}
        </Text>
        {context ? (
          <Text style={{ color: colors.mutedForeground, fontFamily: WebTokens.fontBody, fontSize: 11 }}>
            {context}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

interface SortHeaderProps {
  label: string;
  active: boolean;
  dir: SortDir;
  onPress: () => void;
  align?: "left" | "right";
  width?: any;
  flex?: number;
}

function SortHeader({ label, active, dir, onPress, align = "left", width, flex }: SortHeaderProps) {
  const colors = useColors();
  return (
    <WebHoverable onPress={onPress}>
      {() => (
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 4,
            paddingVertical: 10,
            paddingHorizontal: 12,
            justifyContent: align === "right" ? "flex-end" : "flex-start",
            width,
            flex,
            backgroundColor: colors.muted,
          }}
        >
          <Text
            style={{
              color: active ? colors.primary : colors.mutedForeground,
              fontFamily: WebTokens.fontBody,
              fontSize: 11,
              textTransform: "uppercase",
              letterSpacing: 1.3,
              fontWeight: active ? "700" : "500",
            }}
          >
            {label}
          </Text>
          {active ? (
            dir === "asc" ? (
              <SortAscIcon size={12} color={colors.primary} />
            ) : (
              <SortDescIcon size={12} color={colors.primary} />
            )
          ) : null}
        </View>
      )}
    </WebHoverable>
  );
}

interface PrimaryButtonProps {
  label: string;
  onPress: () => void;
  Icon?: (p: { size?: number; color?: string }) => React.ReactElement;
}

function PrimaryButton({ label, onPress, Icon }: PrimaryButtonProps) {
  const colors = useColors();
  return (
    <WebHoverable onPress={onPress}>
      {({ hovered }) => (
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 6,
            paddingHorizontal: 16,
            paddingVertical: 9,
            borderRadius: 10,
            backgroundColor: colors.primary,
            // @ts-ignore
            transform: hovered ? "translateY(-1px)" : "translateY(0)",
            // @ts-ignore
            transition: WebTokens.transition.fast,
          }}
        >
          {Icon ? <Icon size={16} color={colors.primaryForeground} /> : null}
          <Text
            style={{
              color: colors.primaryForeground,
              fontFamily: WebTokens.fontBody,
              fontSize: 13,
              fontWeight: "600",
            }}
          >
            {label}
          </Text>
        </View>
      )}
    </WebHoverable>
  );
}

export default function WebPortfolioScreen() {
  const colors = useColors();
  const { width } = useWindowDimensions();
  const { holdings } = useHoldings();
  const { stocks } = useWatchlist();
  const [sortKey, setSortKey] = useState<SortKey>("value");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [dividendsOpen, setDividendsOpen] = useState(false);

  const rows: AggregatedRow[] = useMemo(() => {
    return holdings.map((h) => {
      const stock = stocks[h.ticker];
      const { qty, cost, avg } = aggregate(h);
      const price = stock?.price ?? 0;
      const value = qty * price;
      const ret = value - cost;
      const retPct = cost > 0 ? (ret / cost) * 100 : 0;
      return {
        ticker: h.ticker,
        name: stock?.name ?? h.ticker,
        qty,
        avgCost: avg,
        price,
        value,
        cost,
        ret,
        retPct,
        currency: h.currency || stock?.currency || "USD",
      };
    });
  }, [holdings, stocks]);

  const sorted = useMemo(() => {
    const cmp: Record<SortKey, (a: AggregatedRow, b: AggregatedRow) => number> = {
      ticker: (a, b) => a.ticker.localeCompare(b.ticker),
      qty: (a, b) => a.qty - b.qty,
      avg: (a, b) => a.avgCost - b.avgCost,
      price: (a, b) => a.price - b.price,
      value: (a, b) => a.value - b.value,
      ret: (a, b) => a.retPct - b.retPct,
    };
    const out = [...rows].sort(cmp[sortKey]);
    return sortDir === "asc" ? out : out.reverse();
  }, [rows, sortKey, sortDir]);

  const totalValue = rows.reduce((s, r) => s + r.value, 0);
  const totalCost = rows.reduce((s, r) => s + r.cost, 0);
  const totalReturn = totalValue - totalCost;
  const totalReturnPct = totalCost > 0 ? (totalReturn / totalCost) * 100 : 0;

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "ticker" ? "asc" : "desc");
    }
  };

  const compact = width < 900;

  return (
    <View style={{ flex: 1, gap: 24 }}>
      {/* Header */}
      <View
        style={{
          flexDirection: "row",
          alignItems: "flex-start",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: 16,
        }}
      >
        <View>
          <Text
            style={{
              color: colors.text,
              fontFamily: WebTokens.fontDisplay,
              fontSize: 28,
            }}
          >
            Portfolio
          </Text>
          <Text
            style={{
              color: colors.mutedForeground,
              fontFamily: WebTokens.fontBody,
              fontSize: 13,
              marginTop: 4,
            }}
          >
            Holdings, returns and dividends in one place.
          </Text>
        </View>
        <PrimaryButton label="Add Holding" Icon={AddIcon} onPress={() => {}} />
      </View>

      {/* Summary cards */}
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 16 }}>
        <SummaryCard label="Total Value" value={totalValue.toFixed(2)} context="across all lots" />
        <SummaryCard label="Total Cost" value={totalCost.toFixed(2)} context="cost basis" />
        <SummaryCard
          label="Total Return"
          value={formatChangePctWeb(totalReturnPct)}
          context={`${totalReturn >= 0 ? "+" : "−"}${Math.abs(totalReturn).toFixed(2)} absolute`}
          direction={totalReturn >= 0 ? "up" : "down"}
        />
        <SummaryCard label="Dividends Received" value="—" context="last 12 months" />
      </View>

      {/* Holdings table */}
      <View
        style={{
          backgroundColor: colors.card,
          borderWidth: 1,
          borderColor: colors.border,
          borderRadius: 14,
          overflow: "hidden",
        }}
      >
        {/* Header row */}
        <View style={{ flexDirection: "row" }}>
          <SortHeader
            label="Stock"
            active={sortKey === "ticker"}
            dir={sortDir}
            onPress={() => handleSort("ticker")}
            flex={2}
          />
          {!compact ? (
            <SortHeader
              label="Qty"
              active={sortKey === "qty"}
              dir={sortDir}
              onPress={() => handleSort("qty")}
              align="right"
              flex={1}
            />
          ) : null}
          {!compact ? (
            <SortHeader
              label="Avg Cost"
              active={sortKey === "avg"}
              dir={sortDir}
              onPress={() => handleSort("avg")}
              align="right"
              flex={1}
            />
          ) : null}
          <SortHeader
            label="Price"
            active={sortKey === "price"}
            dir={sortDir}
            onPress={() => handleSort("price")}
            align="right"
            flex={1}
          />
          <SortHeader
            label="Value"
            active={sortKey === "value"}
            dir={sortDir}
            onPress={() => handleSort("value")}
            align="right"
            flex={1}
          />
          <SortHeader
            label="Return"
            active={sortKey === "ret"}
            dir={sortDir}
            onPress={() => handleSort("ret")}
            align="right"
            flex={1}
          />
        </View>

        {/* Data rows */}
        {sorted.length === 0 ? (
          <View style={{ padding: 32, alignItems: "center" }}>
            <Text style={{ color: colors.mutedForeground, fontFamily: WebTokens.fontBody, fontSize: 13 }}>
              No holdings yet — add your first to start tracking returns.
            </Text>
          </View>
        ) : (
          sorted.map((row, i) => (
            <WebHoverable
              key={row.ticker}
              onPress={() =>
                router.push({ pathname: "/stock/[ticker]", params: { ticker: row.ticker } })
              }
            >
              {({ hovered }) => (
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    backgroundColor: hovered
                      ? colors.muted
                      : i % 2 === 0
                        ? "transparent"
                        : `${colors.muted}40`,
                    // @ts-ignore
                    transition: WebTokens.transition.fast,
                  }}
                >
                  <View style={{ flex: 2, paddingVertical: 12, paddingHorizontal: 12 }}>
                    <Text
                      style={{
                        color: colors.text,
                        fontFamily: WebTokens.fontData,
                        fontSize: 14,
                        fontWeight: "700",
                      }}
                    >
                      {row.ticker}
                    </Text>
                    <Text
                      style={{
                        color: colors.mutedForeground,
                        fontFamily: WebTokens.fontBody,
                        fontSize: 11,
                        marginTop: 2,
                      }}
                      numberOfLines={1}
                    >
                      {row.name}
                    </Text>
                  </View>
                  {!compact ? (
                    <Text
                      style={{
                        flex: 1,
                        textAlign: "right",
                        paddingHorizontal: 12,
                        color: colors.text,
                        fontFamily: WebTokens.fontData,
                        fontSize: 13,
                      }}
                    >
                      {row.qty.toFixed(2)}
                    </Text>
                  ) : null}
                  {!compact ? (
                    <Text
                      style={{
                        flex: 1,
                        textAlign: "right",
                        paddingHorizontal: 12,
                        color: colors.text,
                        fontFamily: WebTokens.fontData,
                        fontSize: 13,
                      }}
                    >
                      {row.avgCost.toFixed(2)}
                    </Text>
                  ) : null}
                  <Text
                    style={{
                      flex: 1,
                      textAlign: "right",
                      paddingHorizontal: 12,
                      color: colors.text,
                      fontFamily: WebTokens.fontData,
                      fontSize: 13,
                    }}
                  >
                    {row.price.toFixed(2)}
                  </Text>
                  <Text
                    style={{
                      flex: 1,
                      textAlign: "right",
                      paddingHorizontal: 12,
                      color: colors.text,
                      fontFamily: WebTokens.fontData,
                      fontSize: 13,
                      fontWeight: "600",
                    }}
                  >
                    {row.value.toFixed(2)}
                  </Text>
                  <Text
                    style={{
                      flex: 1,
                      textAlign: "right",
                      paddingHorizontal: 12,
                      color: row.retPct >= 0 ? colors.positive : colors.negative,
                      fontFamily: WebTokens.fontData,
                      fontSize: 13,
                      fontWeight: "700",
                    }}
                  >
                    {formatChangePctWeb(row.retPct)}
                  </Text>
                </View>
              )}
            </WebHoverable>
          ))
        )}
      </View>

      {/* Dividends section */}
      <View>
        <WebHoverable onPress={() => setDividendsOpen((v) => !v)}>
          {({ hovered }) => (
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 8,
                paddingVertical: 12,
                paddingHorizontal: 4,
                borderBottomWidth: 1,
                borderBottomColor: colors.border,
              }}
            >
              <Text
                style={{
                  color: hovered ? colors.primary : colors.text,
                  fontFamily: WebTokens.fontBody,
                  fontSize: 14,
                  fontWeight: "600",
                }}
              >
                Dividends
              </Text>
              {dividendsOpen ? (
                <CollapseIcon size={14} color={colors.mutedForeground} />
              ) : (
                <ExpandIcon size={14} color={colors.mutedForeground} />
              )}
            </View>
          )}
        </WebHoverable>
        {dividendsOpen ? (
          <View style={{ padding: 16 }}>
            <Text style={{ color: colors.mutedForeground, fontFamily: WebTokens.fontBody, fontSize: 13 }}>
              Dividend events will appear here when your holdings produce them.
            </Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}
