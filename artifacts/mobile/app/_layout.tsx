import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  useFonts,
} from "@expo-google-fonts/inter";
import { Feather } from "@expo/vector-icons";
import { ClerkProvider, ClerkLoaded } from "@clerk/expo";
import { tokenCache } from "@clerk/expo/token-cache";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import React, { useEffect } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { ErrorBoundary } from "@/components/ErrorBoundary";
import { WatchlistProvider, useWatchlist } from "@/context/WatchlistContext";
import { SubscriptionProvider, useSubscription } from "@/context/SubscriptionContext";
import { ThemeProvider } from "@/context/ThemeContext";
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
          <SafeAreaProvider>
            <ErrorBoundary>
              <QueryClientProvider client={queryClient}>
                <SubscriptionProvider>
                  <WatchlistProviderWithTier>
                    <GestureHandlerRootView>
                      <KeyboardProvider>
                        <RootLayoutNav />
                      </KeyboardProvider>
                    </GestureHandlerRootView>
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
