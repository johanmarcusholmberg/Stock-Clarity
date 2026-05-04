import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  useFonts,
} from "@expo-google-fonts/inter";
import { Feather } from "@expo/vector-icons";
import { ClerkProvider, ClerkLoaded, useAuth, tokenCache } from "@/lib/clerk";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import React, { useEffect, useRef } from "react";
import { Platform } from "react-native";

// Expo web ships @expo/vector-icons fonts via Metro-bundled URLs, but in our
// proxied Android-sized iframe (the canvas mobile preview) the auto-injected
// @font-face URL is unreliable — Feather glyphs render as tofu boxes (□)
// because the browser falls back to the system font when "Feather" isn't
// registered in CSS. We work around this by serving Feather.ttf from
// /public/fonts and registering @font-face ourselves at module load, before
// any Feather <Text> mounts. Native and EAS builds skip this entirely
// (Platform.OS !== 'web') and use Expo's normal asset pipeline.
if (Platform.OS === "web" && typeof document !== "undefined") {
  const FONT_FACE_ID = "stockclarify-feather-font-face";
  if (!document.getElementById(FONT_FACE_ID)) {
    const style = document.createElement("style");
    style.id = FONT_FACE_ID;
    style.textContent = `@font-face {
  font-family: 'Feather';
  src: url('/fonts/Feather.ttf') format('truetype');
  font-weight: normal;
  font-style: normal;
  font-display: block;
}`;
    document.head.appendChild(style);
  }

  // Google Fonts: DM Serif Display (headings), DM Mono (data), Sora (body)
  const GOOGLE_FONTS_ID = "stockclarity-google-fonts";
  if (!document.getElementById(GOOGLE_FONTS_ID)) {
    const link = document.createElement("link");
    link.id = GOOGLE_FONTS_ID;
    link.rel = "stylesheet";
    link.href =
      "https://fonts.googleapis.com/css2?family=DM+Serif+Display&family=DM+Mono:wght@400;500&family=Sora:wght@300;400;500;600&display=swap";
    document.head.appendChild(link);
  }

  // Scrollbar + focus styling for the entire web app.
  const GLOBAL_CSS_ID = "stockclarity-web-globals";
  if (!document.getElementById(GLOBAL_CSS_ID)) {
    const style = document.createElement("style");
    style.id = GLOBAL_CSS_ID;
    style.textContent = `
      * { box-sizing: border-box; }
      html, body, #root { height: 100%; margin: 0; }
      ::-webkit-scrollbar { width: 5px; height: 5px; }
      ::-webkit-scrollbar-track { background: transparent; }
      ::-webkit-scrollbar-thumb {
        background: rgba(56, 190, 235, 0.25);
        border-radius: 3px;
      }
      ::-webkit-scrollbar-thumb:hover { background: rgba(56, 190, 235, 0.5); }
      *:focus-visible {
        outline: 2px solid #38BEEB;
        outline-offset: 2px;
        border-radius: 6px;
      }
      [data-sidebar-collapsed-tip]::after {
        content: attr(data-sidebar-collapsed-tip);
        position: absolute;
        left: 64px;
        top: 50%;
        transform: translateY(-50%) translateX(-4px);
        background: #0A1628;
        color: #fff;
        font-family: 'Sora', system-ui, sans-serif;
        font-size: 12px;
        padding: 6px 10px;
        border-radius: 6px;
        white-space: nowrap;
        opacity: 0;
        pointer-events: none;
        transition: opacity 120ms ease, transform 120ms ease;
        z-index: 1000;
      }
      [data-sidebar-collapsed-tip]:hover::after {
        opacity: 1;
        transform: translateY(-50%) translateX(0);
      }
    `;
    document.head.appendChild(style);
  }
}

import { registerForPushNotifications } from "@/services/pushRegistration";
import { setAuthTokenGetter } from "@/lib/authedFetch";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { ErrorBoundary } from "@/components/ErrorBoundary";
import { OfflineBanner } from "@/components/OfflineBanner";
import { ToastProvider } from "@/components/Toast";
import { initNetwork } from "@/lib/network";
import { WatchlistProvider, useWatchlist } from "@/context/WatchlistContext";
import { SubscriptionProvider, useSubscription } from "@/context/SubscriptionContext";
import { AlertsProvider } from "@/context/AlertsContext";
import { NotifyProvider } from "@/context/NotifyContext";
import { HoldingsProvider } from "@/context/HoldingsContext";
import { DigestProvider } from "@/context/DigestContext";
import { ThemeProvider } from "@/context/ThemeContext";
import { BenchmarkProvider } from "@/context/BenchmarkContext";
import { FirstTimeNameModal } from "@/components/FirstTimeNameModal";

SplashScreen.preventAutoHideAsync();

