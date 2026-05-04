// Web Account screen — two-column settings layout: vertical text-link
// category nav on the left, card-based section panel on the right.

import React, { useState } from "react";
import { Linking, Pressable, ScrollView, Text, View, useWindowDimensions } from "react-native";
import { router } from "expo-router";
import { useAuth, useUser } from "@clerk/expo";
import { useColors } from "@/hooks/useColors";
import { useTheme } from "@/context/ThemeContext";
import { useSubscription } from "@/context/SubscriptionContext";
import { WebTokens } from "@/components/web/WebTokens";
import { WebHoverable } from "@/components/web/WebHoverable";

type Category = "subscription" | "preferences" | "notifications" | "legal" | "danger";

const CATEGORIES: { key: Category; label: string }[] = [
  { key: "subscription", label: "Subscription" },
  { key: "preferences", label: "Preferences" },
  { key: "notifications", label: "Notifications" },
  { key: "legal", label: "Legal" },
  { key: "danger", label: "Danger Zone" },
];

interface CardProps {
  title: string;
  children: React.ReactNode;
}

function Card({ title, children }: CardProps) {
  const colors = useColors();
  return (
    <View
      style={{
        backgroundColor: colors.card,
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: 14,
        padding: 24,
        gap: 12,
        marginBottom: 16,
      }}
    >
      <Text
        style={{
          color: colors.text,
          fontFamily: WebTokens.fontDisplay,
          fontSize: 18,
        }}
      >
        {title}
      </Text>
      <View style={{ marginTop: 4 }}>{children}</View>
    </View>
  );
}

interface RowProps {
  label: string;
  value?: string;
  trailing?: React.ReactNode;
  onPress?: () => void;
  emphasis?: boolean;
}

function Row({ label, value, trailing, onPress, emphasis }: RowProps) {
  const colors = useColors();
  const inner = (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        paddingVertical: 12,
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
        minHeight: 44,
      }}
    >
      <Text
        style={{
          color: emphasis ? colors.accent : colors.text,
          fontFamily: WebTokens.fontBody,
          fontSize: 14,
          fontWeight: emphasis ? "600" : "400",
        }}
      >
        {label}
      </Text>
      {trailing ?? (value ? (
        <Text style={{ color: colors.mutedForeground, fontFamily: WebTokens.fontBody, fontSize: 13 }}>
          {value}
        </Text>
      ) : null)}
    </View>
  );

  if (onPress) {
    return (
      <WebHoverable onPress={onPress}>
        {() => inner}
      </WebHoverable>
    );
  }
  return inner;
}

interface CategoryNavLinkProps {
  label: string;
  active: boolean;
  onPress: () => void;
}

function CategoryNavLink({ label, active, onPress }: CategoryNavLinkProps) {
  const colors = useColors();
  return (
    <WebHoverable onPress={onPress}>
      {({ hovered }) => (
        <View
          style={{
            paddingVertical: 9,
            paddingHorizontal: 12,
            borderLeftWidth: 2,
            borderLeftColor: active ? colors.primary : "transparent",
            // @ts-ignore
            transition: WebTokens.transition.fast,
          }}
        >
          <Text
            style={{
              color: active ? colors.primary : hovered ? colors.text : colors.mutedForeground,
              fontFamily: WebTokens.fontBody,
              fontSize: 13,
              fontWeight: active ? "600" : "500",
            }}
          >
            {label}
          </Text>
        </View>
      )}
    </WebHoverable>
  );
}

