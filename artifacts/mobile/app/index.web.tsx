// Landing page — web only. Metro picks this file for --platform web.
// Native root route continues to resolve to app/(tabs)/index.tsx.
//
// Prerequisite checklist (Clerk dashboard) for Google OAuth:
// 1. clerk.com → your app → User & Authentication → Social connections → Google → Enable
// 2. Add authorized redirect URIs:
//    - https://your-production-domain.com/sso-callback
//    - http://localhost:8081/sso-callback
//
// Prerequisite checklist for Apple OAuth on web:
// 1. developer.apple.com → Identifiers → create a Services ID (e.g. app.stockclarity.web)
// 2. Enable Sign In with Apple, add your domain + return URL
// 3. clerk.com → Social connections → Apple → enter Services ID, Team ID, Key ID, private key

import React, { useEffect } from "react";
import {
  ScrollView,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from "react-native";
import { useAuth } from "@/lib/clerk";
import { useRouter } from "expo-router";
import { useColors } from "@/hooks/useColors";
import { WebTokens } from "@/components/web/WebTokens";
import { Logo } from "@/components/icons/Logo";
import { CheckIcon, ChevronRightIcon, CloseIcon } from "@/components/icons/StockIcons";
import Head from "expo-router/head";
import Svg, {
  Circle,
  Ellipse,
  Line,
  Path,
  Polyline,
  Rect,
  Text as SvgText,
} from "react-native-svg";

// ─── PLAN FEATURES (from PaywallSheet.tsx) ────────────────────────────────────
const PRO_FEATURES = [
  { text: "10 stock pages with AI analysis per day", included: true },
  { text: "3 AI event summaries per stock", included: true },
  { text: "Up to 50 stocks in watchlist", included: true },
  { text: "Up to 5 watchlist folders", included: true },
  { text: "Interactive 1-year price charts", included: true },
  { text: "Digest: daily AI stock briefings", included: true },
  { text: "Multi-source news with AI filtering", included: true },
  { text: "Unlimited AI summaries", included: false },
  { text: "Priority support", included: false },
];

const PREMIUM_FEATURES = [
  { text: "Unlimited stock pages with AI per day", included: true },
  { text: "5 AI event summaries per stock", included: true },
  { text: "Unlimited stocks in watchlist", included: true },
  { text: "Unlimited watchlist folders", included: true },
  { text: "Interactive 1-year price charts", included: true },
  { text: "Digest: daily AI stock briefings", included: true },
  { text: "Multi-source news with AI filtering", included: true },
  { text: "Unlimited AI summaries", included: true },
  { text: "Priority support", included: true },
];

// Free tier shows the pro list but with included=false items highlighted as missing
const FREE_FEATURES = PRO_FEATURES.slice(0, 5).map((f) => ({ ...f, included: false }))
  .concat([
    { text: "AI analysis & daily digest", included: false },
    { text: "News with AI filtering", included: false },
  ]);

// ─── HERO ILLUSTRATION ────────────────────────────────────────────────────────
function HeroDashboardIllustration({ primary, secondary, accent, card, border, muted }: {
  primary: string; secondary: string; accent: string; card: string; border: string; muted: string;
}) {
  const accentColors = [primary, "#3BEBA1", accent, muted];
  const cards = [
    { ticker: "AAPL", price: "182.50", up: true, color: primary },
    { ticker: "TSLA", price: "248.30", up: false, color: "#3BEBA1" },
    { ticker: "NVDA", price: "875.20", up: true, color: accent },
    { ticker: "MSFT", price: "415.70", up: true, color: muted },
  ];

  return (
    <Svg width={380} height={260} viewBox="0 0 380 260">
      {/* Card container */}
      <Rect x={4} y={4} width={372} height={252} rx={14} fill={card}
        stroke={border} strokeWidth={1} />

      {/* Navbar bar */}
      <Rect x={20} y={18} width={340} height={18} rx={5} fill={border} opacity={0.6} />
      <Rect x={28} y={24} width={60} height={6} rx={3} fill={primary} opacity={0.5} />
      <Rect x={300} y={22} width={28} height={10} rx={5} fill={primary} opacity={0.3} />
      <Rect x={332} y={22} width={20} height={10} rx={5} fill={border} />

      {/* Folder tab strip */}
      <Rect x={20} y={46} width={72} height={14} rx={7} fill={primary} opacity={0.25} />
      <Rect x={100} y={46} width={60} height={14} rx={7} fill={border} opacity={0.5} />
      <Rect x={168} y={46} width={60} height={14} rx={7} fill={border} opacity={0.5} />

      {/* 2×2 grid of mini stock cards */}
      {cards.map((c, i) => {
        const col = i % 2;
        const row = Math.floor(i / 2);
        const x = 20 + col * 178;
        const y = 72 + row * 86;
        const w = 166;
        const h = 78;

        // Sparkline path (simple arc)
        const sparkY = c.up ? 20 : 12;
        const sparkPath = c.up
          ? `M${x + 70},${y + h - 18} Q${x + 90},${y + h - sparkY} ${x + 110},${y + h - 22} T${x + w - 8},${y + h - 18}`
          : `M${x + 70},${y + h - 22} Q${x + 90},${y + h - 10} ${x + 110},${y + h - 18} T${x + w - 8},${y + h - 14}`;

        return (
          <React.Fragment key={c.ticker}>
            <Rect x={x} y={y} width={w} height={h} rx={10} fill={card}
              stroke={border} strokeWidth={1} />
            {/* Left accent bar */}
            <Rect x={x} y={y} width={3} height={h} rx={2} fill={c.color} />
            {/* Ticker placeholder */}
            <Rect x={x + 14} y={y + 14} width={36} height={7} rx={3.5} fill={c.color} opacity={0.7} />
            {/* Price placeholder */}
            <Rect x={x + 14} y={y + 28} width={52} height={6} rx={3} fill={border} opacity={0.8} />
            {/* Change badge */}
            <Rect x={x + 14} y={y + 40} width={32} height={10} rx={5}
              fill={c.up ? "#3BEBA1" : "#FF4757"} opacity={0.25} />
            {/* Sparkline */}
            <Path d={sparkPath} fill="none" stroke={c.color} strokeWidth={1.5}
              strokeLinecap="round" opacity={0.8} />
          </React.Fragment>
        );
      })}
    </Svg>
  );
}

// ─── INLINE SVG ICONS FOR FEATURE CARDS ──────────────────────────────────────
function CandlestickIcon({ color }: { color: string }) {
  return (
    <Svg width={32} height={32} viewBox="0 0 32 32">
      <Rect x={6} y={10} width={5} height={14} rx={1.5} fill={color} />
      <Line x1={8.5} y1={6} x2={8.5} y2={10} stroke={color} strokeWidth={1.5} strokeLinecap="round" />
      <Line x1={8.5} y1={24} x2={8.5} y2={28} stroke={color} strokeWidth={1.5} strokeLinecap="round" />
      <Rect x={14} y={6} width={5} height={18} rx={1.5} fill={color} opacity={0.6} />
      <Line x1={16.5} y1={3} x2={16.5} y2={6} stroke={color} strokeWidth={1.5} strokeLinecap="round" />
      <Line x1={16.5} y1={24} x2={16.5} y2={27} stroke={color} strokeWidth={1.5} strokeLinecap="round" />
      <Rect x={22} y={8} width={5} height={12} rx={1.5} fill={color} opacity={0.85} />
      <Line x1={24.5} y1={5} x2={24.5} y2={8} stroke={color} strokeWidth={1.5} strokeLinecap="round" />
      <Line x1={24.5} y1={20} x2={24.5} y2={23} stroke={color} strokeWidth={1.5} strokeLinecap="round" />
    </Svg>
  );
}

function DigestDocIcon({ color }: { color: string }) {
  return (
    <Svg width={32} height={32} viewBox="0 0 32 32">
      <Rect x={5} y={4} width={18} height={22} rx={3} fill={color} opacity={0.15} stroke={color} strokeWidth={1.5} />
      <Line x1={9} y1={11} x2={19} y2={11} stroke={color} strokeWidth={1.5} strokeLinecap="round" />
      <Line x1={9} y1={15} x2={19} y2={15} stroke={color} strokeWidth={1.5} strokeLinecap="round" />
      <Line x1={9} y1={19} x2={15} y2={19} stroke={color} strokeWidth={1.5} strokeLinecap="round" />
      {/* Spark at top-right */}
      <Path d="M22 5 L23.5 8 L22 7 L20.5 10 L22 7 L20.5 5 Z" fill={color} />
    </Svg>
  );
}

function AlertLineIcon({ color }: { color: string }) {
  return (
    <Svg width={32} height={32} viewBox="0 0 32 32">
      {/* Price line */}
      <Polyline points="4,22 10,18 16,20 22,12 28,10"
        fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      {/* Threshold bar */}
      <Line x1={4} y1={16} x2={28} y2={16} stroke={color} strokeWidth={1.5}
        strokeLinecap="round" strokeDasharray="3 2" opacity={0.5} />
      {/* Crossover dot */}
      <Circle cx={22} cy={12} r={3} fill={color} />
    </Svg>
  );
}

function AIReportIcon({ color }: { color: string }) {
  return (
    <Svg width={32} height={32} viewBox="0 0 32 32">
      <Rect x={5} y={4} width={18} height={22} rx={3} fill={color} opacity={0.12} stroke={color} strokeWidth={1.5} />
      <Line x1={9} y1={11} x2={19} y2={11} stroke={color} strokeWidth={1.5} strokeLinecap="round" />
      <Line x1={9} y1={15} x2={19} y2={15} stroke={color} strokeWidth={1.5} strokeLinecap="round" />
      {/* Brain loop */}
      <Path d="M10 20 Q14 17 18 20 Q14 23 10 20 Z" fill={color} opacity={0.4} stroke={color} strokeWidth={1} />
    </Svg>
  );
}

// ─── REUSABLE BUTTON ──────────────────────────────────────────────────────────
function Btn({
  label, onPress, variant = "filled", color, textColor, size = "md", style,
}: {
  label: string; onPress?: () => void; variant?: "filled" | "outline" | "ghost";
  color: string; textColor?: string; size?: "sm" | "md" | "lg"; style?: object;
}) {
  const padV = size === "lg" ? 14 : size === "sm" ? 8 : 11;
  const padH = size === "lg" ? 32 : size === "sm" ? 14 : 20;
  const fs = size === "lg" ? 16 : size === "sm" ? 13 : 14;
  const bg = variant === "filled" ? color : "transparent";
  const border = variant === "outline" ? `1px solid ${color}` : "none";
  const fc = textColor ?? (variant === "filled" ? "#FFFFFF" : color);

  return (
    <TouchableOpacity
      onPress={onPress}
      style={[{
        paddingVertical: padV,
        paddingHorizontal: padH,
        borderRadius: 10,
        alignItems: "center" as const,
        justifyContent: "center" as const,
        backgroundColor: bg,
        ...(variant === "outline" ? { borderWidth: 1, borderColor: color } : {}),
      }, style]}
    >
      <Text style={{
        fontFamily: WebTokens.fontBody,
        fontSize: fs,
        fontWeight: "600",
        color: fc,
      }}>{label}</Text>
    </TouchableOpacity>
  );
}

// ─── MAIN COMPONENT ───────────────────────────────────────────────────────────
export default function LandingPage() {
  const { isSignedIn, isLoaded } = useAuth();
  const router = useRouter();
  const colors = useColors();
  const { width } = useWindowDimensions();

  const isDesktop = width >= 900;
  const isTablet = width >= 600;
  const maxW = 1080;

  useEffect(() => {
    if (isLoaded && isSignedIn) {
      router.replace("/(tabs)");
    }
  }, [isLoaded, isSignedIn]);

  if (!isLoaded || isSignedIn) return null;

  const ws = (style: Record<string, unknown>) => style as any;

  return (
    <>
      <Head>
        <title>StockClarity — Clarity for your portfolio</title>
        <meta name="description" content="AI-powered stock analysis, daily briefings, and real-time alerts. Track your portfolio with clarity." />
        <meta property="og:title" content="StockClarity" />
        <meta property="og:description" content="Clarity for your portfolio" />
        <meta property="og:type" content="website" />
        <meta property="og:url" content="https://stockclarity.app" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="StockClarity" />
        <meta name="twitter:description" content="Clarity for your portfolio" />
        <link rel="canonical" href="https://stockclarity.app" />
      </Head>

      {/* ── Navbar ── */}
      <View style={ws({
        position: "fixed",
        top: 0, left: 0, right: 0,
        height: 60,
        backgroundColor: colors.card,
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
        zIndex: 100,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        paddingHorizontal: 24,
      })}>
        <View style={ws({
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          width: "100%",
          maxWidth: maxW,
        })}>
          <Logo size={28} />
          <View style={{ flexDirection: "row", gap: 10, alignItems: "center" }}>
            {isTablet && (
              <Btn
                label="Sign in"
                variant="ghost"
                color={colors.primary}
                size="sm"
                onPress={() => router.push("/(auth)/sign-in")}
              />
            )}
            <Btn
              label="Get started"
              variant="filled"
              color={colors.primary}
              size="sm"
              onPress={() => router.push("/(auth)/sign-up")}
            />
          </View>
        </View>
      </View>

      <ScrollView
        style={{ flex: 1, backgroundColor: colors.background }}
        contentContainerStyle={{ paddingTop: 60 }}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Hero ── */}
        <View
          nativeID="hero"
          style={ws({
            minHeight: "100vh",
            backgroundColor: colors.background,
            alignItems: "center",
            justifyContent: "center",
            paddingHorizontal: 24,
            paddingVertical: 80,
          })}
        >
          <View style={ws({
            flexDirection: isDesktop ? "row" : "column",
            alignItems: "center",
            gap: isDesktop ? 60 : 48,
            width: "100%",
            maxWidth: maxW,
          })}>
            {/* Left column */}
            <View style={ws({ flex: isDesktop ? "0 0 55%" : undefined, maxWidth: isDesktop ? "55%" : "100%" })}>
              {/* Eyebrow */}
              <View style={{ flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 16 }}>
                <View style={{ width: 24, height: 1, backgroundColor: colors.primary }} />
                <Text style={{
                  fontFamily: WebTokens.fontBody,
                  fontSize: 12,
                  fontWeight: "600",
                  color: colors.mutedForeground,
                  textTransform: "uppercase",
                  letterSpacing: 2,
                }}>
                  Portfolio intelligence
                </Text>
              </View>

              {/* Headline */}
              <Text style={ws({
                fontFamily: WebTokens.fontDisplay,
                fontSize: isDesktop ? 56 : 36,
                color: colors.text,
                lineHeight: isDesktop ? 62 : 42,
                marginBottom: 20,
                letterSpacing: -1,
              })}>
                Clarity for your portfolio
              </Text>

              {/* Subheadline */}
              <Text style={ws({
                fontFamily: WebTokens.fontBody,
                fontSize: 18,
                color: colors.mutedForeground,
                lineHeight: 29,
                maxWidth: 480,
                marginBottom: 32,
              })}>
                AI-powered stock analysis, daily briefings, and real-time alerts — all in one place.
              </Text>

              {/* CTA row */}
              <View style={{ flexDirection: "row", alignItems: "center", gap: 16, flexWrap: "wrap", marginBottom: 28 }}>
                <Btn
                  label="Start for free"
                  variant="filled"
                  color={colors.primary}
                  size="lg"
                  onPress={() => router.push("/(auth)/sign-up")}
                />
                <TouchableOpacity
                  style={{ flexDirection: "row", alignItems: "center", gap: 4 }}
                  onPress={() => {
                    if (typeof document !== "undefined") {
                      document.getElementById("features")?.scrollIntoView({ behavior: "smooth" });
                    }
                  }}
                >
                  <Text style={{ fontFamily: WebTokens.fontBody, fontSize: 15, color: colors.primary, fontWeight: "600" }}>
                    See how it works
                  </Text>
                  <ChevronRightIcon size={16} color={colors.primary} />
                </TouchableOpacity>
              </View>

              {/* Trust badges */}
              <View style={{ flexDirection: "row", gap: 16, flexWrap: "wrap" }}>
                {[
                  "Free tier available",
                  "No credit card required",
                  "iOS & Android apps",
                ].map((badge) => (
                  <View key={badge} style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                    <CheckIcon size={14} color="#3BEBA1" />
                    <Text style={{ fontFamily: WebTokens.fontBody, fontSize: 12, color: colors.mutedForeground }}>
                      {badge}
                    </Text>
                  </View>
                ))}
              </View>
            </View>

            {/* Right column — hero illustration */}
            <View style={ws({
              flex: isDesktop ? "0 0 45%" : undefined,
              alignItems: "center",
              transform: [{ rotate: "-3deg" }],
              boxShadow: WebTokens.shadow.lg,
              borderRadius: 16,
              overflow: "hidden",
            })}>
              <HeroDashboardIllustration
                primary={colors.primary}
                secondary={colors.secondary}
                accent={colors.accent}
                card={colors.card}
                border={colors.border}
                muted={colors.mutedForeground}
              />
            </View>
          </View>
        </View>

        {/* ── Features ── */}
        <View
          nativeID="features"
          style={ws({
            backgroundColor: colors.muted,
            paddingVertical: 80,
            paddingHorizontal: 24,
            alignItems: "center",
          })}
        >
          <View style={ws({ width: "100%", maxWidth: maxW })}>
            {/* Section header */}
            <View style={{ alignItems: "center", marginBottom: 48 }}>
              <Text style={{
                fontFamily: WebTokens.fontBody, fontSize: 12, fontWeight: "600",
                color: colors.mutedForeground, textTransform: "uppercase", letterSpacing: 2, marginBottom: 10,
              }}>Everything you need</Text>
              <Text style={ws({
                fontFamily: WebTokens.fontDisplay, fontSize: 36, color: colors.text,
                textAlign: "center", letterSpacing: -0.5, marginBottom: 12,
              })}>Your portfolio, clarified</Text>
              <Text style={ws({
                fontFamily: WebTokens.fontBody, fontSize: 16, color: colors.mutedForeground,
                textAlign: "center", maxWidth: 480,
              })}>
                Everything you need to track stocks, get AI insights, and never miss a move.
              </Text>
            </View>

            {/* 2×2 grid */}
            <View style={ws({
              flexDirection: "row",
              flexWrap: "wrap",
              gap: 20,
            })}>
              {[
                {
                  icon: <CandlestickIcon color={colors.primary} />,
                  title: "Watchlist & Charts",
                  body: "Track unlimited stocks with interactive price charts, 52-week ranges, and key metrics at a glance.",
                },
                {
                  icon: <DigestDocIcon color="#3BEBA1" />,
                  title: "Daily AI Digest",
                  body: "Wake up to a personalized briefing of everything that happened with your stocks overnight.",
                },
                {
                  icon: <AlertLineIcon color={colors.accent} />,
                  title: "Smart Price Alerts",
                  body: "Set price thresholds and get notified the moment a stock crosses your target.",
                },
                {
                  icon: <AIReportIcon color={colors.primary} />,
                  title: "AI-Powered Reports",
                  body: "Deep analysis on earnings, analyst upgrades, and market-moving events — summarized and ranked by impact.",
                },
              ].map((card) => (
                <View
                  key={card.title}
                  style={ws({
                    backgroundColor: colors.card,
                    borderWidth: 1,
                    borderColor: colors.border,
                    borderRadius: 14,
                    padding: 28,
                    flex: isTablet ? "0 0 calc(50% - 10px)" : "0 0 100%",
                    minWidth: isTablet ? "calc(50% - 10px)" : "100%",
                  })}
                >
                  <View style={{ marginBottom: 16 }}>{card.icon}</View>
                  <Text style={ws({
                    fontFamily: WebTokens.fontBody, fontSize: 17, fontWeight: "700",
                    color: colors.text, marginBottom: 8,
                  })}>{card.title}</Text>
                  <Text style={ws({
                    fontFamily: WebTokens.fontBody, fontSize: 14, color: colors.mutedForeground, lineHeight: 22,
                  })}>{card.body}</Text>
                </View>
              ))}
            </View>
          </View>
        </View>

        {/* ── Pricing ── */}
        <View
          nativeID="pricing"
          style={ws({
            backgroundColor: colors.background,
            paddingVertical: 80,
            paddingHorizontal: 24,
            alignItems: "center",
          })}
        >
          <View style={ws({ width: "100%", maxWidth: maxW })}>
            {/* Section header */}
            <View style={{ alignItems: "center", marginBottom: 48 }}>
              <Text style={{
                fontFamily: WebTokens.fontBody, fontSize: 12, fontWeight: "600",
                color: colors.mutedForeground, textTransform: "uppercase", letterSpacing: 2, marginBottom: 10,
              }}>Simple pricing</Text>
              <Text style={ws({
                fontFamily: WebTokens.fontDisplay, fontSize: 36, color: colors.text,
                textAlign: "center", letterSpacing: -0.5,
              })}>Start free, upgrade when ready</Text>
            </View>

            {/* Pricing cards */}
            <View style={ws({
              flexDirection: isDesktop ? "row" : "column",
              gap: 20,
              alignItems: isDesktop ? "stretch" : "center",
            })}>
              {/* FREE */}
              <View style={ws({
                flex: 1,
                backgroundColor: colors.card,
                borderWidth: 1,
                borderColor: colors.border,
                borderRadius: 16,
                padding: 28,
                minWidth: 260,
              })}>
                <Text style={{ fontFamily: WebTokens.fontDisplay, fontSize: 22, color: colors.text, marginBottom: 8 }}>Free</Text>
                <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 4, marginBottom: 24 }}>
                  <Text style={{ fontFamily: WebTokens.fontData, fontSize: 40, fontWeight: "700", color: colors.text }}>$0</Text>
                  <Text style={{ fontFamily: WebTokens.fontBody, fontSize: 14, color: colors.mutedForeground, paddingBottom: 6 }}>/month</Text>
                </View>
                <View style={{ gap: 10, marginBottom: 28 }}>
                  {FREE_FEATURES.map((f) => (
                    <View key={f.text} style={{ flexDirection: "row", gap: 10, alignItems: "flex-start" }}>
                      <CloseIcon size={14} color={colors.mutedForeground} />
                      <Text style={{ fontFamily: WebTokens.fontBody, fontSize: 13, color: colors.mutedForeground, flex: 1 }}>{f.text}</Text>
                    </View>
                  ))}
                </View>
                <Btn label="Get started free" variant="outline" color={colors.primary}
                  onPress={() => router.push("/(auth)/sign-up")} />
              </View>

              {/* PRO — highlighted */}
              <View style={ws({
                flex: 1,
                backgroundColor: colors.card,
                borderWidth: 2,
                borderColor: colors.primary,
                borderRadius: 16,
                padding: 28,
                minWidth: 260,
                transform: isDesktop ? [{ scale: 1.02 }] : [],
                position: "relative",
              })}>
                {/* Most Popular badge */}
                <View style={ws({
                  position: "absolute",
                  top: -14,
                  left: "50%",
                  transform: [{ translateX: -60 }],
                  backgroundColor: colors.primary,
                  paddingHorizontal: 16,
                  paddingVertical: 4,
                  borderRadius: 20,
                })}>
                  <Text style={{ fontFamily: WebTokens.fontBody, fontSize: 12, fontWeight: "700", color: "#fff" }}>
                    Most Popular
                  </Text>
                </View>
                <Text style={{ fontFamily: WebTokens.fontDisplay, fontSize: 22, color: colors.text, marginBottom: 8 }}>Pro</Text>
                <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 4, marginBottom: 24 }}>
                  <Text style={{ fontFamily: WebTokens.fontData, fontSize: 40, fontWeight: "700", color: colors.text }}>From $9</Text>
                  <Text style={{ fontFamily: WebTokens.fontBody, fontSize: 14, color: colors.mutedForeground, paddingBottom: 6 }}>/mo</Text>
                </View>
                <View style={{ gap: 10, marginBottom: 28 }}>
                  {PRO_FEATURES.map((f) => (
                    <View key={f.text} style={{ flexDirection: "row", gap: 10, alignItems: "flex-start" }}>
                      {f.included
                        ? <CheckIcon size={14} color="#3BEBA1" />
                        : <CloseIcon size={14} color={colors.mutedForeground} />}
                      <Text style={{ fontFamily: WebTokens.fontBody, fontSize: 13, color: f.included ? colors.text : colors.mutedForeground, flex: 1 }}>
                        {f.text}
                      </Text>
                    </View>
                  ))}
                </View>
                <Btn label="Start with Pro" variant="filled" color={colors.primary}
                  onPress={() => router.push("/(auth)/sign-up")} />
              </View>

              {/* PREMIUM */}
              <View style={ws({
                flex: 1,
                backgroundColor: colors.card,
                borderWidth: 1,
                borderColor: colors.border,
                borderRadius: 16,
                padding: 28,
                minWidth: 260,
              })}>
                <Text style={{ fontFamily: WebTokens.fontDisplay, fontSize: 22, color: colors.text, marginBottom: 8 }}>Premium</Text>
                <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 4, marginBottom: 24 }}>
                  <Text style={{ fontFamily: WebTokens.fontData, fontSize: 40, fontWeight: "700", color: colors.text }}>From $19</Text>
                  <Text style={{ fontFamily: WebTokens.fontBody, fontSize: 14, color: colors.mutedForeground, paddingBottom: 6 }}>/mo</Text>
                </View>
                <View style={{ gap: 10, marginBottom: 28 }}>
                  {PREMIUM_FEATURES.map((f) => (
                    <View key={f.text} style={{ flexDirection: "row", gap: 10, alignItems: "flex-start" }}>
                      <CheckIcon size={14} color="#3BEBA1" />
                      <Text style={{ fontFamily: WebTokens.fontBody, fontSize: 13, color: colors.text, flex: 1 }}>
                        {f.text}
                      </Text>
                    </View>
                  ))}
                </View>
                <Btn label="Start with Premium" variant="filled" color={colors.accent}
                  onPress={() => router.push("/(auth)/sign-up")} />
              </View>
            </View>
          </View>
        </View>

        {/* ── Final CTA ── */}
        <View style={ws({
          paddingVertical: 80,
          paddingHorizontal: 24,
          alignItems: "center",
          backgroundImage: `linear-gradient(135deg, ${colors.primary}1A 0%, ${colors.accent}0D 100%)`,
          backgroundColor: colors.background,
        })}>
          <Text style={ws({
            fontFamily: WebTokens.fontDisplay, fontSize: isDesktop ? 40 : 30,
            color: colors.text, textAlign: "center", letterSpacing: -0.5, marginBottom: 16,
          })}>
            Ready to get clarity?
          </Text>
          <Text style={ws({
            fontFamily: WebTokens.fontBody, fontSize: 16, color: colors.mutedForeground,
            textAlign: "center", maxWidth: 440, marginBottom: 32, lineHeight: 25,
          })}>
            Join thousands of investors who start every morning with StockClarity.
          </Text>
          <Btn
            label="Get started for free"
            variant="filled"
            color={colors.background}
            textColor={colors.primary}
            size="lg"
            style={ws({ boxShadow: WebTokens.shadow.md, borderWidth: 1, borderColor: colors.border })}
            onPress={() => router.push("/(auth)/sign-up")}
          />
        </View>

        {/* ── Footer ── */}
        <View style={ws({
          borderTopWidth: 1,
          borderTopColor: colors.border,
          paddingVertical: 24,
          paddingHorizontal: 24,
          flexDirection: isTablet ? "row" : "column",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
        })}>
          <Logo size={22} />
          <Text style={{ fontFamily: WebTokens.fontBody, fontSize: 13, color: colors.mutedForeground }}>
            © 2025 StockClarity
          </Text>
          <View style={{ flexDirection: "row", gap: 16 }}>
            {["Privacy", "Terms"].map((link) => (
              <Text key={link} style={ws({
                fontFamily: WebTokens.fontBody, fontSize: 13, color: colors.mutedForeground,
                cursor: "pointer",
              })}>{link}</Text>
            ))}
          </View>
        </View>
      </ScrollView>
    </>
  );
}