// Wire NetInfo -> React Query's onlineManager + AppState -> focusManager.
// Done at module scope so it's set up exactly once, before any provider mounts.
initNetwork();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Show cached data while a fresh fetch runs in the background.
      // Watchlist quotes, charts, news — all benefit from no spinner flicker.
      staleTime: 60_000,
      gcTime: 30 * 60_000,
      // `offlineFirst` lets cached data render even when the network is down,
      // and queues fetches to fire when connectivity returns.
      networkMode: "offlineFirst",
      refetchOnReconnect: true,
      refetchOnWindowFocus: true,
      // Retry transient errors but bail fast on 4xx — those won't fix
      // themselves and burning 3 attempts just delays the error UI.
      retry: (failureCount, error) => {
        const status = (error as { status?: number } | null)?.status;
        if (typeof status === "number" && status >= 400 && status < 500) return false;
        return failureCount < 2;
      },
      retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 8000),
    },
    mutations: {
      networkMode: "offlineFirst",
      retry: false,
    },
  },
});

const publishableKey = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY!;
const proxyUrl = process.env.EXPO_PUBLIC_CLERK_PROXY_URL || undefined;

function RootLayoutNav() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(auth)" options={{ headerShown: false }} />
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="onboarding" options={{ headerShown: false, gestureEnabled: false }} />
      <Stack.Screen name="stock/[ticker]" options={{ headerShown: false, presentation: "card" }} />
      <Stack.Screen name="legal" options={{ headerShown: false, presentation: "card" }} />
    </Stack>
  );
}

// Bridges Clerk's session into our `authedFetch` helper so every API call
// from outside the React tree (services/*, contexts) automatically attaches
// the Bearer token. Without this bridge the server's `requireSelf` checks
// will respond 401 to every authenticated route. Registered exactly once
// at app start; cleared on unmount so a hot-reload doesn't leak old getters.
function ClerkAuthBridge() {
  const { getToken } = useAuth();
  useEffect(() => {
    setAuthTokenGetter(getToken);
    return () => setAuthTokenGetter(null);
  }, [getToken]);
  return null;
}

// Registers the device's Expo push token with the server once per session,
// after Clerk confirms the user is signed in. The ref guard prevents repeat
// calls when other auth state changes re-trigger the effect.
function PushNotificationRegistrar() {
  const { isSignedIn, userId } = useAuth();
  const registeredFor = useRef<string | null>(null);

  useEffect(() => {
    if (!isSignedIn || !userId) return;
    if (registeredFor.current === userId) return;
    registeredFor.current = userId;
    registerForPushNotifications(userId).catch(() => {
      // best-effort — registration failures shouldn't block the app
    });
  }, [isSignedIn, userId]);

  return null;
}

function AppWithNamePrompt({ children }: { children: React.ReactNode }) {
  const { setDisplayName } = useWatchlist();
  return (
    <>
      {children}
      <FirstTimeNameModal onComplete={(name) => { if (name) setDisplayName(name); }} />
    </>
  );
}

function WatchlistProviderWithTier({ children }: { children: React.ReactNode }) {
  const { tier } = useSubscription();
  return (
    <WatchlistProvider tier={tier}>
      <AppWithNamePrompt>
        {children}
      </AppWithNamePrompt>
    </WatchlistProvider>
  );
}

export default function RootLayout() {
  // Note: Feather.font is explicitly loaded to ensure icon rendering on Android
  // preview and dev builds. If icons still fail in Expo web preview, this is a
  // known limitation — they will render correctly on real devices.
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    ...Feather.font,
  });

  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) return null;

  return (
    <ThemeProvider>
      <ClerkProvider publishableKey={publishableKey} tokenCache={tokenCache} proxyUrl={proxyUrl}>
        <ClerkLoaded>
          <ClerkAuthBridge />
          <PushNotificationRegistrar />
          <SafeAreaProvider>
            <ErrorBoundary
              onError={(error, stackTrace) => {
                // Log so the boundary's swallowed crash still shows up in
                // dev tools / Replit logs. No remote crash reporter is
                // wired up on mobile right now.
                // eslint-disable-next-line no-console
                console.error("[ErrorBoundary]", error, stackTrace);
              }}
            >
              <QueryClientProvider client={queryClient}>
                <ToastProvider>
                  <SubscriptionProvider>
                    <WatchlistProviderWithTier>
                      <AlertsProvider>
                        <NotifyProvider>
                          <HoldingsProvider>
                            <DigestProvider>
                              <BenchmarkProvider>
                                <GestureHandlerRootView>
                                  <KeyboardProvider>
                                    <RootLayoutNav />
                                    <OfflineBanner />
                                  </KeyboardProvider>
                                </GestureHandlerRootView>
                              </BenchmarkProvider>
                            </DigestProvider>
                          </HoldingsProvider>
                        </NotifyProvider>
                      </AlertsProvider>
                    </WatchlistProviderWithTier>
                  </SubscriptionProvider>
                </ToastProvider>
              </QueryClientProvider>
            </ErrorBoundary>
          </SafeAreaProvider>
        </ClerkLoaded>
      </ClerkProvider>
    </ThemeProvider>
  );
}
