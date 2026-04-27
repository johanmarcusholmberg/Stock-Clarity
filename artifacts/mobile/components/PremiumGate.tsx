import React, { useEffect, useRef, useState } from "react";
import { Platform, Pressable, StyleSheet, Text, View, type ViewProps } from "react-native";
import { Feather } from "@expo/vector-icons";
import { BlurView } from "expo-blur";
import { useAuth } from "@clerk/expo";
import { useColors } from "@/hooks/useColors";
import { useSubscription, type Tier } from "@/context/SubscriptionContext";
import { PaywallSheet } from "@/components/PaywallSheet";
import { trackPremiumEvent, type PremiumFeature, type PremiumSurface } from "@/lib/premiumTelemetry";

// Feature → tier requirement map. Keep this in one place so call sites don't
// sprinkle tier math; bump a feature from pro → premium by editing this table.
export const FEATURE_TIER_REQUIREMENT: Record<PremiumFeature, Tier> = {
  performance_rankings: "pro",
  sector_breakdown: "pro",
  fifty_two_week_range: "pro",
  risk_metrics: "premium",
  benchmark_comparison: "premium",
  export_pdf_csv: "premium",
  dividend_calendar: "pro",
  correlation_matrix: "premium",
  scenario_analysis: "premium",
  monte_carlo: "premium",
  tax_lot_view: "premium",
  geo_currency_exposure: "pro",
  rebalancing_suggestions: "premium",
  full_brief_archive: "premium",
  csv_export_basic: "pro",
  realized_pnl: "pro",
};

const TIER_RANK: Record<Tier, number> = { free: 0, pro: 1, premium: 2 };

function satisfiesTier(current: Tier, required: Tier): boolean {
  return TIER_RANK[current] >= TIER_RANK[required];
}

/** Whether `tier` lacks access to `feature`. Exported so parents can branch on
 *  lock state to swap real data for dummy previews before render. */
export function isFeatureLocked(tier: Tier, feature: PremiumFeature): boolean {
  return !satisfiesTier(tier, FEATURE_TIER_REQUIREMENT[feature]);
}

// ── First-use tracking ───────────────────────────────────────────────────────
// In-session Set so we fire the first-use event once per app launch even if the
// user navigates into the same Premium card multiple times. For a persistent
// "first use ever" we'd need AsyncStorage; deferring that until we see whether
// the in-session signal is noisy in the dashboard.
const firstUseFiredThisSession = new Set<string>();

// De-dupe lock impressions so a scroll-in/out of a long list doesn't spam the
// analytics endpoint. Per-session, per-feature.
const impressionsFiredThisSession = new Set<string>();

interface PremiumGateProps extends Omit<ViewProps, "children"> {
  feature: PremiumFeature;
  title: string;
  pitch: string;
  surface?: PremiumSurface;
  /** Render real content under a blur overlay when locked. Default true. */
  previewReal?: boolean;
  /** "blur" (default) layers a heavy blur+mask over `children` so the values
   *  are unreadable. "muted-preview" drops the blur and lowers the children's
   *  opacity instead, so a dummy preview can be read behind the same centered
   *  badge+CTA overlay. The parent is responsible for swapping in dummy data
   *  before passing children when using "muted-preview". */
  previewMode?: "blur" | "muted-preview";
  /** Override the default behaviour of opening the paywall when unlocking. */
  onUpgrade?: () => void;
  children: React.ReactNode;
}

