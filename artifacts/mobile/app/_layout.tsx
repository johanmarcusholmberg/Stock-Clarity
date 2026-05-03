import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  useFonts,
} from "@expo-google-fonts/inter";
import { Feather } from "@expo/vector-icons";
import { ClerkProvider, ClerkLoaded, useAuth } from "@clerk/expo";
import { tokenCache } from "@clerk/expo/token-cache";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import React, { useEffect, useRef } from "react";

import { registerForPushNotifications } from "@/services/pushRegistration";
import { setAuthTokenGetter } from "@/lib/authedFetch";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { ErrorBoundary } from "@/components/ErrorBoundary";
import { OfflineBanner } from "@/components/OfflineBanner";
import { ToastProvider } from "@/components/Toast";
import { initNetwork } from "@/lib/network";
import {
  captureSentryException,
  clearSentryUser,
  initSentry,
  setSentryUser,
} from "@/lib/sentry";
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

// Initialize Sentry at module scope so the SDK is live before the first
// render — including any error in fontsLoaded or ClerkProvider hydration.
// Best-effort: silently no-ops if EXPO_PUBLIC_SENTRY_DSN isn't set.
initSentry();

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

// Tag every Sentry event with the Clerk user id so production crashes are
// filterable per-account. Cleared on sign-out so later events aren't
// attributed to the previous account.
//
// PII policy: id only, no email. The Clerk dashboard is the source of
// truth for {id -> email} lookups; duplicating it into Sentry would bloat
// our PII surface without adding signal.
function SentryUserSync() {
  const { isSignedIn, userId } = useAuth();

  useEffect(() => {
    if (isSignedIn && userId) {
      setSentryUser({ id: userId });
    } else {
      clearSentryUser();
    }
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
          <SentryUserSync />
          <SafeAreaProvider>
            <ErrorBoundary
              onError={(error, stackTrace) => {
                // Forward to Sentry (no-op if DSN not configured) AND keep
                // the console log so the boundary's swallowed crash still
                // shows up in dev tools / Replit logs.
                captureSentryException(error, { stackTrace });
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