function ToggleSwitch({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  const colors = useColors();
  return (
    <Pressable
      onPress={() => onChange(!value)}
      // @ts-ignore — web-only cursor
      style={{ cursor: "pointer" }}
    >
      <View
        style={{
          width: 36,
          height: 20,
          borderRadius: 999,
          backgroundColor: value ? colors.primary : colors.border,
          padding: 2,
          // @ts-ignore
          transition: WebTokens.transition.fast,
        }}
      >
        <View
          style={{
            width: 16,
            height: 16,
            borderRadius: 8,
            backgroundColor: colors.card,
            // @ts-ignore — translateX moves the thumb
            transform: value ? "translateX(16px)" : "translateX(0px)",
            // @ts-ignore
            transition: WebTokens.transition.fast,
          }}
        />
      </View>
    </Pressable>
  );
}

export default function WebAccountScreen() {
  const colors = useColors();
  const { width } = useWindowDimensions();
  const { signOut } = useAuth();
  const { user } = useUser();
  const { theme, setTheme } = useTheme();
  const { tier } = useSubscription();
  const [active, setActive] = useState<Category>("subscription");
  const stacked = width < 900;

  const isPremium = tier === "premium";
  const planLabel = tier === "free" ? "Free" : tier === "pro" ? "Pro" : "Premium";

  return (
    <View style={{ flex: 1 }}>
      <View style={{ marginBottom: 24 }}>
        <Text
          style={{
            color: colors.text,
            fontFamily: WebTokens.fontDisplay,
            fontSize: 28,
          }}
        >
          Account
        </Text>
        <Text
          style={{
            color: colors.mutedForeground,
            fontFamily: WebTokens.fontBody,
            fontSize: 13,
            marginTop: 4,
          }}
        >
          {user?.primaryEmailAddress?.emailAddress}
        </Text>
      </View>

      <View style={{ flexDirection: stacked ? "column" : "row", gap: 24 }}>
        {/* Left nav */}
        <View
          style={{
            width: stacked ? "100%" : 220,
            flexShrink: 0,
            gap: 2,
          }}
        >
          {CATEGORIES.map((c) => (
            <CategoryNavLink
              key={c.key}
              label={c.label}
              active={active === c.key}
              onPress={() => setActive(c.key)}
            />
          ))}
        </View>

        {/* Right content */}
        <View style={{ flex: 1 }}>
          {active === "subscription" ? (
            <>
              <Card title="Current Plan">
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "space-between",
                    paddingVertical: 14,
                    paddingHorizontal: 16,
                    borderRadius: 10,
                    backgroundColor: colors.muted,
                  }}
                >
                  <View>
                    <Text
                      style={{
                        color: colors.text,
                        fontFamily: WebTokens.fontDisplay,
                        fontSize: 22,
                      }}
                    >
                      {planLabel}
                    </Text>
                    <Text
                      style={{
                        color: colors.mutedForeground,
                        fontFamily: WebTokens.fontBody,
                        fontSize: 12,
                        marginTop: 2,
                      }}
                    >
                      {isPremium ? "Unlimited stock pages and AI summaries" : "Unlock more with a paid plan"}
                    </Text>
                  </View>
                  {!isPremium ? (
                    <Pressable
                      // @ts-ignore — cursor on web
                      style={{
                        paddingHorizontal: 16,
                        paddingVertical: 9,
                        borderRadius: 10,
                        backgroundColor: colors.accent,
                        cursor: "pointer",
                      }}
                    >
                      <Text
                        style={{
                          color: colors.accentForeground,
                          fontFamily: WebTokens.fontBody,
                          fontSize: 13,
                          fontWeight: "600",
                        }}
                      >
                        Upgrade
                      </Text>
                    </Pressable>
                  ) : null}
                </View>
              </Card>
              <Card title="Billing">
                <Row label="Manage subscription" value="Stripe portal" onPress={() => Linking.openURL("https://billing.stripe.com")} />
                <Row label="View invoices" value="Stripe portal" onPress={() => Linking.openURL("https://billing.stripe.com")} />
              </Card>
            </>
          ) : null}

          {active === "preferences" ? (
            <Card title="Appearance">
              <Row
                label="Bright mode"
                trailing={
                  <ToggleSwitch
                    value={theme === "bright"}
                    onChange={(v) => setTheme(v ? "bright" : "dark")}
                  />
                }
              />
              <Row
                label="Theme"
                value={theme === "bright" ? "Light background" : "Dark background"}
              />
            </Card>
          ) : null}

          {active === "notifications" ? (
            <Card title="Push & Email">
              <Row label="Manage subscriptions" onPress={() => router.push("/(tabs)/notifications" as any)} />
              <Text
                style={{
                  color: colors.mutedForeground,
                  fontFamily: WebTokens.fontBody,
                  fontSize: 12,
                  marginTop: 8,
                }}
              >
                Per-stock news and earnings notifications can be configured from the notifications page.
              </Text>
            </Card>
          ) : null}

          {active === "legal" ? (
            <Card title="Legal">
              <Row label="Terms of Service" onPress={() => router.push("/legal" as any)} />
              <Row label="Privacy Policy" onPress={() => router.push("/legal" as any)} />
              <Row label="Data Disclaimer" onPress={() => router.push("/legal" as any)} />
            </Card>
          ) : null}

          {active === "danger" ? (
            <Card title="Danger Zone">
              <Row
                label="Sign out"
                emphasis
                onPress={() => signOut().then(() => router.replace("/(auth)/sign-in" as any))}
              />
              <Row
                label="Delete account"
                trailing={
                  <Text style={{ color: colors.negative, fontFamily: WebTokens.fontBody, fontSize: 13 }}>
                    Contact support
                  </Text>
                }
              />
            </Card>
          ) : null}
        </View>
      </View>
    </View>
  );
}
