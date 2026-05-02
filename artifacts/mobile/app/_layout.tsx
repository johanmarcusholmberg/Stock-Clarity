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
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { ErrorBoundary } from "@/components/ErrorBoundary";
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

const queryClient = new QueryClient();

const publishableKey = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY!;
const proxyUrl = process.env.EXPO_PUBLIC_CLERK_PROXY_URL || undefined;

function RootLayoutNav() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(auth)" options={{ headerShown: false }} />
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="stock/[ticker]" options={{ headerShown: false, presentation: "card" }} />
    </Stack>
  );
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
          <PushNotificationRegistrar />
          <SafeAreaProvider>
            <ErrorBoundary
              onError={(error, stackTrace) => {
                // Sentry-ready hook. Once SENTRY_DSN is wired we'll forward
                // here. For now, ensure crashes surface in logs instead of
                // being silently swallowed by the boundary.
                // eslint-disable-next-line no-console
                console.error("[ErrorBoundary]", error, stackTrace);
              }}
            >
              <QueryClientProvider client={queryClient}>
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
                                </KeyboardProvider>
                              </GestureHandlerRootView>
                            </BenchmarkProvider>
                          </DigestProvider>
                        </HoldingsProvider>
                      </NotifyProvider>
                    </AlertsProvider>
                  </WatchlistProviderWithTier>
                </SubscriptionProvider>
              </QueryClientProvider>
            </ErrorBoundary>
          </SafeAreaProvider>
        </ClerkLoaded>
      </ClerkProvider>
    </ThemeProvider>
  );
}