export function PremiumGate({
  feature,
  title,
  pitch,
  surface = "insights",
  previewReal = true,
  previewMode = "blur",
  onUpgrade,
  children,
  style,
  ...viewProps
}: PremiumGateProps) {
  const colors = useColors();
  const { userId } = useAuth();
  const { tier } = useSubscription();
  const required = FEATURE_TIER_REQUIREMENT[feature];
  const locked = !satisfiesTier(tier, required);
  const [paywallVisible, setPaywallVisible] = useState(false);

  // First-use fires when the gate resolves → unlocked for a feature that has
  // a record of being locked for this user in this session. We proxy
  // "locked-before" with whether we emitted an impression earlier.
  const hadImpression = useRef(false);

  useEffect(() => {
    if (!locked) return;
    const key = `${feature}:${surface}`;
    if (impressionsFiredThisSession.has(key)) return;
    impressionsFiredThisSession.add(key);
    hadImpression.current = true;
    trackPremiumEvent("premium_lock_impression", userId, { feature, tier, surface });
  }, [locked, feature, surface, tier, userId]);

  useEffect(() => {
    if (locked) return;
    if (!hadImpression.current) return;
    const key = `${feature}`;
    if (firstUseFiredThisSession.has(key)) return;
    firstUseFiredThisSession.add(key);
    trackPremiumEvent("premium_feature_first_use", userId, { feature, tier });
  }, [locked, feature, tier, userId]);

  if (!locked) {
    return (
      <View style={style} {...viewProps}>
        {children}
      </View>
    );
  }

  const handleUpgrade = () => {
    trackPremiumEvent("premium_lock_cta_click", userId, { feature, tier, cta: "upgrade", surface });
    if (onUpgrade) {
      onUpgrade();
    } else {
      trackPremiumEvent("premium_paywall_opened", userId, { feature, trigger: "gate", surface });
      setPaywallVisible(true);
    }
  };

  const handlePaywallClose = () => {
    trackPremiumEvent("premium_paywall_dismissed", userId, { feature, had_selection: false });
    setPaywallVisible(false);
  };

  const mutedPreview = previewMode === "muted-preview";

  return (
    <View
      style={[styles.container, { borderColor: colors.border, backgroundColor: colors.card }, style]}
      {...viewProps}
    >
      <View
        style={
          mutedPreview ? styles.mutedPreview : previewReal ? styles.preview : styles.previewEmpty
        }
        pointerEvents="none"
      >
        {mutedPreview || previewReal ? children : null}
      </View>

      {/* Blur overlay — BlurView on native, solid fallback on web.
       * Intensity is high and we layer a semi-opaque mask on top so a free
       * user can't read the underlying numbers. Skipped in "muted-preview"
       * mode, where the parent has already swapped real data for dummy values
       * and we want the preview to remain readable. */}
      {!mutedPreview && previewReal && Platform.OS !== "web" ? (
        <>
          <BlurView intensity={60} tint={colors.card === "#000" ? "dark" : "light"} style={styles.blur} />
          <View style={[styles.blur, { backgroundColor: colors.card + "B3" }]} />
        </>
      ) : !mutedPreview ? (
        <View style={[styles.blur, { backgroundColor: colors.background + "EE" }]} />
      ) : null}

      <View style={styles.centre} pointerEvents="box-none">
        <View style={[styles.badge, { backgroundColor: colors.warning + "22" }]}>
          <Feather name="lock" size={14} color={colors.warning} />
          <Text style={[styles.badgeText, { color: colors.warning }]}>
            {required.toUpperCase()}
          </Text>
        </View>
        <Text style={[styles.title, { color: colors.foreground }]}>{title}</Text>
        <Text style={[styles.pitch, { color: colors.mutedForeground }]}>{pitch}</Text>
        <Pressable
          onPress={handleUpgrade}
          style={({ pressed }) => [
            styles.cta,
            { backgroundColor: colors.primary, opacity: pressed ? 0.85 : 1 },
          ]}
        >
          <Text style={[styles.ctaText, { color: colors.primaryForeground }]}>Unlock with {required[0].toUpperCase() + required.slice(1)}</Text>
        </Pressable>
      </View>

      <PaywallSheet
        visible={paywallVisible}
        onClose={handlePaywallClose}
        triggerReason="general"
        currentTier={tier}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 14,
    borderWidth: 1,
    overflow: "hidden",
    position: "relative",
  },
  preview: {
    opacity: 0.6,
  },
  mutedPreview: {
    opacity: 0.45,
  },
  previewEmpty: {
    minHeight: 180,
  },
  blur: {
    ...StyleSheet.absoluteFillObject,
  },
  centre: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
    gap: 8,
  },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
  },
  badgeText: {
    fontSize: 11,
    fontFamily: "Inter_700Bold",
    letterSpacing: 1,
  },
  title: {
    fontSize: 16,
    fontFamily: "Inter_700Bold",
    textAlign: "center",
  },
  pitch: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    lineHeight: 18,
    maxWidth: 260,
  },
  cta: {
    marginTop: 6,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 12,
  },
  ctaText: {
    fontSize: 14,
    fontFamily: "Inter_700Bold",
  },
});
